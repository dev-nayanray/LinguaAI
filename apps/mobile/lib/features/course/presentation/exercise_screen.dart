import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
            Text(widget.exercise.prompt, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 24),
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
          RadioGroup<int>(
            groupValue: _selectedIndex,
            onChanged: (value) {
              if (_outcome == null) {
                setState(() => _selectedIndex = value);
              }
            },
            child: Column(
              children: [
                for (var i = 0; i < content.options.length; i++)
                  RadioListTile<int>(title: Text(content.options[i]), value: i),
              ],
            ),
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
                    ListTile(
                      title: Text(left),
                      selected: _selectedLeftItem == left,
                      onTap: _outcome == null ? () => setState(() => _selectedLeftItem = left) : null,
                    ),
              ],
            ),
          ),
          Expanded(
            child: Column(
              children: [
                for (final right in content.rightItems)
                  if (!pairedRight.contains(right))
                    ListTile(title: Text(right), onTap: () => selectRight(right)),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 16),
      for (final pair in _matches)
        ListTile(
          title: Text('${pair.left} → ${pair.right}'),
          trailing: _outcome == null
              ? IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() => _matches.remove(pair)),
                )
              : null,
        ),
    ];
  }

  Widget _buildOutcomeBanner() {
    final outcome = _outcome!;
    return switch (outcome) {
      AttemptScored(:final result) => Container(
        padding: const EdgeInsets.all(16),
        color: result.isCorrect
            ? Theme.of(context).colorScheme.secondary.withValues(alpha: 0.15)
            : Theme.of(context).colorScheme.error.withValues(alpha: 0.15),
        child: Text(result.isCorrect ? 'Correct!' : 'Not quite — keep practicing.'),
      ),
      AttemptQueued() => Container(
        padding: const EdgeInsets.all(16),
        color: Theme.of(context).colorScheme.secondary.withValues(alpha: 0.15),
        child: const Text("Saved offline — this will sync once you're back online."),
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
