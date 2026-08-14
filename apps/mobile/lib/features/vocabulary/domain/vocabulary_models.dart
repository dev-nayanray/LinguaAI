/// Mirrors `vocabularyItemSchema` (`@linguaai/validation/vocabulary`) — the
/// catalog entry a `UserVocabularyEntry.vocabularyItemId` points at. The
/// SRS deck row itself carries no term/translation text (real, confirmed:
/// `POST .../reviews` only ever returns `easeFactor`/`intervalDays`/etc),
/// so a flashcard screen fetches this separately per card.
class VocabularyItem {
  const VocabularyItem({
    required this.id,
    required this.languageId,
    required this.term,
    required this.partOfSpeech,
    required this.translations,
    required this.audioUrl,
  });

  factory VocabularyItem.fromJson(Map<String, dynamic> json) => VocabularyItem(
    id: json['id'] as String,
    languageId: json['languageId'] as String,
    term: json['term'] as String,
    partOfSpeech: json['partOfSpeech'] as String,
    translations: (json['translations'] as Map<String, dynamic>).cast<String, dynamic>(),
    audioUrl: json['audioUrl'] as String?,
  );

  final String id;
  final String languageId;
  final String term;
  final String partOfSpeech;
  final Map<String, dynamic> translations;
  final String? audioUrl;

  /// The `translations` map is keyed by UI-language code (e.g. `"en"`) —
  /// this app has exactly one UI language at MVP (PRD.md, English), so a
  /// single best-effort lookup is the real, current scope; a multi-UI-
  /// language picker is real, later, unbuilt work, not this screen's own.
  String? translationFor(String uiLanguageCode) {
    final value = translations[uiLanguageCode];
    return value is String ? value : null;
  }
}

/// Mirrors `userVocabularyEntrySchema` — one row per (user, VocabularyItem)
/// SM-2 scheduling state.
class UserVocabularyEntry {
  const UserVocabularyEntry({
    required this.id,
    required this.vocabularyItemId,
    required this.easeFactor,
    required this.intervalDays,
    required this.repetitions,
    required this.nextReviewAt,
    required this.lastReviewedAt,
  });

  factory UserVocabularyEntry.fromJson(Map<String, dynamic> json) => UserVocabularyEntry(
    id: json['id'] as String,
    vocabularyItemId: json['vocabularyItemId'] as String,
    easeFactor: (json['easeFactor'] as num).toDouble(),
    intervalDays: json['intervalDays'] as int,
    repetitions: json['repetitions'] as int,
    nextReviewAt: json['nextReviewAt'] as String,
    lastReviewedAt: json['lastReviewedAt'] as String?,
  );

  final String id;
  final String vocabularyItemId;
  final double easeFactor;
  final int intervalDays;
  final int repetitions;
  final String nextReviewAt;
  final String? lastReviewedAt;
}

/// Mirrors `dueDeckListResponseSchema` — cursor-paginated.
class DueDeckListResult {
  const DueDeckListResult({required this.data, required this.nextCursor});

  factory DueDeckListResult.fromJson(Map<String, dynamic> json) => DueDeckListResult(
    data: (json['data'] as List<dynamic>)
        .map((entry) => UserVocabularyEntry.fromJson(entry as Map<String, dynamic>))
        .toList(),
    nextCursor: (json['meta'] as Map<String, dynamic>)['nextCursor'] as String?,
  );

  final List<UserVocabularyEntry> data;
  final String? nextCursor;
}

/// The real SM-2 input scale `submitDeckReviewRequestSchema` requires
/// (`0..5`) — the backend does zero friendlier-label mapping (its own
/// schema doc comment says so explicitly), so this screen owns the
/// "Again/Hard/Good/Easy" → integer mapping.
enum ReviewQuality {
  again(1),
  hard(3),
  good(4),
  easy(5);

  const ReviewQuality(this.value);

  final int value;
}
