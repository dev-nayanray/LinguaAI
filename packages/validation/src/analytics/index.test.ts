import { describe, expect, it } from 'vitest';

import {
  aiCostResponseSchema,
  cefrProgressionQuerySchema,
  cefrProgressionResponseSchema,
  overviewResponseSchema,
} from './index.js';

const uuid = '9c858f1b-45c0-4b8e-9c1e-2f6a9c9b6d21';

describe('cefrProgressionQuerySchema', () => {
  it('requires languageId; from/to are optional', () => {
    expect(() => cefrProgressionQuerySchema.parse({ languageId: uuid })).not.toThrow();
    expect(() => cefrProgressionQuerySchema.parse({})).toThrow();
  });
});

describe('cefrProgressionResponseSchema', () => {
  it('accepts a real response, including a null progressionRate for a skill with no qualifying users', () => {
    expect(() =>
      cefrProgressionResponseSchema.parse({
        languageId: uuid,
        from: null,
        to: null,
        bySkill: [
          {
            skill: 'READING',
            usersWithMultipleRecords: 10,
            usersAdvanced: 4,
            progressionRate: 0.4,
          },
          {
            skill: 'WRITING',
            usersWithMultipleRecords: 0,
            usersAdvanced: 0,
            progressionRate: null,
          },
        ],
      }),
    ).not.toThrow();
  });
});

describe('aiCostResponseSchema', () => {
  it('accepts a real response', () => {
    expect(() =>
      aiCostResponseSchema.parse({
        from: null,
        to: null,
        totalCostUsdMicros: 1_500_000,
        totalRequests: 42,
        byAgentPersona: [
          { key: 'CONVERSATION_PARTNER', costUsdMicros: 1_000_000, requestCount: 30 },
        ],
        byModelId: [{ key: 'gpt-4o', costUsdMicros: 1_500_000, requestCount: 42 }],
      }),
    ).not.toThrow();
  });
});

describe('overviewResponseSchema', () => {
  it('accepts a real response, including a null rate/cost-per-user for an empty cohort', () => {
    expect(() =>
      overviewResponseSchema.parse({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T00:00:00.000Z',
        activation: { cohortSize: 10, count: 4, rate: 0.4 },
        retention: {
          d1: { cohortSize: 10, count: 6, rate: 0.6 },
          d7: { cohortSize: 10, count: 3, rate: 0.3 },
          d30: { cohortSize: 0, count: 0, rate: null },
        },
        conversion: { cohortSize: 10, count: 2, rate: 0.2 },
        aiCostPerActiveUser: {
          totalCostUsdMicros: 0,
          activeUserCount: 0,
          costPerActiveUserUsdMicros: null,
        },
      }),
    ).not.toThrow();
  });
});
