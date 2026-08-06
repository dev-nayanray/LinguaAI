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

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  return created;
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
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
