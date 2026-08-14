import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/option_card.dart';
import '../domain/course_models.dart';
import 'course_providers.dart';

class ExerciseScreen extends ConsumerStatefulWidget {
  const ExerciseScreen({required this.exercise, super.key});

  final ExercisePublicView exercise;

  @override
  ConsumerState<ExerciseScreen> createState() => _ExerciseScreenState();
}

class _ExerciseScreenState extends ConsumerState<ExerciseScreen> {
  int? _selectedIndex;
  final _textController = TextEditingController();
  String? _selectedLeftItem;
  final List<MatchPair> _matches = [];
  bool _isSubmitting = false;
  AttemptOutcome? _outcome;
  String? _errorMessage;

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  ExerciseResponseValue? _buildResponse() {
    switch (widget.exercise.type) {
      case 'MULTIPLE_CHOICE':
      case 'LISTENING_COMPREHENSION':
        return _selectedIndex != null ? SelectedIndexResponse(_selectedIndex!) : null;
      case 'FILL_BLANK':
      case 'TRANSLATION':
        return _textController.text.trim().isNotEmpty ? TextResponse(_textController.text.trim()) : null;
      case 'MATCHING':
        final content = widget.exercise.content;
        final expectedCount = content is MatchingItemsContent ? content.leftItems.length : 0;
        return _matches.length == expectedCount && expectedCount > 0
            ? MatchesResponse(List.of(_matches))
            : null;
      default:
        return null;
    }
  }

  Future<void> _submit() async {
    final response = _buildResponse();
    if (response == null) {
      return;
    }
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });
    try {
      final outcome = await ref
          .read(exerciseAttemptServiceProvider)
          .submit(widget.exercise.id, response);
      setState(() => _outcome = outcome);
    } catch (_) {
      setState(() => _errorMessage = 'Could not submit your answer. Please try again.');
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Exercise')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            Card(
              color: context.appColors.surfaceMuted,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(widget.exercise.prompt, style: Theme.of(context).textTheme.headlineMedium),
              ),
            ),
            const SizedBox(height: 20),
            ..._buildInput(),
            if (_errorMessage != null) ...[
              const SizedBox(height: 16),
              Text(_errorMessage!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            if (_outcome != null) ...[const SizedBox(height: 16), _buildOutcomeBanner()],
            const SizedBox(height: 24),
            if (_outcome == null && widget.exercise.type != 'SPEAKING_PROMPT')
              FilledButton(
                onPressed: _isSubmitting || _buildResponse() == null ? null : _submit,
                child: _isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Submit'),
              ),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildInput() {
    switch (widget.exercise.type) {
      case 'MULTIPLE_CHOICE':
      case 'LISTENING_COMPREHENSION':
        final content = widget.exercise.content;
        if (content is! McOptionsContent) {
          return const [_UnsupportedExerciseNotice()];
        }
        return [
          for (var i = 0; i < content.options.length; i++)
            OptionCard(
              label: content.options[i],
              selected: _selectedIndex == i,
              onTap: _outcome == null ? () => setState(() => _selectedIndex = i) : null,
              state: _optionState(i),
            ),
        ];
      case 'FILL_BLANK':
      case 'TRANSLATION':
        return [
          TextField(
            controller: _textController,
            enabled: _outcome == null,
            decoration: const InputDecoration(labelText: 'Your answer'),
            onChanged: (_) => setState(() {}),
          ),
        ];
      case 'MATCHING':
        final content = widget.exercise.content;
        if (content is! MatchingItemsContent) {
          return const [_UnsupportedExerciseNotice()];
        }
        return _buildMatchingInput(content);
      case 'SPEAKING_PROMPT':
        return const [
          Text('Speaking exercises are not yet supported on mobile (a real, tracked follow-up).'),
        ];
      default:
        return const [_UnsupportedExerciseNotice()];
    }
  }

  OptionCardState _optionState(int index) {
    final outcome = _outcome;
    if (outcome is! AttemptScored || _selectedIndex != index) {
      return OptionCardState.neutral;
    }
    return outcome.result.isCorrect ? OptionCardState.correct : OptionCardState.incorrect;
  }

  List<Widget> _buildMatchingInput(MatchingItemsContent content) {
    final pairedLeft = _matches.map((m) => m.left).toSet();
    final pairedRight = _matches.map((m) => m.right).toSet();

    void selectRight(String right) {
      if (_selectedLeftItem == null || _outcome != null) {
        return;
      }
      setState(() {
        _matches.add(MatchPair(left: _selectedLeftItem!, right: right));
        _selectedLeftItem = null;
      });
    }

    return [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              children: [
                for (final left in content.leftItems)
                  if (!pairedLeft.contains(left))
                    OptionCard(
                      label: left,
                      selected: _selectedLeftItem == left,
                      onTap: _outcome == null ? () => setState(() => _selectedLeftItem = left) : null,
                    ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              children: [
                for (final right in content.rightItems)
                  if (!pairedRight.contains(right))
                    OptionCard(label: right, selected: false, onTap: () => selectRight(right)),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 8),
      for (final pair in _matches)
        Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            title: Text('${pair.left} → ${pair.right}'),
            trailing: _outcome == null
                ? IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => setState(() => _matches.remove(pair)),
                  )
                : null,
          ),
        ),
    ];
  }

  Widget _buildOutcomeBanner() {
    final outcome = _outcome!;
    final colors = context.appColors;
    return switch (outcome) {
      AttemptScored(:final result) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: result.isCorrect ? colors.success.withValues(alpha: 0.12) : colors.danger.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(context.radii['md']),
        ),
        child: Row(
          children: [
            Icon(
              result.isCorrect ? Icons.check_circle : Icons.cancel,
              color: result.isCorrect ? colors.success : colors.danger,
            ),
            const SizedBox(width: 12),
            Text(result.isCorrect ? 'Correct!' : 'Not quite — keep practicing.'),
          ],
        ),
      ),
      AttemptQueued() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colors.warning.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(context.radii['md']),
        ),
        child: Row(
          children: [
            Icon(Icons.cloud_off, color: colors.warning),
            const SizedBox(width: 12),
            const Expanded(child: Text("Saved offline — this will sync once you're back online.")),
          ],
        ),
      ),
    };
  }
}

class _UnsupportedExerciseNotice extends StatelessWidget {
  const _UnsupportedExerciseNotice();

  @override
  Widget build(BuildContext context) {
    return const Text(
      "This exercise can't be answered yet — its content isn't available.",
    );
  }
}
