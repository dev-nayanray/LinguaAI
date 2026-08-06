import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PaywallModal, type PaywallModalProps } from './paywall-modal';

function Demo(overrides: Partial<PaywallModalProps> = {}) {
  const [open, setOpen] = useState(true);
  return (
    <PaywallModal
      open={open}
      onOpenChange={setOpen}
      title="Unlock Premium"
      description="Get unlimited lessons and offline access."
      onUpgrade={() => {}}
      {...overrides}
    />
  );
}

describe('PaywallModal', () => {
  it('renders title and description when open', () => {
    render(<Demo />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Unlock Premium')).toBeInTheDocument();
    expect(screen.getByText('Get unlimited lessons and offline access.')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<Demo open={false} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders the feature list', () => {
    render(<Demo features={['Unlimited lessons', 'Offline mode']} />);
    expect(screen.getByText('Unlimited lessons')).toBeInTheDocument();
    expect(screen.getByText('Offline mode')).toBeInTheDocument();
  });

  it('renders the price when provided', () => {
    render(<Demo price="$9.99/mo" />);
    expect(screen.getByText('$9.99/mo')).toBeInTheDocument();
  });

  it('calls onUpgrade when the CTA is clicked', async () => {
    const user = userEvent.setup();
    const onUpgrade = vi.fn();
    render(<Demo onUpgrade={onUpgrade} />);

    await user.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('uses custom CTA and dismiss labels', () => {
    render(<Demo ctaLabel="Go Pro" dismissLabel="Maybe later" />);
    expect(screen.getByRole('button', { name: 'Go Pro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maybe later' })).toBeInTheDocument();
  });

  it('shows the error message', () => {
    render(<Demo error="Payment declined." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Payment declined.');
  });

  it('marks the CTA busy while loading, without unmounting the dialog', () => {
    render(<Demo loading />);
    expect(screen.getByRole('button', { name: 'Upgrade' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('closes and calls onOpenChange(false) when dismissed', async () => {
    const user = userEvent.setup();
    render(<Demo />);

    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
