// Learning bounded context (ARCHITECTURE.md §2.1). First real content
// (E6-T2): Assessment entities, mirroring assessment.prisma field-for-field
// (E4-T3's schema, E6-T1's AssessmentItem addition). Zod schemas in
// @linguaai/validation/learning import the runtime enum arrays below rather
// than redefining them, same dependency direction as the identity context.
//
// Timestamps are typed `string` (ISO 8601) — these are wire/domain types
// consumed across the API boundary, not Prisma's own generated types
// (packages/database), which use `Date`.

export const SKILLS = [
  'READING',
  'WRITING',
  'LISTENING',
  'SPEAKING',
  'VOCABULARY',
  'GRAMMAR',
] as const;
export type Skill = (typeof SKILLS)[number];

/** Not yet defined anywhere else in packages/types (module 5/Course Management, E8, hasn't landed) — defined here since AssessmentItem/AssessmentAttempt need it now. Whichever epic adds Course/Level types first should reuse this, not redefine it. */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const ASSESSMENT_TYPES = ['PLACEMENT', 'REASSESSMENT'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const ASSESSMENT_ITEM_TYPES = ['MULTIPLE_CHOICE', 'FILL_IN_BLANK', 'OPEN_RESPONSE'] as const;
export type AssessmentItemType = (typeof ASSESSMENT_ITEM_TYPES)[number];

export interface AssessmentAttempt {
  id: string;
  userId: string;
  languageId: string;
  type: AssessmentType;
  status: AssessmentStatus;
  startedAt: string;
  completedAt: string | null;
}

/**
 * The full backend-truth shape, including `correctAnswer` — the answer key.
 * Never send this type's value directly to a client taking the assessment
 * (E6 design doc §6.3's own scoring-integrity bar). `AssessmentItemPublicView`
 * (@linguaai/validation/learning) is the wire-safe subset served during an
 * attempt; this type is not itself wire-safe.
 */
export interface AssessmentItem {
  id: string;
  languageId: string;
  skill: Skill;
  cefrLevel: CefrLevel;
  difficulty: number;
  prompt: string;
  audioUrl: string | null;
  correctAnswer: unknown;
  itemType: AssessmentItemType;
  isActive: boolean;
}

export interface AssessmentResponse {
  id: string;
  attemptId: string;
  itemId: string | null;
  skill: Skill;
  prompt: string;
  /** Always a plain object (`{ selectedIndex }`, `{ text }`, ...) — "structured, never raw HTML" (same discipline as Exercise.correctAnswer), never a bare primitive. */
  response: Record<string, unknown>;
  isCorrect: boolean | null;
  score: number | null;
  createdAt: string;
}

export const PROFICIENCY_SOURCES = ['ASSESSMENT', 'INFERRED'] as const;
export type ProficiencySource = (typeof PROFICIENCY_SOURCES)[number];

/** Current-state row (E6 T3) — one per (userId, languageId, skill). `ProficiencyLevelHistory` is the append-only trend this same write always also produces. */
export interface ProficiencyLevel {
  id: string;
  userId: string;
  languageId: string;
  skill: Skill;
  cefrLevel: CefrLevel;
  confidence: number;
  source: ProficiencySource;
}

/**
 * The active roadmap `recommendation-engine` generates/maintains (E7 T2/T5)
 * — mirrors `assessment.prisma`'s `LearningPlan` field-for-field.
 * `milestones` is structured, producer-defined JSON (generation metadata,
 * `weakSkills`, ...) — typed as an open record here, not a fixed shape,
 * since its own concrete fields are an internal `recommendation-engine`
 * concern (§6.2/§6.3), not a wire contract this type pins down.
 */
export interface LearningPlan {
  id: string;
  userId: string;
  languageId: string;
  goal: string;
  targetDate: string | null;
  milestones: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Today's target `recommendation-engine`'s nightly job generates (E7 T3/T5)
 * — mirrors `assessment.prisma`'s `DailyGoal` field-for-field. `date` is a
 * plain `YYYY-MM-DD` calendar-date string (the user's own local date the
 * goal was generated for, `toLocalCalendarDate`'s own output shape,
 * `packages/utils`), not a UTC instant.
 */
export interface DailyGoal {
  id: string;
  userId: string;
  learningPlanId: string | null;
  date: string;
  targetXp: number;
  targetMinutes: number;
  targetActivities: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}
