import type { Meta, StoryObj } from '@storybook/react-vite';

import { StreakFlame } from './streak-flame';

const meta = {
  title: 'Progress/StreakFlame',
  component: StreakFlame,
  tags: ['autodocs'],
} satisfies Meta<typeof StreakFlame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: { days: 14, active: true },
};

export const AtRisk: Story = {
  args: { days: 14, active: false },
};

export const SingleDay: Story = {
  args: { days: 1 },
};
