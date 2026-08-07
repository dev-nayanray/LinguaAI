import type { Response } from 'express';

import type { OrchestratorService } from '../orchestrator/orchestrator.service.js';
import type { SendMessageStreamEvent } from '../orchestrator/orchestrator.types.js';
import { AgentSessionsController } from './agent-sessions.controller.js';

function fakeRes(): jest.Mocked<Pick<Response, 'setHeader' | 'flushHeaders' | 'write' | 'end'>> {
  return {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  };
}

async function* fakeEventStream(
  events: SendMessageStreamEvent[],
  failAfter?: number,
): AsyncGenerator<SendMessageStreamEvent> {
  for (let i = 0; i < events.length; i++) {
    yield events[i]!;
    if (failAfter !== undefined && i === failAfter) {
      throw new Error('connection dropped mid-stream');
    }
  }
}

describe('AgentSessionsController', () => {
  describe('start', () => {
    it('delegates to OrchestratorService.startSession and returns its result', async () => {
      const orchestrator = {
        startSession: jest.fn().mockResolvedValue({ sessionId: 'session-1' }),
      };
      const controller = new AgentSessionsController(
        orchestrator as unknown as OrchestratorService,
      );

      const result = await controller.start({
        userId: 'user-1',
        languageId: 'lang-1',
        orchestratorAgent: 'CONVERSATION_PARTNER',
      });

      expect(orchestrator.startSession).toHaveBeenCalledWith({
        userId: 'user-1',
        languageId: 'lang-1',
        orchestratorAgent: 'CONVERSATION_PARTNER',
      });
      expect(result).toEqual({ sessionId: 'session-1' });
    });
  });

  describe('sendMessage', () => {
    it('streams every event as its own SSE "data:" line, then ends the response', async () => {
      const orchestrator = {
        streamMessage: jest.fn().mockReturnValue(
          fakeEventStream([
            { type: 'token', delta: 'hel' },
            { type: 'token', delta: 'lo' },
            {
              type: 'done',
              assistantMessage: 'hello',
              promptVersion: 'v1',
              modelId: 'claude-teacher-model',
            },
          ]),
        ),
      };
      const controller = new AgentSessionsController(
        orchestrator as unknown as OrchestratorService,
      );
      const res = fakeRes();

      await controller.sendMessage(
        'session-1',
        { userMessage: 'hi', variables: {} },
        res as unknown as Response,
      );

      expect(orchestrator.streamMessage).toHaveBeenCalledWith({
        sessionId: 'session-1',
        userMessage: 'hi',
        variables: {},
      });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled();
      expect(res.write).toHaveBeenNthCalledWith(
        1,
        `data: ${JSON.stringify({ type: 'token', delta: 'hel' })}\n\n`,
      );
      expect(res.write).toHaveBeenNthCalledWith(
        2,
        `data: ${JSON.stringify({ type: 'token', delta: 'lo' })}\n\n`,
      );
      expect(res.write).toHaveBeenNthCalledWith(
        3,
        `data: ${JSON.stringify({
          type: 'done',
          assistantMessage: 'hello',
          promptVersion: 'v1',
          modelId: 'claude-teacher-model',
        })}\n\n`,
      );
      expect(res.end).toHaveBeenCalled();
    });

    it('propagates a pre-stream failure (e.g. HARD_STOP) as a thrown error without writing anything to the response', async () => {
      const orchestrator = {
        streamMessage: jest.fn().mockReturnValue(
          // eslint-disable-next-line require-yield -- deliberately throws before any yield, to test the "pre-stream failure" path.
          (async function* (): AsyncGenerator<SendMessageStreamEvent> {
            throw new Error(
              'AI request volume has exceeded the cost circuit breaker threshold (ADR-034) — please try again in a moment.',
            );
          })(),
        ),
      };
      const controller = new AgentSessionsController(
        orchestrator as unknown as OrchestratorService,
      );
      const res = fakeRes();

      await expect(
        controller.sendMessage(
          'session-1',
          { userMessage: 'hi', variables: {} },
          res as unknown as Response,
        ),
      ).rejects.toThrow('cost circuit breaker threshold');
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(res.write).not.toHaveBeenCalled();
    });

    it('writes an error event and still ends the response when the stream fails after at least one token has already been sent', async () => {
      const orchestrator = {
        streamMessage: jest
          .fn()
          .mockReturnValue(fakeEventStream([{ type: 'token', delta: 'partial' }], 0)),
      };
      const controller = new AgentSessionsController(
        orchestrator as unknown as OrchestratorService,
      );
      const res = fakeRes();

      await controller.sendMessage(
        'session-1',
        { userMessage: 'hi', variables: {} },
        res as unknown as Response,
      );

      expect(res.write).toHaveBeenNthCalledWith(
        1,
        `data: ${JSON.stringify({ type: 'token', delta: 'partial' })}\n\n`,
      );
      expect(res.write).toHaveBeenNthCalledWith(
        2,
        `data: ${JSON.stringify({ type: 'error', message: 'The response stream was interrupted.' })}\n\n`,
      );
      expect(res.end).toHaveBeenCalled();
    });

    it("throws if the generator completes without yielding anything at all (structurally unreachable per streamMessage's own contract, guarded only for the IteratorResult type)", async () => {
      const orchestrator = {
        streamMessage: jest.fn().mockReturnValue(
          // eslint-disable-next-line require-yield -- deliberately yields nothing, to exercise this defensive guard.
          (async function* (): AsyncGenerator<SendMessageStreamEvent> {
            return;
          })(),
        ),
      };
      const controller = new AgentSessionsController(
        orchestrator as unknown as OrchestratorService,
      );
      const res = fakeRes();

      await expect(
        controller.sendMessage(
          'session-1',
          { userMessage: 'hi', variables: {} },
          res as unknown as Response,
        ),
      ).rejects.toThrow('AI stream ended with no output');
      expect(res.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('end', () => {
    it('delegates to OrchestratorService.endSession', async () => {
      const orchestrator = { endSession: jest.fn().mockResolvedValue(undefined) };
      const controller = new AgentSessionsController(
        orchestrator as unknown as OrchestratorService,
      );

      await controller.end('session-1');

      expect(orchestrator.endSession).toHaveBeenCalledWith({ sessionId: 'session-1' });
    });
  });
});
