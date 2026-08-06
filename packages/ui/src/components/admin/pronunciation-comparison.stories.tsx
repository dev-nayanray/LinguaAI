import type { Meta, StoryObj } from '@storybook/react-vite';

import { PronunciationComparison } from './pronunciation-comparison';

const meta = {
  title: 'Admin/PronunciationComparison',
  component: PronunciationComparison,
  tags: ['autodocs'],
} satisfies Meta<typeof PronunciationComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextOnly: Story = {
  args: {
    overallScore: 0.72,
    segments: [
      { text: 'Hola', score: 0.95 },
      { text: 'como', score: 0.6 },
      { text: 'estas', score: 0.2 },
    ],
  },
};

export const WithWaveform: Story = {
  args: {
    overallScore: 0.85,
    segments: [
      { text: 'Bonjour', score: 0.9 },
      { text: 'monde', score: 0.8 },
    ],
    referenceWaveform: [0.2, 0.5, 0.8, 0.6, 0.3, 0.7, 0.4],
    attemptWaveform: [0.3, 0.4, 0.7, 0.5, 0.35, 0.6, 0.3],
  },
};

export const AllIncorrect: Story = {
  args: {
    overallScore: 0.1,
    segments: [
      { text: 'こんにちは', score: 0.15 },
      { text: '世界', score: 0.05 },
    ],
  },
};
