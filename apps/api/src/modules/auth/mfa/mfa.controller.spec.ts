import type { MfaEnrollResponse, MfaVerifyRequest } from '@linguaai/validation/identity';

import type { RequestUser } from '../strategies/jwt.strategy.js';
import { MfaController } from './mfa.controller.js';
import type { MfaService } from './mfa.service.js';

describe('MfaController', () => {
  const req = {
    user: { userId: 'u-1', role: 'ADMIN', organizationId: null, orgRole: null } as RequestUser,
  } as unknown as Parameters<MfaController['enroll']>[0];

  it('enroll delegates to MfaService.beginEnrollment for the caller', async () => {
    const response: MfaEnrollResponse = { secret: 'ABCDEF', otpauthUrl: 'otpauth://totp/...' };
    const mfaService = {
      beginEnrollment: jest.fn().mockResolvedValue(response),
    } as unknown as MfaService;
    const controller = new MfaController(mfaService);

    const result = await controller.enroll(req);

    expect(mfaService.beginEnrollment).toHaveBeenCalledWith('u-1');
    expect(result).toBe(response);
  });

  it('verify delegates to MfaService.completeEnrollment with the caller, secret, and code', async () => {
    const mfaService = {
      completeEnrollment: jest.fn().mockResolvedValue(undefined),
    } as unknown as MfaService;
    const controller = new MfaController(mfaService);
    const dto: MfaVerifyRequest = { secret: 'ABCDEF', code: '123456' };

    await controller.verify(req, dto);

    expect(mfaService.completeEnrollment).toHaveBeenCalledWith('u-1', 'ABCDEF', '123456');
  });
});
