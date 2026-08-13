// E4 T12 — deterministic reference-data seed (docs/epics/
// E4-database-schema-core-data-layer.md §14 — the design note this
// script implements). Every insert is idempotent: safe to run against a
// database that already has this seed data, or real dev/CI data
// alongside it. Run via `pnpm --filter @linguaai/database run db:seed`.
//
// Scope is deliberately narrow — see §14.4: this is NOT real content
// authoring (E8's own scope) and NOT a decided MVP language roster
// (PRD.md §5.1 names a count of 10, not a list). Languages/courses/exam
// programs below are illustrative seed data, labeled as such, not a
// product decision made by this script.

import { randomUUID } from 'node:crypto';

import { PrismaClient, type Prisma } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();

// E13 T1 (ADR-053) — the same embedding model/dimension ADR-031 already
// pins for every other real embedding in this platform
// (`services/ai-engine/src/gateway/embedding.constants.ts`), duplicated
// here rather than imported since `packages/database` cannot depend on
// `services/ai-engine` (wrong dependency direction) — this script is the
// one place outside that service real embeddings get computed.
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/** pgvector's own text input format for a `vector` column — `[v1,v2,...]`, cast with `::vector` at the SQL call site. Mirrors `services/ai-engine/src/shared/vector-search.util.ts`'s own `toVectorLiteral`. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Real embedding computation via OpenAI's own API, not a placeholder —
 * closes the gap RISK_REGISTER R-97 (E13's own design phase) found: this
 * script's own pre-existing `CEFR_DESCRIPTOR`/`EXAM_RUBRIC` rows were
 * seeded with `embeddingModelVersion: 'unseeded'` and no real `embedding`
 * value at all, making them unretrievable by `RagRetrievalService`'s own
 * `embedding IS NOT NULL` filter. Returns `null` (not a thrown error) when
 * `OPENAI_API_KEY` is empty — this environment's own already-known,
 * already-tracked credential gap (RISK_REGISTER R-88) — so the rest of
 * this seed script still completes; a genuine API failure with a real key
 * present is still a thrown error, never silently swallowed.
 */
async function computeEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      'OPENAI_API_KEY is not set (RISK_REGISTER R-88) — skipping real embedding computation; this row will be seeded with embeddingModelVersion: "unseeded" and will not be retrievable by RagRetrievalService.',
    );
    return null;
  }

  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({ model: EMBEDDING_MODEL, input: text });
  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error('OpenAI embed() returned no embedding in the response data');
  }
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding provider returned a ${embedding.length}-dimension vector, expected ${EMBEDDING_DIMENSIONS} per ADR-031 — refusing to insert a vector that would fail the column's own vector(${EMBEDDING_DIMENSIONS}) type.`,
    );
  }
  return embedding;
}

async function seedLanguages() {
  // Illustrative subset, not the decided 10-language MVP roster (PRD.md
  // §5.1 names a count, not a list) — enough to exercise the schema and
  // give the sample course/vocabulary/exam data below something real to
  // reference.
  const languages = [
    {
      code: 'es',
      name: 'Spanish',
      nativeName: 'Español',
      voiceAvailable: true,
      uiLanguageSupported: false,
    },
    {
      code: 'de',
      name: 'German',
      nativeName: 'Deutsch',
      voiceAvailable: true,
      uiLanguageSupported: false,
    },
    {
      code: 'fr',
      name: 'French',
      nativeName: 'Français',
      voiceAvailable: true,
      uiLanguageSupported: false,
    },
    {
      code: 'ja',
      name: 'Japanese',
      nativeName: '日本語',
      voiceAvailable: true,
      uiLanguageSupported: false,
    },
    {
      code: 'en',
      name: 'English',
      nativeName: 'English',
      voiceAvailable: true,
      uiLanguageSupported: true,
    },
  ];

  for (const language of languages) {
    await prisma.language.upsert({
      where: { code: language.code },
      create: language,
      update: language,
    });
  }
  console.log(`Seeded ${languages.length} Language rows.`);
}

