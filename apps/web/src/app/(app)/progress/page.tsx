'use client';

import { Flame, Star, Trophy } from 'lucide-react';
import { Card, CardContent } from '@linguaai/ui/cards';
import { StatCard } from '@linguaai/ui/cards';
import { BadgeGrid, MissionCard } from '@linguaai/ui/gamification';

import { useBadges, useGamificationStatus, useMissions } from '@/lib/api/gamification';

export default function ProgressPage() {
  const status = useGamificationStatus();
  const badges = useBadges();
  const missions = useMissions();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 tablet:px-6">
      <h1 className="type-heading-xl text-text">Your progress</h1>
      <p className="mt-1 type-body-sm text-neutral-text">
        XP, streaks, badges, and missions — all real, all yours.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 tablet:grid-cols-3">
        <StatCard
          label="Level"
          value={status.data ? status.data.level : '—'}
          icon={<Star className="h-4 w-4" aria-hidden="true" />}
          loading={status.isLoading}
        />
        <StatCard
          label="Total XP"
          value={status.data ? status.data.totalXp : '—'}
          icon={<Trophy className="h-4 w-4" aria-hidden="true" />}
          loading={status.isLoading}
        />
        <StatCard
          label="Current streak"
          value={
            status.data
              ? `${status.data.currentStreak} day${status.data.currentStreak === 1 ? '' : 's'}`
              : '—'
          }
          icon={<Flame className="h-4 w-4" aria-hidden="true" />}
          loading={status.isLoading}
        />
      </div>

      {status.isError && (
        <Card className="mt-6">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <p className="type-body-sm text-neutral-text">
              Could not load your gamification status.
            </p>
            <button
              type="button"
              onClick={() => void status.refetch()}
              className="type-body-sm font-semibold text-primary-text hover:underline"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      <h2 className="mt-10 type-heading-lg text-text">Missions</h2>
      {missions.isLoading && (
        <div className="mt-4 h-20 w-full animate-pulse rounded-lg bg-surface-muted" />
      )}
      {missions.isError && (
        <p className="mt-4 type-body-sm text-neutral-text">Could not load your missions.</p>
      )}
      {!missions.isLoading && !missions.isError && missions.data?.length === 0 && (
        <p className="mt-4 type-body-sm text-neutral-text">No active missions right now.</p>
      )}
      {missions.data && missions.data.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 tablet:grid-cols-2">
          {missions.data.map((mission) => (
            <MissionCard
              key={mission.missionId}
              title={mission.metric}
              description={`${mission.type.toLowerCase()} mission`}
              current={mission.progress}
              target={mission.targetValue}
              reward={`+${mission.rewardXp} XP`}
            />
          ))}
        </div>
      )}

      <h2 className="mt-10 type-heading-lg text-text">Badges</h2>
      {badges.isLoading && (
        <div className="mt-4 h-20 w-full animate-pulse rounded-lg bg-surface-muted" />
      )}
      {badges.isError && (
        <p className="mt-4 type-body-sm text-neutral-text">Could not load your badges.</p>
      )}
      {!badges.isLoading && !badges.isError && badges.data?.length === 0 && (
        <p className="mt-4 type-body-sm text-neutral-text">
          You haven't earned any badges yet — keep learning to unlock your first one.
        </p>
      )}
      {badges.data && badges.data.length > 0 && (
        <div className="mt-4">
          <BadgeGrid
            items={badges.data.map((badge) => ({
              id: badge.badgeId,
              title: badge.name,
              description: badge.description,
              unlocked: true,
            }))}
          />
        </div>
      )}
    </div>
  );
}
