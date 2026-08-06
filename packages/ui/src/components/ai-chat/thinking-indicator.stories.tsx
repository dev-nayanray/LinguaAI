import type { Meta, StoryObj } from '@storybook/react-vite';

import { ThinkingIndicator } from './thinking-indicator';

const meta = {
  title: 'AI Chat/ThinkingIndicator',
  component: ThinkingIndicator,
  tags: ['autodocs'],
} satisfies Meta<typeof ThinkingIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Thinking: Story = {
  args: { phase: 'thinking' },
};

// `typing` and `idle` intentionally render nothing (the streaming-token
// renderer owns the visible text once tokens arrive) — documented as
// stories anyway so that contract is visible in Storybook, not just in a
// code comment.
export const Typing: Story = {
  args: { phase: 'typing' },
};

export const Idle: Story = {
  args: { phase: 'idle' },
};
