import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Could not load this course.'),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(courseDetailProvider(courseId)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (detail) {
          if (detail.levels.isEmpty) {
            return const Center(child: Text('This course has no content yet.'));
          }
          return ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(detail.summary.title, style: Theme.of(context).textTheme.headlineMedium),
              ),
              for (final level in detail.levels)
                ExpansionTile(
                  title: Text('${level.title} (${level.cefrLevel})'),
                  children: [
                    for (final unit in level.units)
                      Padding(
                        padding: const EdgeInsets.only(left: 16),
                        child: ExpansionTile(
                          title: Text(unit.title),
                          children: [
                            for (final lesson in unit.lessons)
                              ListTile(
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
            ],
          );
        },
      ),
    );
  }
}
