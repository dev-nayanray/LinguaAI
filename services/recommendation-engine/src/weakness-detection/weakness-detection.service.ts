import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@linguaai/database';

import { RECOMMENDATION_ENGINE_PRISMA_CLIENT } from '../database/database.config.js';
import { RECENT_EXERCISE_ATTEMPTS_LIMIT } from './weakness-detection.constants.js';
import { detectWeakSkills, type WeaknessResult } from './weakness-detection.util.js';

@Injectable()
export class WeaknessDetectionService {
  constructor(@Inject(RECOMMENDATION_ENGINE_PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async detectWeakSkills(userId: string, languageId: string): Promise<WeaknessResult[]> {
    const historyRows = await this.prisma.proficiencyLevelHistory.findMany({
      where: { userId, languageId },
      orderBy: { recordedAt: 'asc' },
      select: { skill: true, cefrLevel: true, recordedAt: true },
    });

    // Scoped to this plan's own language — `ExerciseAttempt` carries no
    // `languageId` of its own, only reachable through the real content
    // hierarchy (`exercise -> activity -> lesson -> unit -> level ->
    // course.languageId`).
    const attempts = await this.prisma.exerciseAttempt.findMany({
      where: {
        userId,
        exercise: { activity: { lesson: { unit: { level: { course: { languageId } } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: RECENT_EXERCISE_ATTEMPTS_LIMIT,
      select: { isCorrect: true, exercise: { select: { activity: { select: { type: true } } } } },
    });

    const exerciseSignals = attempts.map((attempt) => ({
      activityType: attempt.exercise.activity.type,
      isCorrect: attempt.isCorrect,
    }));

    return detectWeakSkills(historyRows, exerciseSignals);
  }
}
