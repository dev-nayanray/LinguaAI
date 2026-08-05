import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RegisterPage from './page';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

const registerMock = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    register: (...args: unknown[]) => registerMock(...args),
  },
}));

describe('RegisterPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('submits the form and redirects to /login on success', async () => {
    registerMock.mockResolvedValue({ id: 'u-1' });
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText('Email'), 'new@test.local');
    await user.type(screen.getByLabelText('Display name'), 'New User');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByText('I agree to the Terms of Service and Privacy Policy'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login?registered=1'));
    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@test.local',
        displayName: 'New User',
        tosAccepted: true,
        privacyPolicyAccepted: true,
        marketingConsent: false,
      }),
    );
  });

  it('blocks submission with an inline error when the TOS/privacy checkbox is not checked', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText('Email'), 'new@test.local');
    await user.type(screen.getByLabelText('Display name'), 'New User');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Terms of Service/);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('shows the server error message on a duplicate-email 409', async () => {
    const { ApiError } = await import('@linguaai/auth-client');
    registerMock.mockRejectedValue(
      new ApiError(409, {
        error: { code: 'CONFLICT', message: 'An account with this email already exists' },
      }),
    );
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText('Email'), 'dup@test.local');
    await user.type(screen.getByLabelText('Display name'), 'Dup User');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByText('I agree to the Terms of Service and Privacy Policy'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists',
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
