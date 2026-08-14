import { useMutation, useQuery } from '@tanstack/react-query';
import type { BillingStatusResponse, CheckoutSessionResponse } from '@linguaai/validation/commerce';

import { authClient } from '@/lib/auth-client';

/** `GET /v1/billing/me` (E15 T1) — the caller's own current plan/subscription/entitlement. */
export function fetchBillingStatus(): Promise<BillingStatusResponse> {
  return authClient.request<BillingStatusResponse>('/v1/billing/me');
}

export function useBillingStatus() {
  return useQuery({
    queryKey: ['billing', 'status'],
    queryFn: fetchBillingStatus,
  });
}

/** `POST /v1/billing/checkout` (E15 T1) — creates a real Stripe Checkout Session, returns its hosted URL. */
export function createCheckoutSession(): Promise<CheckoutSessionResponse> {
  return authClient.request<CheckoutSessionResponse>('/v1/billing/checkout', { method: 'POST' });
}

export function useCreateCheckoutSession() {
  return useMutation({ mutationFn: createCheckoutSession });
}
