import type { AssessmentAttemptCompletedPayload } from '@linguaai/validation/learning';

import { LearningPlanService } from './learning-plan.service.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const LANGUAGE_ID = '22222222-2222-4222-8222-222222222222';

function fakePayload(
  overrides: Partial<AssessmentAttemptCompletedPayload> = {},
): AssessmentAttemptCompletedPayload {
  return {
    attemptId: '33333333-3333-4333-8333-333333333333',
    languageId: LANGUAGE_ID,
    type: 'PLACEMENT',
    skillResults: [
      { skill: 'READING', cefrLevel: 'B1', confidence: 0.6, lowConfidence: false },
      { skill: 'WRITING', cefrLevel: 'A2', confidence: 0.4, lowConfidence: true },
    ],
    ...overrides,
  };
}

function fakePrisma() {
  return {
    learningPlan: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userProfile: {
      findUnique: jest.fn(),
    },
  };
}

describe('LearningPlanService', () => {
  function buildService(prisma: ReturnType<typeof fakePrisma>): LearningPlanService {
    return new LearningPlanService(prisma as never);
  }

  it('creates a new LearningPlan when none is active for this user+language, using the onboarding goal', async () => {
    const prisma = fakePrisma();
    prisma.learningPlan.findFirst.mockResolvedValue(null);
    prisma.userProfile.findUnique.mockResolvedValue({ userId: USER_ID, goalType: 'CAREER' });
    prisma.learningPlan.create.mockResolvedValue({ id: 'plan-1' });
    const service = buildService(prisma);

    await service.handleAssessmentAttemptCompleted(USER_ID, fakePayload());

    expect(prisma.learningPlan.findFirst).toHaveBeenCalledWith({
      where: { userId: USER_ID, languageId: LANGUAGE_ID, isActive: true },
    });
    expect(prisma.learningPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        languageId: LANGUAGE_ID,
        goal: 'Career',
        milestones: expect.objectContaining({
          version: 1,
          generatedFromAttemptId: '33333333-3333-4333-8333-333333333333',
          skillLevels: fakePayload().skillResults,
        }) as unknown,
      }) as unknown,
    });
    expect(prisma.learningPlan.update).not.toHaveBeenCalled();
  });

  it('falls back to a default goal label when the user has no UserProfile yet', async () => {
    const prisma = fakePrisma();
    prisma.learningPlan.findFirst.mockResolvedValue(null);
    prisma.userProfile.findUnique.mockResolvedValue(null);
    prisma.learningPlan.create.mockResolvedValue({ id: 'plan-1' });
    const service = buildService(prisma);

    await service.handleAssessmentAttemptCompleted(USER_ID, fakePayload());

    expect(prisma.learningPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ goal: 'General fluency' }) as unknown,
    });
  });

  it('updates the existing active LearningPlan instead of creating a duplicate, on a PLACEMENT completion', async () => {
    const prisma = fakePrisma();
    prisma.learningPlan.findFirst.mockResolvedValue({ id: 'existing-plan' });
    prisma.learningPlan.update.mockResolvedValue({ id: 'existing-plan' });
    const service = buildService(prisma);

    await service.handleAssessmentAttemptCompleted(USER_ID, fakePayload({ type: 'PLACEMENT' }));

    expect(prisma.learningPlan.update).toHaveBeenCalledWith({
      where: { id: 'existing-plan' },
      data: { milestones: expect.objectContaining({ version: 1 }) as unknown },
    });
    expect(prisma.learningPlan.create).not.toHaveBeenCalled();
    expect(prisma.userProfile.findUnique).not.toHaveBeenCalled();
  });

  it('updates the existing active LearningPlan on a REASSESSMENT completion, without creating a duplicate', async () => {
    const prisma = fakePrisma();
    prisma.learningPlan.findFirst.mockResolvedValue({ id: 'existing-plan' });
    prisma.learningPlan.update.mockResolvedValue({ id: 'existing-plan' });
    const service = buildService(prisma);

    await service.handleAssessmentAttemptCompleted(USER_ID, fakePayload({ type: 'REASSESSMENT' }));

    expect(prisma.learningPlan.update).toHaveBeenCalledTimes(1);
    expect(prisma.learningPlan.create).not.toHaveBeenCalled();
  });

  it('reprocessing the same event twice is idempotent — the second call updates rather than duplicating', async () => {
    const prisma = fakePrisma();
    prisma.learningPlan.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'plan-1' });
    prisma.userProfile.findUnique.mockResolvedValue({ userId: USER_ID, goalType: 'TRAVEL' });
    prisma.learningPlan.create.mockResolvedValue({ id: 'plan-1' });
    prisma.learningPlan.update.mockResolvedValue({ id: 'plan-1' });
    const service = buildService(prisma);
    const payload = fakePayload();

    await service.handleAssessmentAttemptCompleted(USER_ID, payload);
    await service.handleAssessmentAttemptCompleted(USER_ID, payload);

    expect(prisma.learningPlan.create).toHaveBeenCalledTimes(1);
    expect(prisma.learningPlan.update).toHaveBeenCalledTimes(1);
  });
});
