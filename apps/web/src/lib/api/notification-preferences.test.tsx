import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import {
  fetchNotificationPreferences,
  updateNotificationPreference,
  useNotificationPreferences,
  useUpdateNotificationPreference,
} from './notification-preferences';

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

describe('fetchNotificationPreferences', () => {
  it('requests GET /v1/notification-preferences', async () => {
    const response = [{ channel: 'EMAIL' as const, type: 'MILESTONE' as const, optedIn: true }];
    requestMock.mockResolvedValueOnce(response);

    const result = await fetchNotificationPreferences();

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/notification-preferences');
  });
});

describe('useNotificationPreferences', () => {
  it('resolves the real preference list through React Query', async () => {
    const response = [{ channel: 'EMAIL' as const, type: 'MILESTONE' as const, optedIn: true }];
    requestMock.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useNotificationPreferences(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(response));
  });
});

describe('updateNotificationPreference', () => {
  it('sends PUT /v1/notification-preferences with the real body', async () => {
    const response = { channel: 'EMAIL' as const, type: 'MILESTONE' as const, optedIn: false };
    requestMock.mockResolvedValueOnce(response);

    const result = await updateNotificationPreference({
      channel: 'EMAIL',
      type: 'MILESTONE',
      optedIn: false,
    });

    expect(result).toBe(response);
    expect(requestMock).toHaveBeenCalledWith('/v1/notification-preferences', {
      method: 'PUT',
      body: { channel: 'EMAIL', type: 'MILESTONE', optedIn: false },
    });
  });
});

describe('useUpdateNotificationPreference', () => {
  it('resolves through React Query and invalidates the preference list', async () => {
    const response = { channel: 'EMAIL' as const, type: 'MILESTONE' as const, optedIn: false };
    requestMock.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useUpdateNotificationPreference(), { wrapper });
    act(() => {
      result.current.mutate({ channel: 'EMAIL', type: 'MILESTONE', optedIn: false });
    });

    await waitFor(() => expect(result.current.data).toEqual(response));
  });
});
