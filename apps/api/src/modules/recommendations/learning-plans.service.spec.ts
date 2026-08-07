import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { LearningPlansService } from './learning-plans.service.js';

const USER: RequestUser = { userId: 'u-1', role: 'USER', organizationId: null, orgRole: null };

const PLAN = {
  id: 'plan-1',
  userId: 'u-1',
  languageId: 'lang-1',
  goal: 'Conversational fluency',
  targetDate: null,
  milestones: { version: 1 },
  isActive: true,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-02T00:00:00.000Z'),
};

function fakePrisma(findFirstResult: unknown) {
  return { learningPlan: { findFirst: jest.fn().mockResolvedValue(findFirstResult) } };
}

describe('LearningPlansService', () => {
  it("returns the wire shape of the caller's own active plan, scoped by userId and isActive", async () => {
    const prisma = fakePrisma(PLAN);
    const service = new LearningPlansService(prisma as unknown as PrismaClient);

    const result = await service.getCurrent(USER, {});

    expect(prisma.learningPlan.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u-1', isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    expect(result).toEqual({
      id: 'plan-1',
      userId: 'u-1',
      languageId: 'lang-1',
      goal: 'Conversational fluency',
      targetDate: null,
      milestones: { version: 1 },
      isActive: true,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-02T00:00:00.000Z',
    });
  });

  it('adds a languageId filter to the query when provided', async () => {
    const prisma = fakePrisma(PLAN);
    const service = new LearningPlansService(prisma as unknown as PrismaClient);

    await service.getCurrent(USER, { languageId: 'lang-1' });

    expect(prisma.learningPlan.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u-1', isActive: true, languageId: 'lang-1' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('throws NotFoundException when no active plan exists', async () => {
    const prisma = fakePrisma(null);
    const service = new LearningPlansService(prisma as unknown as PrismaClient);

    await expect(service.getCurrent(USER, {})).rejects.toThrow(NotFoundException);
  });

  it('converts a non-null targetDate to an ISO string', async () => {
    const prisma = fakePrisma({ ...PLAN, targetDate: new Date('2026-12-01T00:00:00.000Z') });
    const service = new LearningPlansService(prisma as unknown as PrismaClient);

    const result = await service.getCurrent(USER, {});

    expect(result.targetDate).toBe('2026-12-01T00:00:00.000Z');
  });
});
