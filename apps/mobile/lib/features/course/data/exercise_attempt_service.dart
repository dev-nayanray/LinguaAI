import 'package:dio/dio.dart';

import '../../../core/offline/offline_queue.dart';
import '../domain/course_models.dart';
import 'course_api.dart';

/// `DioExceptionType`s that mean "the request never reached the server" —
/// the real, honest signal to queue rather than fail. A real 4xx/5xx from
/// the server (e.g. the exercise was unpublished server-side in the
/// interim) is a genuine outcome, not a connectivity problem, and must
/// propagate as a real error, not be silently queued and retried forever.
const _connectivityFailureTypes = {
  DioExceptionType.connectionError,
  DioExceptionType.connectionTimeout,
  DioExceptionType.receiveTimeout,
  DioExceptionType.sendTimeout,
};

/// The offline-aware wrapper around `CourseApi.submitExerciseAttempt`
/// (§6.3, ADR-062) — the concrete mechanism behind PRD's "last-write-wins
/// offline sync" requirement for this write type. `ExerciseAttempt`
/// creation is append-only (confirmed against `apps/api`'s own real
/// implementation, E21 T2 research) — there is no real "conflict" to
/// resolve for a queued replay, only an ordering question, which FIFO
/// replay (`OfflineQueue.listPending`'s own `id ASC` order) answers
/// directly.
class ExerciseAttemptService {
  ExerciseAttemptService(this._courseApi, this._offlineQueue);

  final CourseApi _courseApi;
  final OfflineQueue _offlineQueue;

  Future<AttemptOutcome> submit(String exerciseId, ExerciseResponseValue response) async {
    try {
      final result = await _courseApi.submitExerciseAttempt(
        exerciseId: exerciseId,
        response: response,
      );
      return AttemptScored(result);
    } on DioException catch (error) {
      if (!_connectivityFailureTypes.contains(error.type)) {
        rethrow;
      }
      await _offlineQueue.enqueue(
        endpoint: '/exercises/$exerciseId/attempts',
        payload: {'response': response.toJson()},
      );
      return const AttemptQueued();
    }
  }

  /// Replays the queue in FIFO order against the real endpoint each entry
  /// already recorded. A replay that itself fails on connectivity grounds
  /// stops the whole pass (the device is still offline, no point trying
  /// the rest); a real server-side rejection is a genuine, visible
  /// sync-conflict — dropped from the queue rather than retried forever
  /// (the exact UX for surfacing that to the learner is real, deferred
  /// product-design work, §10 open question #1 of the E21 design doc, not
  /// resolved here).
  Future<int> syncPendingWrites() async {
    final pending = await _offlineQueue.listPending();
    var syncedCount = 0;
    for (final write in pending) {
      try {
        await _courseApi.submitRaw(endpoint: write.endpoint, body: write.payload);
        await _offlineQueue.remove(write.id);
        syncedCount++;
      } on DioException catch (error) {
        if (_connectivityFailureTypes.contains(error.type)) {
          break;
        }
        await _offlineQueue.remove(write.id);
      }
    }
    return syncedCount;
  }
}
