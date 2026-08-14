import { ExamCatalogService } from './exam-catalog.service.js';

const uuid = '66666666-6666-4666-8666-666666666666';
const now = new Date('2026-08-14T00:00:00.000Z');

describe('ExamCatalogService', () => {
  const findMany = jest.fn();
  const prisma = { examProgram: { findMany } };

  function buildService(): ExamCatalogService {
    return new ExamCatalogService(prisma as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries only active exam programs and never exposes rubric', async () => {
    findMany.mockResolvedValue([
      {
        id: uuid,
        name: 'IELTS Academic',
        code: 'IELTS',
        description: null,
        rubric: { bands: 9 },
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const service = buildService();

    const result = await service.listActive();

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(result.data[0]).not.toHaveProperty('rubric');
  });
});
