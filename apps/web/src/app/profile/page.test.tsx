import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@linguaai/auth-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ProfilePage from './page';

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

const publicUser = {
  id: 'u-1',
  email: 'user@test.local',
  displayName: 'Test User',
  avatarUrl: null,
  locale: 'en-US',
  timezone: 'UTC',
  role: 'USER' as const,
  status: 'ACTIVE' as const,
  mfaEnrolled: false,
  organizationId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProfilePage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clear();
  });

  it('renders the already-in-store user without calling bootstrapSession again', async () => {
    useSessionStore.getState().setSession('tok-1', publicUser);
    render(<ProfilePage />);

    expect(await screen.findByText(publicUser.email)).toBeInTheDocument();
    expect(bootstrapSessionMock).not.toHaveBeenCalled();
    expect(screen.getByText('Enroll in MFA')).toBeInTheDocument();
  });

  it('re-establishes the session from the refresh cookie when the store starts empty', async () => {
    bootstrapSessionMock.mockImplementation(async () => {
      useSessionStore.getState().setSession('tok-bootstrapped', publicUser);
      return publicUser;
    });
    render(<ProfilePage />);

    expect(await screen.findByText(publicUser.email)).toBeInTheDocument();
    expect(bootstrapSessionMock).toHaveBeenCalledTimes(1);
  });

  it('redirects to /login when there is no valid refresh cookie either', async () => {
    bootstrapSessionMock.mockResolvedValue(null);
    render(<ProfilePage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });

  it('does not offer the MFA enrollment link for an already-enrolled user', async () => {
    useSessionStore.getState().setSession('tok-1', { ...publicUser, mfaEnrolled: true });
    render(<ProfilePage />);

    await screen.findByText(publicUser.email);
    expect(screen.queryByText('Enroll in MFA')).not.toBeInTheDocument();
  });

  it('logging out clears the session and redirects to /login', async () => {
    useSessionStore.getState().setSession('tok-1', publicUser);
    logoutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(useSessionStore.getState().accessToken).toBeNull();
  });
});
