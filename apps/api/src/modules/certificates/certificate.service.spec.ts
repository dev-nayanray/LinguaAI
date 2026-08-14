import { CertificateService } from './certificate.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const levelId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-08-14T00:00:00.000Z');

describe('CertificateService', () => {
  const certificateCreate = jest.fn();
  const certificateFindUnique = jest.fn();
  const certificateFindMany = jest.fn();
  const certificateCount = jest.fn();
  const prisma = {
    certificate: {
      create: certificateCreate,
      findUnique: certificateFindUnique,
      findMany: certificateFindMany,
      count: certificateCount,
    },
  };

  function buildService(): CertificateService {
    return new CertificateService(prisma as never, prisma as never);
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

  describe('verify', () => {
    it('looks up by the SHA-256 hash of the raw token, never the raw token itself', async () => {
      certificateFindUnique.mockResolvedValue(null);
      const service = buildService();

      await service.verify('some-raw-token');

      const where = certificateFindUnique.mock.calls[0]![0].where;
      expect(where.verificationTokenHash).not.toBe('some-raw-token');
      expect(where.verificationTokenHash).toHaveLength(64);
    });

    it('returns null on no match — a real, generic "not found", no distinct signal', async () => {
      certificateFindUnique.mockResolvedValue(null);
      const service = buildService();

      const result = await service.verify('unknown-token');

      expect(result).toBeNull();
    });

    it("resolves a real Level-branch milestone name and the holder's display name only", async () => {
      certificateFindUnique.mockResolvedValue({
        issuedAt: now,
        course: null,
        level: { title: 'Beginner' },
        examProgram: null,
        user: { displayName: 'Ada Lovelace' },
      });
      const service = buildService();

      const result = await service.verify('real-token');

      expect(result).toEqual({
        issuedAt: now.toISOString(),
        milestoneType: 'LEVEL',
        milestoneName: 'Beginner',
        holderDisplayName: 'Ada Lovelace',
      });
    });

    it('resolves a real ExamProgram-branch milestone name', async () => {
      certificateFindUnique.mockResolvedValue({
        issuedAt: now,
        course: null,
        level: null,
        examProgram: { name: 'IELTS Academic' },
        user: { displayName: 'Ada Lovelace' },
      });
      const service = buildService();

      const result = await service.verify('real-token');

      expect(result).toEqual({
        issuedAt: now.toISOString(),
        milestoneType: 'EXAM_PROGRAM',
        milestoneName: 'IELTS Academic',
        holderDisplayName: 'Ada Lovelace',
      });
    });

    it('never leaks userId or email in the verification response', async () => {
      certificateFindUnique.mockResolvedValue({
        issuedAt: now,
        course: { title: 'Spanish for Travel' },
        level: null,
        examProgram: null,
        user: { displayName: 'Ada Lovelace' },
      });
      const service = buildService();

      const result = await service.verify('real-token');

      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('id');
    });
  });

  describe('list', () => {
    it("scopes the query to the caller's own certificates, newest first, paginated", async () => {
      certificateFindMany.mockResolvedValue([
        {
          id: 'cert-1',
          courseId: null,
          levelId,
          examProgramId: null,
          issuedAt: now,
          createdAt: now,
        },
      ]);
      certificateCount.mockResolvedValue(1);
      const service = buildService();

      const result = await service.list(userId, { page: 1, pageSize: 20 });

      expect(certificateFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: { issuedAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.data).toEqual([
        {
          id: 'cert-1',
          courseId: null,
          levelId,
          examProgramId: null,
          issuedAt: now.toISOString(),
          createdAt: now.toISOString(),
        },
      ]);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('computes the correct offset for page 2', async () => {
      certificateFindMany.mockResolvedValue([]);
      certificateCount.mockResolvedValue(0);
      const service = buildService();

      await service.list(userId, { page: 2, pageSize: 10 });

      expect(certificateFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });
});
