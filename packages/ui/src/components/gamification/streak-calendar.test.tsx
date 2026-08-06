import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StreakCalendar } from './streak-calendar';

describe('StreakCalendar', () => {
  it('renders a real list, one item per day', () => {
    render(
      <StreakCalendar
        days={[
          { label: 'Mon', active: true },
          { label: 'Tue', active: false },
        ]}
      />,
    );

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('gives each day a full text alternative distinguishing practiced from not', () => {
    render(
      <StreakCalendar
        days={[
          { label: 'Mon', active: true },
          { label: 'Tue', active: false },
        ]}
      />,
    );

    expect(screen.getByText('Mon: practiced')).toBeInTheDocument();
    expect(screen.getByText('Tue: not practiced')).toBeInTheDocument();
  });
});
