import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@linguaai/auth-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AdminDashboardPage from './page';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}));

const bootstrapSessionMock = vi.fn();
const logoutMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    bootstrapSession: (...args: unknown[]) => bootstrapSessionMock(...args),
    logout: (...args: unknown[]) => logoutMock(...args),
  },
}));

const adminUser = {
  id: 'u-1',
  email: 'admin@test.local',
  displayName: 'Admin',
  avatarUrl: null,
  locale: 'en-US',
  timezone: 'UTC',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
  mfaEnrolled: true,
  organizationId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AdminDashboardPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clear();
  });

  it('renders the already-in-store user without calling bootstrapSession again', async () => {
    useSessionStore.getState().setSession('tok-1', adminUser);
    render(<AdminDashboardPage />);

    expect(await screen.findByText(/admin@test\.local/)).toBeInTheDocument();
    expect(bootstrapSessionMock).not.toHaveBeenCalled();
  });

  it('re-establishes the session from the refresh cookie when the store starts empty', async () => {
    // The real bootstrapSession (client.ts) populates the store itself as
    // a side effect — this mock does the same, matching that contract,
    // rather than only returning a value the page would have to persist
    // redundantly on top of it.
    bootstrapSessionMock.mockImplementation(async () => {
      useSessionStore.getState().setSession('tok-bootstrapped', adminUser);
      return adminUser;
    });
    render(<AdminDashboardPage />);

    expect(await screen.findByText(/admin@test\.local/)).toBeInTheDocument();
    expect(bootstrapSessionMock).toHaveBeenCalledTimes(1);
  });

  it('redirects to /login when there is no valid refresh cookie either', async () => {
    bootstrapSessionMock.mockResolvedValue(null);
    render(<AdminDashboardPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });

  it('logging out clears the session and redirects to /login', async () => {
    useSessionStore.getState().setSession('tok-1', adminUser);
    logoutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AdminDashboardPage />);

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(useSessionStore.getState().accessToken).toBeNull();
  });
});
