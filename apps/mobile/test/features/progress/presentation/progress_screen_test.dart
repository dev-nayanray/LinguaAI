import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/progress/domain/progress_models.dart';
import 'package:mobile/features/progress/presentation/progress_providers.dart';
import 'package:mobile/features/progress/presentation/progress_screen.dart';

void main() {
  testWidgets('renders real status/mission/badge data once loaded', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          progressSnapshotProvider.overrideWith(
            (ref) async => const ProgressSnapshot(
              status: GamificationStatus(totalXp: 120, level: 2, currentStreak: 3, longestStreak: 5),
              badges: [
                EarnedBadge(
                  badgeId: 'badge-1',
                  name: 'First Lesson',
                  description: 'Complete your first lesson',
                  iconUrl: null,
                  earnedAt: '2026-01-01T00:00:00.000Z',
                ),
              ],
              missions: [
                MissionProgress(
                  missionId: 'mission-1',
                  type: 'DAILY',
                  metric: 'XP_EARNED',
                  targetValue: 50,
                  progress: 20,
                  rewardXp: 10,
                  completedAt: null,
                  endsAt: '2026-01-02T00:00:00.000Z',
                ),
              ],
              dailyGoal: DailyGoal(
                date: '2026-08-14',
                targetXp: 50,
                targetMinutes: 15,
                targetActivities: 3,
                completed: false,
              ),
            ),
          ),
        ],
        child: const MaterialApp(home: ProgressScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('120'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('First Lesson'), findsOneWidget);
    expect(find.text('20/50'), findsOneWidget);
  });

  testWidgets('shows an honest message when no daily goal has been generated yet', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          progressSnapshotProvider.overrideWith(
            (ref) async => const ProgressSnapshot(
              status: GamificationStatus(totalXp: 0, level: 1, currentStreak: 0, longestStreak: 0),
              badges: [],
              missions: [],
              dailyGoal: null,
            ),
          ),
        ],
        child: const MaterialApp(home: ProgressScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text("Today's goal hasn't been generated yet."), findsOneWidget);
    expect(find.text('No active missions right now.'), findsOneWidget);
    expect(find.text("You haven't earned any badges yet."), findsOneWidget);
  });
}
