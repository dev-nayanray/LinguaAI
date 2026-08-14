'use client';

import { Target, Clock, ListChecks } from 'lucide-react';
import { useSessionStore } from '@linguaai/auth-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@linguaai/ui/cards';
import { StatCard } from '@linguaai/ui/cards';

import { useTodayDailyGoal } from '@/lib/api/daily-goals';

export default function DashboardPage() {
  const user = useSessionStore((s) => s.user);
  const { data: dailyGoal, isLoading, isError, refetch } = useTodayDailyGoal();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 tablet:px-6">
      <h1 className="type-heading-xl text-text">
        {user ? `Welcome back, ${user.displayName}` : 'Welcome back'}
      </h1>
      <p className="mt-1 type-body-sm text-neutral-text">Here's your goal for today.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 tablet:grid-cols-3">
        <StatCard
          label="Target XP"
          value={dailyGoal ? dailyGoal.targetXp : '—'}
          icon={<Target className="h-4 w-4" aria-hidden="true" />}
          loading={isLoading}
        />
        <StatCard
          label="Target minutes"
          value={dailyGoal ? dailyGoal.targetMinutes : '—'}
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
          loading={isLoading}
        />
        <StatCard
          label="Target activities"
          value={dailyGoal ? dailyGoal.targetActivities : '—'}
          icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
          loading={isLoading}
        />
      </div>

      {isError && (
        <Card className="mt-6">
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <p className="type-body-sm text-neutral-text">Could not load today's goal.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="type-body-sm font-semibold text-primary-text hover:underline"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && !dailyGoal && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="type-body-sm text-neutral-text">
              Today's goal hasn't been generated yet — it's created automatically once your learning
              plan is active. Start a lesson to get one going.
            </p>
          </CardContent>
        </Card>
      )}

      {dailyGoal?.completed && (
        <Card className="mt-6 border-success-text">
          <CardContent className="pt-6">
            <p className="type-body-sm font-semibold text-success-text">
              Completed for today — nice work!
            </p>
          </CardContent>
        </Card>
      )}

      <h2 className="mt-10 type-heading-lg text-text">Continue learning</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 tablet:grid-cols-2">
        <a href="/courses">
          <Card className="h-full transition-colors duration-micro hover:bg-surface-muted">
            <CardHeader>
              <CardTitle>Browse courses</CardTitle>
              <CardDescription>Pick a lesson from your structured curriculum.</CardDescription>
            </CardHeader>
          </Card>
        </a>
        <a href="/profile">
          <Card className="h-full transition-colors duration-micro hover:bg-surface-muted">
            <CardHeader>
              <CardTitle>Your profile</CardTitle>
              <CardDescription>Account details, MFA, and session settings.</CardDescription>
            </CardHeader>
          </Card>
        </a>
      </div>
    </div>
  );
}
