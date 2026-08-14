import { AnalyticsService } from './analytics.service.js';

const LANGUAGE_ID = '11111111-1111-4111-8111-111111111111';

describe('AnalyticsService', () => {
  describe('getCefrProgression', () => {
    const findMany = jest.fn();
    const prisma = { proficiencyLevelHistory: { findMany } };

    function buildService(): AnalyticsService {
      return new AnalyticsService(prisma as never);
    }

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('counts a user with 2 identical-level records as "multiple records" with 0 advancement — not silently skipped', async () => {
      findMany.mockResolvedValue([
        { userId: 'u-1', skill: 'READING', cefrLevel: 'B1', recordedAt: new Date('2026-01-01') },
        { userId: 'u-1', skill: 'READING', cefrLevel: 'B1', recordedAt: new Date('2026-02-01') },
      ]);
      const service = buildService();

      const result = await service.getCefrProgression({ languageId: LANGUAGE_ID });

      const reading = result.bySkill.find((s) => s.skill === 'READING');
      expect(reading).toEqual({
        skill: 'READING',
        usersWithMultipleRecords: 1,
        usersAdvanced: 0,
        progressionRate: 0,
      });
    });

    it('counts real advancement between the earliest and latest recorded entry', async () => {
      findMany.mockResolvedValue([
        { userId: 'u-1', skill: 'READING', cefrLevel: 'A1', recordedAt: new Date('2026-01-01') },
        { userId: 'u-1', skill: 'READING', cefrLevel: 'B1', recordedAt: new Date('2026-03-01') },
        { userId: 'u-2', skill: 'READING', cefrLevel: 'A2', recordedAt: new Date('2026-01-01') },
        { userId: 'u-2', skill: 'READING', cefrLevel: 'A2', recordedAt: new Date('2026-03-01') },
      ]);
      const service = buildService();

      const result = await service.getCefrProgression({ languageId: LANGUAGE_ID });

      const reading = result.bySkill.find((s) => s.skill === 'READING');
      expect(reading).toEqual({
        skill: 'READING',
        usersWithMultipleRecords: 2,
        usersAdvanced: 1,
        progressionRate: 0.5,
      });
    });

    it('excludes a user with only a single record from the denominator entirely', async () => {
      findMany.mockResolvedValue([
        { userId: 'u-1', skill: 'READING', cefrLevel: 'B1', recordedAt: new Date('2026-01-01') },
      ]);
      const service = buildService();

      const result = await service.getCefrProgression({ languageId: LANGUAGE_ID });

      const reading = result.bySkill.find((s) => s.skill === 'READING');
      expect(reading).toEqual({
        skill: 'READING',
        usersWithMultipleRecords: 0,
        usersAdvanced: 0,
        progressionRate: null,
      });
    });

    it('never regresses the rate for a real level decrease (e.g. a lower-confidence re-assessment)', async () => {
      findMany.mockResolvedValue([
        { userId: 'u-1', skill: 'READING', cefrLevel: 'B2', recordedAt: new Date('2026-01-01') },
        { userId: 'u-1', skill: 'READING', cefrLevel: 'B1', recordedAt: new Date('2026-03-01') },
      ]);
      const service = buildService();

      const result = await service.getCefrProgression({ languageId: LANGUAGE_ID });

      const reading = result.bySkill.find((s) => s.skill === 'READING');
      expect(reading?.usersAdvanced).toBe(0);
      expect(reading?.usersWithMultipleRecords).toBe(1);
    });

    it('applies the date-range filter to the underlying query when provided', async () => {
      findMany.mockResolvedValue([]);
      const service = buildService();

      await service.getCefrProgression({
        languageId: LANGUAGE_ID,
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-06-01T00:00:00.000Z',
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            languageId: LANGUAGE_ID,
            recordedAt: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
              lte: new Date('2026-06-01T00:00:00.000Z'),
            },
          }),
        }),
      );
    });

    it('returns all 6 real skills, even ones with zero data', async () => {
      findMany.mockResolvedValue([]);
      const service = buildService();

      const result = await service.getCefrProgression({ languageId: LANGUAGE_ID });

      expect(result.bySkill.map((s) => s.skill).sort()).toEqual(
        ['GRAMMAR', 'LISTENING', 'READING', 'SPEAKING', 'VOCABULARY', 'WRITING'].sort(),
      );
    });
  });

  describe('getAiCost', () => {
    const aggregate = jest.fn();
    const groupBy = jest.fn();
    const prisma = { aIUsageLog: { aggregate, groupBy } };

    function buildService(): AnalyticsService {
      return new AnalyticsService(prisma as never);
    }

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns real totals and per-dimension breakdowns', async () => {
      aggregate.mockResolvedValue({ _sum: { costUsdMicros: 1_500_000 }, _count: 42 });
      groupBy.mockResolvedValueOnce([
        { agentPersona: 'CONVERSATION_PARTNER', _sum: { costUsdMicros: 1_000_000 }, _count: 30 },
      ]);
      groupBy.mockResolvedValueOnce([
        { modelId: 'gpt-4o', _sum: { costUsdMicros: 1_500_000 }, _count: 42 },
      ]);
      const service = buildService();

      const result = await service.getAiCost({});

      expect(result).toEqual({
        from: null,
        to: null,
        totalCostUsdMicros: 1_500_000,
        totalRequests: 42,
        byAgentPersona: [
          { key: 'CONVERSATION_PARTNER', costUsdMicros: 1_000_000, requestCount: 30 },
        ],
        byModelId: [{ key: 'gpt-4o', costUsdMicros: 1_500_000, requestCount: 42 }],
      });
    });

    it('returns 0, not null/undefined, when no AIUsageLog rows exist in range', async () => {
      aggregate.mockResolvedValue({ _sum: { costUsdMicros: null }, _count: 0 });
      groupBy.mockResolvedValue([]);
      const service = buildService();

      const result = await service.getAiCost({});

      expect(result.totalCostUsdMicros).toBe(0);
      expect(result.totalRequests).toBe(0);
    });
  });

  describe('getOverview', () => {
    const userFindMany = jest.fn();
    const learningEventFindMany = jest.fn();
    const entitlementFindMany = jest.fn();
    const aIUsageLogAggregate = jest.fn();
    const prisma = {
      user: { findMany: userFindMany },
      learningEvent: { findMany: learningEventFindMany },
      entitlement: { findMany: entitlementFindMany },
      aIUsageLog: { aggregate: aIUsageLogAggregate },
    };

    function buildService(): AnalyticsService {
      return new AnalyticsService(prisma as never);
    }

    beforeEach(() => {
      jest.clearAllMocks();
      aIUsageLogAggregate.mockResolvedValue({ _sum: { costUsdMicros: null } });
    });

    it('returns an all-null-rate response when the signup cohort is empty, without querying LearningEvent/Entitlement', async () => {
      userFindMany.mockResolvedValue([]);
      learningEventFindMany.mockResolvedValue([]);
      const service = buildService();

      const result = await service.getOverview({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T00:00:00.000Z',
      });

      expect(result.activation).toEqual({ cohortSize: 0, count: 0, rate: null });
      expect(result.retention).toEqual({
        d1: { cohortSize: 0, count: 0, rate: null },
        d7: { cohortSize: 0, count: 0, rate: null },
        d30: { cohortSize: 0, count: 0, rate: null },
      });
      expect(result.conversion).toEqual({ cohortSize: 0, count: 0, rate: null });
      expect(entitlementFindMany).not.toHaveBeenCalled();
    });

    it('defaults to the last 30 days when from/to are omitted', async () => {
      userFindMany.mockResolvedValue([]);
      learningEventFindMany.mockResolvedValue([]);
      const service = buildService();
      const before = Date.now();

      const result = await service.getOverview({});

      const to = new Date(result.to).getTime();
      const from = new Date(result.from).getTime();
      expect(to).toBeGreaterThanOrEqual(before);
      expect(to - from).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('computes real activation: a signup with both real events within 24h counts, one outside the window or missing a type does not', async () => {
      const signupAt = new Date('2026-01-01T00:00:00.000Z');
      userFindMany.mockResolvedValue([
        { id: 'u-1', createdAt: signupAt },
        { id: 'u-2', createdAt: signupAt },
        { id: 'u-3', createdAt: signupAt },
      ]);
      learningEventFindMany.mockImplementation(({ where }: { where: { type?: unknown } }) => {
        if (where.type) {
          // Activation query — u-1 has both real event types within 24h;
          // u-2 has only one of the two required types; u-3 has both, but
          // one lands after the 24h window.
          return Promise.resolve([
            {
              userId: 'u-1',
              type: 'assessment.attempt.completed',
              occurredAt: new Date('2026-01-01T02:00:00.000Z'),
            },
            {
              userId: 'u-1',
              type: 'learning.lesson.completed',
              occurredAt: new Date('2026-01-01T05:00:00.000Z'),
            },
            {
              userId: 'u-2',
              type: 'assessment.attempt.completed',
              occurredAt: new Date('2026-01-01T02:00:00.000Z'),
            },
            {
              userId: 'u-3',
              type: 'assessment.attempt.completed',
              occurredAt: new Date('2026-01-01T02:00:00.000Z'),
            },
            {
              userId: 'u-3',
              type: 'learning.lesson.completed',
              occurredAt: new Date('2026-01-03T00:00:00.000Z'),
            },
          ]);
        }
        return Promise.resolve([]);
      });
      entitlementFindMany.mockResolvedValue([]);
      const service = buildService();

      const result = await service.getOverview({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      });

      expect(result.activation).toEqual({ cohortSize: 3, count: 1, rate: 1 / 3 });
    });

    it('computes real D1/D7/D30 retention from the exact calendar day of real recorded activity', async () => {
      const signupAt = new Date('2026-01-01T00:00:00.000Z');
      userFindMany.mockResolvedValue([{ id: 'u-1', createdAt: signupAt }]);
      learningEventFindMany.mockImplementation(({ where }: { where: { type?: unknown } }) => {
        if (where.type) {
          return Promise.resolve([]);
        }
        // Retention query — real activity on day+1 and day+7, none on day+30.
        return Promise.resolve([
          { userId: 'u-1', occurredAt: new Date('2026-01-02T00:00:00.000Z') },
          { userId: 'u-1', occurredAt: new Date('2026-01-08T00:00:00.000Z') },
        ]);
      });
      entitlementFindMany.mockResolvedValue([]);
      const service = buildService();

      const result = await service.getOverview({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      });

      expect(result.retention.d1).toEqual({ cohortSize: 1, count: 1, rate: 1 });
      expect(result.retention.d7).toEqual({ cohortSize: 1, count: 1, rate: 1 });
      expect(result.retention.d30).toEqual({ cohortSize: 1, count: 0, rate: 0 });
    });

    it('computes real conversion from a non-FREE Entitlement', async () => {
      const signupAt = new Date('2026-01-01T00:00:00.000Z');
      userFindMany.mockResolvedValue([
        { id: 'u-1', createdAt: signupAt },
        { id: 'u-2', createdAt: signupAt },
      ]);
      learningEventFindMany.mockResolvedValue([]);
      entitlementFindMany.mockResolvedValue([{ userId: 'u-1' }]);
      const service = buildService();

      const result = await service.getOverview({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
      });

      expect(result.conversion).toEqual({ cohortSize: 2, count: 1, rate: 0.5 });
      expect(entitlementFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ plan: { tier: { not: 'FREE' } } }),
        }),
      );
    });

    it('computes AI cost per active user as a real, period-wide figure, not cohort-scoped', async () => {
      userFindMany.mockResolvedValue([]);
      learningEventFindMany.mockResolvedValue([{ userId: 'u-1' }, { userId: 'u-2' }]);
      aIUsageLogAggregate.mockResolvedValue({ _sum: { costUsdMicros: 4_000_000 } });
      const service = buildService();

      const result = await service.getOverview({});

      expect(result.aiCostPerActiveUser).toEqual({
        totalCostUsdMicros: 4_000_000,
        activeUserCount: 2,
        costPerActiveUserUsdMicros: 2_000_000,
      });
    });

    it('returns a null cost-per-active-user, not a division-by-zero NaN, when there are no active users', async () => {
      userFindMany.mockResolvedValue([]);
      learningEventFindMany.mockResolvedValue([]);
      const service = buildService();

      const result = await service.getOverview({});

      expect(result.aiCostPerActiveUser).toEqual({
        totalCostUsdMicros: 0,
        activeUserCount: 0,
        costPerActiveUserUsdMicros: null,
      });
    });
  });
});
