import type { Meta, StoryObj } from '@storybook/react-vite';

import { MessageBubble } from './message-bubble';

const meta = {
  title: 'AI Chat/MessageBubble',
  component: MessageBubble,
  tags: ['autodocs'],
} satisfies Meta<typeof MessageBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const User: Story = {
  args: { role: 'user', children: 'How do I say "good morning" in Spanish?' },
};

export const Ai: Story = {
  args: { role: 'ai', children: '"Good morning" in Spanish is "buenos días".' },
};

export const AiError: Story = {
  args: {
    role: 'ai',
    error: { message: 'Failed to get a response. Try again?', onRetry: () => {} },
  },
};
