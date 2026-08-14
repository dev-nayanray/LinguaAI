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
});
