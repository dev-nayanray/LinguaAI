import type { AIAgentSession, AIMessage, PrismaClient } from '@linguaai/database';

import type { GenerateResponse } from '../gateway/model-provider.interface.js';
import type { RouterService } from '../gateway/router.service.js';
import type { PromptManagerService } from '../prompts/prompt-manager.service.js';
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
      findUniqueOrThrow: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue(session),
    },
    aIMessage: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(overrides.messages ?? []),
    },
  } as unknown as PrismaClient & {
    aIAgentSession: { create: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
    aIMessage: { create: jest.Mock; findMany: jest.Mock };
  };
}

function fakeRouter(): jest.Mocked<Pick<RouterService, 'generate'>> {
  return { generate: jest.fn() };
}

function fakePromptManager(): jest.Mocked<Pick<PromptManagerService, 'getSystemPrompt'>> {
  return {
    getSystemPrompt: jest
      .fn()
      .mockReturnValue({ text: 'You are the persona.', promptVersion: 'v1' }),
  };
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

describe('OrchestratorService', () => {
  describe('startSession', () => {
    it('creates a new AIAgentSession row and returns its id', async () => {
      const prisma = fakePrisma();
      const service = new OrchestratorService(
        prisma,
        fakeRouter() as unknown as RouterService,
        fakePromptManager() as unknown as PromptManagerService,
        new RollingSummaryCache(),
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
        new RollingSummaryCache(),
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
        new RollingSummaryCache(),
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
        new RollingSummaryCache(),
      );

      await service.sendMessage({ sessionId: 'session-1', userMessage: 'hi', variables: {} });

      expect(router.generate).toHaveBeenCalledTimes(1);
      const request = router.generate.mock.calls[0]![1];
      expect(request.messages).toHaveLength(4);
      expect(request.systemPrompt).toBe('You are the persona.');
    });

    it('folds older turns into a rolling summary once the unsummarized tail exceeds the trigger, retaining only the most recent turns verbatim', async () => {
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
        cache,
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

      expect(cache.get('session-1')?.summary).toBe('a fresh summary');
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
        cache,
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
        cache,
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
        cache,
      );

      await service.endSession({ sessionId: 'session-1' });

      expect(prisma.aIAgentSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { status: 'ENDED', endedAt: expect.any(Date) },
      });
      expect(cache.get('session-1')).toBeUndefined();
    });
  });
});
