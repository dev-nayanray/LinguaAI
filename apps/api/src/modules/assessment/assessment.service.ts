import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AssessmentAttempt,
  AssessmentItem,
  AssessmentResponse,
  CefrLevel,
  Prisma,
  PrismaClient,
  Skill,
} from '@linguaai/database';
import {
  assessmentAttemptCompletedPayloadSchema,
  type AssessmentItemPublicView,
  type CompleteAssessmentAttemptResponse,
  type StartAssessmentAttemptRequest,
  type StartAssessmentAttemptResponse,
  type SubmitAssessmentResponseRequest,
  type SubmitAssessmentResponseResponse,
} from '@linguaai/validation/learning';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { DomainEventPublisher } from '../../events/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';
import {
  AdaptiveItemSelectionService,
  type SelectionHistoryEntry,
} from './adaptive-item-selection.service.js';
import {
  computeSkillBanding,
  computeWritingBanding,
  type ScoredItem,
  type SkillBandingResult,
} from './cefr-banding.util.js';
import { scoreObjectiveResponse } from './objective-scoring.util.js';

/**
 * Fixed serving order (E6 design doc §1/§6.2). WRITING is served last and
 * exactly once (T1's own seed content has a single OPEN_RESPONSE item per
 * language; `AdaptiveItemSelectionService.selectNext` naturally stops the
 * moment its candidate pool is exhausted, the same "no more items" path
 * every objective skill already relies on — no WRITING-specific serving
 * logic needed). T2 originally excluded WRITING here because ai-engine's
 * scoring capability didn't exist yet (T4/T5); wiring it back in — actually
 * calling `AiEngineClientService.scoreWriting()` from `submitResponse` — is
 * this task's own scope (E6-T7, per T5's own doc comment on
 * `AiEngineClientService.scoreWriting`). SPEAKING remains out of scope
 * entirely (§3.2). See ADR-038's Consequences.
 */
const SKILL_ORDER: Skill[] = ['READING', 'LISTENING', 'VOCABULARY', 'GRAMMAR', 'WRITING'];

function toPublicItemView(item: AssessmentItem): AssessmentItemPublicView {
  return {
    id: item.id,
    skill: item.skill,
    cefrLevel: item.cefrLevel,
    difficulty: item.difficulty,
    prompt: item.prompt,
    audioUrl: item.audioUrl,
    itemType: item.itemType,
  };
}

/**
 * Reads back the `aiCefrLevel`/`confidence` a WRITING response's own
 * `scoreWritingItem` persisted (`response` JSON blob + `score` column) —
 * the inverse of that write. Throws on a malformed/missing `aiCefrLevel`
 * rather than silently defaulting: every WRITING `AssessmentResponse` this
 * service itself ever creates always sets it, so a missing value can only
 * mean a data-integrity violation, the same class of defensive throw
 * `computeProficiencyResults`'s own missing-`item` check already uses.
 */
function extractWritingCritique(response: AssessmentResponse): {
  cefrLevel: CefrLevel;
  confidence: number;
} {
  const data = response.response as { aiCefrLevel?: CefrLevel };
  if (!data.aiCefrLevel || response.score === null) {
    throw new Error(
      `WRITING AssessmentResponse ${response.id} is missing its AI critique — data integrity violation`,
    );
  }
  return { cefrLevel: data.aiCefrLevel, confidence: response.score };
}

function toWireAttempt(attempt: AssessmentAttempt): StartAssessmentAttemptResponse['attempt'] {
  return {
    id: attempt.id,
    userId: attempt.userId,
    languageId: attempt.languageId,
    type: attempt.type,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    completedAt: attempt.completedAt ? attempt.completedAt.toISOString() : null,
  };
}

function toWireResponse(
  response: AssessmentResponse,
): CompleteAssessmentAttemptResponse['responses'][number] {
  return {
    id: response.id,
    attemptId: response.attemptId,
    itemId: response.itemId,
    skill: response.skill,
    prompt: response.prompt,
    // Prisma types every `Json` column as `JsonValue` (which includes the
    // JSON literal `null`) regardless of column nullability — this
    // service only ever writes a plain object (dto.response, always
    // `{ selectedIndex }`/`{ text }`), so the cast reflects a real
    // invariant of this table's writers, not an unchecked assumption.
    response: response.response as Record<string, unknown>,
    isCorrect: response.isCorrect,
    score: response.score,
    createdAt: response.createdAt.toISOString(),
  };
}

