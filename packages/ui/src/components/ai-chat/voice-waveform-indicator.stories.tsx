import type { Meta, StoryObj } from '@storybook/react-vite';

import { VoiceWaveformIndicator } from './voice-waveform-indicator';

const meta = {
  title: 'AI Chat/VoiceWaveformIndicator',
  component: VoiceWaveformIndicator,
  tags: ['autodocs'],
} satisfies Meta<typeof VoiceWaveformIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { state: 'idle' },
};

export const Recording: Story = {
  args: { state: 'recording' },
};
