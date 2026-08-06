import { Inject, Injectable } from '@nestjs/common';
import type { AIMessage, AIMessageRole, PrismaClient } from '@linguaai/database';

import { AI_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';
import type { ChatMessage, ChatRole } from '../gateway/model-provider.interface.js';
import { RouterService } from '../gateway/router.service.js';
import { PromptManagerService } from '../prompts/prompt-manager.service.js';
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
 * Does not write `AIUsageLog` (T9's Cost Meter) or read `AIMemoryEntry`
 * (T6's Memory Manager) — both real, named gaps this task does not close,
 * consistent with E5 §9's own task boundaries.
 */
@Injectable()
export class OrchestratorService {
  constructor(
    @Inject(AI_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly router: RouterService,
    private readonly promptManager: PromptManagerService,
    private readonly rollingSummaryCache: RollingSummaryCache,
  ) {}

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
    );
    const { text: personaPrompt, promptVersion } = this.promptManager.getSystemPrompt(
      session.orchestratorAgent,
      input.variables,
    );

    const response = await this.router.generate('teacher', {
      systemPrompt: summarySuffix ? `${personaPrompt}${summarySuffix}` : personaPrompt,
      messages: contextMessages,
    });

    await this.prisma.aIMessage.create({
      data: {
        sessionId: input.sessionId,
        role: 'ASSISTANT',
        content: response.content,
        promptVersion,
        modelId: response.modelId,
        latencyMs: response.latencyMs,
      },
    });

    return { assistantMessage: response.content, promptVersion, modelId: response.modelId };
  }

  async endSession(input: EndSessionInput): Promise<void> {
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
   */
  private async buildContext(
    sessionId: string,
    allMessages: AIMessage[],
  ): Promise<{ contextMessages: ChatMessage[]; summarySuffix: string }> {
    const cached = this.rollingSummaryCache.get(sessionId);
    const tail = cached
      ? allMessages.filter((m) => m.createdAt > cached.summarizedThroughCreatedAt)
      : allMessages;

    if (tail.length <= ROLLING_SUMMARY_TRIGGER_MESSAGE_COUNT) {
      return {
        contextMessages: tail.map(toChatMessage),
        summarySuffix: cached ? summarySuffixFor(cached.summary) : '',
      };
    }

    const toSummarize = tail.slice(0, -ROLLING_SUMMARY_RETAIN_RECENT_COUNT);
    const stillRecent = tail.slice(-ROLLING_SUMMARY_RETAIN_RECENT_COUNT);
    const newSummary = await this.summarize(cached?.summary, toSummarize);
    const boundary = toSummarize[toSummarize.length - 1]!.createdAt;

    this.rollingSummaryCache.set(sessionId, {
      summary: newSummary,
      summarizedThroughCreatedAt: boundary,
    });

    return {
      contextMessages: stillRecent.map(toChatMessage),
      summarySuffix: summarySuffixFor(newSummary),
    };
  }

  private async summarize(
    previousSummary: string | undefined,
    messages: AIMessage[],
  ): Promise<string> {
    const prompt = previousSummary
      ? `Existing summary of earlier turns:\n${previousSummary}\n\nNew turns to fold in:\n${transcriptOf(messages)}`
      : `Conversation turns to summarize:\n${transcriptOf(messages)}`;

    const response = await this.router.generate('teacher', {
      systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content;
  }
}

function summarySuffixFor(summary: string): string {
  return `\n\nSummary of the conversation so far:\n${summary}`;
}
