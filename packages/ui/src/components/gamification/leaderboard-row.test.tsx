import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LeaderboardRow } from './leaderboard-row';

describe('LeaderboardRow', () => {
  it('renders as a list item with rank, name, and formatted score', () => {
    render(
      <ul>
        <LeaderboardRow rank={1} name="Ada Lovelace" score={12500} />
      </ul>,
    );

    const row = screen.getByRole('listitem');
    expect(row).toHaveTextContent('1');
    expect(row).toHaveTextContent('Ada Lovelace');
    expect(row).toHaveTextContent('12,500');
  });

  it('marks the current user row with aria-current, not color alone', () => {
    render(
      <ul>
        <LeaderboardRow rank={3} name="You" score={800} isCurrentUser />
      </ul>,
    );
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-current', 'true');
  });

  it('does not set aria-current for other users', () => {
    render(
      <ul>
        <LeaderboardRow rank={2} name="Someone Else" score={900} />
      </ul>,
    );
    expect(screen.getByRole('listitem')).not.toHaveAttribute('aria-current');
  });
});
