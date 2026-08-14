import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient, Skill } from '@linguaai/database';
import type {
  CreateMockTestSectionRequest,
  DraftListeningSectionContent,
  MockTestSectionResponse,
  UpdateMockTestSectionRequest,
} from '@linguaai/validation/exams';

import { APP_PRISMA_CLIENT } from '../../database/index.js';
import { SpeechServiceClientService } from '../speech-service-client/speech-service-client.service.js';

function toWireSection(row: {
  id: string;
  examProgramId: string;
  skill: Skill;
  order: number;
  content: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): MockTestSectionResponse {
  return {
    id: row.id,
    examProgramId: row.examProgramId,
    skill: row.skill,
    order: row.order,
    content: row.content as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `MockTestSection` admin authoring (E19 T1, design doc §3.1/§4/§6.1),
 * nested under its own `ExamProgram`. One section per skill per program
 * (`@@unique([examProgramId, skill])`, exams.prisma) — `create` is really
 * an upsert-by-skill in spirit, but modeled as a real `create` that fails
 * on a real duplicate, the same "let the database's own constraint be the
 * source of truth" discipline every other unique-keyed create endpoint in
 * this codebase already follows.
 */
@Injectable()
export class MockTestSectionService {
  constructor(
    @Inject(APP_PRISMA_CLIENT) private readonly appPrisma: PrismaClient,
    private readonly speechServiceClient: SpeechServiceClientService,
  ) {}

  async create(
    examProgramId: string,
    dto: CreateMockTestSectionRequest,
  ): Promise<MockTestSectionResponse> {
    await this.getOwnedExamProgram(examProgramId);
    const existing = await this.appPrisma.mockTestSection.findUnique({
      where: { examProgramId_skill: { examProgramId, skill: dto.skill } },
    });
    if (existing) {
      throw new ConflictException(`A ${dto.skill} section already exists for this exam program`);
    }
    const content =
      dto.skill === 'LISTENING' ? await this.synthesizeListeningContent(dto.content) : dto.content;
    const section = await this.appPrisma.mockTestSection.create({
      data: {
        examProgramId,
        skill: dto.skill,
        order: dto.order,
        content: content as Prisma.InputJsonValue,
      },
    });
    return toWireSection(section);
  }

  /**
   * Real request/persisted asymmetry for `LISTENING` (design doc §6.1) —
   * mirrors `LessonContentService.synthesizeListeningContent` exactly
   * (E12 T1), extended with this domain's own `questions` array carried
   * through unchanged (E12's own `Activity.content` shape has no such
   * per-question structure to preserve).
   */
  private async synthesizeListeningContent(
    draftContent: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { script, questions } = draftContent as unknown as DraftListeningSectionContent;
    const audioUrl = await this.speechServiceClient.synthesizeSpeech(script);
    return { audioUrl, transcript: script, questions };
  }

  async update(
    examProgramId: string,
    skill: string,
    dto: UpdateMockTestSectionRequest,
  ): Promise<MockTestSectionResponse> {
    const existing = await this.getOwnedSection(examProgramId, skill);
    const section = await this.appPrisma.mockTestSection.update({
      where: { id: existing.id },
      data: { ...dto, content: dto.content as Prisma.InputJsonValue | undefined },
    });
    return toWireSection(section);
  }

  async get(examProgramId: string, skill: string): Promise<MockTestSectionResponse> {
    const section = await this.getOwnedSection(examProgramId, skill);
    return toWireSection(section);
  }

  async list(examProgramId: string): Promise<MockTestSectionResponse[]> {
    await this.getOwnedExamProgram(examProgramId);
    const sections = await this.appPrisma.mockTestSection.findMany({
      where: { examProgramId },
      orderBy: { order: 'asc' },
    });
    return sections.map(toWireSection);
  }

  private async getOwnedExamProgram(examProgramId: string) {
    const examProgram = await this.appPrisma.examProgram.findUnique({
      where: { id: examProgramId },
    });
    if (!examProgram) {
      throw new NotFoundException('Exam program not found');
    }
    return examProgram;
  }

  private async getOwnedSection(examProgramId: string, skill: string) {
    const section = await this.appPrisma.mockTestSection.findUnique({
      where: { examProgramId_skill: { examProgramId, skill: skill as Skill } },
    });
    if (!section) {
      throw new NotFoundException('Mock test section not found');
    }
    return section;
  }
}
