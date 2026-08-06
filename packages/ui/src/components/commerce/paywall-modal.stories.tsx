import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button';
import { PaywallModal } from './paywall-modal';

function Demo({ loading = false, error }: { loading?: boolean; error?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Unlock Premium</Button>
      <PaywallModal
        open={open}
        onOpenChange={setOpen}
        title="Unlock Premium"
        description="Get unlimited lessons, offline access, and no ads."
        features={['Unlimited lessons', 'Offline mode', 'No ads']}
        price="$9.99/mo"
        onUpgrade={() => {}}
        loading={loading}
        error={error}
      />
    </div>
  );
}

const meta = {
  title: 'Commerce/PaywallModal',
  component: Demo,
  tags: ['autodocs'],
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Demo />,
};

export const Loading: Story = {
  render: () => <Demo loading />,
};

export const WithError: Story = {
  render: () => <Demo error="Payment declined. Please try another card." />,
};

/**
 * Required T13 evidence (E3 §20's task table): "Interaction test (modal
 * focus-trap/restoration)". Radix `AlertDialog` renders its content into a
 * `document.body` portal, outside `canvasElement` — portal content is
 * queried via global `within(document.body)`, per this codebase's
 * established pattern (see xp-toast.stories.tsx's `Triggered` story).
 */
export const FocusTrapAndRestoration: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Unlock Premium' });

    await userEvent.click(trigger);

    const body = within(document.body);
    const dialog = await body.findByRole('alertdialog', { name: 'Unlock Premium' });
    expect(dialog).toBeInTheDocument();

    // Focus-trap: opening the dialog moves focus inside it, off the trigger.
    expect(trigger).not.toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await userEvent.click(body.getByRole('button', { name: 'Not now' }));

    // Focus-restoration: dismissing returns focus to the element that opened it.
    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  },
};
