import { Inject, Injectable } from '@nestjs/common';
import {
  agentMessageStreamEventSchema,
  sendAgentMessageRequestSchema,
  startAgentSessionRequestSchema,
  startAgentSessionResponseSchema,
  type AgentMessageStreamEvent,
  type SendAgentMessageRequest,
  type StartAgentSessionRequest,
  type StartAgentSessionResponse,
} from '@linguaai/validation/ai-coaching';

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
 * ADR-033 (T10): `apps/api`'s typed client for `ai-engine`'s
 * `AgentSessionsController` — internal-network-only (ADR-033's own
 * security-implications note; no auth header, since ai-engine has no auth
 * mechanism of its own and this is server-to-server on a private network).
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
