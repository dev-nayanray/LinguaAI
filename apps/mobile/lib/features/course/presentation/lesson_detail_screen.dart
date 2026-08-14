import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Could not load this lesson.'),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(lessonDetailProvider(lessonId)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (lesson) {
          final exercises = lesson.activities.expand((activity) => activity.exercises).toList();
          if (exercises.isEmpty) {
            return const Center(child: Text('This lesson has no exercises yet.'));
          }
          return ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  lesson.summary.title,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ),
              for (final activity in lesson.activities) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Text(activity.title, style: Theme.of(context).textTheme.bodyLarge),
                ),
                for (final exercise in activity.exercises)
                  ListTile(
                    title: Text(exercise.prompt),
                    subtitle: Text(exercise.type),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(builder: (_) => ExerciseScreen(exercise: exercise)),
                    ),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }
}
