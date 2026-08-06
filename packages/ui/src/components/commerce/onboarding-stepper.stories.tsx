import type { Meta, StoryObj } from '@storybook/react-vite';

import { OnboardingStepper } from './onboarding-stepper';

const STEPS = [
  { id: 'profile', label: 'Profile' },
  { id: 'goals', label: 'Goals' },
  { id: 'level', label: 'Level' },
  { id: 'review', label: 'Review' },
];

const meta = {
  title: 'Commerce/OnboardingStepper',
  component: OnboardingStepper,
  tags: ['autodocs'],
} satisfies Meta<typeof OnboardingStepper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstStep: Story = {
  args: { steps: STEPS, currentStep: 0 },
};

export const MiddleStep: Story = {
  args: { steps: STEPS, currentStep: 2 },
};

export const LastStep: Story = {
  args: { steps: STEPS, currentStep: 3 },
};
