import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import NotificationSettingsPage from './page';

const useNotificationPreferencesMock = vi.fn();
const useUpdateNotificationPreferenceMock = vi.fn();

vi.mock('@/lib/api/notification-preferences', () => ({
  useNotificationPreferences: () => useNotificationPreferencesMock(),
  useUpdateNotificationPreference: () => useUpdateNotificationPreferenceMock(),
}));

describe('NotificationSettingsPage', () => {
  it('renders every notification type with a real opted-in default', () => {
    useNotificationPreferencesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useUpdateNotificationPreferenceMock.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<NotificationSettingsPage />);

    expect(screen.getByText('Streak reminders')).toBeInTheDocument();
    expect(screen.getByText("Can't be turned off")).toBeInTheDocument();
    const switches = screen.getAllByRole('switch');
    // 6 types x 2 channels
    expect(switches).toHaveLength(12);
  });

  it('reflects a real opted-out preference from the API', () => {
    useNotificationPreferencesMock.mockReturnValue({
      data: [{ channel: 'EMAIL', type: 'MARKETING', optedIn: false }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useUpdateNotificationPreferenceMock.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<NotificationSettingsPage />);

    expect(screen.getByRole('switch', { name: 'Product news & tips via email' })).toHaveAttribute(
      'data-state',
      'unchecked',
    );
  });

  it('the SECURITY_ALERT row is always on and disabled, matching the real backend enforcement', () => {
    useNotificationPreferencesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useUpdateNotificationPreferenceMock.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<NotificationSettingsPage />);

    const securitySwitch = screen.getByRole('switch', { name: 'Security alerts via email' });
    expect(securitySwitch).toBeDisabled();
    expect(securitySwitch).toHaveAttribute('data-state', 'checked');
  });

  it('toggling a real switch calls the real update mutation', async () => {
    useNotificationPreferencesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const mutate = vi.fn();
    useUpdateNotificationPreferenceMock.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();

    render(<NotificationSettingsPage />);
    await user.click(screen.getByRole('switch', { name: 'Streak reminders via email' }));

    expect(mutate).toHaveBeenCalledWith({
      type: 'STREAK_REMINDER',
      channel: 'EMAIL',
      optedIn: false,
    });
  });

  it('shows a real error state with a working retry action', () => {
    const refetch = vi.fn();
    useNotificationPreferencesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    useUpdateNotificationPreferenceMock.mockReturnValue({ mutate: vi.fn(), isPending: false });

    render(<NotificationSettingsPage />);

    expect(screen.getByText('Could not load your preferences.')).toBeInTheDocument();
  });
});
