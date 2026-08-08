import { Inject, Injectable } from '@nestjs/common';
import {
  agentMessageStreamEventSchema,
  scoreWritingRequestSchema,
  sendAgentMessageRequestSchema,
  startAgentSessionRequestSchema,
  startAgentSessionResponseSchema,
  writingCritiqueSchema,
  type AgentMessageStreamEvent,
  type ScoreWritingRequest,
  type SendAgentMessageRequest,
  type StartAgentSessionRequest,
  type StartAgentSessionResponse,
  type WritingCritiqueSchema,
} from '@linguaai/validation/ai-coaching';
import {
  contentDraftLessonSchema,
  draftLessonRequestSchema,
  type ContentDraftLesson,
  type DraftLessonRequest,
} from '@linguaai/validation/content';

import { AI_ENGINE_CLIENT_CONFIG } from './ai-engine-client.config.js';
import type { AiEngineClientEnv } from '@linguaai/config';

/**
 * Parses a `text/event-stream` response body (one JSON value per
 * `data: ...\n\n` line — API_GUIDELINES.md §13) into the raw, not-yet-
 * validated payloads it carries. A separate, small function rather than
 * inline in `streamMessage()` so the wire-format parsing and the
 * ai-coaching-specific schema validation stay independently testable.
 */
async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '));
        if (dataLine) {
          yield JSON.parse(dataLine.slice('data: '.length)) as unknown;
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

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

  async endSession(sessionId: string): Promise<void> {
    const response = await fetch(
      `${this.config.AI_ENGINE_URL}/v1/agent-sessions/${sessionId}/end`,
      {
        method: 'POST',
      },
    );
    if (!response.ok) {
      throw new Error(`ai-engine returned ${response.status} ending session "${sessionId}"`);
    }
  }
}
