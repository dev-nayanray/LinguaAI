import type {
  ActivityResponse,
  ExerciseResponse,
  LessonResponse,
  QuizResponse,
} from '@linguaai/validation/content';

import { LessonContentController } from './lesson-content.controller.js';
import type { LessonContentService } from './lesson-content.service.js';

const LESSON: LessonResponse = {
  id: 'lesson-1',
  unitId: 'unit-1',
  title: 'Saying Hello',
  description: null,
  order: 1,
  estimatedMinutes: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const ACTIVITY: ActivityResponse = {
  id: 'activity-1',
  lessonId: 'lesson-1',
  type: 'READING',
  title: 'Basic Greetings',
  content: {},
  order: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const QUIZ: QuizResponse = {
  id: 'quiz-1',
  activityId: 'activity-1',
  title: 'Quiz 1',
  passingScorePercent: 80,
  order: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const EXERCISE: ExerciseResponse = {
  id: 'ex-1',
  activityId: 'activity-1',
  quizId: null,
  type: 'MULTIPLE_CHOICE',
  prompt: 'Choose the greeting',
  correctAnswer: {},
  order: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function fakeService(): jest.Mocked<LessonContentService> {
  return {
    createLesson: jest.fn().mockResolvedValue(LESSON),
    updateLesson: jest.fn().mockResolvedValue(LESSON),
    deleteLesson: jest.fn().mockResolvedValue(undefined),
    createActivity: jest.fn().mockResolvedValue(ACTIVITY),
    updateActivity: jest.fn().mockResolvedValue(ACTIVITY),
    deleteActivity: jest.fn().mockResolvedValue(undefined),
    createQuiz: jest.fn().mockResolvedValue(QUIZ),
    updateQuiz: jest.fn().mockResolvedValue(QUIZ),
    deleteQuiz: jest.fn().mockResolvedValue(undefined),
    createExercise: jest.fn().mockResolvedValue(EXERCISE),
    updateExercise: jest.fn().mockResolvedValue(EXERCISE),
    deleteExercise: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<LessonContentService>;
}

describe('LessonContentController', () => {
  it('createLesson delegates to the service with the parent unitId', async () => {
    const service = fakeService();
    const controller = new LessonContentController(service);
    const dto = { title: 'Saying Hello', order: 1 };

    await controller.createLesson('unit-1', dto);

    expect(service.createLesson).toHaveBeenCalledWith('unit-1', dto);
  });

  it('updateLesson delegates to the service', async () => {
    const service = fakeService();
    const controller = new LessonContentController(service);
    const dto = { title: 'Updated' };

    const result = await controller.updateLesson('lesson-1', dto);

    expect(service.updateLesson).toHaveBeenCalledWith('lesson-1', dto);
    expect(result).toBe(LESSON);
  });

  it('createActivity delegates to the service with the parent lessonId', async () => {
    const service = fakeService();
    const controller = new LessonContentController(service);
    const dto = { type: 'READING' as const, title: 'Basic Greetings', content: {}, order: 1 };

    await controller.createActivity('lesson-1', dto);

    expect(service.createActivity).toHaveBeenCalledWith('lesson-1', dto);
  });

  it('createQuiz delegates to the service with the parent activityId', async () => {
    const service = fakeService();
    const controller = new LessonContentController(service);
    const dto = { title: 'Quiz 1', order: 1 };

    await controller.createQuiz('activity-1', dto);

    expect(service.createQuiz).toHaveBeenCalledWith('activity-1', dto);
  });

  it('createExercise delegates to the service with the parent activityId', async () => {
    const service = fakeService();
    const controller = new LessonContentController(service);
    const dto = { type: 'MULTIPLE_CHOICE' as const, prompt: 'p', correctAnswer: {}, order: 1 };

    await controller.createExercise('activity-1', dto);

    expect(service.createExercise).toHaveBeenCalledWith('activity-1', dto);
  });

  it('deleteExercise delegates to the service', async () => {
    const service = fakeService();
    const controller = new LessonContentController(service);

    await controller.deleteExercise('ex-1');

    expect(service.deleteExercise).toHaveBeenCalledWith('ex-1');
  });
});