async function seedSampleCourse() {
  const spanish = await prisma.language.findUniqueOrThrow({ where: { code: 'es' } });

  const course = await prisma.course.upsert({
    where: { languageId_slug: { languageId: spanish.id, slug: 'spanish-for-travel' } },
    create: {
      languageId: spanish.id,
      title: 'Spanish for Travel',
      description:
        'A representative course chain proving the full content hierarchy seeds correctly — not a real content catalog (E8).',
      slug: 'spanish-for-travel',
      publishedAt: new Date(),
    },
    update: {},
  });

  let level = await prisma.level.findFirst({ where: { courseId: course.id, cefrLevel: 'A1' } });
  level ??= await prisma.level.create({
    data: { courseId: course.id, cefrLevel: 'A1', title: 'Beginner', order: 1 },
  });

  let unit = await prisma.unit.findFirst({ where: { levelId: level.id, title: 'Greetings' } });
  unit ??= await prisma.unit.create({ data: { levelId: level.id, title: 'Greetings', order: 1 } });

  let lesson = await prisma.lesson.findFirst({ where: { unitId: unit.id, title: 'Saying Hello' } });
  lesson ??= await prisma.lesson.create({
    data: { unitId: unit.id, title: 'Saying Hello', order: 1, estimatedMinutes: 5 },
  });

  let activity = await prisma.activity.findFirst({
    where: { lessonId: lesson.id, title: 'Basic Greetings' },
  });
  activity ??= await prisma.activity.create({
    data: {
      lessonId: lesson.id,
      type: 'VOCABULARY_DRILL',
      title: 'Basic Greetings',
      content: { instructions: 'Learn to say hello and goodbye in Spanish.' },
      order: 1,
    },
  });

  const existingExercise = await prisma.exercise.findFirst({
    where: { activityId: activity.id, prompt: 'How do you say "hello" in Spanish?' },
  });
  if (!existingExercise) {
    await prisma.exercise.create({
      data: {
        activityId: activity.id,
        type: 'MULTIPLE_CHOICE',
        prompt: 'How do you say "hello" in Spanish?',
        correctAnswer: { options: ['Hola', 'Adiós', 'Gracias', 'Por favor'], correctIndex: 0 },
        order: 1,
      },
    });
  }

  console.log(
    'Seeded 1 sample Course -> Level -> Unit -> Lesson -> Activity -> Exercise chain (Spanish for Travel).',
  );
}

async function seedVocabulary() {
  const spanish = await prisma.language.findUniqueOrThrow({ where: { code: 'es' } });
  const items = [
    { term: 'hola', partOfSpeech: 'INTERJECTION' as const, translations: { en: 'hello' } },
    { term: 'gracias', partOfSpeech: 'INTERJECTION' as const, translations: { en: 'thank you' } },
    { term: 'adiós', partOfSpeech: 'INTERJECTION' as const, translations: { en: 'goodbye' } },
  ];

  for (const item of items) {
    const existing = await prisma.vocabularyItem.findFirst({
      where: { languageId: spanish.id, term: item.term },
    });
    if (!existing) {
      await prisma.vocabularyItem.create({ data: { languageId: spanish.id, ...item } });
    }
  }
  console.log(`Seeded ${items.length} VocabularyItem rows.`);
}

async function seedKnowledgeBaseEntries() {
  const entries = [
    {
      category: 'CEFR_DESCRIPTOR' as const,
      title: 'A1 Speaking Descriptor',
      content:
        'Can interact in a simple way provided the other person is prepared to repeat or rephrase things at a slower rate of speech.',
    },
    {
      category: 'EXAM_RUBRIC' as const,
      title: 'IELTS Speaking Band 7 Descriptor',
      content:
        'Speaks at length without noticeable effort or loss of coherence; uses some less common and idiomatic vocabulary.',
    },
  ];

  const created: { id: string }[] = [];
  for (const entry of entries) {
    let row = await prisma.knowledgeBaseEntry.findFirst({ where: { title: entry.title } });
    row ??= await prisma.knowledgeBaseEntry.create({
      data: { ...entry, embeddingModelVersion: 'unseeded', knowledgeBaseVersion: 'v1' },
    });
    created.push(row);
  }
  console.log(`Seeded ${entries.length} KnowledgeBaseEntry rows.`);

  created.push(...(await seedGrammarReferenceEntries()));
  return created;
}

