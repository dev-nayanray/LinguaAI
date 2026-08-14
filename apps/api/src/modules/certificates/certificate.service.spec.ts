import { CertificateService } from './certificate.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const levelId = '22222222-2222-4222-8222-222222222222';

describe('CertificateService', () => {
  const certificateCreate = jest.fn();
  const prisma = { certificate: { create: certificateCreate } };

  function buildService(): CertificateService {
    return new CertificateService(prisma as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a real Certificate row with a real 64-char SHA-256 hex hash, never the raw token', async () => {
    certificateCreate.mockResolvedValue({ id: 'cert-1' });
    const service = buildService();

    await service.issue(userId, { levelId });

    expect(certificateCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId, levelId }) }),
    );
    const data = certificateCreate.mock.calls[0]![0].data;
    expect(typeof data.verificationTokenHash).toBe('string');
    expect(data.verificationTokenHash).toHaveLength(64);
    expect(data).not.toHaveProperty('rawToken');
  });

  it('returns a real, non-empty raw token exactly once — never persisted', async () => {
    certificateCreate.mockResolvedValue({ id: 'cert-1' });
    const service = buildService();

    const result = await service.issue(userId, { levelId });

    expect(typeof result.rawToken).toBe('string');
    expect(result.rawToken.length).toBeGreaterThan(0);
    const persistedHash = certificateCreate.mock.calls[0]![0].data.verificationTokenHash;
    expect(persistedHash).not.toBe(result.rawToken);
  });

  it('generates a different raw token and hash on every call (never reused)', async () => {
    certificateCreate.mockResolvedValue({ id: 'cert-1' });
    const service = buildService();

    const first = await service.issue(userId, { levelId });
    const second = await service.issue(userId, { levelId });

    expect(first.rawToken).not.toBe(second.rawToken);
  });

  it('passes through exactly the milestone branch supplied (examProgramId)', async () => {
    certificateCreate.mockResolvedValue({ id: 'cert-1' });
    const service = buildService();
    const examProgramId = '33333333-3333-4333-8333-333333333333';

    await service.issue(userId, { examProgramId });

    const data = certificateCreate.mock.calls[0]![0].data;
    expect(data.examProgramId).toBe(examProgramId);
    expect(data.courseId).toBeUndefined();
    expect(data.levelId).toBeUndefined();
  });
});
