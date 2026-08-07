import { Logger } from '@nestjs/common';

import { SafetyLayerService } from './safety-layer.service.js';

describe('SafetyLayerService', () => {
  let service: SafetyLayerService;

  beforeEach(() => {
    service = new SafetyLayerService();
  });

  it('delimitUntrustedContent delegates to the pure function', () => {
    const result = service.delimitUntrustedContent('conversation_summary', 'some text');

    expect(result).toContain('<untrusted_context label="conversation_summary">');
    expect(result).toContain('some text');
  });

  it('sanitizeOutput delegates to the pure function', () => {
    expect(service.sanitizeOutput('<b>bold</b> text')).toBe('bold text');
  });

  it('resolveAgeBracket delegates to the pure function, failing closed to MINOR', () => {
    expect(service.resolveAgeBracket('ADULT')).toBe('ADULT');
    expect(service.resolveAgeBracket(null)).toBe('MINOR');
  });

  describe('recordSampleForReviewIfDue', () => {
    let logSpy: jest.SpyInstance;
    let randomSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      logSpy.mockRestore();
      randomSpy.mockRestore();
    });

    it('logs a structured event, without message content, when the sample fires', () => {
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

      service.recordSampleForReviewIfDue({ sessionId: 'session-1', messageId: 'msg-1' });

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1', messageId: 'msg-1' }),
      );
      const loggedPayload = logSpy.mock.calls[0]![0];
      expect(loggedPayload.content).toBeUndefined();
    });

    it('does not log when the sample does not fire', () => {
      randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.999999);

      service.recordSampleForReviewIfDue({ sessionId: 'session-1', messageId: 'msg-1' });

      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