/**
 * E13 T1 (§3.1, ADR-053) — a real, if deliberately small, curated
 * `GRAMMAR_REFERENCE` set (RISK_REGISTER R-97's own explicitly-scoped
 * "closes the no-real-content-at-all half" fix), with genuinely computed
 * embeddings (`computeEmbedding()` above), not placeholder rows. Spanish —
 * the same illustrative-language choice E6 T1's own placement-item bank
 * already made. `Unsupported("vector(n)")` fields are opaque to Prisma's
 * normal client API (`ai.prisma`'s own field comment) — every write here
 * is raw SQL, the same pre-existing, documented constraint
 * `RagRetrievalService`'s own reads already work within.
 */
async function seedGrammarReferenceEntries(): Promise<{ id: string }[]> {
  const spanish = await prisma.language.findUnique({ where: { code: 'es' } });
  const entries = [
    {
      title: 'Ser vs. estar',
      content:
        'Spanish has two verbs for "to be": "ser" for permanent/defining qualities (identity, origin, profession) and "estar" for temporary states or location. "Soy cansado" (wrong) vs. "Estoy cansado" (correct, "I am tired" — a temporary state, not a permanent trait).',
    },
    {
      title: 'Subject-verb agreement with irregular -ar/-er/-ir conjugation',
      content:
        'Spanish verbs conjugate by person and number; a common English-speaker error is defaulting to the infinitive or third-person form regardless of subject. "Yo tiene" (wrong) vs. "Yo tengo" (correct) — "tener" is irregular in the "yo" form.',
    },
    {
      title: 'Gender and number agreement of adjectives',
      content:
        'Spanish adjectives must agree in gender and number with the noun they modify, unlike English. "La casa blanco" (wrong) vs. "La casa blanca" (correct) — "casa" is feminine, so the adjective takes the feminine "-a" ending.',
    },
  ];

  const created: { id: string }[] = [];
  for (const entry of entries) {
    const existing = await prisma.knowledgeBaseEntry.findFirst({ where: { title: entry.title } });
    if (existing) {
      created.push(existing);
      continue;
    }

    const embedding = await computeEmbedding(entry.content);
    const id = randomUUID();
    if (embedding) {
      await prisma.$executeRaw`
        INSERT INTO "KnowledgeBaseEntry"
          (id, "languageId", category, title, content, embedding, "embeddingModelVersion", "knowledgeBaseVersion", "isActive", "createdAt", "updatedAt")
        VALUES
          (${id}::uuid, ${spanish?.id ?? null}::uuid, 'GRAMMAR_REFERENCE'::"KnowledgeBaseCategory", ${entry.title}, ${entry.content}, ${toVectorLiteral(embedding)}::vector, ${EMBEDDING_MODEL}, 'v1', true, now(), now())
      `;
    } else {
      await prisma.knowledgeBaseEntry.create({
        data: {
          id,
          languageId: spanish?.id,
          category: 'GRAMMAR_REFERENCE',
          title: entry.title,
          content: entry.content,
          embeddingModelVersion: 'unseeded',
          knowledgeBaseVersion: 'v1',
        },
      });
    }
    created.push({ id });
  }
  console.log(`Seeded ${entries.length} GRAMMAR_REFERENCE KnowledgeBaseEntry rows.`);
  return created;
}

