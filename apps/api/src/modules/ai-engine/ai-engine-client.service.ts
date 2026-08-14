import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { parseSseStream } from '@linguaai/utils';
import {
  agentMessageStreamEventSchema,
  correctWritingRequestSchema,
  draftStoryRequestSchema,
  endAgentSessionRequestSchema,
  examSectionScoreSchema,
  scoreExamSectionRequestSchema,
  scoreFluencyRequestSchema,
  scoreFluencyResponseSchema,
  scoreWritingRequestSchema,
  sendAgentMessageRequestSchema,
  startAgentSessionRequestSchema,
  startAgentSessionResponseSchema,
  storyDraftSchema,
  writingCorrectionResultSchema,
  writingCritiqueSchema,
  type AgentMessageStreamEvent,
  type CorrectWritingRequest,
  type DraftStoryRequest,
  type ExamSectionScore,
  type ScoreExamSectionRequest,
  type ScoreFluencyResponse,
  type ScoreWritingRequest,
  type SendAgentMessageRequest,
  type StartAgentSessionRequest,
  type StartAgentSessionResponse,
  type StoryDraft,
  type WritingCorrectionResult,
  type WritingCritiqueSchema,
} from '@linguaai/validation/ai-coaching';
import {
  contentDraftLessonSchema,
  draftLessonRequestSchema,
  type ContentDraftLesson,
  type DraftLessonRequest,
} from '@linguaai/validation/content';
import {
  draftVocabularyItemRequestSchema,
  vocabularyItemDraftSchema,
  type DraftVocabularyItemRequest,
  type VocabularyItemDraft,
} from '@linguaai/validation/vocabulary';

import { AI_ENGINE_CLIENT_CONFIG } from './ai-engine-client.config.js';
import type { AiEngineClientEnv } from '@linguaai/config';

/**
 * ADR-033 (T10, extended in E6 T5): `apps/api`'s typed client for
 * `ai-engine`'s REST controllers — `AgentSessionsController` (T10) and
 * `AssessmentScoringController` (E6 T5) — internal-network-only (ADR-033's
 * own security-implications note; no auth header, since ai-engine has no
 * auth mechanism of its own and this is server-to-server on a private
 * network).
 * "Typed" here means every request/response is validated against the same
 * `@linguaai/validation/ai-coaching` Zod schemas the controller itself
 * validates against — the single source of truth ARCHITECTURE.md §4 names
 * `packages/types`/`packages/validation` as, not a separate OpenAPI-
 * codegen'd client (no such tool exists anywhere in this repo yet, and
 * introducing one is a bigger infra decision than this task's own scope —
 * flagged as a deliberate interpretation, not literally what "generated
 * from the OpenAPI spec" states).
 */
@Injectable()
export class AiEngineClientService {
  constructor(@Inject(AI_ENGINE_CLIENT_CONFIG) private readonly config: AiEngineClientEnv) {}

