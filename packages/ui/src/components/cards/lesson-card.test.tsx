import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LessonCard } from './lesson-card';

describe('LessonCard', () => {
  it('renders the title, description, and a status badge distinct per status', () => {
    render(
      <LessonCard
        title="Greetings"
        description="Say hello and introduce yourself"
        status="completed"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Greetings' })).toBeInTheDocument();
    expect(screen.getByText('Say hello and introduce yourself')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it.each([
    ['not-started', 'Not started'],
    ['in-progress', 'In progress'],
    ['completed', 'Completed'],
  ] as const)('renders the %s status as "%s"', (status, label) => {
    render(<LessonCard title="Greetings" status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders the footer slot only when provided', () => {
    const { rerender } = render(
      <LessonCard title="Greetings" status="not-started" footer={<button>Start</button>} />,
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();

    rerender(<LessonCard title="Greetings" status="not-started" />);
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });

  it('renders a loading skeleton instead of the title when loading', () => {
    render(<LessonCard title="Greetings" status="not-started" loading />);
    expect(screen.queryByRole('heading', { name: 'Greetings' })).not.toBeInTheDocument();
  });
});
