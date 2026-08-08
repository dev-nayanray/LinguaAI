import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AIAgentSession,
  AIMessage,
  AIMessageRole,
  OrchestratorAgentPersona,
  PrismaClient,
} from '@linguaai/database';

import { CircuitBreakerService } from '../cost/circuit-breaker.service.js';
import { CostMeterService } from '../cost/cost-meter.service.js';
import { AI_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';
import type {
  ChatMessage,
  ChatRole,
  GenerateRequest,
  GenerateResponse,
} from '../gateway/model-provider.interface.js';
import { RouterService, type ModelTier } from '../gateway/router.service.js';
import { MemoryManagerService } from '../memory/memory-manager.service.js';
import type { RetrievedMemory } from '../memory/memory-manager.types.js';
import { PromptManagerService } from '../prompts/prompt-manager.service.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import {
  ROLLING_SUMMARY_RETAIN_RECENT_COUNT,
  ROLLING_SUMMARY_TRIGGER_MESSAGE_COUNT,
  SUMMARIZATION_SYSTEM_PROMPT,
} from './rolling-summary.constants.js';
import { RollingSummaryCache } from './rolling-summary.cache.js';
import type {
  EndSessionInput,
  SendMessageInput,
  SendMessageResult,
  SendMessageStreamEvent,
  StartSessionInput,
  StartSessionResult,
} from './orchestrator.types.js';

const AI_MESSAGE_ROLE_TO_CHAT_ROLE: Record<AIMessageRole, ChatRole> = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

function toChatMessage(message: AIMessage): ChatMessage {
  return { role: AI_MESSAGE_ROLE_TO_CHAT_ROLE[message.role], content: message.content };
}

