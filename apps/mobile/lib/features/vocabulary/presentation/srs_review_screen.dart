import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/vocabulary_models.dart';
import 'vocabulary_providers.dart';

/// A real flashcard review loop against the real SM-2 backend
/// (`POST /v1/vocabulary/deck/:id/reviews`, `quality` 0-5) — this screen
/// owns the "Again/Hard/Good/Easy" → integer mapping the backend
/// deliberately leaves to the client (`submitDeckReviewRequestSchema`'s
/// own doc comment). `UserVocabularyEntry` carries no term/translation
/// text at all, so the current card's own `VocabularyItem` is fetched
/// lazily, one at a time, as each card comes to the front of the queue.
class SrsReviewScreen extends ConsumerStatefulWidget {
  const SrsReviewScreen({super.key});

  @override
  ConsumerState<SrsReviewScreen> createState() => _SrsReviewScreenState();
}

class _SrsReviewScreenState extends ConsumerState<SrsReviewScreen> {
  bool _isLoading = true;
  String? _errorMessage;
  final List<UserVocabularyEntry> _queue = [];
  String? _nextCursor;
  VocabularyItem? _currentItem;
  bool _revealed = false;
  bool _isSubmitting = false;
  int _reviewedCount = 0;

  @override
  void initState() {
    super.initState();
    _loadInitial();
  }

  Future<void> _loadInitial() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final result = await ref.read(vocabularyApiProvider).listDueCards();
      _queue
        ..clear()
        ..addAll(result.data);
      _nextCursor = result.nextCursor;
      await _loadCurrentItem();
    } catch (_) {
      setState(() => _errorMessage = 'Could not load your review deck.');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _loadCurrentItem() async {
    if (_queue.isEmpty) {
      setState(() => _currentItem = null);
      return;
    }
    final item = await ref
        .read(vocabularyApiProvider)
        .getVocabularyItem(_queue.first.vocabularyItemId);
    if (mounted) {
      setState(() => _currentItem = item);
    }
  }

  Future<void> _rate(ReviewQuality quality) async {
    final current = _queue.first;
    setState(() => _isSubmitting = true);
    try {
      await ref
          .read(vocabularyApiProvider)
          .submitReview(deckEntryId: current.id, quality: quality);
      _queue.removeAt(0);
      _reviewedCount++;
      _revealed = false;
      if (_queue.isEmpty && _nextCursor != null) {
        final more = await ref.read(vocabularyApiProvider).listDueCards(cursor: _nextCursor);
        _queue.addAll(more.data);
        _nextCursor = more.nextCursor;
      }
      await _loadCurrentItem();
    } catch (_) {
      setState(() => _errorMessage = 'Could not save that review. Please try again.');
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Review')),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_errorMessage != null && _queue.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_errorMessage!),
            const SizedBox(height: 12),
            FilledButton(onPressed: _loadInitial, child: const Text('Retry')),
          ],
        ),
      );
    }
    if (_queue.isEmpty) {
      return Center(
        child: Text(
          _reviewedCount > 0
              ? 'All done! You reviewed $_reviewedCount card${_reviewedCount == 1 ? '' : 's'}.'
              : 'No cards are due for review right now.',
        ),
      );
    }
    final item = _currentItem;
    if (item == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text('${_queue.length} card${_queue.length == 1 ? '' : 's'} left'),
          const SizedBox(height: 32),
          Text(item.term, style: Theme.of(context).textTheme.displayLarge),
          const SizedBox(height: 16),
          if (_revealed)
            Text(
              item.translationFor('en') ?? '(no English translation available)',
              style: Theme.of(context).textTheme.headlineMedium,
            )
          else
            TextButton(onPressed: () => setState(() => _revealed = true), child: const Text('Reveal')),
          const SizedBox(height: 32),
          if (_errorMessage != null) ...[
            Text(_errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            const SizedBox(height: 16),
          ],
          if (_revealed)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (final quality in ReviewQuality.values)
                  FilledButton(
                    onPressed: _isSubmitting ? null : () => _rate(quality),
                    child: Text(_labelFor(quality)),
                  ),
              ],
            ),
        ],
      ),
    );
  }

  String _labelFor(ReviewQuality quality) => switch (quality) {
    ReviewQuality.again => 'Again',
    ReviewQuality.hard => 'Hard',
    ReviewQuality.good => 'Good',
    ReviewQuality.easy => 'Easy',
  };
}