// E6 T1 (ADR-037): real, if intentionally small, curated placement-test
// item bank content — Spanish (the same illustrative language every other
// seed function above already uses), spanning A1/B1/C1 (a sparse sample
// across the difficulty range, not all 6 CEFR bands) for the 4 objective
// skills, plus 1 Writing (OPEN_RESPONSE) item. Matches KnowledgeBaseEntry's
// own seeding discipline (E5 T7: "5 seeded rows for verification, not
// exhaustive") — the target ~10-15 items per skill per band (E6 design doc
// §6.1) is real, separately-scoped future content-authoring work, not
// delivered by this seed pass. Listening items have no real audioUrl yet
// (a real, flagged gap — E6 design doc §6.1's own audioUrl comment); their
// `prompt` is a text scaffold of what would be played.
async function seedAssessmentItems() {
  const spanish = await prisma.language.findUniqueOrThrow({ where: { code: 'es' } });

  const items: Array<{
    skill: 'READING' | 'LISTENING' | 'VOCABULARY' | 'GRAMMAR' | 'WRITING';
    cefrLevel: 'A1' | 'B1' | 'C1';
    difficulty: number;
    prompt: string;
    audioUrl?: string;
    correctAnswer: Prisma.InputJsonValue | null;
    itemType: 'MULTIPLE_CHOICE' | 'FILL_IN_BLANK' | 'OPEN_RESPONSE';
  }> = [
    // Reading
    {
      skill: 'READING',
      cefrLevel: 'A1',
      difficulty: 0.5,
      prompt: 'Read: "Me llamo Ana. Soy de España. Tengo veinte años." What is Ana\'s age?',
      correctAnswer: { options: ['Ten', 'Twenty', 'Thirty', 'Not stated'], correctIndex: 1 },
      itemType: 'MULTIPLE_CHOICE',
    },
    {
      skill: 'READING',
      cefrLevel: 'B1',
      difficulty: 0.5,
      prompt:
        'Read: "Aunque llovía mucho, decidimos ir al mercado porque necesitábamos comprar verduras frescas para la cena." Why did they go to the market despite the rain?',
      correctAnswer: {
        options: [
          'They wanted to see the rain',
          'They needed fresh vegetables for dinner',
          'The market was closing',
          'It was not raining',
        ],
        correctIndex: 1,
      },
      itemType: 'MULTIPLE_CHOICE',
    },
    {
      skill: 'READING',
      cefrLevel: 'C1',
      difficulty: 0.5,
      prompt:
        'Read: "Si bien la propuesta parecía prometedora en un principio, un análisis más riguroso reveló una serie de inconsistencias que sus defensores no habían anticipado." What does the passage imply about the proposal\'s initial reception?',
      correctAnswer: {
        options: [
          'It was immediately rejected',
          'It seemed promising before closer scrutiny found flaws',
          'Its defenders had already found all the flaws',
          'No analysis was ever conducted',
        ],
        correctIndex: 1,
      },
      itemType: 'MULTIPLE_CHOICE',
    },
    // Listening (no real audio yet — see this function's own header comment)
    {
      skill: 'LISTENING',
      cefrLevel: 'A1',
      difficulty: 0.5,
      prompt:
        '[Audio transcript scaffold] "Hola, ¿cómo estás? — Muy bien, gracias." What is the second speaker expressing?',
      correctAnswer: {
        options: ['Sadness', 'Wellbeing', 'Confusion', 'A question'],
        correctIndex: 1,
      },
      itemType: 'MULTIPLE_CHOICE',
    },
    {
      skill: 'LISTENING',
      cefrLevel: 'B1',
      difficulty: 0.5,
      prompt:
        '[Audio transcript scaffold] "El tren a Madrid sale a las nueve, pero llega con retraso los lunes." When might the train be late?',
      correctAnswer: {
        options: ['Every day', 'Only on Mondays', 'Never', 'Only at 9pm'],
        correctIndex: 1,
      },
      itemType: 'MULTIPLE_CHOICE',
    },
    {
      skill: 'LISTENING',
      cefrLevel: 'C1',
      difficulty: 0.5,
      prompt:
        '[Audio transcript scaffold] "A pesar de las críticas iniciales, el proyecto acabó por ganarse el respeto de la comunidad científica." What is the speaker\'s overall point?',
      correctAnswer: {
        options: [
          'The project failed despite early praise',
          'The project eventually earned respect despite early criticism',
          'The scientific community never accepted the project',
          'There were no initial critiques',
        ],
        correctIndex: 1,
      },
      itemType: 'MULTIPLE_CHOICE',
    },
    // Vocabulary
    {
      skill: 'VOCABULARY',
      cefrLevel: 'A1',
      difficulty: 0.5,
      prompt: 'What does "gato" mean in English?',
      correctAnswer: { options: ['Dog', 'Cat', 'Bird', 'Fish'], correctIndex: 1 },
      itemType: 'MULTIPLE_CHOICE',
    },
    {
      skill: 'VOCABULARY',
      cefrLevel: 'B1',
      difficulty: 0.5,
      prompt: 'Fill in the blank: "Necesito ___ una cita con el médico." (to make/schedule)',
      correctAnswer: { acceptable: ['pedir', 'concertar', 'sacar'] },
      itemType: 'FILL_IN_BLANK',
    },
    {
      skill: 'VOCABULARY',
      cefrLevel: 'C1',
      difficulty: 0.5,
      prompt:
        'Which word best fits: "Su discurso fue tan ___ que convenció a toda la sala." (persuasive)',
      correctAnswer: { options: ['aburrido', 'contundente', 'breve', 'confuso'], correctIndex: 1 },
      itemType: 'MULTIPLE_CHOICE',
    },
    // Grammar
    {
      skill: 'GRAMMAR',
      cefrLevel: 'A1',
      difficulty: 0.5,
      prompt: 'Fill in the blank: "Yo ___ estudiante." (soy/eres/es)',
      correctAnswer: { acceptable: ['soy'] },
      itemType: 'FILL_IN_BLANK',
    },
    {
      skill: 'GRAMMAR',
      cefrLevel: 'B1',
      difficulty: 0.5,
      prompt:
        'Fill in the blank (preterite vs. imperfect): "Cuando era niño, ___ (vivir) en Madrid."',
      correctAnswer: { acceptable: ['vivía'] },
      itemType: 'FILL_IN_BLANK',
    },
    {
      skill: 'GRAMMAR',
      cefrLevel: 'C1',
      difficulty: 0.5,
      prompt:
        'Fill in the blank (subjunctive): "Dudo que ella ___ (llegar) a tiempo, dado el tráfico."',
      correctAnswer: { acceptable: ['llegue'] },
      itemType: 'FILL_IN_BLANK',
    },
    // Writing — OPEN_RESPONSE, no answer key; scored by ai-engine (E6 T4)
    {
      skill: 'WRITING',
      cefrLevel: 'B1',
      difficulty: 0.5,
      prompt:
        'Escribe un párrafo breve (60-100 palabras) describiendo tu ciudad favorita y por qué te gusta.',
      correctAnswer: null,
      itemType: 'OPEN_RESPONSE',
    },
  ];

  let created = 0;
  for (const item of items) {
    const existing = await prisma.assessmentItem.findFirst({
      where: {
        languageId: spanish.id,
        skill: item.skill,
        cefrLevel: item.cefrLevel,
        prompt: item.prompt,
      },
    });
    if (!existing) {
      await prisma.assessmentItem.create({
        data: {
          languageId: spanish.id,
          skill: item.skill,
          cefrLevel: item.cefrLevel,
          difficulty: item.difficulty,
          prompt: item.prompt,
          audioUrl: item.audioUrl ?? null,
          correctAnswer: item.correctAnswer ?? undefined,
          itemType: item.itemType,
        },
      });
      created++;
    }
  }
  console.log(`Seeded ${created} new AssessmentItem rows (${items.length} defined).`);
}

