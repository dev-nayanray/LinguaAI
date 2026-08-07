import { describe, expect, it } from 'vitest';

import {
  agentMessageDoneEventSchema,
  agentMessageErrorEventSchema,
  agentMessageStreamEventSchema,
  agentMessageTokenEventSchema,
  aiAgentSessionSchema,
  sendAgentMessageRequestSchema,
  startAgentSessionRequestSchema,
  startAgentSessionResponseSchema,
} from './index.js';

const uuid = '9c858f1b-45c0-4b8e-9c1e-2f6a9c9b6d21';
const timestamp = '2026-08-07T12:00:00.000Z';

describe('aiAgentSessionSchema', () => {
  const valid = {
    id: uuid,
    userId: uuid,
    languageId: uuid,
    orchestratorAgent: 'CONVERSATION_PARTNER',
    status: 'ACTIVE',
    startedAt: timestamp,
    endedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  it('accepts a valid active session', () => {
    expect(aiAgentSessionSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an orchestratorAgent outside the five-value enum', () => {
    const result = aiAgentSessionSchema.safeParse({
      ...valid,
      orchestratorAgent: 'GRAMMAR_COACH',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a non-null endedAt for an ended session', () => {
    const result = aiAgentSessionSchema.safeParse({
      ...valid,
      status: 'ENDED',
      endedAt: timestamp,
    });
    expect(result.success).toBe(true);
  });
});

describe('startAgentSessionRequestSchema', () => {
  it('accepts a valid request', () => {
    const result = startAgentSessionRequestSchema.safeParse({
      userId: uuid,
      languageId: uuid,
      orchestratorAgent: 'EXAM_COACH',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid userId', () => {
    const result = startAgentSessionRequestSchema.safeParse({
      userId: 'not-a-uuid',
      languageId: uuid,
      orchestratorAgent: 'EXAM_COACH',
    });
    expect(result.success).toBe(false);
  });
});

describe('startAgentSessionResponseSchema', () => {
  it('accepts a valid sessionId', () => {
    expect(startAgentSessionResponseSchema.safeParse({ sessionId: uuid }).success).toBe(true);
  });
});

describe('sendAgentMessageRequestSchema', () => {
  it('accepts a message with no variables, defaulting variables to {}', () => {
    const result = sendAgentMessageRequestSchema.safeParse({ userMessage: 'hola' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variables).toEqual({});
    }
  });

  it('accepts a message with variables', () => {
    const result = sendAgentMessageRequestSchema.safeParse({
      userMessage: 'hola',
      variables: { targetLanguageName: 'Spanish' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty userMessage', () => {
    expect(sendAgentMessageRequestSchema.safeParse({ userMessage: '' }).success).toBe(false);
  });

  it('rejects a userMessage over the 8000-character cap', () => {
    const result = sendAgentMessageRequestSchema.safeParse({ userMessage: 'x'.repeat(8001) });
    expect(result.success).toBe(false);
  });
});

describe('agentMessageStreamEventSchema', () => {
  it('accepts a token event', () => {
    expect(agentMessageTokenEventSchema.safeParse({ type: 'token', delta: 'hel' }).success).toBe(
      true,
    );
  });

  it('accepts a done event', () => {
    const result = agentMessageDoneEventSchema.safeParse({
      type: 'done',
      assistantMessage: 'hello',
      promptVersion: 'v1',
      modelId: 'claude-teacher-model',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an error event', () => {
    expect(
      agentMessageErrorEventSchema.safeParse({ type: 'error', message: 'stream interrupted' })
        .success,
    ).toBe(true);
  });

  it('discriminates correctly on the type field via the union', () => {
    expect(agentMessageStreamEventSchema.safeParse({ type: 'token', delta: 'x' }).success).toBe(
      true,
    );
    expect(agentMessageStreamEventSchema.safeParse({ type: 'unknown', delta: 'x' }).success).toBe(
      false,
    );
  });
});
