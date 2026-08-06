import type { Meta, StoryObj } from '@storybook/react-vite';

import { LeaderboardRow } from './leaderboard-row';

const meta = {
  title: 'Gamification/LeaderboardRow',
  component: LeaderboardRow,
  tags: ['autodocs'],
} satisfies Meta<typeof LeaderboardRow>;

export default meta;
type Story = StoryObj<typeof meta>;

// Renders as <li> (E3 §12.5: "list semantics") — every story wraps it in a
// real <ol> itself, both for valid markup and because axe's own
// `listitem` rule requires a list-item to have a list ancestor.
export const Default: Story = {
  args: { rank: 2, name: 'Ada Lovelace', score: 12500 },
  render: (args) => (
    <ol>
      <LeaderboardRow {...args} />
    </ol>
  ),
};

export const CurrentUser: Story = {
  args: { rank: 5, name: 'You', score: 800, isCurrentUser: true },
  render: (args) => (
    <ol>
      <LeaderboardRow {...args} />
    </ol>
  ),
};

export const FullBoard: Story = {
  args: { rank: 1, name: 'Ada Lovelace', score: 12500 },
  render: () => (
    <ol>
      <LeaderboardRow rank={1} name="Ada Lovelace" score={12500} />
      <LeaderboardRow rank={2} name="Grace Hopper" score={11800} />
      <LeaderboardRow rank={3} name="You" score={9200} isCurrentUser />
      <LeaderboardRow rank={4} name="Alan Turing" score={7400} />
    </ol>
  ),
};
