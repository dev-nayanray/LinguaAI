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
  PrismaClient,
  Skill,
} from '@linguaai/database';
import type {
  AssessmentItemPublicView,
  CompleteAssessmentAttemptResponse,
  StartAssessmentAttemptRequest,
  StartAssessmentAttemptResponse,
  SubmitAssessmentResponseRequest,
  SubmitAssessmentResponseResponse,
} from '@linguaai/validation/learning';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import {
  AdaptiveItemSelectionService,
  type SelectionHistoryEntry,
} from './adaptive-item-selection.service.js';
import { scoreObjectiveResponse } from './objective-scoring.util.js';

/**
 * Fixed serving order for T2's scope (E6 design doc §1's own listed order).
 * WRITING is deliberately excluded — ai-engine's scoring capability doesn't
 * exist yet (T4/T5); serving a WRITING item with no way to score it would
 * leave an attempt permanently unable to reach every objective skill's
 * completion condition. SPEAKING is out of scope entirely (§3.2). See
 * ADR-038's Consequences.
 */
const SKILL_ORDER: Skill[] = ['READING', 'LISTENING', 'VOCABULARY', 'GRAMMAR'];

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
  ) {}

  async startAttempt(
    caller: RequestUser,
    dto: StartAssessmentAttemptRequest,
  ): Promise<StartAssessmentAttemptResponse> {
    const language = await this.appPrisma.language.findUnique({ where: { id: dto.languageId } });
    if (!language) {
      throw new NotFoundException('Language not found');
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

    const { isCorrect, score } = scoreObjectiveResponse(item, dto.response);

    const savedResponse = await this.appPrisma.assessmentResponse.create({
      data: {
        attemptId: attempt.id,
        itemId: item.id,
        skill: item.skill,
        prompt: item.prompt,
        response: dto.response,
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
    if (attempt.status === 'COMPLETED') {
      const responses = await this.appPrisma.assessmentResponse.findMany({
        where: { attemptId: attempt.id },
        orderBy: { createdAt: 'asc' },
      });
      return { attempt: toWireAttempt(attempt), responses: responses.map(toWireResponse) };
    }

    const nextServable = await this.computeNextServableItem(attempt.id, attempt.languageId, 0);
    if (nextServable) {
      throw new ConflictException(
        'Attempt is not ready to complete — at least one skill still has items to serve',
      );
    }

    const completed = await this.appPrisma.assessmentAttempt.update({
      where: { id: attempt.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    const responses = await this.appPrisma.assessmentResponse.findMany({
      where: { attemptId: attempt.id },
      orderBy: { createdAt: 'asc' },
    });

    return { attempt: toWireAttempt(completed), responses: responses.map(toWireResponse) };
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
