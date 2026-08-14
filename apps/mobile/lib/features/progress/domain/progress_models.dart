/// Mirrors `gamificationStatusResponseSchema` — no `atRisk`/streak-warning
/// field exists on this response (confirmed: that field only lives in the
/// internal `gamification.streak.updated` domain-event payload, and is
/// hardcoded `false` there too) — this screen shows only what's real.
class GamificationStatus {
  const GamificationStatus({
    required this.totalXp,
    required this.level,
    required this.currentStreak,
    required this.longestStreak,
  });

  factory GamificationStatus.fromJson(Map<String, dynamic> json) => GamificationStatus(
    totalXp: json['totalXp'] as int,
    level: json['level'] as int,
    currentStreak: json['currentStreak'] as int,
    longestStreak: json['longestStreak'] as int,
  );

  final int totalXp;
  final int level;
  final int currentStreak;
  final int longestStreak;
}

/// Mirrors `earnedBadgeResponseSchema`.
class EarnedBadge {
  const EarnedBadge({
    required this.badgeId,
    required this.name,
    required this.description,
    required this.iconUrl,
    required this.earnedAt,
  });

  factory EarnedBadge.fromJson(Map<String, dynamic> json) => EarnedBadge(
    badgeId: json['badgeId'] as String,
    name: json['name'] as String,
    description: json['description'] as String,
    iconUrl: json['iconUrl'] as String?,
    earnedAt: json['earnedAt'] as String,
  );

  final String badgeId;
  final String name;
  final String description;
  final String? iconUrl;
  final String earnedAt;
}

/// Mirrors `missionProgressResponseSchema`.
class MissionProgress {
  const MissionProgress({
    required this.missionId,
    required this.type,
    required this.metric,
    required this.targetValue,
    required this.progress,
    required this.rewardXp,
    required this.completedAt,
    required this.endsAt,
  });

  factory MissionProgress.fromJson(Map<String, dynamic> json) => MissionProgress(
    missionId: json['missionId'] as String,
    type: json['type'] as String,
    metric: json['metric'] as String,
    targetValue: json['targetValue'] as int,
    progress: json['progress'] as int,
    rewardXp: json['rewardXp'] as int,
    completedAt: json['completedAt'] as String?,
    endsAt: json['endsAt'] as String,
  );

  final String missionId;
  final String type;
  final String metric;
  final int targetValue;
  final int progress;
  final int rewardXp;
  final String? completedAt;
  final String endsAt;

  bool get isComplete => completedAt != null;
}

/// Mirrors `dailyGoalResponseSchema` — `date` is a bare `YYYY-MM-DD`
/// calendar-date string (`z.string().date()`, not a datetime), already
/// resolved server-side in the caller's own timezone — never re-parsed as
/// a UTC instant here.
class DailyGoal {
  const DailyGoal({
    required this.date,
    required this.targetXp,
    required this.targetMinutes,
    required this.targetActivities,
    required this.completed,
  });

  factory DailyGoal.fromJson(Map<String, dynamic> json) => DailyGoal(
    date: json['date'] as String,
    targetXp: json['targetXp'] as int,
    targetMinutes: json['targetMinutes'] as int,
    targetActivities: json['targetActivities'] as int,
    completed: json['completed'] as bool,
  );

  final String date;
  final int targetXp;
  final int targetMinutes;
  final int targetActivities;
  final bool completed;
}
