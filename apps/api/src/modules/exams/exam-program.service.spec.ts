import { NotFoundException } from '@nestjs/common';

import { ExamProgramService } from './exam-program.service.js';

const uuid = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-08-14T00:00:00.000Z');

const baseRow = {
  id: uuid,
  name: 'IELTS Academic',
  code: 'IELTS',
  description: null,
  rubric: { bands: 9 },
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

describe('ExamProgramService', () => {
  const create = jest.fn();
  const update = jest.fn();
  const findUnique = jest.fn();
  const findMany = jest.fn();
  const prisma = { examProgram: { create, update, findUnique, findMany } };

  function buildService(): ExamProgramService {
    return new ExamProgramService(prisma as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an ExamProgram and serializes dates/rubric on the wire', async () => {
    create.mockResolvedValue(baseRow);
    const service = buildService();

    const result = await service.create({
      name: 'IELTS Academic',
      code: 'IELTS',
      rubric: { bands: 9 },
    });

    expect(result).toEqual({
      id: uuid,
      name: 'IELTS Academic',
      code: 'IELTS',
      description: null,
      rubric: { bands: 9 },
      isActive: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it('throws NotFoundException on update when the ExamProgram does not exist', async () => {
    findUnique.mockResolvedValue(null);
    const service = buildService();

    await expect(service.update(uuid, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException on get when the ExamProgram does not exist', async () => {
    findUnique.mockResolvedValue(null);
    const service = buildService();

    await expect(service.get(uuid)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('list() omits rubric from every row (summary view, not the full detail)', async () => {
    findMany.mockResolvedValue([baseRow]);
    const service = buildService();

    const result = await service.list();

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('rubric');
    expect(result.data[0]).toEqual({
      id: uuid,
      name: 'IELTS Academic',
      code: 'IELTS',
      description: null,
      isActive: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });
});
