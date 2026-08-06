import type { Meta, StoryObj } from '@storybook/react-vite';

import { VoiceSessionIndicator } from './voice-session-indicator';

const meta = {
  title: 'AI Chat/VoiceSessionIndicator',
  component: VoiceSessionIndicator,
  tags: ['autodocs'],
  argTypes: {
    state: { control: 'select', options: ['idle', 'listening', 'processing', 'speaking', 'error'] },
  },
} satisfies Meta<typeof VoiceSessionIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { state: 'idle' },
};

export const Listening: Story = {
  args: { state: 'listening' },
};

export const Processing: Story = {
  args: { state: 'processing' },
};

export const Speaking: Story = {
  args: { state: 'speaking' },
};

export const ErrorState: Story = {
  args: { state: 'error', errorMessage: 'Microphone access denied' },
};
