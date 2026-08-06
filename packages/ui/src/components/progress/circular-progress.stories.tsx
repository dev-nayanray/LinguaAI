import type { Meta, StoryObj } from '@storybook/react-vite';

import { CircularProgress } from './circular-progress';

const meta = {
  title: 'Progress/CircularProgress',
  component: CircularProgress,
  tags: ['autodocs'],
} satisfies Meta<typeof CircularProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: 72, label: 'Spanish mastery' },
};

export const Empty: Story = {
  args: { value: 0, label: 'Spanish mastery' },
};

export const Complete: Story = {
  args: { value: 100, label: 'Spanish mastery' },
};

export const Large: Story = {
  args: { value: 45, label: 'Spanish mastery', size: 96, strokeWidth: 8 },
};
