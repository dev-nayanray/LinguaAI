import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BadgeGrid } from './badge-grid';

describe('BadgeGrid', () => {
  it('renders as a real list, one item per badge', () => {
    render(
      <BadgeGrid
        items={[
          { id: '1', title: '7-day streak', unlocked: true },
          { id: '2', title: '30-day streak', unlocked: false },
        ]}
      />,
    );

    const list = screen.getByRole('list');
    const items = screen.getAllByRole('listitem');
    expect(list).toBeInTheDocument();
    expect(items).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '7-day streak' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '30-day streak' })).toBeInTheDocument();
  });

  it('passes unlocked/locked state through to each AchievementCard', () => {
    render(<BadgeGrid items={[{ id: '1', title: '30-day streak', unlocked: false }]} />);
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });
});
