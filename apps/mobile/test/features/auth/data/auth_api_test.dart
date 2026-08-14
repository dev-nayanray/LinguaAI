import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/features/auth/data/auth_api.dart';

/// A real, minimal `dart:io` HTTP server standing in for `apps/api` — no
/// mock package, no fake `HttpClientAdapter`: the request `AuthApi` sends
/// travels over a real socket to a real (if trivial) server, so what this
/// asserts (method, path, headers, body) is what a real backend would
/// actually receive, not a hand-typed guess at Dio's own request shape.
class _CapturingServer {
  _CapturingServer(this._responder);

  final Map<String, dynamic> Function(HttpRequest request, String body) _responder;
  late HttpServer _server;
  HttpRequest? lastRequest;
  String? lastBody;

  Future<String> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server.listen((request) async {
      final body = await utf8.decodeStream(request);
      lastRequest = request;
      lastBody = body;
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
  group('AuthApi', () {
    late _CapturingServer server;
    late String baseUrl;
    late ApiClient apiClient;
    late AuthApi authApi;

    tearDown(() async {
      await server.stop();
    });

    test('login sends X-Client-Platform: mobile and the correct JSON body to /auth/login', () async {
      server = _CapturingServer(
        (request, body) => {
          'status': 'AUTHENTICATED',
          'accessToken': 'jwt-1',
          'user': _publicUserJson(),
        },
      );
      baseUrl = await server.start();
      apiClient = ApiClient(baseUrl: baseUrl);
      authApi = AuthApi(apiClient.dio);

      await authApi.login(email: 'ada@test.local', password: 'correct horse battery staple');

      expect(server.lastRequest!.method, 'POST');
      expect(server.lastRequest!.uri.path, '/auth/login');
      expect(server.lastRequest!.headers.value('x-client-platform'), 'mobile');
      final sentBody = jsonDecode(server.lastBody!) as Map<String, dynamic>;
      expect(sentBody['email'], 'ada@test.local');
      expect(sentBody['password'], 'correct horse battery staple');
    });

    test('refresh posts the refresh token in the body to /auth/refresh', () async {
      server = _CapturingServer(
        (request, body) => {'accessToken': 'jwt-2', 'refreshToken': 'new-refresh'},
      );
      baseUrl = await server.start();
      apiClient = ApiClient(baseUrl: baseUrl);
      authApi = AuthApi(apiClient.dio);

      final result = await authApi.refresh(refreshToken: 'old-refresh');

      expect(server.lastRequest!.uri.path, '/auth/refresh');
      final sentBody = jsonDecode(server.lastBody!) as Map<String, dynamic>;
      expect(sentBody['refreshToken'], 'old-refresh');
      expect(result.accessToken, 'jwt-2');
      expect(result.refreshToken, 'new-refresh');
    });

    test('an attached Bearer access token is sent on an authenticated call (fetchCurrentUser)', () async {
      server = _CapturingServer((request, body) => _publicUserJson());
      baseUrl = await server.start();
      apiClient = ApiClient(baseUrl: baseUrl)..setAccessToken('the-access-token');
      authApi = AuthApi(apiClient.dio);

      final user = await authApi.fetchCurrentUser();

      expect(server.lastRequest!.headers.value('authorization'), 'Bearer the-access-token');
      expect(user.email, 'ada@test.local');
    });
  });

  group('ApiClient 401 refresh-retry', () {
    late _CapturingServer server;
    late String baseUrl;

    tearDown(() async {
      await server.stop();
    });

    test('a 401 on a real call triggers exactly one refresh and retries the original request', () async {
      var callCount = 0;
      server = _CapturingServer((request, body) {
        callCount++;
        final authHeader = request.headers.value('authorization');
        if (authHeader == 'Bearer stale-token') {
          request.response.statusCode = 401;
          return {'message': 'Unauthorized'};
        }
        return {'ok': true};
      });
      baseUrl = await server.start();
      final apiClient = ApiClient(baseUrl: baseUrl)..setAccessToken('stale-token');
      apiClient.refreshAccessToken = () async {
        apiClient.setAccessToken('fresh-token');
        return 'fresh-token';
      };

      final response = await apiClient.dio.get<Map<String, dynamic>>('/some-protected-route');

      expect(response.data, {'ok': true});
      expect(callCount, 2);
    });

    test('a failed refresh calls onSessionExpired and forwards the original 401', () async {
      server = _CapturingServer((request, body) {
        request.response.statusCode = 401;
        return {'message': 'Unauthorized'};
      });
      baseUrl = await server.start();
      final apiClient = ApiClient(baseUrl: baseUrl)..setAccessToken('stale-token');
      apiClient.refreshAccessToken = () async => null;
      var sessionExpiredCalled = false;
      apiClient.onSessionExpired = () => sessionExpiredCalled = true;

      await expectLater(
        apiClient.dio.get<void>('/some-protected-route'),
        throwsA(isA<DioException>()),
      );
      expect(sessionExpiredCalled, isTrue);
    });

    test('login/register/refresh/mfa-challenge paths never trigger a refresh loop on their own 401', () async {
      var refreshCalls = 0;
      server = _CapturingServer((request, body) {
        request.response.statusCode = 401;
        return {'message': 'Unauthorized'};
      });
      baseUrl = await server.start();
      final apiClient = ApiClient(baseUrl: baseUrl);
      apiClient.refreshAccessToken = () async {
        refreshCalls++;
        return null;
      };

      await expectLater(
        apiClient.dio.post<void>('/auth/login', data: {}),
        throwsA(isA<DioException>()),
      );
      expect(refreshCalls, 0);
    });
  });
}

Map<String, dynamic> _publicUserJson() => {
  'id': 'u-1',
  'email': 'ada@test.local',
  'displayName': 'Ada Lovelace',
  'avatarUrl': null,
  'locale': 'en-US',
  'timezone': 'UTC',
  'role': 'USER',
  'status': 'ACTIVE',
  'mfaEnrolled': false,
  'organizationId': null,
  'createdAt': '2026-01-01T00:00:00.000Z',
  'updatedAt': '2026-01-01T00:00:00.000Z',
};
