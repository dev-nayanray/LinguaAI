import type { Meta, StoryObj } from '@storybook/react-vite';

import { ProgressBar } from './progress-bar';

const meta = {
  title: 'Progress/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs'],
} satisfies Meta<typeof ProgressBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: 6, max: 10, label: 'Lesson progress' },
};

export const WithValueText: Story = {
  args: { value: 6, max: 10, label: 'Lesson progress', showValueText: true },
};

export const Empty: Story = {
  args: { value: 0, max: 10, label: 'Lesson progress' },
};

export const Complete: Story = {
  args: { value: 10, max: 10, label: 'Lesson progress' },
};
