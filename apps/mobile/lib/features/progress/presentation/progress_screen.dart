import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Could not load your progress.'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => ref.invalidate(progressSnapshotProvider),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
        data: (snapshot) => RefreshIndicator(
          onRefresh: () => ref.refresh(progressSnapshotProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _DailyGoalCard(dailyGoal: snapshot.dailyGoal),
              const SizedBox(height: 16),
              _StatusCard(status: snapshot.status),
              const SizedBox(height: 24),
              Text('Missions', style: Theme.of(context).textTheme.headlineMedium),
              if (snapshot.missions.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('No active missions right now.'),
                )
              else
                for (final mission in snapshot.missions) _MissionTile(mission: mission),
              const SizedBox(height: 24),
              Text('Badges', style: Theme.of(context).textTheme.headlineMedium),
              if (snapshot.badges.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text("You haven't earned any badges yet."),
                )
              else
                for (final badge in snapshot.badges)
                  ListTile(
                    leading: const Icon(Icons.emoji_events),
                    title: Text(badge.name),
                    subtitle: Text(badge.description),
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
                  Text("Today's goal", style: Theme.of(context).textTheme.bodyLarge),
                  const SizedBox(height: 8),
                  Text(
                    '${goal.targetXp} XP · ${goal.targetMinutes} min · ${goal.targetActivities} activities',
                  ),
                  if (goal.completed) const Text('Completed today!'),
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
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _StatColumn(label: 'Level', value: '${status.level}'),
            _StatColumn(label: 'XP', value: '${status.totalXp}'),
            _StatColumn(label: 'Streak', value: '${status.currentStreak}'),
          ],
        ),
      ),
    );
  }
}

class _StatColumn extends StatelessWidget {
  const _StatColumn({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: Theme.of(context).textTheme.headlineMedium),
        Text(label),
      ],
    );
  }
}

class _MissionTile extends StatelessWidget {
  const _MissionTile({required this.mission});

  final MissionProgress mission;

  @override
  Widget build(BuildContext context) {
    final ratio = mission.targetValue == 0 ? 0.0 : mission.progress / mission.targetValue;
    return ListTile(
      title: Text(mission.metric),
      subtitle: LinearProgressIndicator(value: ratio.clamp(0, 1)),
      trailing: mission.isComplete
          ? const Icon(Icons.check_circle)
          : Text('${mission.progress}/${mission.targetValue}'),
    );
  }
}
