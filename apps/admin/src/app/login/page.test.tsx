import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@linguaai/auth-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AdminLoginPage from './page';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

const loginMock = vi.fn();
const mfaChallengeMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    login: (...args: unknown[]) => loginMock(...args),
    mfaChallenge: (...args: unknown[]) => mfaChallengeMock(...args),
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

describe('AdminLoginPage — ADR-011 two-step login', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clear();
  });

  it('an AUTHENTICATED response (non-MFA-enrolled admin) skips the code step and redirects to /dashboard', async () => {
    loginMock.mockResolvedValue({
      status: 'AUTHENTICATED',
      accessToken: 'tok-1',
      user: { ...adminUser, mfaEnrolled: false },
    });
    const user = userEvent.setup();
    render(<AdminLoginPage />);

    await user.type(screen.getByLabelText('Email'), 'admin@test.local');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
    expect(useSessionStore.getState().accessToken).toBe('tok-1');
  });

  it('an MFA_REQUIRED response shows the code step instead of redirecting, then completes on a valid code', async () => {
    loginMock.mockResolvedValue({ status: 'MFA_REQUIRED', challengeToken: 'chal-1' });
    mfaChallengeMock.mockResolvedValue({
      status: 'AUTHENTICATED',
      accessToken: 'tok-2',
      user: adminUser,
    });
    const user = userEvent.setup();
    render(<AdminLoginPage />);

    await user.type(screen.getByLabelText('Email'), 'admin@test.local');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByLabelText('6-digit code')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
    expect(mfaChallengeMock).toHaveBeenCalledWith({ challengeToken: 'chal-1', code: '123456' });
    expect(useSessionStore.getState().accessToken).toBe('tok-2');
  });

  it('shows an inline error and stays on the password step when credentials are wrong', async () => {
    const { ApiError } = await import('@linguaai/auth-client');
    loginMock.mockRejectedValue(
      new ApiError(401, { error: { code: 'AUTH_REQUIRED', message: 'Invalid email or password' } }),
    );
    const user = userEvent.setup();
    render(<AdminLoginPage />);

    await user.type(screen.getByLabelText('Email'), 'admin@test.local');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows an inline error and stays on the code step when the TOTP code is wrong', async () => {
    loginMock.mockResolvedValue({ status: 'MFA_REQUIRED', challengeToken: 'chal-1' });
    const { ApiError } = await import('@linguaai/auth-client');
    mfaChallengeMock.mockRejectedValue(
      new ApiError(401, { error: { code: 'AUTH_REQUIRED', message: 'Invalid verification code' } }),
    );
    const user = userEvent.setup();
    render(<AdminLoginPage />);

    await user.type(screen.getByLabelText('Email'), 'admin@test.local');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('6-digit code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid verification code');
    expect(pushMock).not.toHaveBeenCalled();
  });
});