/**
 * `AssessmentModule` (E6 T2, ADR-038). Assessment tables carry no RLS
 * policy (assessment.prisma's own header comment, confirmed by direct
 * inspection) — `APP_PRISMA_CLIENT` is used throughout for the same reason
 * `OrganizationsService.getOrganization` does (an ordinary `app_role`
 * connection), never `SERVICE_ROLE_PRISMA_CLIENT`: nothing here touches a
 * Part-9C-style privileged column. Ownership ("is this the caller's own
 * attempt") is enforced by hand, per method — the same
 * `assertCallerManagesOrg` discipline `OrganizationsService` established,
 * since RLS provides no help on an unpoliced table.
 */
@Injectable()
export class AssessmentService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly adaptiveSelection: AdaptiveItemSelectionService,
    private readonly events: DomainEventPublisher,
    private readonly aiEngineClient: AiEngineClientService,
  ) {}

  async startAttempt(
    caller: RequestUser,
    dto: StartAssessmentAttemptRequest,
  ): Promise<StartAssessmentAttemptResponse> {
    const language = await this.appPrisma.language.findUnique({ where: { id: dto.languageId } });
    if (!language) {
      throw new NotFoundException('Language not found');
    }

    // Real gap found while building T6's re-assessment flow, applies
    // regardless of `dto.type`: nothing previously stopped a user from
    // starting a second concurrent attempt for the same language while one
    // was already IN_PROGRESS — two simultaneous attempts would both try
    // to serve/score items independently with no way to reconcile them.
    const inProgress = await this.appPrisma.assessmentAttempt.findFirst({
      where: { userId: caller.userId, languageId: language.id, status: 'IN_PROGRESS' },
    });
    if (inProgress) {
      throw new ConflictException('An assessment attempt is already in progress for this language');
    }

    // PRD.md §5.1's user-initiated re-assessment flow (E6-T6): "re"-assessing
    // implies a prior real assessment exists — a REASSESSMENT attempt with
    // no completed history for this language is a semantically invalid
    // request on otherwise-valid input (422, matching the same class as the
    // no-items-available check below), not a 400 the request schema alone
    // can catch.
    if (dto.type === 'REASSESSMENT') {
      const priorCompleted = await this.appPrisma.assessmentAttempt.findFirst({
        where: { userId: caller.userId, languageId: language.id, status: 'COMPLETED' },
      });
      if (!priorCompleted) {
        throw new UnprocessableEntityException(
          'Cannot start a re-assessment without a prior completed assessment for this language',
        );
      }
    }

    const attempt = await this.appPrisma.assessmentAttempt.create({
      data: {
        userId: caller.userId,
        languageId: language.id,
        type: dto.type,
        status: 'IN_PROGRESS',
      },
    });

    const firstItem = await this.computeNextServableItem(attempt.id, language.id, 0);
    if (!firstItem) {
      throw new UnprocessableEntityException(
        'No assessment items are available for this language yet — cannot start an attempt',
      );
    }

    return { attempt: toWireAttempt(attempt), nextItem: toPublicItemView(firstItem) };
  }

  async submitResponse(
    caller: RequestUser,
    attemptId: string,
    dto: SubmitAssessmentResponseRequest,
  ): Promise<SubmitAssessmentResponseResponse> {
    const attempt = await this.getOwnedAttempt(caller, attemptId);
    if (attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException(`Attempt is already ${attempt.status.toLowerCase()}`);
    }

    const item = await this.appPrisma.assessmentItem.findUnique({ where: { id: dto.itemId } });
    if (!item || !item.isActive || item.languageId !== attempt.languageId) {
      throw new NotFoundException('Assessment item not found');
    }

    const alreadyAnswered = await this.appPrisma.assessmentResponse.findFirst({
      where: { attemptId: attempt.id, itemId: item.id },
    });
    if (alreadyAnswered) {
      throw new ConflictException('This item has already been answered in this attempt');
    }

    // Server-computed, never a client-supplied claim (Part 9C's "never
    // trust a client-supplied value feeding a privileged decision"
    // discipline, applied here to scoring integrity): the submitted item
    // must be the one the adaptive algorithm would serve right now, or a
    // client could skip ahead / answer out of order and undermine
    // ADR-037's "reproducible scoring" bar.
    const expected = await this.computeNextServableItem(attempt.id, attempt.languageId, 0);
    if (!expected || expected.id !== item.id) {
      throw new ConflictException('This is not the currently active item for this attempt');
    }

    const { isCorrect, score, responseData } =
      item.itemType === 'OPEN_RESPONSE'
        ? await this.scoreWritingItem(attempt.languageId, item, dto.response)
        : { ...scoreObjectiveResponse(item, dto.response), responseData: dto.response };

    const savedResponse = await this.appPrisma.assessmentResponse.create({
      data: {
        attemptId: attempt.id,
        itemId: item.id,
        skill: item.skill,
        prompt: item.prompt,
        response: responseData,
        isCorrect,
        score,
      },
    });

    const currentSkillIndex = SKILL_ORDER.indexOf(item.skill);
    const nextItem = await this.computeNextServableItem(
      attempt.id,
      attempt.languageId,
      currentSkillIndex,
    );

    return {
      response: {
        id: savedResponse.id,
        isCorrect: savedResponse.isCorrect,
        score: savedResponse.score,
      },
      nextItem: nextItem ? toPublicItemView(nextItem) : null,
      attemptStatus: attempt.status,
    };
  }

  /**
   * WRITING (OPEN_RESPONSE) items are AI-scored (§6.3), not answer-key
   * matched — calls the already-built `AssessmentScoringService` via
   * `AiEngineClientService.scoreWriting()` (T4/T5), reused here, not
   * reimplemented. `isCorrect` genuinely has no meaning for an open-ended
   * essay (stored `null`, matching the column's own nullable type); `score`
   * reuses the critique's own `confidence` (0-1) — the same value
   * `computeWritingBanding` later reads back out. The AI's `cefrLevel`/
   * `feedback` have no dedicated `AssessmentResponse` columns (a schema
   * change was not part of this task's own scope, §6.1) — persisted inside
   * the same `response` JSON blob the learner's own text already occupies,
   * so `computeProficiencyResults`'s later idempotent recompute (and the
   * client's own `completeAttempt` `responses[]` view) can read them back
   * without a second table.
   */
  private async scoreWritingItem(
    languageId: string,
    item: AssessmentItem,
    response: SubmitAssessmentResponseRequest['response'],
  ): Promise<{ isCorrect: null; score: number; responseData: Prisma.InputJsonObject }> {
    if (!('text' in response)) {
      throw new UnprocessableEntityException(
        'OPEN_RESPONSE (Writing) items require a response shaped { text }',
      );
    }

    // Only reached via `startAttempt`'s already-served WRITING item, so the
    // language is known to exist — re-fetched here (not threaded through
    // from the caller) since `submitResponse` only carries `languageId`,
    // and `targetLanguageName` is a real, separate value `ai-engine`'s own
    // request schema requires (a display name for the scoring prompt, not
    // just the id).
    const language = await this.appPrisma.language.findUnique({ where: { id: languageId } });
    if (!language) {
      throw new NotFoundException('Language not found');
    }

    const critique = await this.aiEngineClient.scoreWriting({
      languageId,
      targetLanguageName: language.name,
      prompt: item.prompt,
      learnerResponse: response.text,
    });

    return {
      isCorrect: null,
      score: critique.confidence,
      responseData: {
        text: response.text,
        aiCefrLevel: critique.cefrLevel,
        aiFeedback: critique.feedback,
      },
    };
  }

  async completeAttempt(
    caller: RequestUser,
    attemptId: string,
  ): Promise<CompleteAssessmentAttemptResponse> {
    const attempt = await this.getOwnedAttempt(caller, attemptId);

    // Idempotent re-completion: a retried request after the first one
    // already succeeded returns the same result rather than erroring — a
    // real, if partial, mitigation for the Idempotency-Key infrastructure
    // API_GUIDELINES.md §6 requires but this platform doesn't build yet
    // anywhere (RISK_REGISTER.md). `startAttempt`/`submitResponse` are not
    // similarly safe under a duplicate retry — a real, separately-flagged
    // gap, not solved by this one endpoint's own idempotent shape.
    const alreadyCompleted = attempt.status === 'COMPLETED';

    if (!alreadyCompleted) {
      const nextServable = await this.computeNextServableItem(attempt.id, attempt.languageId, 0);
      if (nextServable) {
        throw new ConflictException(
          'Attempt is not ready to complete — at least one skill still has items to serve',
        );
      }
    }

    const responses = await this.appPrisma.assessmentResponse.findMany({
      where: { attemptId: attempt.id },
      orderBy: { createdAt: 'asc' },
      include: { item: true },
    });

    // §6.4's banding/confidence are a pure function of already-persisted,
    // immutable AssessmentResponse rows — always recomputed fresh (cheap,
    // deterministic), so an idempotent replay returns the exact same
    // numbers without needing a second table to remember them, and without
    // an AssessmentAttempt-keyed FK on ProficiencyLevelHistory that E4/E6
    // T1's schema never defined.
    const proficiencyResults = this.computeProficiencyResults(responses);

    let finalAttempt = attempt;
    if (!alreadyCompleted) {
      // Real gap found while adding T6's event emission and re-examining
      // this method: the attempt-status update and every skill's
      // ProficiencyLevel/History write previously ran as separate,
      // unwrapped sequential awaits — a failure partway through (e.g. the
      // 3rd skill's upsert throwing) would leave the attempt marked
      // COMPLETED with only some skills' proficiency data recorded, a real
      // partial-write hazard for a state this platform treats as atomic.
      // Wrapped in a single transaction so it's all-or-nothing, matching
      // `OrganizationsService`'s own established transaction discipline.
      finalAttempt = await this.appPrisma.$transaction(async (tx) => {
        const updated = await tx.assessmentAttempt.update({
          where: { id: attempt.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });

        for (const result of proficiencyResults) {
          const proficiencyLevel = await tx.proficiencyLevel.upsert({
            where: {
              userId_languageId_skill: {
                userId: caller.userId,
                languageId: attempt.languageId,
                skill: result.skill,
              },
            },
            create: {
              userId: caller.userId,
              languageId: attempt.languageId,
              skill: result.skill,
              cefrLevel: result.cefrLevel,
              confidence: result.confidence,
              source: 'ASSESSMENT',
            },
            update: {
              cefrLevel: result.cefrLevel,
              confidence: result.confidence,
              source: 'ASSESSMENT',
            },
          });
          await tx.proficiencyLevelHistory.create({
            data: {
              proficiencyLevelId: proficiencyLevel.id,
              userId: caller.userId,
              languageId: attempt.languageId,
              skill: result.skill,
              cefrLevel: result.cefrLevel,
              confidence: result.confidence,
              source: 'ASSESSMENT',
            },
          });
        }

        return updated;
      });

      // Published only after the transaction has actually committed —
      // same discipline as `OrganizationsService`'s own event calls, and
      // only on the real transition (never on an idempotent replay), or
      // every retried `complete` call would emit a spurious duplicate
      // event for something that only actually happened once.
      // EVENT_ARCHITECTURE.md's own already-cataloged row (§3) names
      // `recommendation-engine`/`analytics-service` as this event's
      // consumers — neither exists yet (ROADMAP.md), so this is the real,
      // tested mechanism with no live consumer, matching T7/T10's own
      // "build it real, flag the not-yet-wired consumer" precedent.
      const eventPayload = assessmentAttemptCompletedPayloadSchema.parse({
        attemptId: finalAttempt.id,
        languageId: finalAttempt.languageId,
        type: finalAttempt.type,
        skillResults: proficiencyResults.map(({ skill, cefrLevel, confidence, lowConfidence }) => ({
          skill,
          cefrLevel,
          confidence,
          lowConfidence,
        })),
      });
      await this.events.publish('assessment.attempt.completed', {
        userId: caller.userId,
        payload: eventPayload,
      });
    }

    return {
      attempt: toWireAttempt(finalAttempt),
      responses: responses.map(toWireResponse),
      proficiencyLevels: proficiencyResults.map(
        ({ skill, cefrLevel, confidence, lowConfidence }) => ({
          skill,
          cefrLevel,
          confidence,
          lowConfidence,
        }),
      ),
      // §6.4's low-confidence retake-offer contract (E6-T6, API shape
      // only) — true when any served skill's own lowConfidence flag is
      // set; the frontend epic's own job is building the retake-offer UX
      // this flag is for (PRD.md §5.1).
      retakeRecommended: proficiencyResults.some((result) => result.lowConfidence),
    };
  }

  /**
   * Groups this attempt's responses by skill and bands each group (§6.4).
   * `SPEAKING` never appears (out of scope entirely, §3.2). WRITING (E6-T7)
   * is banded separately from the 4 objective skills — `computeSkillBanding`
   * only knows how to weight isCorrect/difficulty across multiple items,
   * which doesn't apply to a single AI-scored essay; its already-persisted
   * critique (`extractWritingCritique`) is read back and passed through
   * `computeWritingBanding` instead.
   *
   * Real, deliberate asymmetry with the 4 objective skills: a WRITING
   * result is only included when a WRITING response was actually served —
   * unlike `computeSkillBanding([])`'s own zero-items default, a missing
   * WRITING result is *omitted* from `proficiencyLevels` entirely, not
   * defaulted to a low-confidence A1. Most languages have no seeded WRITING
   * item yet (T1's own scope), so defaulting would misrepresent "never
   * assessed" as "assessed and scored poorly" and spuriously force
   * `retakeRecommended: true` on every one of those attempts — see
   * `computeWritingBanding`'s own doc comment for the full reasoning.
   */
  private computeProficiencyResults(
    responses: ReadonlyArray<AssessmentResponse & { item: AssessmentItem | null }>,
  ): Array<{ skill: Skill } & SkillBandingResult> {
    const bySkill = new Map<Skill, ScoredItem[]>();
    let latestWritingResponse: AssessmentResponse | undefined;
    for (const response of responses) {
      if (!response.item) {
        throw new Error(
          `AssessmentResponse ${response.id} has no linked AssessmentItem — data integrity violation`,
        );
      }
      if (response.skill === 'WRITING') {
        // T1's seed content serves at most 1 WRITING item per attempt
        // (§6.2) — `responses` arrives ordered by `createdAt asc`, so the
        // last one encountered is the most recent if this invariant were
        // ever violated, rather than an arbitrary one.
        latestWritingResponse = response;
        continue;
      }
      const scored = bySkill.get(response.skill) ?? [];
      scored.push({ isCorrect: response.isCorrect, difficulty: response.item.difficulty });
      bySkill.set(response.skill, scored);
    }

    return SKILL_ORDER.flatMap((skill): Array<{ skill: Skill } & SkillBandingResult> => {
      if (skill === 'WRITING') {
        if (!latestWritingResponse) {
          return [];
        }
        return [{ skill, ...computeWritingBanding(extractWritingCritique(latestWritingResponse)) }];
      }
      return [{ skill, ...computeSkillBanding(bySkill.get(skill) ?? []) }];
    });
  }

  /**
   * 404, not 403 (API_GUIDELINES.md §3's no-existence-leak rule, same
   * discipline as `OrganizationsService.assertCallerManagesOrg`) — whether
   * the attempt doesn't exist or just isn't the caller's own.
   */
  private async getOwnedAttempt(
    caller: RequestUser,
    attemptId: string,
  ): Promise<AssessmentAttempt> {
    const attempt = await this.appPrisma.assessmentAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.userId !== caller.userId) {
      throw new NotFoundException('Assessment attempt not found');
    }
    return attempt;
  }

  /**
   * Walks `SKILL_ORDER` starting at `fromIndex`, returning the next item the
   * adaptive algorithm would serve for the first skill that still has one —
   * skipping any skill already at its stop condition (ADR-038). Used both
   * to compute what a client should submit next (`fromIndex` at the
   * currently-in-progress skill) and, from `fromIndex: 0`, as the single
   * source of truth for "is the whole attempt ready to complete" (null
   * means every objective skill has stopped).
   */
  private async computeNextServableItem(
    attemptId: string,
    languageId: string,
    fromIndex: number,
  ): Promise<AssessmentItem | null> {
    for (let i = fromIndex; i < SKILL_ORDER.length; i++) {
      const skill = SKILL_ORDER[i];
      if (!skill) continue;
      const { history, candidates } = await this.getSkillState(attemptId, languageId, skill);
      const { item } = this.adaptiveSelection.selectNext(candidates, history);
      if (item) {
        return item;
      }
    }
    return null;
  }

  private async getSkillState(
    attemptId: string,
    languageId: string,
    skill: Skill,
  ): Promise<{ history: SelectionHistoryEntry[]; candidates: AssessmentItem[] }> {
    const responses = await this.appPrisma.assessmentResponse.findMany({
      where: { attemptId, skill },
      orderBy: { createdAt: 'asc' },
      include: { item: true },
    });

    const servedItemIds: string[] = [];
    const history: SelectionHistoryEntry[] = [];
    for (const response of responses) {
      if (!response.item) {
        // Every T2-created AssessmentResponse row always has itemId set —
        // this can only fire on a data-integrity violation, never a normal
        // request path.
        throw new Error(
          `AssessmentResponse ${response.id} has no linked AssessmentItem — data integrity violation`,
        );
      }
      servedItemIds.push(response.item.id);
      history.push({ isCorrect: response.isCorrect });
    }

    const candidates = await this.appPrisma.assessmentItem.findMany({
      where: {
        languageId,
        skill,
        isActive: true,
        ...(servedItemIds.length > 0 ? { id: { notIn: servedItemIds } } : {}),
      },
    });

    return { history, candidates };
  }
}
