import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/section_header.dart';
import '../../../core/widgets/state_views.dart';
import '../../../core/widgets/stat_pill.dart';
import '../domain/progress_models.dart';
import 'progress_providers.dart';

class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final snapshotAsync = ref.watch(progressSnapshotProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My Progress')),
      body: snapshotAsync.when(
        loading: () => const LoadingView(),
        error: (error, _) => ErrorView(
          message: 'Could not load your progress.',
          onRetry: () => ref.invalidate(progressSnapshotProvider),
        ),
        data: (snapshot) => RefreshIndicator(
          onRefresh: () => ref.refresh(progressSnapshotProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _StatusCard(status: snapshot.status),
              const SizedBox(height: 16),
              _DailyGoalCard(dailyGoal: snapshot.dailyGoal),
              const SizedBox(height: 24),
              const SectionHeader('Missions'),
              if (snapshot.missions.isEmpty)
                const EmptyStateView(message: 'No active missions right now.', icon: Icons.flag_outlined)
              else
                for (final mission in snapshot.missions) _MissionCard(mission: mission),
              const SizedBox(height: 24),
              const SectionHeader('Badges'),
              if (snapshot.badges.isEmpty)
                const EmptyStateView(
                  message: "You haven't earned any badges yet.",
                  icon: Icons.emoji_events_outlined,
                )
              else
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [for (final badge in snapshot.badges) _BadgeCard(badge: badge)],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DailyGoalCard extends StatelessWidget {
  const _DailyGoalCard({required this.dailyGoal});

  final DailyGoal? dailyGoal;

  @override
  Widget build(BuildContext context) {
    final goal = dailyGoal;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: goal == null
            ? const Text("Today's goal hasn't been generated yet.")
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text("Today's goal", style: Theme.of(context).textTheme.bodyLarge),
                      if (goal.completed)
                        Icon(Icons.check_circle, color: context.appColors.success),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${goal.targetXp} XP · ${goal.targetMinutes} min · ${goal.targetActivities} activities',
                  ),
                  if (goal.completed) Text('Completed today!', style: TextStyle(color: context.appColors.success)),
                ],
              ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.status});

  final GamificationStatus status;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.06),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            StatPill(icon: Icons.military_tech, value: '${status.level}', label: 'Level'),
            StatPill(
              icon: Icons.bolt,
              value: '${status.totalXp}',
              label: 'XP',
              color: context.appColors.warning,
            ),
            StatPill(
              icon: Icons.local_fire_department,
              value: '${status.currentStreak}',
              label: 'Streak',
              color: context.appColors.danger,
            ),
          ],
        ),
      ),
    );
  }
}

class _MissionCard extends StatelessWidget {
  const _MissionCard({required this.mission});

  final MissionProgress mission;

  @override
  Widget build(BuildContext context) {
    final ratio = mission.targetValue == 0 ? 0.0 : mission.progress / mission.targetValue;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(mission.metric, style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 6),
                  LinearProgressIndicator(
                    value: ratio.clamp(0, 1),
                    borderRadius: BorderRadius.circular(context.radii['pill']),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            mission.isComplete
                ? Icon(Icons.check_circle, color: context.appColors.success)
                : Text('${mission.progress}/${mission.targetValue}'),
          ],
        ),
      ),
    );
  }
}

class _BadgeCard extends StatelessWidget {
  const _BadgeCard({required this.badge});

  final EarnedBadge badge;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 150,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.emoji_events, color: context.appColors.warning),
              const SizedBox(height: 8),
              Text(badge.name, style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 4),
              Text(
                badge.description,
                style: Theme.of(context).textTheme.bodySmall,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
