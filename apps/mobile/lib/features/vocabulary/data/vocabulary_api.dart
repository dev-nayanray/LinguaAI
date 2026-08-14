import 'package:dio/dio.dart';

import '../domain/vocabulary_models.dart';

/// Direct HTTP client for `/v1/vocabulary*` (`apps/api/src/modules/
/// vocabulary/srs-deck.controller.ts`, `vocabulary-catalog.controller.ts`)
/// — the same plain `AuthGuard('jwt')` shape every other feature's API
/// class already targets, so `ApiClient`'s interceptor needs no changes.
class VocabularyApi {
  VocabularyApi(this._dio);

  final Dio _dio;

  Future<DueDeckListResult> listDueCards({String? cursor, int limit = 20}) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/vocabulary/deck/due',
      queryParameters: {'cursor': ?cursor, 'limit': limit},
    );
    return DueDeckListResult.fromJson(response.data!);
  }

  Future<UserVocabularyEntry> addToDeck(String vocabularyItemId) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/vocabulary/deck',
      data: {'vocabularyItemId': vocabularyItemId},
    );
    return UserVocabularyEntry.fromJson(response.data!);
  }

  Future<UserVocabularyEntry> submitReview({
    required String deckEntryId,
    required ReviewQuality quality,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/vocabulary/deck/$deckEntryId/reviews',
      data: {'quality': quality.value},
    );
    return UserVocabularyEntry.fromJson(response.data!);
  }

  Future<VocabularyItem> getVocabularyItem(String vocabularyItemId) async {
    final response = await _dio.get<Map<String, dynamic>>('/vocabulary-items/$vocabularyItemId');
    return VocabularyItem.fromJson(response.data!);
  }
}
