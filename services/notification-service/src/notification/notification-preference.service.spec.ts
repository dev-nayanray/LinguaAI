import { NotificationPreferenceService } from './notification-preference.service.js';

describe('NotificationPreferenceService', () => {
  const findUnique = jest.fn();
  const prisma = { notificationPreference: { findUnique } } as never;
  const service = new NotificationPreferenceService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true (opted in) when no preference row exists — default opt-in (§3.4)', async () => {
    findUnique.mockResolvedValue(null);

    const result = await service.isOptedIn('user-1', 'EMAIL', 'SYSTEM');

    expect(result).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_channel_type: { userId: 'user-1', channel: 'EMAIL', type: 'SYSTEM' } },
    });
  });

  it('returns true when a real row exists with optedIn: true', async () => {
    findUnique.mockResolvedValue({ optedIn: true });

    expect(await service.isOptedIn('user-1', 'EMAIL', 'SYSTEM')).toBe(true);
  });

  it('returns false when a real row exists with optedIn: false — a real opt-out', async () => {
    findUnique.mockResolvedValue({ optedIn: false });

    expect(await service.isOptedIn('user-1', 'EMAIL', 'SYSTEM')).toBe(false);
  });
});
