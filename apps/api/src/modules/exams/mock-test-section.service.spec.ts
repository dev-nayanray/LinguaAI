import { ConflictException, NotFoundException } from '@nestjs/common';

import { MockTestSectionService } from './mock-test-section.service.js';

const uuid = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-08-14T00:00:00.000Z');

describe('MockTestSectionService', () => {
  const examProgramFindUnique = jest.fn();
  const sectionCreate = jest.fn();
  const sectionUpdate = jest.fn();
  const sectionFindUnique = jest.fn();
  const sectionFindMany = jest.fn();
  const synthesizeSpeech = jest.fn();
  const prisma = {
    examProgram: { findUnique: examProgramFindUnique },
    mockTestSection: {
      create: sectionCreate,
      update: sectionUpdate,
      findUnique: sectionFindUnique,
      findMany: sectionFindMany,
    },
  };
  const speechServiceClient = { synthesizeSpeech };

  function buildService(): MockTestSectionService {
    return new MockTestSectionService(prisma as never, speechServiceClient as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    examProgramFindUnique.mockResolvedValue({ id: uuid });
  });

  it('creates a READING section without ever calling speech synthesis', async () => {
    sectionCreate.mockResolvedValue({
      id: uuid,
      examProgramId: uuid,
      skill: 'READING',
      order: 0,
      content: { passage: 'x', questions: [] },
      createdAt: now,
      updatedAt: now,
    });
    const service = buildService();

    await service.create(uuid, {
      skill: 'READING',
      order: 0,
      content: { passage: 'x', questions: [{ prompt: 'q', options: ['a', 'b'], correctIndex: 0 }] },
    });

    expect(synthesizeSpeech).not.toHaveBeenCalled();
    expect(sectionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: {
            passage: 'x',
            questions: [{ prompt: 'q', options: ['a', 'b'], correctIndex: 0 }],
          },
        }),
      }),
    );
  });

  it('synthesizes real audio for a LISTENING section, persisting audioUrl/transcript alongside the caller-supplied questions', async () => {
    synthesizeSpeech.mockResolvedValue('https://cdn.example.com/audio/real.mp3');
    sectionCreate.mockResolvedValue({
      id: uuid,
      examProgramId: uuid,
      skill: 'LISTENING',
      order: 1,
      content: {},
      createdAt: now,
      updatedAt: now,
    });
    const service = buildService();

    await service.create(uuid, {
      skill: 'LISTENING',
      order: 1,
      content: {
        script: 'A real script.',
        questions: [{ prompt: 'q', options: ['a', 'b'], correctIndex: 1 }],
      },
    });

    expect(synthesizeSpeech).toHaveBeenCalledWith('A real script.');
    expect(sectionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: {
            audioUrl: 'https://cdn.example.com/audio/real.mp3',
            transcript: 'A real script.',
            questions: [{ prompt: 'q', options: ['a', 'b'], correctIndex: 1 }],
          },
        }),
      }),
    );
  });

  it('throws ConflictException creating a second section for a skill that already has one', async () => {
    sectionFindUnique.mockResolvedValue({ id: uuid, examProgramId: uuid, skill: 'WRITING' });
    const service = buildService();

    await expect(
      service.create(uuid, {
        skill: 'WRITING',
        order: 0,
        content: { taskPrompt: 'x', minWords: 100 },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(sectionCreate).not.toHaveBeenCalled();
  });

  it('throws NotFoundException creating a section under a nonexistent ExamProgram', async () => {
    examProgramFindUnique.mockResolvedValue(null);
    const service = buildService();

    await expect(
      service.create(uuid, {
        skill: 'WRITING',
        order: 0,
        content: { taskPrompt: 'x', minWords: 100 },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sectionCreate).not.toHaveBeenCalled();
  });

  it('throws NotFoundException reading a section that does not exist for that skill', async () => {
    sectionFindUnique.mockResolvedValue(null);
    const service = buildService();

    await expect(service.get(uuid, 'SPEAKING')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists sections ordered by their own real `order` field', async () => {
    sectionFindMany.mockResolvedValue([]);
    const service = buildService();

    await service.list(uuid);

    expect(sectionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { examProgramId: uuid }, orderBy: { order: 'asc' } }),
    );
  });
});
