import type { AIAgentSession, AIMessage, PrismaClient } from '@linguaai/database';

import type { CircuitBreakerService } from '../cost/circuit-breaker.service.js';
import type { CostMeterService } from '../cost/cost-meter.service.js';
import type { GenerateResponse, StreamChunk } from '../gateway/model-provider.interface.js';
import type { RouterService } from '../gateway/router.service.js';
import type { MemoryManagerService } from '../memory/memory-manager.service.js';
import type { RetrievedMemory } from '../memory/memory-manager.types.js';
import type { PromptManagerService } from '../prompts/prompt-manager.service.js';
import { SafetyLayerService } from '../safety/safety-layer.service.js';
import { OrchestratorService } from './orchestrator.service.js';
import { RollingSummaryCache } from './rolling-summary.cache.js';
import {
  ROLLING_SUMMARY_RETAIN_RECENT_COUNT,
  ROLLING_SUMMARY_TRIGGER_MESSAGE_COUNT,
} from './rolling-summary.constants.js';

function fakeSession(overrides: Partial<AIAgentSession> = {}): AIAgentSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    languageId: 'lang-1',
    orchestratorAgent: 'CONVERSATION_PARTNER',
    specialistInvocations: null,
    status: 'ACTIVE',
    rollingSummary: null,
    summarizedThroughAt: null,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    endedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as AIAgentSession;
}

