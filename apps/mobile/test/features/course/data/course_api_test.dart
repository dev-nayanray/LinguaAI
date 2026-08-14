import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/features/course/data/course_api.dart';
import 'package:mobile/features/course/domain/course_models.dart';

class _CapturingServer {
  _CapturingServer(this._responder);

  final Map<String, dynamic> Function(HttpRequest request, String body) _responder;
  late HttpServer _server;
  HttpRequest? lastRequest;

  Future<String> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server.listen((request) async {
      final body = await utf8.decodeStream(request);
      lastRequest = request;
      final responseJson = _responder(request, body);
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode(responseJson));
      await request.response.close();
    });
    return 'http://${_server.address.address}:${_server.port}';
  }

  Future<void> stop() => _server.close();
}

void main() {
  group('CourseApi', () {
    late _CapturingServer server;

    tearDown(() async {
      await server.stop();
    });

    test('listCourses sends real page/pageSize query params to GET /courses', () async {
      server = _CapturingServer(
        (request, body) => {
          'data': [
            {
              'id': 'course-1',
              'languageId': 'lang-1',
              'title': 'Spanish for Travel',
              'description': null,
              'slug': 'spanish-for-travel',
              'publishedAt': '2026-01-01T00:00:00.000Z',
              'createdAt': '2026-01-01T00:00:00.000Z',
              'updatedAt': '2026-01-01T00:00:00.000Z',
            },
          ],
          'meta': {'page': 1, 'pageSize': 20, 'total': 1},
        },
      );
      final baseUrl = await server.start();
      final api = CourseApi(ApiClient(baseUrl: baseUrl).dio);

      final result = await api.listCourses(page: 1, pageSize: 20);

      expect(server.lastRequest!.uri.path, '/courses');
      expect(server.lastRequest!.uri.queryParameters['page'], '1');
      expect(server.lastRequest!.uri.queryParameters['pageSize'], '20');
      expect(result.data, hasLength(1));
      expect(result.data.single.title, 'Spanish for Travel');
      expect(result.total, 1);
    });

    test('getCourseDetail requests GET /courses/:id and parses the nested Level/Unit/Lesson tree', () async {
      server = _CapturingServer(
        (request, body) => {
          'id': 'course-1',
          'languageId': 'lang-1',
          'title': 'Spanish for Travel',
          'description': null,
          'slug': 'spanish-for-travel',
          'publishedAt': '2026-01-01T00:00:00.000Z',
          'createdAt': '2026-01-01T00:00:00.000Z',
          'updatedAt': '2026-01-01T00:00:00.000Z',
          'levels': [
            {
              'id': 'level-1',
              'courseId': 'course-1',
              'cefrLevel': 'A1',
              'title': 'Beginner',
              'description': null,
              'order': 1,
              'units': [
                {
                  'id': 'unit-1',
                  'levelId': 'level-1',
                  'title': 'Greetings',
                  'description': null,
                  'order': 1,
                  'lessons': [
                    {
                      'id': 'lesson-1',
                      'unitId': 'unit-1',
                      'title': 'Saying Hello',
                      'description': null,
                      'order': 1,
                      'estimatedMinutes': 5,
                    },
                  ],
                },
              ],
            },
          ],
        },
      );
      final baseUrl = await server.start();
      final api = CourseApi(ApiClient(baseUrl: baseUrl).dio);

      final detail = await api.getCourseDetail('course-1');

      expect(server.lastRequest!.uri.path, '/courses/course-1');
      expect(detail.levels, hasLength(1));
      expect(detail.levels.single.units.single.lessons.single.title, 'Saying Hello');
    });

    test('getLessonDetail parses exercises including the real content field (options/leftItems/rightItems)', () async {
      server = _CapturingServer(
        (request, body) => {
          'id': 'lesson-1',
          'unitId': 'unit-1',
          'title': 'Saying Hello',
          'description': null,
          'order': 1,
          'estimatedMinutes': 5,
          'activities': [
            {
              'id': 'activity-1',
              'lessonId': 'lesson-1',
              'type': 'READING',
              'title': 'Basics',
              'content': {'text': 'Hola'},
              'order': 1,
              'exercises': [
                {
                  'id': 'ex-1',
                  'activityId': 'activity-1',
                  'quizId': null,
                  'type': 'MULTIPLE_CHOICE',
                  'prompt': 'Choose the greeting',
                  'order': 1,
                  'content': {
                    'options': ['Hola', 'Adiós'],
                  },
                },
                {
                  'id': 'ex-2',
                  'activityId': 'activity-1',
                  'quizId': null,
                  'type': 'FILL_BLANK',
                  'prompt': 'Complete: ___, como estas?',
                  'order': 2,
                  'content': null,
                },
              ],
              'quizzes': [],
            },
          ],
        },
      );
      final baseUrl = await server.start();
      final api = CourseApi(ApiClient(baseUrl: baseUrl).dio);

      final lesson = await api.getLessonDetail('lesson-1');

      expect(server.lastRequest!.uri.path, '/lessons/lesson-1');
      final exercises = lesson.activities.single.exercises;
      expect(exercises, hasLength(2));
      final mcContent = exercises[0].content;
      expect(mcContent, isA<McOptionsContent>());
      expect((mcContent as McOptionsContent).options, ['Hola', 'Adiós']);
      expect(exercises[1].content, isNull);
    });

    test('submitExerciseAttempt posts { response } to POST /exercises/:id/attempts', () async {
      server = _CapturingServer(
        (request, body) => {'id': 'attempt-1', 'isCorrect': true, 'score': 1},
      );
      final baseUrl = await server.start();
      final api = CourseApi(ApiClient(baseUrl: baseUrl).dio);

      final result = await api.submitExerciseAttempt(
        exerciseId: 'ex-1',
        response: const SelectedIndexResponse(0),
      );

      expect(server.lastRequest!.uri.path, '/exercises/ex-1/attempts');
      expect(result.isCorrect, isTrue);
      expect(result.score, 1);
    });
  });
}
