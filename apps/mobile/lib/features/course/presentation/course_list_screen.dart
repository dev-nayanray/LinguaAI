import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'course_detail_screen.dart';
import 'course_providers.dart';

class CourseListScreen extends ConsumerWidget {
  const CourseListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coursesAsync = ref.watch(courseListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Courses')),
      body: coursesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Could not load courses.'),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.invalidate(courseListProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
        data: (result) {
          if (result.data.isEmpty) {
            return const Center(child: Text('No courses are published yet.'));
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(courseListProvider.future),
            child: ListView.builder(
              itemCount: result.data.length,
              itemBuilder: (context, index) {
                final course = result.data[index];
                return ListTile(
                  title: Text(course.title),
                  subtitle: course.description != null ? Text(course.description!) : null,
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => CourseDetailScreen(courseId: course.id),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
