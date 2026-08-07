import { WeaknessDetectionService } from './weakness-detection.service.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const LANGUAGE_ID = '22222222-2222-4222-8222-222222222222';

function fakePrisma() {
  return {
    proficiencyLevelHistory: { findMany: jest.fn().mockResolvedValue([]) },
    exerciseAttempt: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('WeaknessDetectionService', () => {
  it('queries ProficiencyLevelHistory scoped to the user+language, and ExerciseAttempt scoped through the real content hierarchy to the same language', async () => {
    const prisma = fakePrisma();
    const service = new WeaknessDetectionService(prisma as never);

    await service.detectWeakSkills(USER_ID, LANGUAGE_ID);

    expect(prisma.proficiencyLevelHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID, languageId: LANGUAGE_ID } }),
    );
    expect(prisma.exerciseAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: USER_ID,
          exercise: {
            activity: { lesson: { unit: { level: { course: { languageId: LANGUAGE_ID } } } } },
          },
        },
      }),
    );
  });

  it('maps real Prisma rows into the pure detector and returns its result', async () => {
    const prisma = fakePrisma();
    prisma.proficiencyLevelHistory.findMany.mockResolvedValue([
      { skill: 'READING', cefrLevel: 'B2', recordedAt: new Date('2026-01-01') },
      { skill: 'READING', cefrLevel: 'B1', recordedAt: new Date('2026-02-01') },
    ]);
    const service = new WeaknessDetectionService(prisma as never);

    const results = await service.detectWeakSkills(USER_ID, LANGUAGE_ID);

    expect(results).toEqual([{ skill: 'READING', isWeak: true, reason: 'REGRESSED' }]);
  });

  it('extracts activityType/isCorrect from the nested exercise.activity include shape', async () => {
    const prisma = fakePrisma();
    prisma.exerciseAttempt.findMany.mockResolvedValue([
      { isCorrect: false, exercise: { activity: { type: 'VOCABULARY_DRILL' } } },
      { isCorrect: false, exercise: { activity: { type: 'VOCABULARY_DRILL' } } },
      { isCorrect: false, exercise: { activity: { type: 'VOCABULARY_DRILL' } } },
    ]);
    const service = new WeaknessDetectionService(prisma as never);

    const results = await service.detectWeakSkills(USER_ID, LANGUAGE_ID);

    expect(results).toEqual([{ skill: 'VOCABULARY', isWeak: true, reason: 'LOW_ACCURACY' }]);
  });
});
