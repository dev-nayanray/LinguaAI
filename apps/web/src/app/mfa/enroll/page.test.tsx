import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@linguaai/auth-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MfaEnrollPage from './page';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}));

const bootstrapSessionMock = vi.fn();
const mfaEnrollMock = vi.fn();
const mfaVerifyMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    bootstrapSession: (...args: unknown[]) => bootstrapSessionMock(...args),
    mfaEnroll: (...args: unknown[]) => mfaEnrollMock(...args),
    mfaVerify: (...args: unknown[]) => mfaVerifyMock(...args),
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

describe('MfaEnrollPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clear();
  });

  it('redirects to /login when there is no session at all', async () => {
    bootstrapSessionMock.mockResolvedValue(null);
    render(<MfaEnrollPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });

  it('walks the full begin → verify → done flow for an already-authenticated user', async () => {
    useSessionStore.getState().setSession('tok-1', publicUser);
    mfaEnrollMock.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x' });
    mfaVerifyMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MfaEnrollPage />);

    await user.click(await screen.findByRole('button', { name: 'Begin enrollment' }));

    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();

    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('MFA enrollment complete.')).toBeInTheDocument();
    expect(mfaVerifyMock).toHaveBeenCalledWith({ secret: 'JBSWY3DPEHPK3PXP', code: '123456' });
  });

  it('shows an inline error and stays on the code step when verification fails', async () => {
    useSessionStore.getState().setSession('tok-1', publicUser);
    mfaEnrollMock.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x' });
    const { ApiError } = await import('@linguaai/auth-client');
    mfaVerifyMock.mockRejectedValue(
      new ApiError(401, { error: { code: 'AUTH_REQUIRED', message: 'Invalid verification code' } }),
    );
    const user = userEvent.setup();
    render(<MfaEnrollPage />);

    await user.click(await screen.findByRole('button', { name: 'Begin enrollment' }));
    await user.type(await screen.findByLabelText('6-digit code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid verification code');
    expect(screen.queryByText('MFA enrollment complete.')).not.toBeInTheDocument();
  });
});
