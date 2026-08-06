import type { Meta, StoryObj } from '@storybook/react-vite';

import { StreakCalendar } from './streak-calendar';

const meta = {
  title: 'Gamification/StreakCalendar',
  component: StreakCalendar,
  tags: ['autodocs'],
} satisfies Meta<typeof StreakCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    days: [
      { label: 'Mon', active: true },
      { label: 'Tue', active: true },
      { label: 'Wed', active: true },
      { label: 'Thu', active: false },
      { label: 'Fri', active: false },
      { label: 'Sat', active: false },
      { label: 'Sun', active: false },
    ],
  },
};
