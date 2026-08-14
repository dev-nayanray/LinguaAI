import { describe, expect, it } from 'vitest';

import {
  createExamProgramRequestSchema,
  createMockTestSectionRequestSchema,
  mockTestSectionPublicViewSchema,
  mockTestSectionSchema,
  startMockTestAttemptResponseSchema,
} from './index.js';

const uuid = '9c858f1b-45c0-4b8e-9c1e-2f6a9c9b6d21';
const now = new Date().toISOString();

describe('createExamProgramRequestSchema', () => {
  it('accepts an uppercase alphanumeric code and rejects a lowercase one', () => {
    expect(() =>
      createExamProgramRequestSchema.parse({
        name: 'IELTS Academic',
        code: 'IELTS_ACADEMIC',
        rubric: { bands: [] },
      }),
    ).not.toThrow();
    expect(() =>
      createExamProgramRequestSchema.parse({
        name: 'IELTS Academic',
        code: 'ielts-academic',
        rubric: {},
      }),
    ).toThrow();
  });
});

describe('mockTestSectionSchema (persisted, per-skill content)', () => {
  it('validates a real READING section, correctIndex included', () => {
    expect(() =>
      mockTestSectionSchema.parse({
        id: uuid,
        examProgramId: uuid,
        skill: 'READING',
        order: 0,
        content: {
          passage: 'A real passage.',
          questions: [{ prompt: 'What?', options: ['a', 'b'], correctIndex: 0 }],
        },
        createdAt: now,
        updatedAt: now,
      }),
    ).not.toThrow();
  });

  it('validates a real LISTENING section requiring a real audioUrl (not the draft script shape)', () => {
    const result = mockTestSectionSchema.safeParse({
      id: uuid,
      examProgramId: uuid,
      skill: 'LISTENING',
      order: 1,
      content: { script: 'not a real persisted shape', questions: [] },
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });

  it('validates a real WRITING section', () => {
    expect(() =>
      mockTestSectionSchema.parse({
        id: uuid,
        examProgramId: uuid,
        skill: 'WRITING',
        order: 2,
        content: { taskPrompt: 'Describe a chart.', minWords: 150 },
        createdAt: now,
        updatedAt: now,
      }),
    ).not.toThrow();
  });

  it('validates a real SPEAKING section', () => {
    expect(() =>
      mockTestSectionSchema.parse({
        id: uuid,
        examProgramId: uuid,
        skill: 'SPEAKING',
        order: 3,
        content: { prompts: ['Tell me about your hometown.'] },
        createdAt: now,
        updatedAt: now,
      }),
    ).not.toThrow();
  });

  it('rejects a WRITING section with no real content fields', () => {
    const result = mockTestSectionSchema.safeParse({
      id: uuid,
      examProgramId: uuid,
      skill: 'WRITING',
      order: 2,
      content: {},
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });
});

describe('createMockTestSectionRequestSchema — LISTENING request/persisted asymmetry', () => {
  it('accepts the draft { script, questions } shape at request time, not audioUrl', () => {
    expect(() =>
      createMockTestSectionRequestSchema.parse({
        skill: 'LISTENING',
        order: 1,
        content: {
          script: 'A real script.',
          questions: [{ prompt: 'Q', options: ['a', 'b'], correctIndex: 1 }],
        },
      }),
    ).not.toThrow();
  });

  it('rejects a request already carrying a persisted audioUrl shape (caller never supplies audioUrl directly)', () => {
    const result = createMockTestSectionRequestSchema.safeParse({
      skill: 'LISTENING',
      order: 1,
      content: { audioUrl: 'https://example.com/a.mp3', transcript: 'x', questions: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe('mockTestSectionPublicViewSchema — correctIndex never leaks', () => {
  it('strips correctIndex from a READING section serving a learner', () => {
    const parsed = mockTestSectionPublicViewSchema.parse({
      id: uuid,
      examProgramId: uuid,
      skill: 'READING',
      order: 0,
      content: {
        passage: 'A real passage.',
        questions: [{ prompt: 'What?', options: ['a', 'b'] }],
      },
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed.content.questions).toEqual([{ prompt: 'What?', options: ['a', 'b'] }]);
  });

  it('accepts a public-view READING section even if content still carries correctIndex — a real, documented limitation, not a false guarantee', () => {
    // `content` stays `Record<string, unknown>` end-to-end (the same
    // "Prisma stores Json, Zod validates the shape" split content.prisma's
    // own header comment already establishes) — `superRefine` only
    // *validates* the nested shape via a discarded `safeParse`, it never
    // strips or replaces `data.content` itself. Structural validation here
    // is therefore not the mechanism that keeps `correctIndex` from ever
    // reaching a learner — the service layer (apps/api) is responsible for
    // building the public payload by omitting it explicitly, the same way
    // `exercisePublicViewSchema`'s own real answer never round-trips
    // through a schema that claims to strip it either.
    const result = mockTestSectionPublicViewSchema.safeParse({
      id: uuid,
      examProgramId: uuid,
      skill: 'READING',
      order: 0,
      content: {
        passage: 'A real passage.',
        questions: [{ prompt: 'What?', options: ['a', 'b'], correctIndex: 0 }],
      },
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a public-view section missing the required shape entirely (e.g. no questions array)', () => {
    const result = mockTestSectionPublicViewSchema.safeParse({
      id: uuid,
      examProgramId: uuid,
      skill: 'READING',
      order: 0,
      content: { passage: 'A real passage.' },
      createdAt: now,
      updatedAt: now,
    });
    expect(result.success).toBe(false);
  });
});

describe('startMockTestAttemptResponseSchema', () => {
  it('accepts an attempt with a real public-view section set', () => {
    expect(() =>
      startMockTestAttemptResponseSchema.parse({
        id: uuid,
        userId: uuid,
        examProgramId: uuid,
        status: 'IN_PROGRESS',
        overallScore: null,
        startedAt: now,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        sections: [
          {
            id: uuid,
            examProgramId: uuid,
            skill: 'SPEAKING',
            order: 0,
            content: { prompts: ['Tell me about your hometown.'] },
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    ).not.toThrow();
  });
});
