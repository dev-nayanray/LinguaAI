import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/offline/offline_queue.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/course_api.dart';
import '../data/exercise_attempt_service.dart';
import '../domain/course_models.dart';

final courseApiProvider = Provider<CourseApi>((ref) => CourseApi(ref.watch(apiClientProvider).dio));

final offlineQueueProvider = Provider<OfflineQueue>((ref) => OfflineQueue());

final exerciseAttemptServiceProvider = Provider<ExerciseAttemptService>(
  (ref) => ExerciseAttemptService(ref.watch(courseApiProvider), ref.watch(offlineQueueProvider)),
);

/// A single, generously-sized page — the course catalog is "bounded per
/// language, not a high-churn feed" (the same reasoning
/// `courseListQuerySchema`'s own doc comment already gives for offset
/// pagination over cursor), so a full-catalog fetch is the right MVP
/// scope rather than building incremental-load UI for T2.
final courseListProvider = FutureProvider<CourseListResult>(
  (ref) => ref.watch(courseApiProvider).listCourses(pageSize: 100),
);

final courseDetailProvider = FutureProvider.family<CourseDetail, String>(
  (ref, courseId) => ref.watch(courseApiProvider).getCourseDetail(courseId),
);

final lessonDetailProvider = FutureProvider.family<LessonDetail, String>(
  (ref, lessonId) => ref.watch(courseApiProvider).getLessonDetail(lessonId),
);
