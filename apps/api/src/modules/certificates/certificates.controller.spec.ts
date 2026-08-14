import { NotFoundException } from '@nestjs/common';
import type {
  CertificateListResponse,
  VerifyCertificateResponse,
} from '@linguaai/validation/certificates';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { CertificatesController } from './certificates.controller.js';
import type { CertificateService } from './certificate.service.js';

const USER: RequestUser = {
  userId: 'user-1',
  role: 'USER',
  organizationId: null,
  orgRole: null,
};

describe('CertificatesController', () => {
  it('verify delegates to CertificateService.verify and returns its result', async () => {
    const verification: VerifyCertificateResponse = {
      issuedAt: '2026-08-14T00:00:00.000Z',
      milestoneType: 'LEVEL',
      milestoneName: 'Beginner',
      holderDisplayName: 'Ada Lovelace',
    };
    const certificateService = { verify: jest.fn().mockResolvedValue(verification) };
    const controller = new CertificatesController(
      certificateService as unknown as CertificateService,
    );

    const result = await controller.verify('real-token');

    expect(certificateService.verify).toHaveBeenCalledWith('real-token');
    expect(result).toEqual(verification);
  });

  it('verify throws 404 when CertificateService.verify returns null', async () => {
    const certificateService = { verify: jest.fn().mockResolvedValue(null) };
    const controller = new CertificatesController(
      certificateService as unknown as CertificateService,
    );

    await expect(controller.verify('unknown-token')).rejects.toBeInstanceOf(NotFoundException);
  });

  it("list delegates to CertificateService.list with the caller's own userId", async () => {
    const listResponse: CertificateListResponse = {
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    };
    const certificateService = { list: jest.fn().mockResolvedValue(listResponse) };
    const controller = new CertificatesController(
      certificateService as unknown as CertificateService,
    );
    const req = { user: USER } as never;

    const result = await controller.list(req, { page: 1, pageSize: 20 });

    expect(certificateService.list).toHaveBeenCalledWith('user-1', { page: 1, pageSize: 20 });
    expect(result).toEqual(listResponse);
  });
});
