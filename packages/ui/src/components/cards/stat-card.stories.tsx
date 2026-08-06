import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatCard } from './stat-card';

const meta = {
  title: 'Cards/StatCard',
  component: StatCard,
  tags: ['autodocs'],
} satisfies Meta<typeof StatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'XP this week', value: 1250 },
};

export const WithTrendUp: Story = {
  args: {
    label: 'Streak',
    value: '14 days',
    trend: { direction: 'up', label: '+3 vs last week' },
  },
};

export const WithTrendDown: Story = {
  args: {
    label: 'Errors per lesson',
    value: 1.2,
    trend: { direction: 'down', label: '-0.4 vs last week' },
  },
};

export const WithIcon: Story = {
  args: {
    label: 'Lessons completed',
    value: 42,
    icon: <span aria-hidden="true">🔥</span>,
  },
};

export const Loading: Story = {
  args: { label: 'XP this week', value: 1250, loading: true },
};
