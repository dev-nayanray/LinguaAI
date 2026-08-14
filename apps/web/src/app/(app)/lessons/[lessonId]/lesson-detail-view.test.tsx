import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LessonDetailView } from './lesson-detail-view';

const useLessonDetailMock = vi.fn();
const useSubmitExerciseAttemptMock = vi.fn();

vi.mock('@/lib/api/courses', () => ({
  useLessonDetail: (lessonId: string) => useLessonDetailMock(lessonId),
  useSubmitExerciseAttempt: () => useSubmitExerciseAttemptMock(),
}));

function renderPage(lessonId = 'lesson-1') {
  return render(<LessonDetailView lessonId={lessonId} />);
}

const baseLesson = {
  id: 'lesson-1',
  unitId: 'unit-1',
  title: 'Saying hello',
  description: 'Basic greetings',
  order: 1,
  estimatedMinutes: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('LessonDetailPage', () => {
  it('renders a free-text exercise, submits it, and shows a real scored outcome', async () => {
    useLessonDetailMock.mockReturnValue({
      data: {
        ...baseLesson,
        activities: [
          {
            id: 'activity-1',
            lessonId: 'lesson-1',
            type: 'VOCABULARY_DRILL',
            title: 'Vocabulary',
            order: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            exercises: [
              {
                id: 'ex-1',
                activityId: 'activity-1',
                quizId: null,
                type: 'TRANSLATION',
                prompt: 'Translate "hello"',
                order: 1,
              },
            ],
            quizzes: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const mutate = vi.fn();
    useSubmitExerciseAttemptMock.mockReturnValue({
      mutate,
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Translate "hello"')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Your answer'), 'hola');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(mutate).toHaveBeenCalledWith({ exerciseId: 'ex-1', response: { text: 'hola' } });
  });

  it('shows an honest notice for exercise types with no answer content served yet', async () => {
    useLessonDetailMock.mockReturnValue({
      data: {
        ...baseLesson,
        activities: [
          {
            id: 'activity-1',
            lessonId: 'lesson-1',
            type: 'VOCABULARY_DRILL',
            title: 'Vocabulary',
            order: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            exercises: [
              {
                id: 'ex-2',
                activityId: 'activity-1',
                quizId: null,
                type: 'MULTIPLE_CHOICE',
                prompt: 'How do you say hello?',
                order: 1,
              },
            ],
            quizzes: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSubmitExerciseAttemptMock.mockReturnValue({
      mutate: vi.fn(),
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(await screen.findByText('How do you say hello?')).toBeInTheDocument();
    expect(screen.getByText(/isn't answerable here yet/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your answer')).not.toBeInTheDocument();
  });

  it('renders the real scored outcome once the mutation result comes back', async () => {
    useLessonDetailMock.mockReturnValue({
      data: {
        ...baseLesson,
        activities: [
          {
            id: 'activity-1',
            lessonId: 'lesson-1',
            type: 'VOCABULARY_DRILL',
            title: 'Vocabulary',
            order: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            exercises: [
              {
                id: 'ex-1',
                activityId: 'activity-1',
                quizId: null,
                type: 'TRANSLATION',
                prompt: 'Translate "hello"',
                order: 1,
              },
            ],
            quizzes: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useSubmitExerciseAttemptMock.mockReturnValue({
      mutate: vi.fn(),
      data: { id: 'attempt-1', isCorrect: true, score: 1 },
      isPending: false,
      isError: false,
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Correct!')).toBeInTheDocument();
  });
});
