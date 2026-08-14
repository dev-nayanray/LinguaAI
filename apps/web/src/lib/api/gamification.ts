import { useQuery } from '@tanstack/react-query';
import type {
  EarnedBadgeResponse,
  GamificationStatusResponse,
  MissionProgressResponse,
} from '@linguaai/validation/gamification';

import { authClient } from '@/lib/auth-client';

/** `GET /v1/gamification/me` (E14 T1) — the caller's own XP, level, and streak. */
export function fetchGamificationStatus(): Promise<GamificationStatusResponse> {
  return authClient.request<GamificationStatusResponse>('/v1/gamification/me');
}

export function useGamificationStatus() {
  return useQuery({
    queryKey: ['gamification', 'status'],
    queryFn: fetchGamificationStatus,
  });
}

/** `GET /v1/gamification/badges` (E14 T2) — the caller's own earned badges. */
export function fetchBadges(): Promise<EarnedBadgeResponse[]> {
  return authClient.request<EarnedBadgeResponse[]>('/v1/gamification/badges');
}

export function useBadges() {
  return useQuery({
    queryKey: ['gamification', 'badges'],
    queryFn: fetchBadges,
  });
}

/** `GET /v1/gamification/missions` (E14 T2) — the caller's own active missions and progress. */
export function fetchMissions(): Promise<MissionProgressResponse[]> {
  return authClient.request<MissionProgressResponse[]>('/v1/gamification/missions');
}

export function useMissions() {
  return useQuery({
    queryKey: ['gamification', 'missions'],
    queryFn: fetchMissions,
  });
}
