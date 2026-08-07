import { randomUUID } from 'node:crypto';

import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type {
  AssessmentAttempt,
  AssessmentItem,
  AssessmentResponse,
  CefrLevel,
  PrismaClient,
  ProficiencyLevel,
  ProficiencyLevelHistory,
  Skill,
} from '@linguaai/database';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { AdaptiveItemSelectionService } from './adaptive-item-selection.service.js';
import { AssessmentService } from './assessment.service.js';

const LANGUAGE_ID = 'lang-es';
const CALLER: RequestUser = { userId: 'user-1', role: 'USER', organizationId: null, orgRole: null };
const OTHER_USER: RequestUser = {
  userId: 'user-2',
  role: 'USER',
  organizationId: null,
  orgRole: null,
};

function makeItem(overrides: Partial<AssessmentItem> = {}): AssessmentItem {
  return {
    id: randomUUID(),
    languageId: LANGUAGE_ID,
    skill: 'READING' as Skill,
    cefrLevel: 'B1' as CefrLevel,
    difficulty: 0.5,
    prompt: 'prompt',
    audioUrl: null,
    correctAnswer: { correctIndex: 0 },
    itemType: 'MULTIPLE_CHOICE',
    isActive: true,
    linguistSignOffBy: null,
    linguistSignOffAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * A minimal in-memory fake of the two tables this service reads/writes
 * across a multi-step flow (an attempt's items are queried repeatedly, with
 * different `notIn` exclusions, across `startAttempt`/`submitResponse`
 * calls) — a fixed sequence of `mockResolvedValueOnce` calls can't express
 * that without becoming unreadable. Still a jest-mock-backed double (not a
 * real Prisma client), matching this repo's own "mocked Prisma" unit-test
 * convention (`OrganizationsService`'s own spec).
 */
function makeFakePrisma(items: AssessmentItem[]) {
  const attempts = new Map<string, AssessmentAttempt>();
  const responses: AssessmentResponse[] = [];
  const proficiencyLevels = new Map<string, ProficiencyLevel>();
  const proficiencyLevelHistories: ProficiencyLevelHistory[] = [];

  const appPrisma = {
    language: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === LANGUAGE_ID ? { id: LANGUAGE_ID, code: 'es' } : null,
      ),
    },
    assessmentAttempt: {
      create: jest.fn(async ({ data }: { data: Partial<AssessmentAttempt> }) => {
        const now = new Date();
        const attempt: AssessmentAttempt = {
          id: randomUUID(),
          userId: data.userId as string,
          languageId: data.languageId as string,
          type: data.type as AssessmentAttempt['type'],
          status: 'IN_PROGRESS',
          startedAt: now,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        attempts.set(attempt.id, attempt);
        return attempt;
      }),
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) => attempts.get(where.id) ?? null,
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<AssessmentAttempt> }) => {
          const existing = attempts.get(where.id);
          if (!existing) throw new Error('not found');
          const updated = { ...existing, ...data };
          attempts.set(where.id, updated);
          return updated;
        },
      ),
    },
    assessmentItem: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          items.find((i) => i.id === where.id) ?? null,
      ),
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { languageId: string; skill: Skill; isActive: boolean; id?: { notIn: string[] } };
        }) =>
          items.filter(
            (i) =>
              i.languageId === where.languageId &&
              i.skill === where.skill &&
              i.isActive === where.isActive &&
              !(where.id?.notIn ?? []).includes(i.id),
          ),
      ),
    },
    assessmentResponse: {
      findFirst: jest.fn(
        async ({ where }: { where: { attemptId: string; itemId: string } }) =>
          responses.find((r) => r.attemptId === where.attemptId && r.itemId === where.itemId) ??
          null,
      ),
      findMany: jest.fn(async ({ where }: { where: { attemptId: string; skill?: Skill } }) => {
        const matched = responses
          .filter(
            (r) => r.attemptId === where.attemptId && (!where.skill || r.skill === where.skill),
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        // `include: { item }` support — attach the linked item so
        // `getSkillState` can read its cefrLevel, mirroring what a real
        // Prisma `include` would return.
        return matched.map((r) => ({ ...r, item: items.find((i) => i.id === r.itemId) ?? null }));
      }),
      create: jest.fn(
        async ({
          data,
        }: {
          data: Pick<
            AssessmentResponse,
            'attemptId' | 'itemId' | 'skill' | 'prompt' | 'response' | 'isCorrect' | 'score'
          >;
        }) => {
          const response: AssessmentResponse = {
            id: randomUUID(),
            createdAt: new Date(Date.now() + responses.length),
            ...data,
          };
          responses.push(response);
          return response;
        },
      ),
    },
    proficiencyLevel: {
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { userId_languageId_skill: { userId: string; languageId: string; skill: Skill } };
          create: Omit<ProficiencyLevel, 'id'>;
          update: Partial<ProficiencyLevel>;
        }) => {
          const key = JSON.stringify(where.userId_languageId_skill);
          const existing = proficiencyLevels.get(key);
          const row: ProficiencyLevel = existing
            ? { ...existing, ...update }
            : { id: randomUUID(), ...create };
          proficiencyLevels.set(key, row);
          return row;
        },
      ),
    },
    proficiencyLevelHistory: {
      create: jest.fn(
        async ({ data }: { data: Omit<ProficiencyLevelHistory, 'id' | 'recordedAt'> }) => {
          const row: ProficiencyLevelHistory = {
            id: randomUUID(),
            recordedAt: new Date(),
            ...data,
          };
          proficiencyLevelHistories.push(row);
          return row;
        },
      ),
    },
  };

  return { appPrisma, attempts, responses, proficiencyLevels, proficiencyLevelHistories };
}

