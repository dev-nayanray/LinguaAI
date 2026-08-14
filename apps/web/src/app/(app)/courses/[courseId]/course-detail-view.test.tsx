import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CourseDetailView } from './course-detail-view';

const useCourseDetailMock = vi.fn();

vi.mock('@/lib/api/courses', () => ({
  useCourseDetail: (courseId: string) => useCourseDetailMock(courseId),
}));

function renderPage(courseId = 'course-1') {
  return render(<CourseDetailView courseId={courseId} />);
}

describe('CourseDetailPage', () => {
  it('renders the real title, levels, units, and lesson links', async () => {
    useCourseDetailMock.mockReturnValue({
      data: {
        id: 'course-1',
        languageId: 'lang-1',
        title: 'Spanish for Travel',
        description: 'Learn the basics',
        slug: 'spanish-for-travel',
        publishedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        levels: [
          {
            id: 'level-1',
            courseId: 'course-1',
            cefrLevel: 'A1',
            title: 'Beginner',
            description: null,
            order: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            units: [
              {
                id: 'unit-1',
                levelId: 'level-1',
                title: 'Greetings',
                description: null,
                order: 1,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                lessons: [
                  {
                    id: 'lesson-1',
                    unitId: 'unit-1',
                    title: 'Saying hello',
                    description: null,
                    order: 1,
                    estimatedMinutes: 5,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                  },
                ],
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(await screen.findByText('Spanish for Travel')).toBeInTheDocument();
    expect(screen.getByText('Beginner')).toBeInTheDocument();
    expect(screen.getByText('Greetings')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Saying hello/ })).toHaveAttribute(
      'href',
      '/lessons/lesson-1',
    );
  });

  it('shows a real error state with a working retry action', async () => {
    const refetch = vi.fn();
    useCourseDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    const user = userEvent.setup();

    renderPage();

    expect(screen.getByText('Could not load this course.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
