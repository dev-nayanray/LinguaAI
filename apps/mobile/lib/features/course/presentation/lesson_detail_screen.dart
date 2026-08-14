import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/section_header.dart';
import '../../../core/widgets/state_views.dart';
import 'course_providers.dart';
import 'exercise_screen.dart';

class LessonDetailScreen extends ConsumerWidget {
  const LessonDetailScreen({required this.lessonId, super.key});

  final String lessonId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lessonAsync = ref.watch(lessonDetailProvider(lessonId));

    return Scaffold(
      appBar: AppBar(title: const Text('Lesson')),
      body: lessonAsync.when(
        loading: () => const LoadingView(),
        error: (error, _) => ErrorView(
          message: 'Could not load this lesson.',
          onRetry: () => ref.invalidate(lessonDetailProvider(lessonId)),
        ),
        data: (lesson) {
          final exercises = lesson.activities.expand((activity) => activity.exercises).toList();
          if (exercises.isEmpty) {
            return const EmptyStateView(message: 'This lesson has no exercises yet.');
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(lesson.summary.title, style: Theme.of(context).textTheme.headlineLarge),
              const SizedBox(height: 20),
              for (final activity in lesson.activities) ...[
                SectionHeader(activity.title),
                for (final exercise in activity.exercises)
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundColor: Theme.of(context).colorScheme.secondary.withValues(alpha: 0.12),
                        child: Icon(
                          _iconFor(exercise.type),
                          size: 18,
                          color: Theme.of(context).colorScheme.secondary,
                        ),
                      ),
                      title: Text(exercise.prompt),
                      subtitle: Text(exercise.type),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(builder: (_) => ExerciseScreen(exercise: exercise)),
                      ),
                    ),
                  ),
                const SizedBox(height: 12),
              ],
            ],
          );
        },
      ),
    );
  }

  IconData _iconFor(String exerciseType) => switch (exerciseType) {
    'MULTIPLE_CHOICE' => Icons.check_box_outlined,
    'LISTENING_COMPREHENSION' => Icons.headphones_outlined,
    'FILL_BLANK' => Icons.edit_outlined,
    'TRANSLATION' => Icons.translate,
    'MATCHING' => Icons.compare_arrows,
    'SPEAKING_PROMPT' => Icons.mic_none_outlined,
    _ => Icons.quiz_outlined,
  };
}
