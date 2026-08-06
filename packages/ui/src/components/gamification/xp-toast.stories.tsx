import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button';
import { Toaster } from '../ui/toaster';
import { celebrateXp, XpToastContent } from './xp-toast';

const meta = {
  title: 'Gamification/XpToast',
  component: XpToastContent,
  tags: ['autodocs'],
} satisfies Meta<typeof XpToastContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The toast content in isolation, statically rendered — not through
 * sonner's portal — so its default/steady-state visual is inspectable
 * directly in the Storybook canvas.
 */
export const Content: Story = {
  args: { xp: 50, message: 'Lesson complete!' },
};

function CelebrateDemo() {
  return (
    <div>
      <Toaster />
      <Button
        variant="primary"
        onClick={() => celebrateXp({ xp: 50, message: 'Lesson complete!' })}
      >
        Complete lesson
      </Button>
    </div>
  );
}

// Exercises the real, imperative path: `celebrateXp()` dispatching through
// a mounted `Toaster`, the same as a real app would.
export const Triggered: StoryObj<typeof CelebrateDemo> = {
  render: () => <CelebrateDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Complete lesson' }));
    expect(await within(document.body).findByText('+50 XP')).toBeInTheDocument();
  },
};
