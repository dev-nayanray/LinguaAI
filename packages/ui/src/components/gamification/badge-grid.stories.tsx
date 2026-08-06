import type { Meta, StoryObj } from '@storybook/react-vite';

import { BadgeGrid } from './badge-grid';

const meta = {
  title: 'Gamification/BadgeGrid',
  component: BadgeGrid,
  tags: ['autodocs'],
} satisfies Meta<typeof BadgeGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      { id: '1', title: '7-day streak', description: 'Practice 7 days in a row', unlocked: true },
      {
        id: '2',
        title: '30-day streak',
        description: 'Practice 30 days in a row',
        unlocked: false,
      },
      { id: '3', title: 'First lesson', description: 'Complete your first lesson', unlocked: true },
      { id: '4', title: 'Perfect score', description: 'Get 100% on a quiz', unlocked: false },
    ],
  },
};
