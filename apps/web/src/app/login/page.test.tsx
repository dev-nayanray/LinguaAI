import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@linguaai/auth-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LoginPage from './page';

const pushMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const loginMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    login: (...args: unknown[]) => loginMock(...args),
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

describe('LoginPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clear();
    searchParams = new URLSearchParams();
  });

  it('logs in and redirects to /profile on an AUTHENTICATED response', async () => {
    loginMock.mockResolvedValue({
      status: 'AUTHENTICATED',
      accessToken: 'tok-1',
      user: publicUser,
    });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), publicUser.email);
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/profile'));
    expect(useSessionStore.getState().accessToken).toBe('tok-1');
  });

  it('shows a success banner when ?registered=1 is present', () => {
    searchParams = new URLSearchParams('registered=1');
    render(<LoginPage />);

    expect(screen.getByText(/Account created/)).toBeInTheDocument();
  });

  it('shows an inline error on invalid credentials', async () => {
    const { ApiError } = await import('@linguaai/auth-client');
    loginMock.mockRejectedValue(
      new ApiError(401, { error: { code: 'AUTH_REQUIRED', message: 'Invalid email or password' } }),
    );
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), publicUser.email);
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows a clear message (not a crash) for the MFA_REQUIRED branch, which this app does not support', async () => {
    loginMock.mockResolvedValue({ status: 'MFA_REQUIRED', challengeToken: 'chal-1' });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), publicUser.email);
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('MFA step-up');
    expect(pushMock).not.toHaveBeenCalled();
  });
});