function transcriptOf(messages: AIMessage[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join('\n');
}

/**
 * Owns `AIAgentSession`/`AIMessage` lifecycle (AI_SYSTEM.md §2's
 * "Orchestrator" component) and the single-voice invariant (ADR-007):
 * `sendMessage` takes no persona parameter at all — the session's own
 * `orchestratorAgent`, fixed at `startSession` and never mutated
 * afterward, is the only source of which persona speaks. There is
 * structurally no code path for a second persona to post into the same
 * session.
 *
 * Every AI-invoking Router call (the main reply and the internal
 * summarization sub-call) is gated by `CircuitBreakerService.checkBreachState()`
 * first (ADR-034: "checked before each new AI-invoking request reaches the
 * Router") — HARD_STOP throws a graceful error before the Router is ever
 * called; DEGRADE downgrades that one call to the `'economy'` model tier.
 * `CostMeterService.recordUsage()` runs after each such call completes,
 * writing the real `AIUsageLog` row T9 introduces.
 *
 * Memory retrieval (T6, AI_MemoryManagerService) runs on every
 * `sendMessage` call, query-texted against the learner's own message —
 * a deliberate, flagged adaptation of AI_SYSTEM.md §5's literal "at
 * session start" wording: a per-turn query is always at least as
 * relevant as a one-time session-start snapshot (which would go stale
 * the moment a session's topic shifts), and doesn't require inventing a
 * second in-process cache layer purely to match that phrasing literally.
 */
@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(AI_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly router: RouterService,
    private readonly promptManager: PromptManagerService,
    private readonly memoryManager: MemoryManagerService,
    private readonly safetyLayer: SafetyLayerService,
    private readonly rollingSummaryCache: RollingSummaryCache,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly costMeter: CostMeterService,
  ) {}

  /** ADR-034: checked before every Router-invoking call this service makes. Throws a graceful, user-facing error on HARD_STOP rather than letting the request reach the Router at all. */
  private async resolveTierOrThrow(): Promise<ModelTier> {
    const state = await this.circuitBreaker.checkBreachState();
    if (state === 'HARD_STOP') {
      throw new Error(
        'AI request volume has exceeded the cost circuit breaker threshold (ADR-034) — please try again in a moment.',
      );
    }
    return state === 'DEGRADE' ? 'economy' : 'default';
  }

  async startSession(input: StartSessionInput): Promise<StartSessionResult> {
    const session = await this.prisma.aIAgentSession.create({
      data: {
        userId: input.userId,
        languageId: input.languageId,
        orchestratorAgent: input.orchestratorAgent,
      },
    });
    return { sessionId: session.id };
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const { session, request, tier, promptVersion } = await this.prepareGeneration(input);
    const response = await this.router.generate('teacher', request, tier);
    return this.finalizeAssistantReply(session, response, promptVersion);
  }

  /**
   * ADR-033 (T10): the real, token-by-token backing for the SSE contract's
   * "session message generation" stream — uses `RouterService.stream()`
   * end-to-end rather than wrapping a single non-streaming `generate()`
   * call, matching AI_SYSTEM.md §7/PERFORMANCE.md §2's "streaming at every
   * hop, not an optional add-on." Shares `prepareGeneration`/
   * `finalizeAssistantReply` with `sendMessage()` — the circuit-breaker
   * check, memory/rolling-summary context, safety sanitization, cost
   * metering, and human-review sampling are identical for both; only the
   * actual generation call (and how its result is assembled) differs.
   *
   * Live-streamed `token` deltas are raw, un-sanitized model output —
   * `sanitizeOutput()` can only run on the complete text (a `<script>` tag
   * arriving split across several deltas can't be stripped mid-stream).
   * This is not a new gap: AI_GOVERNANCE.md §6 already documents the
   * gateway-level sanitizer as defense-in-depth, with "a renderer-level
   * sanitizer at render time" as the primary defense — exactly the layer a
   * streaming UI must apply to live deltas regardless. Only the final
   * `done` event (and the persisted `AIMessage` row) carries the
   * sanitized text.
   */
  async *streamMessage(input: SendMessageInput): AsyncGenerator<SendMessageStreamEvent> {
    const { session, request, tier, promptVersion } = await this.prepareGeneration(input);

    let content = '';
    let usage:
      Pick<GenerateResponse, 'inputTokens' | 'outputTokens' | 'modelId' | 'latencyMs'> | undefined;
    for await (const chunk of this.router.stream('teacher', request, tier)) {
      if (chunk.delta) {
        content += chunk.delta;
        yield { type: 'token', delta: chunk.delta };
      }
      if (chunk.done) {
        usage = chunk.usage;
      }
    }
    if (!usage) {
      throw new Error('Stream ended without usage metadata on its final chunk');
    }

    const result = await this.finalizeAssistantReply(session, { content, ...usage }, promptVersion);
    yield { type: 'done', ...result };
  }

  /** Shared "before generation" setup for both `sendMessage`/`streamMessage` — session validation, user-message write, rolling-summary/memory context, persona prompt, and the ADR-034 circuit-breaker check every Router-invoking call needs. */
  private async prepareGeneration(input: SendMessageInput): Promise<{
    session: AIAgentSession;
    request: Omit<GenerateRequest, 'model'>;
    tier: ModelTier;
    promptVersion: string;
  }> {
    const session = await this.prisma.aIAgentSession.findUniqueOrThrow({
      where: { id: input.sessionId },
    });
    if (session.status !== 'ACTIVE') {
      throw new Error(
        `Cannot send a message to session "${input.sessionId}" — status is "${session.status}", not ACTIVE`,
      );
    }

    await this.prisma.aIMessage.create({
      data: { sessionId: input.sessionId, role: 'USER', content: input.userMessage },
    });

    const allMessages = await this.prisma.aIMessage.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { createdAt: 'asc' },
    });

    const { contextMessages, summarySuffix } = await this.buildContext(
      input.sessionId,
      allMessages,
      {
        rollingSummary: session.rollingSummary,
        summarizedThroughAt: session.summarizedThroughAt,
      },
      { userId: session.userId, orchestratorAgent: session.orchestratorAgent },
    );
    const memories = await this.memoryManager.retrieveRelevantMemories({
      userId: session.userId,
      languageId: session.languageId,
      queryText: input.userMessage,
    });
    const { text: personaPrompt, promptVersion } = this.promptManager.getSystemPrompt(
      session.orchestratorAgent,
      input.variables,
    );
    const tier = await this.resolveTierOrThrow();

    return {
      session,
      request: {
        systemPrompt: `${personaPrompt}${this.memorySuffixFor(memories)}${summarySuffix}`,
        messages: contextMessages,
      },
      tier,
      promptVersion,
    };
  }

  /** Shared "after generation" finish — cost metering, output sanitization, the `AIMessage` write, and human-review sampling, identical whether the reply came from `generate()` or was accumulated from `stream()`. */
  private async finalizeAssistantReply(
    session: Pick<AIAgentSession, 'id' | 'userId' | 'orchestratorAgent'>,
    response: Pick<
      GenerateResponse,
      'content' | 'inputTokens' | 'outputTokens' | 'modelId' | 'latencyMs'
    >,
    promptVersion: string,
  ): Promise<SendMessageResult> {
    await this.costMeter.recordUsage({
      userId: session.userId,
      agentPersona: session.orchestratorAgent,
      modelId: response.modelId,
      promptVersion,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      latencyMs: response.latencyMs,
    });
    const sanitizedContent = this.safetyLayer.sanitizeOutput(response.content);

    const assistantMessage = await this.prisma.aIMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: sanitizedContent,
        promptVersion,
        modelId: response.modelId,
        latencyMs: response.latencyMs,
      },
    });
    this.safetyLayer.recordSampleForReviewIfDue({
      sessionId: session.id,
      messageId: assistantMessage.id,
    });

    return { assistantMessage: sanitizedContent, promptVersion, modelId: response.modelId };
  }

  /**
   * 404 (not a silent no-op, and not 403 — API_GUIDELINES.md §3's no-
   * existence-leak rule) on a missing session or an owner mismatch — the
   * ownership check T2 added on top of what was previously a blind,
   * unauthenticated update by id alone.
   */
  async endSession(input: EndSessionInput): Promise<void> {
    const session = await this.prisma.aIAgentSession.findUnique({
      where: { id: input.sessionId },
    });
    if (!session || session.userId !== input.userId) {
      throw new NotFoundException('AI agent session not found');
    }

    await this.prisma.aIAgentSession.update({
      where: { id: input.sessionId },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    this.rollingSummaryCache.clear(input.sessionId);
  }

  /**
   * Returns the messages to actually send to the model plus an optional
   * summary suffix to append to the persona's own system prompt. Once the
   * not-yet-summarized tail grows past the trigger, the older portion is
   * folded (together with any prior summary, so information isn't lost)
   * into a fresh summary via its own dedicated model call — this is the
   * one piece of real, if provisionally-thresholded, rolling
   * summarization logic AI_SYSTEM.md §5 requires.
   *
   * Read-through / write-through against `AIAgentSession.rollingSummary`/
   * `summarizedThroughAt` (T6's own schema addition, closing T4's own
   * flagged gap): an in-process cache miss (a restart, or a different
   * Fargate replica handling this turn) first checks the durable row
   * before falling all the way back to resummarizing full history: cheap,
   * always correct, never a wasted model call when the durable value is
   * already there.
   */
  private async buildContext(
    sessionId: string,
    allMessages: AIMessage[],
    durable: { rollingSummary: string | null; summarizedThroughAt: Date | null },
    session: { userId: string; orchestratorAgent: OrchestratorAgentPersona },
  ): Promise<{ contextMessages: ChatMessage[]; summarySuffix: string }> {
    let cached = this.rollingSummaryCache.get(sessionId);
    if (!cached && durable.rollingSummary !== null && durable.summarizedThroughAt !== null) {
      cached = {
        summary: durable.rollingSummary,
        summarizedThroughCreatedAt: durable.summarizedThroughAt,
      };
      this.rollingSummaryCache.set(sessionId, cached);
    }

    const tail = cached
      ? allMessages.filter((m) => m.createdAt > cached.summarizedThroughCreatedAt)
      : allMessages;

    if (tail.length <= ROLLING_SUMMARY_TRIGGER_MESSAGE_COUNT) {
      return {
        contextMessages: tail.map(toChatMessage),
        summarySuffix: cached ? this.summarySuffixFor(cached.summary) : '',
      };
    }

    const toSummarize = tail.slice(0, -ROLLING_SUMMARY_RETAIN_RECENT_COUNT);
    const stillRecent = tail.slice(-ROLLING_SUMMARY_RETAIN_RECENT_COUNT);
    const newSummary = await this.summarize(cached?.summary, toSummarize, session);
    const boundary = toSummarize[toSummarize.length - 1]!.createdAt;

    this.rollingSummaryCache.set(sessionId, {
      summary: newSummary,
      summarizedThroughCreatedAt: boundary,
    });
    await this.prisma.aIAgentSession.update({
      where: { id: sessionId },
      data: { rollingSummary: newSummary, summarizedThroughAt: boundary },
    });

    return {
      contextMessages: stillRecent.map(toChatMessage),
      summarySuffix: this.summarySuffixFor(newSummary),
    };
  }

  private summarySuffixFor(summary: string): string {
    const delimited = this.safetyLayer.delimitUntrustedContent('conversation_summary', summary);
    return `\n\nSummary of the conversation so far:\n${delimited}`;
  }

  private memorySuffixFor(memories: RetrievedMemory[]): string {
    if (memories.length === 0) {
      return '';
    }
    const lines = memories.map((m) => `- (${m.category}) ${m.fact}`).join('\n');
    const delimited = this.safetyLayer.delimitUntrustedContent('learner_memory', lines);
    return `\n\nWhat you already know about this learner:\n${delimited}`;
  }

  private async summarize(
    previousSummary: string | undefined,
    messages: AIMessage[],
    session: { userId: string; orchestratorAgent: OrchestratorAgentPersona },
  ): Promise<string> {
    const prompt = previousSummary
      ? `Existing summary of earlier turns:\n${previousSummary}\n\nNew turns to fold in:\n${transcriptOf(messages)}`
      : `Conversation turns to summarize:\n${transcriptOf(messages)}`;

    const tier = await this.resolveTierOrThrow();
    const response = await this.router.generate(
      'teacher',
      {
        systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      },
      tier,
    );
    await this.costMeter.recordUsage({
      userId: session.userId,
      agentPersona: session.orchestratorAgent,
      modelId: response.modelId,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      latencyMs: response.latencyMs,
    });
    return response.content;
  }
}
