import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/vocabulary/data/vocabulary_api.dart';
import 'package:mobile/features/vocabulary/domain/vocabulary_models.dart';
import 'package:mobile/features/vocabulary/presentation/srs_review_screen.dart';
import 'package:mobile/features/vocabulary/presentation/vocabulary_providers.dart';
import 'package:mocktail/mocktail.dart';

class _MockVocabularyApi extends Mock implements VocabularyApi {}

const _entry1 = UserVocabularyEntry(
  id: 'entry-1',
  vocabularyItemId: 'item-1',
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  nextReviewAt: '2026-01-01T00:00:00.000Z',
  lastReviewedAt: null,
);

const _item1 = VocabularyItem(
  id: 'item-1',
  languageId: 'lang-1',
  term: 'hola',
  partOfSpeech: 'INTERJECTION',
  translations: {'en': 'hello'},
  audioUrl: null,
);

void main() {
  setUpAll(() {
    registerFallbackValue(ReviewQuality.good);
  });

  testWidgets('reveals the translation, then rating submits the real quality and advances', (
    tester,
  ) async {
    final api = _MockVocabularyApi();
    when(() => api.listDueCards()).thenAnswer(
      (_) async => const DueDeckListResult(data: [_entry1], nextCursor: null),
    );
    when(() => api.getVocabularyItem('item-1')).thenAnswer((_) async => _item1);
    when(
      () => api.submitReview(deckEntryId: 'entry-1', quality: ReviewQuality.good),
    ).thenAnswer((_) async => const UserVocabularyEntry(
      id: 'entry-1',
      vocabularyItemId: 'item-1',
      easeFactor: 2.6,
      intervalDays: 1,
      repetitions: 1,
      nextReviewAt: '2026-01-02T00:00:00.000Z',
      lastReviewedAt: '2026-01-01T00:00:00.000Z',
    ));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [vocabularyApiProvider.overrideWithValue(api)],
        child: const MaterialApp(home: SrsReviewScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('hola'), findsOneWidget);
    expect(find.text('hello'), findsNothing);

    await tester.tap(find.text('Reveal'));
    await tester.pump();
    expect(find.text('hello'), findsOneWidget);

    await tester.tap(find.text('Good'));
    await tester.pumpAndSettle();

    verify(() => api.submitReview(deckEntryId: 'entry-1', quality: ReviewQuality.good)).called(1);
    expect(find.text('All done! You reviewed 1 card.'), findsOneWidget);
  });

  testWidgets('shows a real empty state when nothing is due', (tester) async {
    final api = _MockVocabularyApi();
    when(
      () => api.listDueCards(),
    ).thenAnswer((_) async => const DueDeckListResult(data: [], nextCursor: null));

    await tester.pumpWidget(
      ProviderScope(
        overrides: [vocabularyApiProvider.overrideWithValue(api)],
        child: const MaterialApp(home: SrsReviewScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No cards are due for review right now.'), findsOneWidget);
  });
}
