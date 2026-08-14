import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BillingPage from './page';

const useBillingStatusMock = vi.fn();
const useCreateCheckoutSessionMock = vi.fn();

vi.mock('@/lib/api/billing', () => ({
  useBillingStatus: () => useBillingStatusMock(),
  useCreateCheckoutSession: () => useCreateCheckoutSessionMock(),
}));

describe('BillingPage', () => {
  it('shows the Free plan and a real upgrade CTA', () => {
    useBillingStatusMock.mockReturnValue({
      data: {
        planTier: 'FREE',
        subscriptionStatus: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
        limits: {},
        usage: {},
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useCreateCheckoutSessionMock.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<BillingPage />);

    expect(screen.getByText('FREE plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade to Premium' })).toBeInTheDocument();
  });

  it('shows the Premium plan with no upgrade CTA', () => {
    useBillingStatusMock.mockReturnValue({
      data: {
        planTier: 'PREMIUM',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        trialEndsAt: null,
        limits: {},
        usage: {},
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useCreateCheckoutSessionMock.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<BillingPage />);

    expect(screen.getByText('PREMIUM plan')).toBeInTheDocument();
    expect(screen.getByText('Status: ACTIVE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upgrade to Premium' })).not.toBeInTheDocument();
  });

  it('clicking upgrade calls the real checkout mutation', async () => {
    useBillingStatusMock.mockReturnValue({
      data: {
        planTier: 'FREE',
        subscriptionStatus: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
        limits: {},
        usage: {},
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const mutate = vi.fn();
    useCreateCheckoutSessionMock.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    render(<BillingPage />);
    await user.click(screen.getByRole('button', { name: 'Upgrade to Premium' }));

    expect(mutate).toHaveBeenCalledWith(undefined, expect.any(Object));
  });

  it('shows a real error state with a working retry action', () => {
    const refetch = vi.fn();
    useBillingStatusMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    useCreateCheckoutSessionMock.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<BillingPage />);

    expect(screen.getByText('Could not load your billing status.')).toBeInTheDocument();
  });
});