async function seedBadgesAndMissions() {
  const badges = [
    {
      name: '7-Day Streak',
      description: 'Maintained a 7-day learning streak.',
      criteria: { type: 'STREAK_DAYS', threshold: 7 },
    },
    {
      name: 'First Lesson Complete',
      description: 'Completed your first lesson.',
      criteria: { type: 'LESSONS_COMPLETED', threshold: 1 },
    },
  ];
  for (const badge of badges) {
    const existing = await prisma.badge.findFirst({ where: { name: badge.name } });
    if (!existing) await prisma.badge.create({ data: badge });
  }
  console.log(`Seeded ${badges.length} Badge rows.`);

  // Mission windows are relative to "now" and refreshed on every seed run
  // (upsert-by-title + explicit update) so a re-seeded environment's
  // mission is never stale, unlike a fixed calendar date would be.
  const now = new Date();
  const missions = [
    {
      title: 'Daily Practice',
      type: 'DAILY' as const,
      metric: 'MINUTES_STUDIED' as const,
      targetValue: 15,
      rewardXp: 50,
      startsAt: now,
      endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    },
    {
      title: 'Weekly Lesson Goal',
      type: 'WEEKLY' as const,
      metric: 'LESSONS_COMPLETED' as const,
      targetValue: 5,
      rewardXp: 200,
      startsAt: now,
      endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  ];
  for (const { title, ...rest } of missions) {
    const existing = await prisma.mission.findFirst({
      where: { type: rest.type, metric: rest.metric, rewardXp: rest.rewardXp },
    });
    if (existing) {
      await prisma.mission.update({
        where: { id: existing.id },
        data: { startsAt: rest.startsAt, endsAt: rest.endsAt },
      });
    } else {
      await prisma.mission.create({ data: rest });
    }
  }
  console.log(`Seeded ${missions.length} Mission rows (dates refreshed relative to now).`);
}

async function seedExamPrograms(knowledgeBaseEntries: { id: string }[]) {
  // DATABASE.md §2.8's own named 6 programs. isActive here is illustrative
  // (IELTS/TOEFL picked as the two most globally common) — ROADMAP.md
  // scopes MVP to "1-2 active exam programs" but does not name which;
  // this is not a product decision, just a functional default.
  const programs = [
    { code: 'IELTS', name: 'IELTS Academic', rubric: { bands: 9 }, isActive: true },
    { code: 'TOEFL', name: 'TOEFL iBT', rubric: { maxScore: 120 }, isActive: true },
    {
      code: 'JLPT',
      name: 'JLPT',
      rubric: { levels: ['N5', 'N4', 'N3', 'N2', 'N1'] },
      isActive: false,
    },
    { code: 'TOPIK', name: 'TOPIK', rubric: { levels: [1, 2, 3, 4, 5, 6] }, isActive: false },
    { code: 'HSK', name: 'HSK', rubric: { levels: [1, 2, 3, 4, 5, 6] }, isActive: false },
    {
      code: 'DELE',
      name: 'DELE',
      rubric: { levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
      isActive: false,
    },
  ];

  for (const program of programs) {
    await prisma.examProgram.upsert({
      where: { code: program.code },
      create: program,
      update: { name: program.name, rubric: program.rubric, isActive: program.isActive },
    });
  }
  console.log(`Seeded ${programs.length} ExamProgram rows.`);

  const ielts = await prisma.examProgram.findUniqueOrThrow({ where: { code: 'IELTS' } });
  const ieltsRubricEntry = knowledgeBaseEntries.find((e) => e.id); // any seeded entry is fine for this illustrative link
  if (ieltsRubricEntry) {
    const existingLink = await prisma.examProgramKnowledgeBaseEntry.findFirst({
      where: { examProgramId: ielts.id, knowledgeBaseEntryId: ieltsRubricEntry.id },
    });
    if (!existingLink) {
      await prisma.examProgramKnowledgeBaseEntry.create({
        data: { examProgramId: ielts.id, knowledgeBaseEntryId: ieltsRubricEntry.id },
      });
    }
    console.log('Seeded 1 ExamProgramKnowledgeBaseEntry link (IELTS).');
  }
}

async function seedPlans() {
  // Matches DATABASE.md §2.9's already-established, real (not
  // illustrative) precedent: FREE/PREMIUM active at MVP, FAMILY (ADR-013)
  // and BUSINESS (Enterprise phase) rows exist but inactive.
  const plans = [
    {
      tier: 'FREE' as const,
      name: 'Free',
      limits: {
        maxLanguages: 1,
        dailyAiConversationMinutes: 30,
        pronunciationLabAccess: false,
        examPrepAccess: false,
        adsEnabled: true,
      },
      isActive: true,
    },
    {
      tier: 'PREMIUM' as const,
      name: 'Premium',
      limits: {
        maxLanguages: null,
        dailyAiConversationMinutes: null,
        pronunciationLabAccess: true,
        examPrepAccess: true,
        adsEnabled: false,
      },
      isActive: true,
    },
    {
      tier: 'FAMILY' as const,
      name: 'Family',
      limits: {
        maxLanguages: null,
        dailyAiConversationMinutes: null,
        pronunciationLabAccess: true,
        examPrepAccess: true,
        adsEnabled: false,
        seats: 5,
      },
      isActive: false,
    },
    {
      tier: 'BUSINESS' as const,
      name: 'Business',
      limits: {
        maxLanguages: null,
        dailyAiConversationMinutes: null,
        pronunciationLabAccess: true,
        examPrepAccess: true,
        adsEnabled: false,
        sso: true,
      },
      isActive: false,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { tier: plan.tier },
      create: plan,
      update: { name: plan.name, limits: plan.limits, isActive: plan.isActive },
    });
  }
  console.log(`Seeded ${plans.length} Plan rows.`);
}

async function main() {
  await seedLanguages();
  await seedSampleCourse();
  await seedVocabulary();
  const knowledgeBaseEntries = await seedKnowledgeBaseEntries();
  await seedBadgesAndMissions();
  await seedExamPrograms(knowledgeBaseEntries);
  await seedPlans();
  await seedAssessmentItems();
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
