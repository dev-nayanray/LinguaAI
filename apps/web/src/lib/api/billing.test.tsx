import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import {
  createCheckoutSession,
  fetchBillingStatus,
  useBillingStatus,
  useCreateCheckoutSession,
} from './billing';

const requestMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('fetchBillingStatus', () => {
  it('requests GET /v1/billing/me', async () => {
    const response = {
      planTier: 'FREE' as const,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      limits: {},
      usage: {},
    };
    requestMock.mockResolvedValueOnce(response);

    const result = await fetchBillingStatus();

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/billing/me');
  });
});

describe('useBillingStatus', () => {
  it('resolves the real status through React Query', async () => {
    const response = {
      planTier: 'FREE' as const,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      trialEndsAt: null,
      limits: {},
      usage: {},
    };
    requestMock.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useBillingStatus(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(response));
  });
});

describe('createCheckoutSession', () => {
  it('posts to POST /v1/billing/checkout and returns the real checkout URL', async () => {
    const response = { checkoutUrl: 'https://checkout.stripe.com/session-1' };
    requestMock.mockResolvedValueOnce(response);

    const result = await createCheckoutSession();

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/billing/checkout', { method: 'POST' });
  });
});

describe('useCreateCheckoutSession', () => {
  it('resolves the real checkout URL through React Query', async () => {
    const response = { checkoutUrl: 'https://checkout.stripe.com/session-1' };
    requestMock.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useCreateCheckoutSession(), { wrapper });
    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.data).toEqual(response));
  });
});
