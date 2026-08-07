// Content & curriculum bounded context (ARCHITECTURE.md §2.1, DATABASE.md
// §2.3). First real content (E8-T1): Course Management System's own
// hierarchy, mirroring content.prisma field-for-field (E4 T2's schema).
// Timestamps are typed `string` (ISO 8601) — wire/domain types consumed
// across the API boundary, not Prisma's own generated `Date`-typed types
// (packages/database), the same convention @linguaai/types/learning
// already established.

import { CEFR_LEVELS, type CefrLevel } from '../learning/index.js';

// Re-exported so a consumer only ever imports CEFR_LEVELS/CefrLevel from
// one place per context it's working in — @linguaai/types/learning's own
// header comment names this exact reuse ("Whichever epic adds Course/Level
// types first should reuse this, not redefine it") rather than a second,
// independently-defined content-local copy of the same six-value union.
export { CEFR_LEVELS, type CefrLevel };

export const SCRIPT_DIRECTIONS = ['LTR', 'RTL'] as const;
export type ScriptDirection = (typeof SCRIPT_DIRECTIONS)[number];

export const ACTIVITY_TYPES = [
  'VOCABULARY_DRILL',
  'GRAMMAR_EXPLANATION',
  'LISTENING',
  'SPEAKING',
  'READING',
  'WRITING',
  'CONVERSATION',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const EXERCISE_TYPES = [
  'MULTIPLE_CHOICE',
  'FILL_BLANK',
  'MATCHING',
  'TRANSLATION',
  'LISTENING_COMPREHENSION',
  'SPEAKING_PROMPT',
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export interface Course {
  id: string;
  languageId: string;
  title: string;
  description: string | null;
  slug: string;
  /** Null = draft/unpublished. Set = live (DATABASE.md §2.3). */
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Level {
  id: string;
  courseId: string;
  cefrLevel: CefrLevel;
  title: string;
  description: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  levelId: string;
  title: string;
  description: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  unitId: string;
  title: string;
  description: string | null;
  order: number;
  estimatedMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

/** `content: Record<string, unknown>` — type-specific payload, shape varies per `ActivityType`, validated at the application layer (content.prisma's own header comment), not pinned down further here. */
export interface Activity {
  id: string;
  lessonId: string;
  type: ActivityType;
  title: string;
  content: Record<string, unknown>;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Quiz {
  id: string;
  activityId: string;
  title: string;
  passingScorePercent: number | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** `correctAnswer: Record<string, unknown>` — structured, never raw HTML (content.prisma's own header comment); never sent to a learner-facing read (E8-T2's own scope), only ever visible through this admin-authoring wire shape. */
export interface Exercise {
  id: string;
  activityId: string;
  quizId: string | null;
  type: ExerciseType;
  prompt: string;
  correctAnswer: Record<string, unknown>;
  order: number;
  createdAt: string;
  updatedAt: string;
}
