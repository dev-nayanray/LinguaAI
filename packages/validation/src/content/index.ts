// Content & curriculum bounded context (ARCHITECTURE.md §2.1). First real
// content (E8-T1): the admin authoring wire contract for Course Management
// System's hierarchy, mirroring @linguaai/types/content field-for-field,
// matching every other bounded context's own established schema-plus-
// drift-guard pattern.

import { z } from 'zod';
import { cefrLevelSchema } from '../learning/index.js';
import {
  ACTIVITY_TYPES,
  EXERCISE_TYPES,
  SCRIPT_DIRECTIONS,
  type Activity,
  type Course,
  type Exercise,
  type Lesson,
  type Level,
  type Quiz,
  type Unit,
} from '@linguaai/types/content';

/**
 * Compile-time-only drift guard (identical pattern to every other bounded
 * context's own `assertExtends`): fails to compile if a schema's inferred
 * shape stops matching its canonical @linguaai/types/content interface.
 * Never invoked for any runtime effect.
 */
function assertExtends<Expected, Actual extends Expected>(_witness?: Actual): void {
  // no-op — see doc comment above; `Actual` is referenced in `_witness`'s
  // type so it isn't flagged as an unused type parameter.
}

export const scriptDirectionSchema = z.enum(SCRIPT_DIRECTIONS);
export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export const exerciseTypeSchema = z.enum(EXERCISE_TYPES);

// --- Entity (response) schemas ---

export const courseSchema = z.object({
  id: z.string().uuid(),
  languageId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Course, z.infer<typeof courseSchema>>();
export type CourseResponse = z.infer<typeof courseSchema>;

export const levelSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  cefrLevel: cefrLevelSchema,
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Level, z.infer<typeof levelSchema>>();
export type LevelResponse = z.infer<typeof levelSchema>;

export const unitSchema = z.object({
  id: z.string().uuid(),
  levelId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Unit, z.infer<typeof unitSchema>>();
export type UnitResponse = z.infer<typeof unitSchema>;

export const lessonSchema = z.object({
  id: z.string().uuid(),
  unitId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  estimatedMinutes: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Lesson, z.infer<typeof lessonSchema>>();
export type LessonResponse = z.infer<typeof lessonSchema>;

export const activitySchema = z.object({
  id: z.string().uuid(),
  lessonId: z.string().uuid(),
  type: activityTypeSchema,
  title: z.string(),
  content: z.record(z.string(), z.unknown()),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Activity, z.infer<typeof activitySchema>>();
export type ActivityResponse = z.infer<typeof activitySchema>;

export const quizSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  title: z.string(),
  passingScorePercent: z.number().int().min(0).max(100).nullable(),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Quiz, z.infer<typeof quizSchema>>();
export type QuizResponse = z.infer<typeof quizSchema>;

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  quizId: z.string().uuid().nullable(),
  type: exerciseTypeSchema,
  prompt: z.string().min(1),
  correctAnswer: z.record(z.string(), z.unknown()),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
assertExtends<Exercise, z.infer<typeof exerciseSchema>>();
export type ExerciseResponse = z.infer<typeof exerciseSchema>;

// --- Admin authoring request schemas (E8-T1, §6.1) ---

export const createCourseRequestSchema = z.object({
  languageId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase, hyphen-separated'),
});
export type CreateCourseRequest = z.infer<typeof createCourseRequestSchema>;

export const updateCourseRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase, hyphen-separated')
    .optional(),
});
export type UpdateCourseRequest = z.infer<typeof updateCourseRequestSchema>;

export const createLevelRequestSchema = z.object({
  cefrLevel: cefrLevelSchema,
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0),
});
export type CreateLevelRequest = z.infer<typeof createLevelRequestSchema>;

export const updateLevelRequestSchema = z.object({
  cefrLevel: cefrLevelSchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateLevelRequest = z.infer<typeof updateLevelRequestSchema>;

export const createUnitRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0),
});
export type CreateUnitRequest = z.infer<typeof createUnitRequestSchema>;

export const updateUnitRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateUnitRequest = z.infer<typeof updateUnitRequestSchema>;

export const createLessonRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0),
  estimatedMinutes: z.number().int().min(1).optional(),
});
export type CreateLessonRequest = z.infer<typeof createLessonRequestSchema>;

export const updateLessonRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
  estimatedMinutes: z.number().int().min(1).optional(),
});
export type UpdateLessonRequest = z.infer<typeof updateLessonRequestSchema>;

export const createActivityRequestSchema = z.object({
  type: activityTypeSchema,
  title: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
  order: z.number().int().min(0),
});
export type CreateActivityRequest = z.infer<typeof createActivityRequestSchema>;

export const updateActivityRequestSchema = z.object({
  type: activityTypeSchema.optional(),
  title: z.string().min(1).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateActivityRequest = z.infer<typeof updateActivityRequestSchema>;

export const createQuizRequestSchema = z.object({
  title: z.string().min(1),
  passingScorePercent: z.number().int().min(0).max(100).optional(),
  order: z.number().int().min(0),
});
export type CreateQuizRequest = z.infer<typeof createQuizRequestSchema>;

export const updateQuizRequestSchema = z.object({
  title: z.string().min(1).optional(),
  passingScorePercent: z.number().int().min(0).max(100).optional(),
  order: z.number().int().min(0).optional(),
});
export type UpdateQuizRequest = z.infer<typeof updateQuizRequestSchema>;

export const createExerciseRequestSchema = z.object({
  type: exerciseTypeSchema,
  prompt: z.string().min(1),
  correctAnswer: z.record(z.string(), z.unknown()),
  order: z.number().int().min(0),
  quizId: z.string().uuid().optional(),
});
export type CreateExerciseRequest = z.infer<typeof createExerciseRequestSchema>;

export const updateExerciseRequestSchema = z.object({
  type: exerciseTypeSchema.optional(),
  prompt: z.string().min(1).optional(),
  correctAnswer: z.record(z.string(), z.unknown()).optional(),
  order: z.number().int().min(0).optional(),
  quizId: z.string().uuid().nullable().optional(),
});
export type UpdateExerciseRequest = z.infer<typeof updateExerciseRequestSchema>;
