import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  endAgentSessionRequestSchema,
  sendAgentMessageRequestSchema,
  startAgentSessionRequestSchema,
  updateAgentMessageAudioRequestSchema,
  type AgentMessageStreamEvent,
  type EndAgentSessionRequest,
  type SendAgentMessageRequest,
  type StartAgentSessionRequest,
  type StartAgentSessionResponse,
  type UpdateAgentMessageAudioRequest,
} from '@linguaai/validation/ai-coaching';
import type { Response } from 'express';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { OrchestratorService } from '../orchestrator/orchestrator.service.js';

/**
 * ADR-033 (T10): the real REST surface for `OrchestratorService`
 * (`startSession`/`streamMessage`/`endSession`) — apps/api's own
 * `AiEngineClientModule` is the one caller today (internal-network-only,
 * no auth guard here: `apps/api`'s own already-authenticated request is
 * the trust boundary, matching ADR-033's security-implications note).
 */
@ApiTags('agent-sessions')
@Controller('agent-sessions')
export class AgentSessionsController {
  constructor(private readonly orchestrator: OrchestratorService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a new AI agent session' })
  async start(
    @Body(new ZodValidationPipe(startAgentSessionRequestSchema)) dto: StartAgentSessionRequest,
  ): Promise<StartAgentSessionResponse> {
    return this.orchestrator.startSession(dto);
  }

  /**
   * Server-Sent Events, not NestJS's `@Sse()` decorator — that decorator
   * forces `GET` (no request body), but a message turn needs one
   * (`userMessage`/`variables`). Managed manually via `@Res()` instead:
   *
   * - A failure *before* the first token (session not found, HARD_STOP,
   *   validation) throws out of the awaited `stream.next()` call below,
   *   propagating to `GlobalExceptionFilter` as a normal HTTP error
   *   response — nothing has been written to `res` yet at that point.
   * - A failure *after* streaming has begun is reported as an `error`
   *   event inside the stream itself, never an HTTP-status change —
   *   headers are already flushed as `200 text/event-stream`, the same
   *   "already-yielded content can't be retried/switched" constraint
   *   `RouterService.stream()`'s own failover logic documents.
   *
   * Wire format: one JSON value per `data: ...\n\n` line, discriminated
   * on the payload's own `type` field — no named SSE `event:` fields
   * (API_GUIDELINES.md §13).
   */
  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message and stream the assistant reply (Server-Sent Events)' })
  async sendMessage(
    @Param('id') sessionId: string,
    @Body(new ZodValidationPipe(sendAgentMessageRequestSchema)) dto: SendAgentMessageRequest,
    @Res() res: Response,
  ): Promise<void> {
    const stream = this.orchestrator.streamMessage({
      sessionId,
      userMessage: dto.userMessage,
      variables: dto.variables,
      userAudioUrl: dto.audioUrl,
    });

    const first = await stream.next();
    if (first.done) {
      // Structurally unreachable — streamMessage() always yields at least
      // one token/done event before returning, or throws. Guarded only to
      // satisfy AsyncGenerator's IteratorResult type.
      throw new Error('AI stream ended with no output');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const writeEvent = (event: AgentMessageStreamEvent): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    writeEvent(first.value);
    try {
      for await (const event of stream) {
        writeEvent(event);
      }
    } catch {
      writeEvent({ type: 'error', message: 'The response stream was interrupted.' });
    }
    res.end();
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End an AI agent session' })
  async end(
    @Param('id') sessionId: string,
    @Body(new ZodValidationPipe(endAgentSessionRequestSchema)) dto: EndAgentSessionRequest,
  ): Promise<void> {
    await this.orchestrator.endSession({ sessionId, userId: dto.userId });
  }

  /**
   * E10 T4 (design doc §6.3 step 4) — attaches the assistant's own
   * synthesized-speech URL once TTS finishes, onto the exact `AIMessage`
   * row the `done` SSE event's own `messageId` already named.
   */
  @Patch(':id/messages/:messageId/audio-url')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Attach a synthesized-audio URL to an assistant AIMessage' })
  async updateMessageAudioUrl(
    @Param('id') sessionId: string,
    @Param('messageId') messageId: string,
    @Body(new ZodValidationPipe(updateAgentMessageAudioRequestSchema))
    dto: UpdateAgentMessageAudioRequest,
  ): Promise<void> {
    await this.orchestrator.updateMessageAudioUrl({ sessionId, messageId, audioUrl: dto.audioUrl });
  }
}
