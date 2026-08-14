import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/features/progress/data/progress_api.dart';

class _CapturingServer {
  _CapturingServer(this._responder);

  final ({int statusCode, dynamic body}) Function(HttpRequest request) _responder;
  late HttpServer _server;
  HttpRequest? lastRequest;

  Future<String> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server.listen((request) async {
      lastRequest = request;
      await request.drain<void>();
      final result = _responder(request);
      request.response.statusCode = result.statusCode;
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode(result.body));
      await request.response.close();
    });
    return 'http://${_server.address.address}:${_server.port}';
  }

  Future<void> stop() => _server.close();
}

void main() {
  group('ProgressApi', () {
    late _CapturingServer server;

    tearDown(() async {
      await server.stop();
    });

    test('getStatus requests GET /gamification/me and parses XP/streak fields', () async {
      server = _CapturingServer(
        (request) => (
          statusCode: 200,
          body: {'totalXp': 120, 'level': 2, 'currentStreak': 3, 'longestStreak': 5},
        ),
      );
      final baseUrl = await server.start();
      final api = ProgressApi(ApiClient(baseUrl: baseUrl).dio);

      final status = await api.getStatus();

      expect(server.lastRequest!.uri.path, '/gamification/me');
      expect(status.totalXp, 120);
      expect(status.currentStreak, 3);
    });

    test('getBadges parses a real raw array (not a {data,meta} envelope)', () async {
      server = _CapturingServer(
        (request) => (
          statusCode: 200,
          body: [
            {
              'badgeId': 'badge-1',
              'name': 'First Lesson',
              'description': 'Complete your first lesson',
              'iconUrl': null,
              'earnedAt': '2026-01-01T00:00:00.000Z',
            },
          ],
        ),
      );
      final baseUrl = await server.start();
      final api = ProgressApi(ApiClient(baseUrl: baseUrl).dio);

      final badges = await api.getBadges();

      expect(server.lastRequest!.uri.path, '/gamification/badges');
      expect(badges, hasLength(1));
      expect(badges.single.name, 'First Lesson');
    });

    test('getMissions parses progress/completedAt correctly', () async {
      server = _CapturingServer(
        (request) => (
          statusCode: 200,
          body: [
            {
              'missionId': 'mission-1',
              'type': 'DAILY',
              'metric': 'XP_EARNED',
              'targetValue': 50,
              'progress': 20,
              'rewardXp': 10,
              'completedAt': null,
              'endsAt': '2026-01-02T00:00:00.000Z',
            },
          ],
        ),
      );
      final baseUrl = await server.start();
      final api = ProgressApi(ApiClient(baseUrl: baseUrl).dio);

      final missions = await api.getMissions();

      expect(missions.single.isComplete, isFalse);
      expect(missions.single.progress, 20);
    });

    test('getDailyGoalToday parses a real goal when one exists', () async {
      server = _CapturingServer(
        (request) => (
          statusCode: 200,
          body: {
            'date': '2026-08-14',
            'targetXp': 50,
            'targetMinutes': 15,
            'targetActivities': 3,
            'completed': false,
          },
        ),
      );
      final baseUrl = await server.start();
      final api = ProgressApi(ApiClient(baseUrl: baseUrl).dio);

      final goal = await api.getDailyGoalToday();

      expect(server.lastRequest!.uri.path, '/daily-goals/today');
      expect(goal!.targetXp, 50);
      expect(goal.date, '2026-08-14');
    });

    test('getDailyGoalToday returns null on a real 404 (no goal generated yet) rather than throwing', () async {
      server = _CapturingServer((request) => (statusCode: 404, body: {'message': 'Not Found'}));
      final baseUrl = await server.start();
      final api = ProgressApi(ApiClient(baseUrl: baseUrl).dio);

      final goal = await api.getDailyGoalToday();

      expect(goal, isNull);
    });
  });
}
