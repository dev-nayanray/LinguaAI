import 'package:dio/dio.dart';

import '../domain/progress_models.dart';

/// Direct HTTP client for `/v1/gamification*` and `/v1/daily-goals/today`
/// (`apps/api/src/modules/gamification/gamification.controller.ts`,
/// `apps/api/src/modules/recommendations/daily-goals.controller.ts`) — the
/// same plain `AuthGuard('jwt')` shape every other feature's API class
/// already targets.
class ProgressApi {
  ProgressApi(this._dio);

  final Dio _dio;

  Future<GamificationStatus> getStatus() async {
    final response = await _dio.get<Map<String, dynamic>>('/gamification/me');
    return GamificationStatus.fromJson(response.data!);
  }

  Future<List<EarnedBadge>> getBadges() async {
    final response = await _dio.get<List<dynamic>>('/gamification/badges');
    return response.data!
        .map((entry) => EarnedBadge.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<List<MissionProgress>> getMissions() async {
    final response = await _dio.get<List<dynamic>>('/gamification/missions');
    return response.data!
        .map((entry) => MissionProgress.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  /// `null` for "no goal generated yet today" (a real, ordinary 404 —
  /// `DailyGoalsController`'s own documented shape — not an error state).
  Future<DailyGoal?> getDailyGoalToday() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/daily-goals/today');
      return DailyGoal.fromJson(response.data!);
    } on DioException catch (error) {
      if (error.response?.statusCode == 404) {
        return null;
      }
      rethrow;
    }
  }
}
