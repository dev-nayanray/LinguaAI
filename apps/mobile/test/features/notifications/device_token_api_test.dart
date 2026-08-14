import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/features/notifications/data/device_token_api.dart';

class _CapturingServer {
  _CapturingServer(this._responder);

  final void Function(HttpRequest request, String body) _responder;
  late HttpServer _server;
  HttpRequest? lastRequest;
  String? lastBody;

  Future<String> start() async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server.listen((request) async {
      final body = await utf8.decodeStream(request);
      lastRequest = request;
      lastBody = body;
      _responder(request, body);
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({}));
      await request.response.close();
    });
    return 'http://${_server.address.address}:${_server.port}';
  }

  Future<void> stop() => _server.close();
}

void main() {
  group('DeviceTokenApi', () {
    late _CapturingServer server;

    tearDown(() async {
      await server.stop();
    });

    test('register posts { platform, token } to POST /notifications/device-tokens', () async {
      server = _CapturingServer((request, body) {});
      final baseUrl = await server.start();
      final api = DeviceTokenApi(ApiClient(baseUrl: baseUrl).dio);

      await api.register(platform: 'ANDROID', token: 'fcm-token-1');

      expect(server.lastRequest!.uri.path, '/notifications/device-tokens');
      expect(server.lastRequest!.method, 'POST');
      expect(jsonDecode(server.lastBody!), {'platform': 'ANDROID', 'token': 'fcm-token-1'});
    });

    test('unregister sends DELETE /notifications/device-tokens/:token', () async {
      server = _CapturingServer((request, body) {});
      final baseUrl = await server.start();
      final api = DeviceTokenApi(ApiClient(baseUrl: baseUrl).dio);

      await api.unregister('fcm-token-1');

      expect(server.lastRequest!.uri.path, '/notifications/device-tokens/fcm-token-1');
      expect(server.lastRequest!.method, 'DELETE');
    });
  });
}
