import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/features/vocabulary/data/vocabulary_api.dart';
import 'package:mobile/features/vocabulary/domain/vocabulary_models.dart';

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
  group('VocabularyApi', () {
    late _CapturingServer server;

    tearDown(() async {
      await server.stop();
    });

    test('listDueCards sends cursor/limit query params to GET /vocabulary/deck/due', () async {
      server = _CapturingServer(
        (request, body) => {
          'data': [
            {
              'id': 'entry-1',
              'vocabularyItemId': 'item-1',
              'easeFactor': 2.5,
              'intervalDays': 0,
              'repetitions': 0,
              'nextReviewAt': '2026-01-01T00:00:00.000Z',
              'lastReviewedAt': null,
            },
          ],
          'meta': {'nextCursor': 'cursor-2'},
        },
      );
      final baseUrl = await server.start();
      final api = VocabularyApi(ApiClient(baseUrl: baseUrl).dio);

      final result = await api.listDueCards(cursor: 'cursor-1', limit: 10);

      expect(server.lastRequest!.uri.path, '/vocabulary/deck/due');
      expect(server.lastRequest!.uri.queryParameters['cursor'], 'cursor-1');
      expect(server.lastRequest!.uri.queryParameters['limit'], '10');
      expect(result.data, hasLength(1));
      expect(result.nextCursor, 'cursor-2');
    });

    test('listDueCards omits the cursor param entirely when null (first page)', () async {
      server = _CapturingServer((request, body) => {'data': [], 'meta': {'nextCursor': null}});
      final baseUrl = await server.start();
      final api = VocabularyApi(ApiClient(baseUrl: baseUrl).dio);

      await api.listDueCards();

      expect(server.lastRequest!.uri.queryParameters.containsKey('cursor'), isFalse);
    });

    test('addToDeck posts vocabularyItemId to POST /vocabulary/deck', () async {
      server = _CapturingServer(
        (request, body) => {
          'id': 'entry-1',
          'vocabularyItemId': 'item-1',
          'easeFactor': 2.5,
          'intervalDays': 0,
          'repetitions': 0,
          'nextReviewAt': '2026-01-01T00:00:00.000Z',
          'lastReviewedAt': null,
        },
      );
      final baseUrl = await server.start();
      final api = VocabularyApi(ApiClient(baseUrl: baseUrl).dio);

      await api.addToDeck('item-1');

      expect(server.lastRequest!.uri.path, '/vocabulary/deck');
      expect(server.lastRequest!.method, 'POST');
      final sentBody = jsonDecode(server.lastBody!) as Map<String, dynamic>;
      expect(sentBody, {'vocabularyItemId': 'item-1'});
    });

    test('submitReview posts the real SM-2 quality integer to POST /vocabulary/deck/:id/reviews', () async {
      server = _CapturingServer(
        (request, body) => {
          'id': 'entry-1',
          'vocabularyItemId': 'item-1',
          'easeFactor': 2.6,
          'intervalDays': 1,
          'repetitions': 1,
          'nextReviewAt': '2026-01-02T00:00:00.000Z',
          'lastReviewedAt': '2026-01-01T00:00:00.000Z',
        },
      );
      final baseUrl = await server.start();
      final api = VocabularyApi(ApiClient(baseUrl: baseUrl).dio);

      final result = await api.submitReview(deckEntryId: 'entry-1', quality: ReviewQuality.good);

      expect(server.lastRequest!.uri.path, '/vocabulary/deck/entry-1/reviews');
      final sentBody = jsonDecode(server.lastBody!) as Map<String, dynamic>;
      expect(sentBody, {'quality': 4});
      expect(result.repetitions, 1);
    });

    test('getVocabularyItem requests GET /vocabulary-items/:id and parses translations', () async {
      server = _CapturingServer(
        (request, body) => {
          'id': 'item-1',
          'languageId': 'lang-1',
          'term': 'hola',
          'partOfSpeech': 'INTERJECTION',
          'translations': {'en': 'hello'},
          'audioUrl': null,
        },
      );
      final baseUrl = await server.start();
      final api = VocabularyApi(ApiClient(baseUrl: baseUrl).dio);

      final item = await api.getVocabularyItem('item-1');

      expect(server.lastRequest!.uri.path, '/vocabulary-items/item-1');
      expect(item.term, 'hola');
      expect(item.translationFor('en'), 'hello');
      expect(item.translationFor('fr'), isNull);
    });
  });
}
