import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../data/progress_api.dart';
import '../domain/progress_models.dart';

final progressApiProvider = Provider<ProgressApi>((ref) => ProgressApi(ref.watch(apiClientProvider).dio));

/// A single combined read for the progress screen — four independent GETs,
/// none of which depend on each other, sequenced simply rather than via
/// `Future.wait` (fine at this call volume; not a hot path).
class ProgressSnapshot {
  const ProgressSnapshot({
    required this.status,
    required this.badges,
    required this.missions,
    required this.dailyGoal,
  });

  final GamificationStatus status;
  final List<EarnedBadge> badges;
  final List<MissionProgress> missions;
  final DailyGoal? dailyGoal;
}

final progressSnapshotProvider = FutureProvider<ProgressSnapshot>((ref) async {
  final api = ref.watch(progressApiProvider);
  final status = await api.getStatus();
  final badges = await api.getBadges();
  final missions = await api.getMissions();
  final dailyGoal = await api.getDailyGoalToday();
  return ProgressSnapshot(status: status, badges: badges, missions: missions, dailyGoal: dailyGoal);
});
