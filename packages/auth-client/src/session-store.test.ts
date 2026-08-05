import { afterEach, describe, expect, it } from 'vitest';
import type { PublicUser } from '@linguaai/validation/identity';

import { useSessionStore } from './session-store';

const user: PublicUser = {
  id: 'u-1',
  email: 'user@test.local',
  displayName: 'Test User',
  avatarUrl: null,
  locale: 'en-US',
  timezone: 'UTC',
  role: 'USER',
  status: 'ACTIVE',
  mfaEnrolled: false,
  organizationId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('useSessionStore', () => {
  afterEach(() => {
    useSessionStore.getState().clear();
  });

  it('starts with no session', () => {
    expect(useSessionStore.getState().accessToken).toBeNull();
    expect(useSessionStore.getState().user).toBeNull();
  });

  it('setSession populates both accessToken and user', () => {
    useSessionStore.getState().setSession('token-abc', user);

    expect(useSessionStore.getState().accessToken).toBe('token-abc');
    expect(useSessionStore.getState().user).toEqual(user);
  });

  it('clear resets both fields to null', () => {
    useSessionStore.getState().setSession('token-abc', user);

    useSessionStore.getState().clear();

    expect(useSessionStore.getState().accessToken).toBeNull();
    expect(useSessionStore.getState().user).toBeNull();
  });
});
