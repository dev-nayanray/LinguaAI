import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/state_views.dart';
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
      return const LoadingView();
    }
    if (_errorMessage != null && _queue.isEmpty) {
      return ErrorView(message: _errorMessage!, onRetry: _loadInitial);
    }
    if (_queue.isEmpty) {
      return EmptyStateView(
        icon: Icons.celebration_outlined,
        message: _reviewedCount > 0
            ? 'All done! You reviewed $_reviewedCount card${_reviewedCount == 1 ? '' : 's'}.'
            : 'No cards are due for review right now.',
      );
    }
    final item = _currentItem;
    if (item == null) {
      return const LoadingView();
    }
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          LinearProgressIndicator(
            value: _reviewedCount == 0
                ? 0
                : _reviewedCount / (_reviewedCount + _queue.length),
            borderRadius: BorderRadius.circular(context.radii['pill']),
          ),
          const SizedBox(height: 8),
          Text('${_queue.length} card${_queue.length == 1 ? '' : 's'} left'),
          const SizedBox(height: 24),
          Expanded(
            child: Center(
              child: Card(
                color: context.appColors.surfaceElevated,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(item.term, style: Theme.of(context).textTheme.displayLarge),
                      const SizedBox(height: 16),
                      if (_revealed)
                        Text(
                          item.translationFor('en') ?? '(no English translation available)',
                          style: Theme.of(context).textTheme.headlineMedium,
                        )
                      else
                        OutlinedButton(
                          onPressed: () => setState(() => _revealed = true),
                          child: const Text('Reveal'),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (_errorMessage != null) ...[
            Text(_errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            const SizedBox(height: 16),
          ],
          if (_revealed) _buildQualityButtons(),
        ],
      ),
    );
  }

  Widget _buildQualityButtons() {
    final colors = context.appColors;
    final buttonColors = {
      ReviewQuality.again: colors.danger,
      ReviewQuality.hard: colors.warning,
      ReviewQuality.good: Theme.of(context).colorScheme.primary,
      ReviewQuality.easy: colors.success,
    };
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        for (final quality in ReviewQuality.values)
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: buttonColors[quality]),
            onPressed: _isSubmitting ? null : () => _rate(quality),
            child: Text(_labelFor(quality)),
          ),
      ],
    );
  }

  String _labelFor(ReviewQuality quality) => switch (quality) {
    ReviewQuality.again => 'Again',
    ReviewQuality.hard => 'Hard',
    ReviewQuality.good => 'Good',
    ReviewQuality.easy => 'Easy',
  };
}
