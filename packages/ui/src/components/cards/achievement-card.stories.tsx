import type { Meta, StoryObj } from '@storybook/react-vite';

import { AchievementCard } from './achievement-card';

const meta = {
  title: 'Cards/AchievementCard',
  component: AchievementCard,
  tags: ['autodocs'],
} satisfies Meta<typeof AchievementCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unlocked: Story = {
  args: {
    title: '7-day streak',
    description: 'Practice 7 days in a row',
    icon: <span aria-hidden="true">🔥</span>,
  },
};

export const Locked: Story = {
  args: {
    title: '30-day streak',
    description: 'Practice 30 days in a row',
    icon: <span aria-hidden="true">🔥</span>,
    unlocked: false,
  },
};

export const Loading: Story = {
  args: { title: '7-day streak', loading: true },
};
