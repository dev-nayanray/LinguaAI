import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PasswordResetRequestPage from './page';

const requestPasswordResetMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    requestPasswordReset: (...args: unknown[]) => requestPasswordResetMock(...args),
  },
}));

describe('PasswordResetRequestPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the same enumeration-resistant success message for EMAIL_SENT', async () => {
    requestPasswordResetMock.mockResolvedValue({ status: 'EMAIL_SENT' });
    const user = userEvent.setup();
    render(<PasswordResetRequestPage />);

    await user.type(screen.getByLabelText('Email'), 'anyone@test.local');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText(/reset link is on its way/)).toBeInTheDocument();
  });

  it('shows the provider-specific message for an OAUTH_ACCOUNT response', async () => {
    requestPasswordResetMock.mockResolvedValue({ status: 'OAUTH_ACCOUNT', providers: ['GOOGLE'] });
    const user = userEvent.setup();
    render(<PasswordResetRequestPage />);

    await user.type(screen.getByLabelText('Email'), 'oauth@test.local');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText(/GOOGLE/)).toBeInTheDocument();
  });

  it('shows an inline error when the request itself fails (e.g. rate limited)', async () => {
    const { ApiError } = await import('@linguaai/auth-client');
    requestPasswordResetMock.mockRejectedValue(
      new ApiError(429, {
        error: { code: 'RATE_LIMITED', message: 'Too many requests — try again later' },
      }),
    );
    const user = userEvent.setup();
    render(<PasswordResetRequestPage />);

    await user.type(screen.getByLabelText('Email'), 'anyone@test.local');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
  });
});
