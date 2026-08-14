import 'package:dio/dio.dart';

import '../domain/course_models.dart';

/// Direct HTTP client for the learner-facing course-catalog/exercise-attempt
/// contract (`apps/api/src/modules/course/course-catalog.controller.ts`,
/// `exercise-attempts.controller.ts`) — the same plain `AuthGuard('jwt')`
/// shape `AuthApi.fetchCurrentUser()` already calls, so `ApiClient`'s
/// existing Bearer/refresh interceptor needs no changes for this feature.
class CourseApi {
  CourseApi(this._dio);

  final Dio _dio;

  Future<CourseListResult> listCourses({String? languageId, int page = 1, int pageSize = 20}) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/courses',
      queryParameters: {
        'languageId': ?languageId,
        'page': page,
        'pageSize': pageSize,
      },
    );
    return CourseListResult.fromJson(response.data!);
  }

  Future<CourseDetail> getCourseDetail(String courseId) async {
    final response = await _dio.get<Map<String, dynamic>>('/courses/$courseId');
    return CourseDetail.fromJson(response.data!);
  }

  Future<LessonDetail> getLessonDetail(String lessonId) async {
    final response = await _dio.get<Map<String, dynamic>>('/lessons/$lessonId');
    return LessonDetail.fromJson(response.data!);
  }

  Future<ExerciseAttemptResult> submitExerciseAttempt({
    required String exerciseId,
    required ExerciseResponseValue response,
  }) async {
    final result = await submitRaw(
      endpoint: '/exercises/$exerciseId/attempts',
      body: {'response': response.toJson()},
    );
    return ExerciseAttemptResult.fromJson(result);
  }

  /// The generic replay entry point `ExerciseAttemptService.syncPendingWrites`
  /// (§6.3) calls — a queued `PendingWrite` only remembers `endpoint`/`payload`
  /// (already-JSON, not a typed `ExerciseResponseValue`), so replay posts the
  /// raw body back rather than reconstructing a typed request object.
  Future<Map<String, dynamic>> submitRaw({
    required String endpoint,
    required Map<String, dynamic> body,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(endpoint, data: body);
    return response.data!;
  }
}
