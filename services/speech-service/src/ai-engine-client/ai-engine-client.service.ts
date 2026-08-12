import { Inject, Injectable } from '@nestjs/common';
import type { AiEngineClientEnv } from '@linguaai/config';
import { parseSseStream } from '@linguaai/utils';
import {
  agentMessageStreamEventSchema,
  endAgentSessionRequestSchema,
  sendAgentMessageRequestSchema,
  updateAgentMessageAudioRequestSchema,
  type AgentMessageStreamEvent,
  type SendAgentMessageRequest,
} from '@linguaai/validation/ai-coaching';

import { AI_ENGINE_CLIENT_CONFIG } from './ai-engine-client.config.js';

/**
 * `services/speech-service`'s own typed client for `ai-engine`'s
 * `AgentSessionsController` (E10 T4, ADR-033's established pattern
 * extended to a second internal caller, ADR-044). Internal-network-only,
 * no auth header — the same trust-boundary reasoning `apps/api`'s own
 * client already documents.
 */
@Injectable()
export class AiEngineClientService {
  constructor(@Inject(AI_ENGINE_CLIENT_CONFIG) private readonly config: AiEngineClientEnv) {}

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
   * Attaches the assistant's own synthesized-audio URL once TTS finishes
   * (E10 T4, design doc §6.3 step 4) onto the exact `AIMessage` row the
   * `done` SSE event's own `messageId` already named.
   */
  async updateMessageAudioUrl(
    sessionId: string,
    messageId: string,
    audioUrl: string,
  ): Promise<void> {
    const response = await fetch(
      `${this.config.AI_ENGINE_URL}/v1/agent-sessions/${sessionId}/messages/${messageId}/audio-url`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateAgentMessageAudioRequestSchema.parse({ audioUrl })),
      },
    );
    if (!response.ok) {
      throw new Error(
        `ai-engine returned ${response.status} attaching audioUrl to message "${messageId}"`,
      );
    }
  }

  /**
   * T7 (§6.5) — called once the gateway's own 60s reconnection grace-window
   * timer expires without a resume, transitioning the session to
   * `ABANDONED`. `userId` is this connection's own already-verified token
   * claim (`SessionTokenService.verify`), never client-suppliable.
   */
  async abandonSession(sessionId: string, userId: string): Promise<void> {
    const response = await fetch(
      `${this.config.AI_ENGINE_URL}/v1/agent-sessions/${sessionId}/abandon`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endAgentSessionRequestSchema.parse({ userId })),
      },
    );
    if (!response.ok) {
      throw new Error(`ai-engine returned ${response.status} abandoning session "${sessionId}"`);
    }
  }
}