function fakeMessage(overrides: Partial<AIMessage> = {}): AIMessage {
  return {
    id: 'msg',
    sessionId: 'session-1',
    role: 'USER',
    content: 'hello',
    audioUrl: null,
    latencyMs: null,
    promptVersion: null,
    modelId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as AIMessage;
}

function buildMessages(count: number): AIMessage[] {
  return Array.from({ length: count }, (_, i) =>
    fakeMessage({
      id: `msg-${i}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      role: i % 2 === 0 ? 'USER' : 'ASSISTANT',
      content: `turn ${i}`,
    }),
  );
}

function fakePrisma(overrides: { session?: Partial<AIAgentSession>; messages?: AIMessage[] } = {}) {
  const session = fakeSession(overrides.session);
  return {
    aIAgentSession: {
      create: jest.fn().mockResolvedValue(session),
      findUnique: jest.fn().mockResolvedValue(session),
      findUniqueOrThrow: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue(session),
    },
    aIMessage: {
      create: jest.fn().mockResolvedValue({ id: 'assistant-msg-1' }),
      findMany: jest.fn().mockResolvedValue(overrides.messages ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaClient & {
    aIAgentSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    aIMessage: { create: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  };
}

function fakeRouter(): jest.Mocked<Pick<RouterService, 'generate' | 'stream'>> {
  return { generate: jest.fn(), stream: jest.fn() };
}

async function* fakeStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk;
}

async function collectStream<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of iterable) {
    result.push(item);
  }
  return result;
}

function fakePromptManager(): jest.Mocked<Pick<PromptManagerService, 'getSystemPrompt'>> {
  return {
    getSystemPrompt: jest
      .fn()
      .mockReturnValue({ text: 'You are the persona.', promptVersion: 'v1' }),
  };
}

function fakeMemoryManager(
  memories: RetrievedMemory[] = [],
): jest.Mocked<Pick<MemoryManagerService, 'retrieveRelevantMemories'>> {
  return { retrieveRelevantMemories: jest.fn().mockResolvedValue(memories) };
}

function fakeGenerateResponse(overrides: Partial<GenerateResponse> = {}): GenerateResponse {
  return {
    content: 'a reply',
    inputTokens: 10,
    outputTokens: 5,
    modelId: 'claude-teacher-model',
    latencyMs: 42,
    ...overrides,
  };
}

/** The real, dependency-free SafetyLayerService — used everywhere except the dedicated "Safety Layer integration" tests below, so delimiting/sanitization behavior is exercised authentically, not mocked away. */
function realSafetyLayer(): SafetyLayerService {
  return new SafetyLayerService();
}

/** Defaults to NONE (no breach) everywhere except the dedicated "Cost Meter & Circuit Breaker integration" tests below. */
function fakeCircuitBreaker(): jest.Mocked<Pick<CircuitBreakerService, 'checkBreachState'>> {
  return { checkBreachState: jest.fn().mockResolvedValue('NONE') };
}

function fakeCostMeter(): jest.Mocked<Pick<CostMeterService, 'recordUsage'>> {
  return { recordUsage: jest.fn().mockResolvedValue({ costUsdMicros: 0 }) };
}

describe('OrchestratorService', () => {
  describe('startSession', () => {
    it('creates a new AIAgentSession row and returns its id', async () => {
      const prisma = fakePrisma();
      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      const result = await service.startSession({
        userId: 'user-1',
        languageId: 'lang-1',
        orchestratorAgent: 'CONVERSATION_PARTNER',
      });

      expect(prisma.aIAgentSession.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', languageId: 'lang-1', orchestratorAgent: 'CONVERSATION_PARTNER' },
      });
      expect(result).toEqual({ sessionId: 'session-1' });
    });
  });

  describe('sendMessage', () => {
    it('rejects a message to a session that is not ACTIVE, without writing anything', async () => {
      const prisma = fakePrisma({ session: { status: 'ENDED' } });
      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await expect(
        service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} }),
      ).rejects.toThrow('status is "ENDED", not ACTIVE');
      expect(prisma.aIMessage.create).not.toHaveBeenCalled();
    });

    it('writes the user message, derives the persona from the session (not a caller-supplied value), and writes the assistant reply', async () => {
      const priorMessages = buildMessages(2);
      const prisma = fakePrisma({
        session: { orchestratorAgent: 'EXAM_COACH' },
        messages: [...priorMessages, fakeMessage({ id: 'msg-new', role: 'USER', content: 'hi' })],
      });
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeGenerateResponse({ content: 'welcome back' }));
      const promptManager = fakePromptManager();

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        promptManager as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      const result = await service.sendMessage({
        sessionId: 'session-1',
        userMessage: 'hi',
        variables: { targetLanguageName: 'Spanish' },
      });

      expect(prisma.aIMessage.create).toHaveBeenNthCalledWith(1, {
        data: { sessionId: 'session-1', role: 'USER', content: 'hi' },
      });
      expect(promptManager.getSystemPrompt).toHaveBeenCalledWith('EXAM_COACH', {
        targetLanguageName: 'Spanish',
      });
      expect(router.generate).toHaveBeenCalledWith(
        'teacher',
        expect.objectContaining({ systemPrompt: 'You are the persona.' }),
        'default',
      );
      expect(prisma.aIMessage.create).toHaveBeenNthCalledWith(2, {
        data: {
          sessionId: 'session-1',
          role: 'ASSISTANT',
          content: 'welcome back',
          promptVersion: 'v1',
          modelId: 'claude-teacher-model',
          latencyMs: 42,
        },
      });
      expect(result).toEqual({
        messageId: 'assistant-msg-1',
        assistantMessage: 'welcome back',
        promptVersion: 'v1',
        modelId: 'claude-teacher-model',
      });
    });

    it('sends the full message history verbatim when the session is short (no rolling summarization yet)', async () => {
      const messages = buildMessages(4);
      const prisma = fakePrisma({ messages });
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeGenerateResponse());

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} });

      expect(router.generate).toHaveBeenCalledTimes(1);
      const request = router.generate.mock.calls[0]![1];
      expect(request.messages).toHaveLength(4);
      expect(request.systemPrompt).toBe('You are the persona.');
    });

    it("retrieves relevant memories query-texted against the learner's message and injects them into the system prompt, boundary-delimited", async () => {
      const prisma = fakePrisma({ messages: buildMessages(1) });
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeGenerateResponse());
      const memoryManager = fakeMemoryManager([
        { id: 'mem-1', category: 'MISTAKE', fact: 'confuses ser/estar', confidence: 0.9 },
      ]);

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        memoryManager as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.sendMessage({
        sessionId: 'session-1',
        userMessage: 'how do I say...',
        variables: {},
      });

      expect(memoryManager.retrieveRelevantMemories).toHaveBeenCalledWith({
        userId: 'user-1',
        languageId: 'lang-1',
        queryText: 'how do I say...',
      });
      const request = router.generate.mock.calls[0]![1];
      expect(request.systemPrompt).toContain('What you already know about this learner:');
      expect(request.systemPrompt).toContain('confuses ser/estar');
      expect(request.systemPrompt).toContain('<untrusted_context label="learner_memory">');
    });

    it('does not add a memory section to the system prompt when no memories are retrieved', async () => {
      const prisma = fakePrisma({ messages: buildMessages(1) });
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeGenerateResponse());

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager([]) as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} });

      const request = router.generate.mock.calls[0]![1];
      expect(request.systemPrompt).toBe('You are the persona.');
    });

    it('falls back to the durable AIAgentSession.rollingSummary/summarizedThroughAt when the in-process cache misses', async () => {
      const boundary = new Date('2026-01-01T00:00:10Z');
      const messages = [
        fakeMessage({ id: 'old', createdAt: new Date('2026-01-01T00:00:00Z') }),
        fakeMessage({ id: 'recent', createdAt: new Date('2026-01-01T00:00:20Z') }),
      ];
      const prisma = fakePrisma({
        session: { rollingSummary: 'durable prior summary', summarizedThroughAt: boundary },
        messages,
      });
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeGenerateResponse());
      const cache = new RollingSummaryCache();

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        cache,
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} });

      const request = router.generate.mock.calls[0]![1];
      expect(request.systemPrompt).toContain('durable prior summary');
      expect(request.messages).toHaveLength(1);
      expect(cache.get('session-1')?.summary).toBe('durable prior summary');
    });

    it('folds older turns into a rolling summary once the unsummarized tail exceeds the trigger, retaining only the most recent turns verbatim, and persists it durably, boundary-delimited', async () => {
      const messages = buildMessages(ROLLING_SUMMARY_TRIGGER_MESSAGE_COUNT + 2);
      const prisma = fakePrisma({ messages });
      const router = fakeRouter();
      router.generate
        .mockResolvedValueOnce(fakeGenerateResponse({ content: 'a fresh summary' }))
        .mockResolvedValueOnce(fakeGenerateResponse({ content: 'the real reply' }));
      const cache = new RollingSummaryCache();

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        cache,
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      const result = await service.sendMessage({
        sessionId: 'session-1',
        userMessage: 'hi',
        variables: {},
      });

      expect(router.generate).toHaveBeenCalledTimes(2);

      const summarizeCall = router.generate.mock.calls[0]!;
      expect(summarizeCall[0]).toBe('teacher');
      expect(summarizeCall[1].messages).toHaveLength(1);
      expect(summarizeCall[1].messages[0]!.content).toContain('Conversation turns to summarize');
      expect(summarizeCall[1].systemPrompt).toContain('Summarize the following conversation');

      const replyCall = router.generate.mock.calls[1]!;
      expect(replyCall[1].messages).toHaveLength(ROLLING_SUMMARY_RETAIN_RECENT_COUNT);
      expect(replyCall[1].systemPrompt).toContain('Summary of the conversation so far:');
      expect(replyCall[1].systemPrompt).toContain('a fresh summary');
      expect(replyCall[1].systemPrompt).toContain(
        '<untrusted_context label="conversation_summary">',
      );

      expect(cache.get('session-1')?.summary).toBe('a fresh summary');
      expect(prisma.aIAgentSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { rollingSummary: 'a fresh summary', summarizedThroughAt: expect.any(Date) },
      });
      expect(result.assistantMessage).toBe('the real reply');
    });

    it('reuses a cached summary without re-summarizing while the unsummarized tail stays within the trigger', async () => {
      const messages = buildMessages(3);
      const prisma = fakePrisma({ messages });
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeGenerateResponse());
      const cache = new RollingSummaryCache();
      cache.set('session-1', { summary: 'prior summary', summarizedThroughCreatedAt: new Date(0) });

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        cache,
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} });

      expect(router.generate).toHaveBeenCalledTimes(1);
      const request = router.generate.mock.calls[0]![1];
      expect(request.systemPrompt).toContain('prior summary');
      expect(request.messages).toHaveLength(3);
    });

    it('folds the previous summary into a new one when the tail grows past the trigger again', async () => {
      const messages = buildMessages(ROLLING_SUMMARY_TRIGGER_MESSAGE_COUNT + 2);
      const prisma = fakePrisma({ messages });
      const router = fakeRouter();
      router.generate
        .mockResolvedValueOnce(fakeGenerateResponse({ content: 'an updated summary' }))
        .mockResolvedValueOnce(fakeGenerateResponse());
      const cache = new RollingSummaryCache();
      cache.set('session-1', {
        summary: 'an old summary',
        summarizedThroughCreatedAt: new Date(0),
      });

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        cache,
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} });

      const summarizeCall = router.generate.mock.calls[0]!;
      expect(summarizeCall[1].messages[0]!.content).toContain('Existing summary of earlier turns:');
      expect(summarizeCall[1].messages[0]!.content).toContain('an old summary');
      expect(cache.get('session-1')?.summary).toBe('an updated summary');
    });
  });

  describe('endSession', () => {
    it('marks the session ENDED with an endedAt timestamp, and clears its rolling summary cache entry', async () => {
      const prisma = fakePrisma();
      const cache = new RollingSummaryCache();
      cache.set('session-1', { summary: 'x', summarizedThroughCreatedAt: new Date() });

      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        cache,
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.endSession({ sessionId: 'session-1', userId: 'user-1' });

      expect(prisma.aIAgentSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { status: 'ENDED', endedAt: expect.any(Date) },
      });
      expect(cache.get('session-1')).toBeUndefined();
    });

    it('404s (not a silent no-op) when the caller is not the session owner, and never updates it', async () => {
      const prisma = fakePrisma();
      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await expect(
        service.endSession({ sessionId: 'session-1', userId: 'a-different-user' }),
      ).rejects.toThrow('AI agent session not found');
      expect(prisma.aIAgentSession.update).not.toHaveBeenCalled();
    });

    it('404s when the session does not exist', async () => {
      const prisma = fakePrisma();
      prisma.aIAgentSession.findUnique.mockResolvedValue(null);
      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await expect(
        service.endSession({ sessionId: 'session-1', userId: 'user-1' }),
      ).rejects.toThrow('AI agent session not found');
      expect(prisma.aIAgentSession.update).not.toHaveBeenCalled();
    });
  });

  describe('abandonSession', () => {
    it('marks the session ABANDONED with an endedAt timestamp, and clears its rolling summary cache entry', async () => {
      const prisma = fakePrisma();
      const cache = new RollingSummaryCache();
      cache.set('session-1', { summary: 'x', summarizedThroughCreatedAt: new Date() });

      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        cache,
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.abandonSession({ sessionId: 'session-1', userId: 'user-1' });

      expect(prisma.aIAgentSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { status: 'ABANDONED', endedAt: expect.any(Date) },
      });
      expect(cache.get('session-1')).toBeUndefined();
    });

    it('is a silent no-op (never a second write) when the session already transitioned out of ACTIVE', async () => {
      const prisma = fakePrisma({ session: { status: 'ENDED' } });
      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.abandonSession({ sessionId: 'session-1', userId: 'user-1' });

      expect(prisma.aIAgentSession.update).not.toHaveBeenCalled();
    });

    it('404s (not a silent no-op) when the caller is not the session owner, and never updates it', async () => {
      const prisma = fakePrisma();
      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await expect(
        service.abandonSession({ sessionId: 'session-1', userId: 'a-different-user' }),
      ).rejects.toThrow('AI agent session not found');
      expect(prisma.aIAgentSession.update).not.toHaveBeenCalled();
    });

    it('404s when the session does not exist', async () => {
      const prisma = fakePrisma();
      prisma.aIAgentSession.findUnique.mockResolvedValue(null);
      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await expect(
        service.abandonSession({ sessionId: 'session-1', userId: 'user-1' }),
      ).rejects.toThrow('AI agent session not found');
      expect(prisma.aIAgentSession.update).not.toHaveBeenCalled();
    });
  });

  describe('updateMessageAudioUrl', () => {
    it('attaches the audioUrl to the message, scoped to its own session', async () => {
      const prisma = fakePrisma();
      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.updateMessageAudioUrl({
        sessionId: 'session-1',
        messageId: 'assistant-msg-1',
        audioUrl: 'https://storage.example.com/assistant-msg-1.mp3',
      });

      expect(prisma.aIMessage.updateMany).toHaveBeenCalledWith({
        where: { id: 'assistant-msg-1', sessionId: 'session-1' },
        data: { audioUrl: 'https://storage.example.com/assistant-msg-1.mp3' },
      });
    });

    it('404s (not a silent no-op) when the message does not exist or belongs to a different session', async () => {
      const prisma = fakePrisma();
      prisma.aIMessage.updateMany.mockResolvedValue({ count: 0 });
      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await expect(
        service.updateMessageAudioUrl({
          sessionId: 'session-1',
          messageId: 'not-real',
          audioUrl: 'https://storage.example.com/not-real.mp3',
        }),
      ).rejects.toThrow('AI message not found');
    });
  });

  describe('Safety Layer integration (T8)', () => {
    it('sanitizes the model output before storing and returning it', async () => {
      const prisma = fakePrisma({ messages: buildMessages(1) });
      const router = fakeRouter();
      router.generate.mockResolvedValue(
        fakeGenerateResponse({ content: '<script>alert(1)</script>safe text' }),
      );

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      const result = await service.sendMessage({
        sessionId: 'session-1',
        userMessage: 'hi',
        variables: {},
      });

      expect(result.assistantMessage).toBe('alert(1)safe text');
      expect(prisma.aIMessage.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({ content: 'alert(1)safe text' }),
      });
    });

    it('records a human-review sample keyed to the real session and assistant-message id', async () => {
      const prisma = fakePrisma({ messages: buildMessages(1) });
      prisma.aIMessage.create
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ id: 'assistant-msg-42' });
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeGenerateResponse());
      const safetyLayer = {
        delimitUntrustedContent: jest.fn((_label: string, text: string) => text),
        sanitizeOutput: jest.fn((text: string) => text),
        resolveAgeBracket: jest.fn(),
        recordSampleForReviewIfDue: jest.fn(),
      } as unknown as SafetyLayerService;

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        safetyLayer,
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} });

      expect(safetyLayer.recordSampleForReviewIfDue).toHaveBeenCalledWith({
        sessionId: 'session-1',
        messageId: 'assistant-msg-42',
      });
    });
  });

  describe('Cost Meter & Circuit Breaker integration (T9)', () => {
    it('checks the circuit breaker before calling the Router, and records real usage via CostMeterService afterward', async () => {
      const prisma = fakePrisma({
        session: { orchestratorAgent: 'EXAM_COACH' },
        messages: buildMessages(1),
      });
      const router = fakeRouter();
      router.generate.mockResolvedValue(
        fakeGenerateResponse({ modelId: 'claude-teacher-model', inputTokens: 20, outputTokens: 8 }),
      );
      const circuitBreaker = fakeCircuitBreaker();
      const costMeter = fakeCostMeter();

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        circuitBreaker as unknown as CircuitBreakerService,
        costMeter as unknown as CostMeterService,
      );

      await service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} });

      expect(circuitBreaker.checkBreachState).toHaveBeenCalled();
      expect(costMeter.recordUsage).toHaveBeenCalledWith({
        userId: 'user-1',
        agentPersona: 'EXAM_COACH',
        modelId: 'claude-teacher-model',
        promptVersion: 'v1',
        inputTokens: 20,
        outputTokens: 8,
        latencyMs: 42,
      });
    });

    it('passes tier="economy" to the Router when the circuit breaker reports DEGRADE', async () => {
      const prisma = fakePrisma({ messages: buildMessages(1) });
      const router = fakeRouter();
      router.generate.mockResolvedValue(fakeGenerateResponse());
      const circuitBreaker = { checkBreachState: jest.fn().mockResolvedValue('DEGRADE') };

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        circuitBreaker as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} });

      expect(router.generate).toHaveBeenCalledWith('teacher', expect.anything(), 'economy');
    });

    it('throws a graceful error and never reaches the Router when the circuit breaker reports HARD_STOP', async () => {
      const prisma = fakePrisma({ messages: buildMessages(1) });
      const router = fakeRouter();
      const circuitBreaker = { checkBreachState: jest.fn().mockResolvedValue('HARD_STOP') };
      const costMeter = fakeCostMeter();

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        circuitBreaker as unknown as CircuitBreakerService,
        costMeter as unknown as CostMeterService,
      );

      await expect(
        service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} }),
      ).rejects.toThrow('cost circuit breaker threshold');
      expect(router.generate).not.toHaveBeenCalled();
      expect(costMeter.recordUsage).not.toHaveBeenCalled();
    });

    it('gates and records usage for the internal summarization sub-call too, not just the main reply', async () => {
      const messages = buildMessages(ROLLING_SUMMARY_TRIGGER_MESSAGE_COUNT + 2);
      const prisma = fakePrisma({
        session: { orchestratorAgent: 'CONVERSATION_PARTNER' },
        messages,
      });
      const router = fakeRouter();
      router.generate
        .mockResolvedValueOnce(
          fakeGenerateResponse({ content: 'a fresh summary', inputTokens: 100, outputTokens: 30 }),
        )
        .mockResolvedValueOnce(fakeGenerateResponse());
      const circuitBreaker = fakeCircuitBreaker();
      const costMeter = fakeCostMeter();

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        circuitBreaker as unknown as CircuitBreakerService,
        costMeter as unknown as CostMeterService,
      );

      await service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} });

      expect(circuitBreaker.checkBreachState).toHaveBeenCalledTimes(2);
      expect(costMeter.recordUsage).toHaveBeenCalledTimes(2);
      expect(costMeter.recordUsage).toHaveBeenNthCalledWith(1, {
        userId: 'user-1',
        agentPersona: 'CONVERSATION_PARTNER',
        modelId: 'claude-teacher-model',
        inputTokens: 100,
        outputTokens: 30,
        latencyMs: 42,
      });
    });
  });

  describe('streamMessage (T10, ADR-033)', () => {
    it('yields a token event per delta, then exactly one done event with the accumulated, sanitized text', async () => {
      const prisma = fakePrisma({
        session: { orchestratorAgent: 'EXAM_COACH' },
        messages: buildMessages(1),
      });
      const router = fakeRouter();
      router.stream.mockReturnValue(
        fakeStream([
          { delta: 'hel', done: false },
          { delta: 'lo', done: false },
          {
            delta: '',
            done: true,
            usage: {
              inputTokens: 12,
              outputTokens: 6,
              modelId: 'claude-teacher-model',
              latencyMs: 55,
            },
          },
        ]),
      );
      const promptManager = fakePromptManager();

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        promptManager as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      const events = await collectStream(
        service.streamMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} }),
      );

      expect(events).toEqual([
        { type: 'token', delta: 'hel' },
        { type: 'token', delta: 'lo' },
        {
          type: 'done',
          messageId: 'assistant-msg-1',
          assistantMessage: 'hello',
          promptVersion: 'v1',
          modelId: 'claude-teacher-model',
        },
      ]);
      expect(prisma.aIMessage.create).toHaveBeenNthCalledWith(2, {
        data: {
          sessionId: 'session-1',
          role: 'ASSISTANT',
          content: 'hello',
          promptVersion: 'v1',
          modelId: 'claude-teacher-model',
          latencyMs: 55,
        },
      });
    });

    it('checks the circuit breaker before streaming and passes tier="economy" on DEGRADE, same as sendMessage', async () => {
      const prisma = fakePrisma({ messages: buildMessages(1) });
      const router = fakeRouter();
      router.stream.mockReturnValue(
        fakeStream([
          {
            delta: 'hi',
            done: true,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              modelId: 'claude-teacher-model',
              latencyMs: 1,
            },
          },
        ]),
      );
      const circuitBreaker = { checkBreachState: jest.fn().mockResolvedValue('DEGRADE') };

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        circuitBreaker as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await collectStream(
        service.streamMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} }),
      );

      expect(router.stream).toHaveBeenCalledWith('teacher', expect.anything(), 'economy');
    });

    it('throws before ever calling the Router when the circuit breaker reports HARD_STOP', async () => {
      const prisma = fakePrisma({ messages: buildMessages(1) });
      const router = fakeRouter();
      const circuitBreaker = { checkBreachState: jest.fn().mockResolvedValue('HARD_STOP') };

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        circuitBreaker as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await expect(
        collectStream(
          service.streamMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} }),
        ),
      ).rejects.toThrow('cost circuit breaker threshold');
      expect(router.stream).not.toHaveBeenCalled();
    });

    it('records cost usage and human-review sampling exactly once, after the stream completes', async () => {
      const prisma = fakePrisma({ messages: buildMessages(1) });
      prisma.aIMessage.create
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ id: 'assistant-msg-77' });
      const router = fakeRouter();
      router.stream.mockReturnValue(
        fakeStream([
          {
            delta: 'reply',
            done: true,
            usage: {
              inputTokens: 3,
              outputTokens: 4,
              modelId: 'claude-teacher-model',
              latencyMs: 9,
            },
          },
        ]),
      );
      const costMeter = fakeCostMeter();
      const safetyLayer = {
        delimitUntrustedContent: jest.fn((_label: string, text: string) => text),
        sanitizeOutput: jest.fn((text: string) => text),
        resolveAgeBracket: jest.fn(),
        recordSampleForReviewIfDue: jest.fn(),
      } as unknown as SafetyLayerService;

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        safetyLayer,
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        costMeter as unknown as CostMeterService,
      );

      await collectStream(
        service.streamMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} }),
      );

      expect(costMeter.recordUsage).toHaveBeenCalledTimes(1);
      expect(costMeter.recordUsage).toHaveBeenCalledWith({
        userId: 'user-1',
        agentPersona: 'CONVERSATION_PARTNER',
        modelId: 'claude-teacher-model',
        promptVersion: 'v1',
        inputTokens: 3,
        outputTokens: 4,
        latencyMs: 9,
      });
      expect(safetyLayer.recordSampleForReviewIfDue).toHaveBeenCalledWith({
        sessionId: 'session-1',
        messageId: 'assistant-msg-77',
      });
    });

    it('throws a clear error if the stream ends without a final usage-bearing chunk', async () => {
      const prisma = fakePrisma({ messages: buildMessages(1) });
      const router = fakeRouter();
      router.stream.mockReturnValue(fakeStream([{ delta: 'partial', done: false }]));

      const service = new OrchestratorService(
        prisma,
        router as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        fakeMemoryManager() as unknown as MemoryManagerService,
        realSafetyLayer(),
        new RollingSummaryCache(),
        fakeCircuitBreaker() as unknown as CircuitBreakerService,
        fakeCostMeter() as unknown as CostMeterService,
      );

      await expect(
        collectStream(
          service.streamMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} }),
        ),
      ).rejects.toThrow('Stream ended without usage metadata');
    });
  });
});
