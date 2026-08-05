import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PasswordResetConfirmPage from './page';

const pushMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const confirmPasswordResetMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    confirmPasswordReset: (...args: unknown[]) => confirmPasswordResetMock(...args),
  },
}));

describe('PasswordResetConfirmPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  it('shows a clear error instead of a form when the link has no token', () => {
    render(<PasswordResetConfirmPage />);

    expect(screen.getByRole('alert')).toHaveTextContent('missing its reset token');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('submits the token + new password and redirects to /login on success', async () => {
    searchParams = new URLSearchParams('token=raw-token-abc');
    confirmPasswordResetMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<PasswordResetConfirmPage />);

    await user.type(screen.getByLabelText('New password'), 'new password 12+');
    await user.type(screen.getByLabelText('Confirm new password'), 'new password 12+');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login?reset=1'));
    expect(confirmPasswordResetMock).toHaveBeenCalledWith({
      token: 'raw-token-abc',
      newPassword: 'new password 12+',
    });
  });

  it('shows an inline error when the two password fields do not match, without calling the API', async () => {
    searchParams = new URLSearchParams('token=raw-token-abc');
    const user = userEvent.setup();
    render(<PasswordResetConfirmPage />);

    await user.type(screen.getByLabelText('New password'), 'new password 12+');
    await user.type(screen.getByLabelText('Confirm new password'), 'different password');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(confirmPasswordResetMock).not.toHaveBeenCalled();
  });

  it('shows the server error for an invalid/expired token', async () => {
    searchParams = new URLSearchParams('token=stale-token');
    const { ApiError } = await import('@linguaai/auth-client');
    confirmPasswordResetMock.mockRejectedValue(
      new ApiError(401, {
        error: { code: 'AUTH_REQUIRED', message: 'Invalid or expired reset token' },
      }),
    );
    const user = userEvent.setup();
    render(<PasswordResetConfirmPage />);

    await user.type(screen.getByLabelText('New password'), 'new password 12+');
    await user.type(screen.getByLabelText('Confirm new password'), 'new password 12+');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired reset token');
    expect(pushMock).not.toHaveBeenCalled();
  });
});
