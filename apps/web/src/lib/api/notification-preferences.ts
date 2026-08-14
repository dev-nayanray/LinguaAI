import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NotificationPreference,
  UpdateNotificationPreferenceRequest,
} from '@linguaai/validation/notification';

import { authClient } from '@/lib/auth-client';

/** `GET /v1/notification-preferences` (E16 T3) — the caller's own full default-opted-in set. */
export function fetchNotificationPreferences(): Promise<NotificationPreference[]> {
  return authClient.request<NotificationPreference[]>('/v1/notification-preferences');
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: fetchNotificationPreferences,
  });
}

/** `PUT /v1/notification-preferences` (E16 T3) — upserts one (channel, type) row. */
export function updateNotificationPreference(
  dto: UpdateNotificationPreferenceRequest,
): Promise<NotificationPreference> {
  return authClient.request<NotificationPreference>('/v1/notification-preferences', {
    method: 'PUT',
    body: dto,
  });
}

export function useUpdateNotificationPreference() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateNotificationPreference,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });
}
