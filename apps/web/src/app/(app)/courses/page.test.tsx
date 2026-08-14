import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import CoursesPage from './page';

const useCoursesMock = vi.fn();

vi.mock('@/lib/api/courses', () => ({
  useCourses: () => useCoursesMock(),
}));

describe('CoursesPage', () => {
  it('renders real course titles once the list loads', () => {
    useCoursesMock.mockReturnValue({
      data: {
        data: [
          {
            id: 'course-1',
            languageId: 'lang-1',
            title: 'Spanish for Travel',
            description: 'Learn the basics',
            slug: 'spanish-for-travel',
            publishedAt: '2026-01-01T00:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<CoursesPage />);

    expect(screen.getByText('Spanish for Travel')).toBeInTheDocument();
    expect(screen.getByText('Learn the basics')).toBeInTheDocument();
  });

  it('shows a real empty state when no courses are published', () => {
    useCoursesMock.mockReturnValue({
      data: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<CoursesPage />);

    expect(screen.getByText('No courses are published yet.')).toBeInTheDocument();
  });

  it('shows a real error state with a working retry action', async () => {
    const refetch = vi.fn();
    useCoursesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    const user = userEvent.setup();

    render(<CoursesPage />);

    expect(screen.getByText('Could not load courses.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows loading skeletons while the catalog is in flight', () => {
    useCoursesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    const { container } = render(<CoursesPage />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
