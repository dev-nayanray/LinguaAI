import type { Meta, StoryObj } from '@storybook/react-vite';

import { MissionCard } from './mission-card';

const meta = {
  title: 'Gamification/MissionCard',
  component: MissionCard,
  tags: ['autodocs'],
} satisfies Meta<typeof MissionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {
  args: {
    title: 'Complete 5 lessons',
    description: 'Finish any 5 lessons this week',
    current: 3,
    target: 5,
    reward: '+50 XP',
  },
};

export const Completed: Story = {
  args: {
    title: 'Complete 5 lessons',
    description: 'Finish any 5 lessons this week',
    current: 5,
    target: 5,
    reward: '+50 XP',
  },
};

export const NoReward: Story = {
  args: { title: 'Practice today', current: 0, target: 1 },
};
