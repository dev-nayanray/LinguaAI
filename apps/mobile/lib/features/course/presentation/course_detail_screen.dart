import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/state_views.dart';
import 'course_providers.dart';
import 'lesson_detail_screen.dart';

class CourseDetailScreen extends ConsumerWidget {
  const CourseDetailScreen({required this.courseId, super.key});

  final String courseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(courseDetailProvider(courseId));

    return Scaffold(
      appBar: AppBar(title: const Text('Course')),
      body: detailAsync.when(
        loading: () => const LoadingView(),
        error: (error, _) => ErrorView(
          message: 'Could not load this course.',
          onRetry: () => ref.invalidate(courseDetailProvider(courseId)),
        ),
        data: (detail) {
          if (detail.levels.isEmpty) {
            return const EmptyStateView(message: 'This course has no content yet.');
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(detail.summary.title, style: Theme.of(context).textTheme.headlineLarge),
              const SizedBox(height: 16),
              for (final level in detail.levels)
                Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  clipBehavior: Clip.antiAlias,
                  child: ExpansionTile(
                    leading: CircleAvatar(
                      backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
                      child: Text(
                        level.cefrLevel,
                        style: TextStyle(color: Theme.of(context).colorScheme.primary, fontSize: 12),
                      ),
                    ),
                    title: Text(level.title),
                    children: [
                      for (final unit in level.units)
                        Padding(
                          padding: const EdgeInsets.only(left: 16),
                          child: ExpansionTile(
                            title: Text(unit.title),
                            children: [
                              for (final lesson in unit.lessons)
                                ListTile(
                                  leading: const Icon(Icons.play_circle_outline),
                                  title: Text(lesson.title),
                                  trailing: const Icon(Icons.chevron_right),
                                  onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute<void>(
                                      builder: (_) => LessonDetailScreen(lessonId: lesson.id),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