describe('AssessmentService', () => {
  function buildService(items: AssessmentItem[]) {
    const { appPrisma, proficiencyLevels, proficiencyLevelHistories } = makeFakePrisma(items);
    const service = new AssessmentService(
      appPrisma as unknown as PrismaClient,
      new AdaptiveItemSelectionService(),
    );
    return { service, appPrisma, proficiencyLevels, proficiencyLevelHistories };
  }

  describe('startAttempt', () => {
    it('throws NotFoundException for an unknown language', async () => {
      const { service } = buildService([]);
      await expect(
        service.startAttempt(CALLER, { languageId: 'unknown-lang', type: 'PLACEMENT' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when the language has no seeded items at all', async () => {
      const { service } = buildService([]);
      await expect(
        service.startAttempt(CALLER, { languageId: LANGUAGE_ID, type: 'PLACEMENT' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('creates an IN_PROGRESS attempt and returns the first Reading item, never leaking correctAnswer', async () => {
      const readingItem = makeItem({ skill: 'READING', cefrLevel: 'B1', difficulty: 0.5 });
      const { service } = buildService([readingItem]);

      const result = await service.startAttempt(CALLER, {
        languageId: LANGUAGE_ID,
        type: 'PLACEMENT',
      });

      expect(result.attempt.status).toBe('IN_PROGRESS');
      expect(result.attempt.userId).toBe(CALLER.userId);
      expect(result.nextItem.id).toBe(readingItem.id);
      expect(result.nextItem).not.toHaveProperty('correctAnswer');
    });
  });

  describe('submitResponse', () => {
    async function startWithItems(items: AssessmentItem[]) {
      const { service, appPrisma } = buildService(items);
      const started = await service.startAttempt(CALLER, {
        languageId: LANGUAGE_ID,
        type: 'PLACEMENT',
      });
      return { service, appPrisma, attemptId: started.attempt.id, firstItem: started.nextItem };
    }

    it('throws NotFoundException for an attempt owned by a different user', async () => {
      const item = makeItem();
      const { service, attemptId } = await startWithItems([item]);
      await expect(
        service.submitResponse(OTHER_USER, attemptId, {
          itemId: item.id,
          response: { selectedIndex: 0 },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a non-existent attempt', async () => {
      const { service } = buildService([makeItem()]);
      await expect(
        service.submitResponse(CALLER, 'no-such-attempt', {
          itemId: randomUUID(),
          response: { selectedIndex: 0 },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the submitted item is not the currently active one', async () => {
      const currentItem = makeItem({ id: 'current', skill: 'READING' });
      const otherItem = makeItem({ id: 'other', skill: 'READING', difficulty: 0.1 });
      const { service, attemptId } = await startWithItems([currentItem, otherItem]);

      await expect(
        service.submitResponse(CALLER, attemptId, {
          itemId: otherItem.id,
          response: { selectedIndex: 0 },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('scores a correct MULTIPLE_CHOICE answer, persists the response, and serves the next item', async () => {
      const readingItem = makeItem({
        skill: 'READING',
        cefrLevel: 'B1',
        difficulty: 0.5,
        correctAnswer: { correctIndex: 2 },
      });
      const listeningItem = makeItem({ skill: 'LISTENING', cefrLevel: 'B1', difficulty: 0.5 });
      const { service, attemptId } = await startWithItems([readingItem, listeningItem]);

      const result = await service.submitResponse(CALLER, attemptId, {
        itemId: readingItem.id,
        response: { selectedIndex: 2 },
      });

      expect(result.response.isCorrect).toBe(true);
      expect(result.response.score).toBe(1);
      expect(result.attemptStatus).toBe('IN_PROGRESS');
      // Reading has no more unserved items and the single response doesn't
      // stabilize on its own — the algorithm moves on to the next skill in
      // SKILL_ORDER (Listening), matching ADR-038's fixed serving order.
      expect(result.nextItem?.id).toBe(listeningItem.id);
    });

    it('throws ConflictException on a duplicate submission for the same item', async () => {
      const item = makeItem({ correctAnswer: { correctIndex: 0 } });
      const { service, attemptId } = await startWithItems([item]);
      await service.submitResponse(CALLER, attemptId, {
        itemId: item.id,
        response: { selectedIndex: 0 },
      });

      // Re-fetch the (now-nonexistent) "current" item check fails first in
      // practice once the skill has moved on — construct a same-attempt,
      // same-item resubmission directly to isolate the duplicate-answer
      // guard itself, matching this test's own stated intent.
      await expect(
        service.submitResponse(CALLER, attemptId, {
          itemId: item.id,
          response: { selectedIndex: 0 },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when submitting to an attempt that is already COMPLETED', async () => {
      const item = makeItem({ correctAnswer: { correctIndex: 0 } });
      const { service, appPrisma, attemptId } = await startWithItems([item]);
      await service.submitResponse(CALLER, attemptId, {
        itemId: item.id,
        response: { selectedIndex: 0 },
      });
      await appPrisma.assessmentAttempt.update({
        where: { id: attemptId },
        data: { status: 'COMPLETED' },
      });

      await expect(
        service.submitResponse(CALLER, attemptId, {
          itemId: item.id,
          response: { selectedIndex: 0 },
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('completeAttempt', () => {
    it('throws NotFoundException for an attempt owned by a different user', async () => {
      const item = makeItem();
      const { service } = buildService([item]);
      const started = await service.startAttempt(CALLER, {
        languageId: LANGUAGE_ID,
        type: 'PLACEMENT',
      });

      await expect(service.completeAttempt(OTHER_USER, started.attempt.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when a skill still has servable items remaining', async () => {
      const item = makeItem({ skill: 'READING' });
      const { service } = buildService([item]);
      const started = await service.startAttempt(CALLER, {
        languageId: LANGUAGE_ID,
        type: 'PLACEMENT',
      });

      await expect(service.completeAttempt(CALLER, started.attempt.id)).rejects.toThrow(
        ConflictException,
      );
    });

    it('completes once every objective skill has stabilized, and re-completion is idempotent', async () => {
      // One item per objective skill — each skill "stabilizes" the moment
      // its single response is recorded only if history reaches
      // MAX_ITEMS_PER_SKILL or two-in-a-row; with just one served item per
      // skill and no more candidates left, `computeNextServableItem`
      // already treats an empty candidate pool as skillComplete — so a
      // single item per skill is sufficient to reach COMPLETED here.
      const items: AssessmentItem[] = (
        ['READING', 'LISTENING', 'VOCABULARY', 'GRAMMAR'] as Skill[]
      ).map((skill) => makeItem({ skill, correctAnswer: { correctIndex: 0 } }));
      const { service, proficiencyLevels, proficiencyLevelHistories } = buildService(items);
      const started = await service.startAttempt(CALLER, {
        languageId: LANGUAGE_ID,
        type: 'PLACEMENT',
      });

      for (const item of items) {
        await service.submitResponse(CALLER, started.attempt.id, {
          itemId: item.id,
          response: { selectedIndex: 0 },
        });
      }

      const completed = await service.completeAttempt(CALLER, started.attempt.id);
      expect(completed.attempt.status).toBe('COMPLETED');
      expect(completed.responses).toHaveLength(4);

      // Every served item was answered correctly at the default difficulty
      // (0.5) -> raw score 100% for each skill -> C2, per §6.4's
      // threshold table; a single served item gives confidence
      // 0.5*(1/5) + 0.5*1 = 0.6 (>= the 0.5 floor, not flagged low).
      expect(completed.proficiencyLevels).toHaveLength(4);
      for (const result of completed.proficiencyLevels) {
        expect(result.cefrLevel).toBe('C2');
        expect(result.confidence).toBeCloseTo(0.6, 5);
        expect(result.lowConfidence).toBe(false);
      }
      expect(proficiencyLevels.size).toBe(4);
      expect(proficiencyLevelHistories).toHaveLength(4);

      // Idempotent re-completion: same computed result, but no duplicate
      // ProficiencyLevel/History writes — the real event only happened once.
      const secondCall = await service.completeAttempt(CALLER, started.attempt.id);
      expect(secondCall.attempt.status).toBe('COMPLETED');
      expect(secondCall.responses).toHaveLength(4);
      expect(secondCall.proficiencyLevels).toEqual(completed.proficiencyLevels);
      expect(proficiencyLevels.size).toBe(4);
      expect(proficiencyLevelHistories).toHaveLength(4);
    });

    it('flags a skill lowConfidence when responses are inconsistent, independent of the other skills', async () => {
      const readingItems = [
        makeItem({ skill: 'READING', difficulty: 1, correctAnswer: { correctIndex: 0 } }),
        makeItem({ skill: 'READING', difficulty: 1, correctAnswer: { correctIndex: 0 } }),
      ];
      const otherItems = (['LISTENING', 'VOCABULARY', 'GRAMMAR'] as Skill[]).map((skill) =>
        makeItem({ skill, correctAnswer: { correctIndex: 0 } }),
      );
      const { service } = buildService([...readingItems, ...otherItems]);
      const started = await service.startAttempt(CALLER, {
        languageId: LANGUAGE_ID,
        type: 'PLACEMENT',
      });

      // Reading: first correct, second incorrect — inconsistent (50/50).
      await service.submitResponse(CALLER, started.attempt.id, {
        itemId: readingItems[0]!.id,
        response: { selectedIndex: 0 },
      });
      const afterFirstReading = await service.submitResponse(CALLER, started.attempt.id, {
        itemId: readingItems[1]!.id,
        response: { selectedIndex: 1 },
      });
      let nextItem = afterFirstReading.nextItem;
      while (nextItem) {
        const res = await service.submitResponse(CALLER, started.attempt.id, {
          itemId: nextItem.id,
          response: { selectedIndex: 0 },
        });
        nextItem = res.nextItem;
      }

      const completed = await service.completeAttempt(CALLER, started.attempt.id);
      const reading = completed.proficiencyLevels.find((r) => r.skill === 'READING')!;
      expect(reading.lowConfidence).toBe(true);
      const listening = completed.proficiencyLevels.find((r) => r.skill === 'LISTENING')!;
      expect(listening.lowConfidence).toBe(false);
    });
  });
});
