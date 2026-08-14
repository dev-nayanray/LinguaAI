import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@linguaai/auth-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';

import AppLayout from './layout';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  usePathname: () => '/dashboard',
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

function renderLayout() {
  return render(
    <ThemeProvider>
      <AppLayout>
        <div>Page content</div>
      </AppLayout>
    </ThemeProvider>,
  );
}

describe('AppLayout', () => {
  afterEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().clear();
  });

  it('renders the shell and page content once a session already exists in the store', async () => {
    useSessionStore.getState().setSession('tok-1', publicUser);
    renderLayout();

    expect(await screen.findByText('Page content')).toBeInTheDocument();
    expect(bootstrapSessionMock).not.toHaveBeenCalled();
    const dashboardLinks = screen.getAllByRole('link', { name: 'Dashboard' });
    expect(dashboardLinks.length).toBeGreaterThan(0);
    for (const link of dashboardLinks) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
  });

  it('re-establishes the session from the refresh cookie when the store starts empty', async () => {
    bootstrapSessionMock.mockImplementation(async () => {
      useSessionStore.getState().setSession('tok-bootstrapped', publicUser);
      return publicUser;
    });
    renderLayout();

    expect(await screen.findByText('Page content')).toBeInTheDocument();
    expect(bootstrapSessionMock).toHaveBeenCalledTimes(1);
  });

  it('redirects to /login when there is no valid refresh cookie either', async () => {
    bootstrapSessionMock.mockResolvedValue(null);
    renderLayout();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });

  it('logging out clears the session and redirects to /login', async () => {
    useSessionStore.getState().setSession('tok-1', publicUser);
    logoutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLayout();

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    expect(useSessionStore.getState().accessToken).toBeNull();
  });
});