  async startSession(input: StartAgentSessionRequest): Promise<StartAgentSessionResponse> {
    const response = await fetch(`${this.config.AI_ENGINE_URL}/v1/agent-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(startAgentSessionRequestSchema.parse(input)),
    });
    if (!response.ok) {
      throw new Error(`ai-engine returned ${response.status} starting an agent session`);
    }
    return startAgentSessionResponseSchema.parse(await response.json());
  }

  /**
   * A failure before the first event throws normally (the fetch itself
   * rejects, or the response is a non-2xx JSON error — ai-engine's own
   * `GlobalExceptionFilter` shape). A failure mid-stream instead surfaces
   * as an `{ type: 'error' }` event within the parsed stream — mirroring
   * exactly what `agent-sessions.controller.ts` emits once its own SSE
   * headers are already flushed; this client does not invent a second
   * failure-signaling mechanism on top of that.
   */
  async *streamMessage(
    sessionId: string,
    input: SendAgentMessageRequest,
  ): AsyncGenerator<AgentMessageStreamEvent> {
    const response = await fetch(
      `${this.config.AI_ENGINE_URL}/v1/agent-sessions/${sessionId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendAgentMessageRequestSchema.parse(input)),
      },
    );
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(
        `ai-engine returned ${response.status} sending a message: ${errorBody?.error?.message ?? 'unknown error'}`,
      );
    }
    if (!response.body) {
      throw new Error('ai-engine returned no response body for a streaming request');
    }

    for await (const rawEvent of parseSseStream(response.body)) {
      yield agentMessageStreamEventSchema.parse(rawEvent);
    }
  }

  /**
   * E6 T5 (ADR-033's pattern applied to Writing-skill scoring, §6.3) —
   * wired into the attempt lifecycle by `AssessmentService.scoreWritingItem`
   * (E6-T7).
   */
  async scoreWriting(input: ScoreWritingRequest): Promise<WritingCritiqueSchema> {
    const response = await fetch(`${this.config.AI_ENGINE_URL}/v1/assessment-scoring/writing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scoreWritingRequestSchema.parse(input)),
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(
        `ai-engine returned ${response.status} scoring a writing response: ${errorBody?.error?.message ?? 'unknown error'}`,
      );
    }
    return writingCritiqueSchema.parse(await response.json());
  }

  /**
   * E8 T4 (ADR-041, §6.4) — wired into `apps/api`'s own `ADMIN`-only
   * `POST /v1/admin/lessons/ai-draft` endpoint
   * (`ContentAuthoringController`). Returns a proposal only; nothing is
   * ever persisted on this call path — the caller submits the (possibly
   * edited) draft through the real create endpoints (§6.1) explicitly.
   */
  async draftLesson(input: DraftLessonRequest): Promise<ContentDraftLesson> {
    const response = await fetch(`${this.config.AI_ENGINE_URL}/v1/content-authoring/draft-lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftLessonRequestSchema.parse(input)),
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(
        `ai-engine returned ${response.status} drafting a lesson: ${errorBody?.error?.message ?? 'unknown error'}`,
      );
    }
    return contentDraftLessonSchema.parse(await response.json());
  }

  /**
   * Calls `services/ai-engine`'s `POST /v1/content-authoring/draft-vocabulary-item`
   * endpoint (`ContentDraftingController.draftVocabularyItem()`, E9 T4,
   * §6.4). Returns a proposal only; nothing is ever persisted on this call
   * path — the caller submits the (possibly edited) draft through the real
   * `POST /v1/admin/vocabulary-items` endpoint (§6.1) explicitly.
   */
  async draftVocabularyItem(input: DraftVocabularyItemRequest): Promise<VocabularyItemDraft> {
    const response = await fetch(
      `${this.config.AI_ENGINE_URL}/v1/content-authoring/draft-vocabulary-item`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftVocabularyItemRequestSchema.parse(input)),
      },
    );
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(
        `ai-engine returned ${response.status} drafting a vocabulary item: ${errorBody?.error?.message ?? 'unknown error'}`,
      );
    }
    return vocabularyItemDraftSchema.parse(await response.json());
  }

  /**
   * `userId` (E10 T2) is forwarded so ai-engine's own `endSession` can
   * enforce ownership (§7, ADR-043's session-lifecycle half) — a 404
   * response means either the session doesn't exist or isn't the caller's
   * own (API_GUIDELINES.md §3's no-existence-leak rule), translated here
   * into a real `NotFoundException` rather than the generic `Error` every
   * other non-2xx ai-engine response throws, so `SpeakingController`'s own
   * `DELETE /v1/speaking-sessions/:id` can return a real 404 instead of a
   * misleading 500.
   */
  async endSession(sessionId: string, userId: string): Promise<void> {
    const response = await fetch(
      `${this.config.AI_ENGINE_URL}/v1/agent-sessions/${sessionId}/end`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endAgentSessionRequestSchema.parse({ userId })),
      },
    );
    if (response.status === 404) {
      throw new NotFoundException('Speaking session not found');
    }
    if (!response.ok) {
      throw new Error(`ai-engine returned ${response.status} ending session "${sessionId}"`);
    }
  }

  /**
   * E10 T5 (ADR-048, design doc §6.4) — wired into `SpeakingService.endSession()`,
   * called after the underlying `AIAgentSession` is marked `ENDED`.
   */
  async scoreFluencyAndExtractVocabulary(sessionId: string): Promise<ScoreFluencyResponse> {
    const response = await fetch(`${this.config.AI_ENGINE_URL}/v1/fluency-scoring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scoreFluencyRequestSchema.parse({ sessionId })),
    });
    if (!response.ok) {
      throw new Error(`ai-engine returned ${response.status} scoring session "${sessionId}"`);
    }
    return scoreFluencyResponseSchema.parse(await response.json());
  }

  /**
   * E13 T2 (ADR-052, design doc §6.2) — wired into `WritingCoachingService.submitWriting()`.
   */
  async correctWriting(input: CorrectWritingRequest): Promise<WritingCorrectionResult> {
    const response = await fetch(`${this.config.AI_ENGINE_URL}/v1/writing-coaching/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(correctWritingRequestSchema.parse(input)),
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(
        `ai-engine returned ${response.status} correcting writing: ${errorBody?.error?.message ?? 'unknown error'}`,
      );
    }
    return writingCorrectionResultSchema.parse(await response.json());
  }

  /**
   * E19 T2 (ADR-058, design doc §6.2) — wired into
   * `MockTestAttemptsService.submitSectionResponse()` for the Writing/
   * Speaking sections only (Reading/Listening are scored objectively,
   * in-process, no AI call).
   */
  async scoreExamSection(input: ScoreExamSectionRequest): Promise<ExamSectionScore> {
    const response = await fetch(`${this.config.AI_ENGINE_URL}/v1/exam-scoring/section`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scoreExamSectionRequestSchema.parse(input)),
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(
        `ai-engine returned ${response.status} scoring an exam section: ${errorBody?.error?.message ?? 'unknown error'}`,
      );
    }
    return examSectionScoreSchema.parse(await response.json());
  }

  /**
   * E13 T3 (design doc §6.3) — wired into `StoryService.generateStory()`.
   */
  async draftStory(input: DraftStoryRequest): Promise<StoryDraft> {
    const response = await fetch(`${this.config.AI_ENGINE_URL}/v1/content-authoring/draft-story`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftStoryRequestSchema.parse(input)),
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new Error(
        `ai-engine returned ${response.status} drafting a story: ${errorBody?.error?.message ?? 'unknown error'}`,
      );
    }
    return storyDraftSchema.parse(await response.json());
  }
}
