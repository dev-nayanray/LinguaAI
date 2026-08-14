import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/offline/offline_queue.dart';
import 'package:mobile/features/course/data/course_api.dart';
import 'package:mobile/features/course/data/exercise_attempt_service.dart';
import 'package:mobile/features/course/domain/course_models.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

class _CapturingServer {
  _CapturingServer(this._responder);

  final Map<String, dynamic> Function(HttpRequest request, String body) _responder;
  late HttpServer _server;
  int requestCount = 0;

  Future<String> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server.listen((request) async {
      requestCount++;
      final body = await utf8.decodeStream(request);
      final responseJson = _responder(request, body);
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode(responseJson));
      await request.response.close();
    });
    return 'http://${_server.address.address}:${_server.port}';
  }

  Future<void> stop() => _server.close();
}

Future<int> _unusedPort() async {
  final probe = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
  final port = probe.port;
  await probe.close();
  return port;
}

void main() {
  late Database database;
  late OfflineQueue offlineQueue;

  setUpAll(() {
    sqfliteFfiInit();
  });

  setUp(() async {
    database = await databaseFactoryFfi.openDatabase(
      inMemoryDatabasePath,
      options: OpenDatabaseOptions(
        version: 1,
        onCreate: (db, version) => db.execute('''
          CREATE TABLE pending_writes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT NOT NULL,
            payload TEXT NOT NULL,
            createdAt TEXT NOT NULL
          )
        '''),
      ),
    );
    offlineQueue = OfflineQueue(database: database);
  });

  tearDown(() => database.close());

  test('a real, reachable server returns Scored, and nothing is queued', () async {
    final server = _CapturingServer(
      (request, body) => {'id': 'attempt-1', 'isCorrect': true, 'score': 1},
    );
    final baseUrl = await server.start();
    final apiClient = ApiClient(baseUrl: baseUrl);
    final service = ExerciseAttemptService(CourseApi(apiClient.dio), offlineQueue);

    final outcome = await service.submit('ex-1', const SelectedIndexResponse(0));

    expect(outcome, isA<AttemptScored>());
    expect((outcome as AttemptScored).result.isCorrect, isTrue);
    expect(await offlineQueue.listPending(), isEmpty);
    await server.stop();
  });

  test('an unreachable server (real connection failure, not mocked) queues the attempt and returns Queued', () async {
    final deadPort = await _unusedPort();
    final apiClient = ApiClient(baseUrl: 'http://127.0.0.1:$deadPort');
    final service = ExerciseAttemptService(CourseApi(apiClient.dio), offlineQueue);

    final outcome = await service.submit('ex-1', const TextResponse('Hola'));

    expect(outcome, isA<AttemptQueued>());
    final pending = await offlineQueue.listPending();
    expect(pending, hasLength(1));
    expect(pending.single.endpoint, '/exercises/ex-1/attempts');
    expect(pending.single.payload, {
      'response': {'text': 'Hola'},
    });
  });

  test('syncPendingWrites replays queued attempts in order against a real server and clears the queue', () async {
    final deadPort = await _unusedPort();
    final offlineApiClient = ApiClient(baseUrl: 'http://127.0.0.1:$deadPort');
    final offlineService = ExerciseAttemptService(CourseApi(offlineApiClient.dio), offlineQueue);
    await offlineService.submit('ex-1', const SelectedIndexResponse(0));
    await offlineService.submit('ex-2', const TextResponse('Adiós'));
    expect(await offlineQueue.listPending(), hasLength(2));

    final server = _CapturingServer(
      (request, body) => {'id': 'attempt-x', 'isCorrect': true, 'score': 1},
    );
    final baseUrl = await server.start();
    final onlineApiClient = ApiClient(baseUrl: baseUrl);
    final onlineService = ExerciseAttemptService(CourseApi(onlineApiClient.dio), offlineQueue);

    final syncedCount = await onlineService.syncPendingWrites();

    expect(syncedCount, 2);
    expect(server.requestCount, 2);
    expect(await offlineQueue.listPending(), isEmpty);
    await server.stop();
  });

  test('syncPendingWrites stops (does not drop) on a real connection failure, leaving the queue intact', () async {
    final deadPort = await _unusedPort();
    final apiClient = ApiClient(baseUrl: 'http://127.0.0.1:$deadPort');
    final service = ExerciseAttemptService(CourseApi(apiClient.dio), offlineQueue);
    await service.submit('ex-1', const SelectedIndexResponse(0));

    final syncedCount = await service.syncPendingWrites();

    expect(syncedCount, 0);
    expect(await offlineQueue.listPending(), hasLength(1));
  });

  test('syncPendingWrites drops (does not retry forever) a real server-side rejection', () async {
    final deadPort = await _unusedPort();
    final offlineApiClient = ApiClient(baseUrl: 'http://127.0.0.1:$deadPort');
    final offlineService = ExerciseAttemptService(CourseApi(offlineApiClient.dio), offlineQueue);
    await offlineService.submit('ex-1', const SelectedIndexResponse(0));

    final server = _CapturingServer((request, body) {
      request.response.statusCode = 422;
      return {'message': 'Unprocessable'};
    });
    final baseUrl = await server.start();
    final onlineApiClient = ApiClient(baseUrl: baseUrl);
    final onlineService = ExerciseAttemptService(CourseApi(onlineApiClient.dio), offlineQueue);

    final syncedCount = await onlineService.syncPendingWrites();

    expect(syncedCount, 0);
    expect(await offlineQueue.listPending(), isEmpty);
    await server.stop();
  });
}
