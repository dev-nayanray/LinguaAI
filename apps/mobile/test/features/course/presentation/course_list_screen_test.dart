import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/course/domain/course_models.dart';
import 'package:mobile/features/course/presentation/course_list_screen.dart';
import 'package:mobile/features/course/presentation/course_providers.dart';

void main() {
  testWidgets('renders real course titles once the list loads', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          courseListProvider.overrideWith(
            (ref) async => const CourseListResult(
              data: [
                CourseSummary(
                  id: 'course-1',
                  languageId: 'lang-1',
                  title: 'Spanish for Travel',
                  description: 'Learn the basics',
                  slug: 'spanish-for-travel',
                  publishedAt: '2026-01-01T00:00:00.000Z',
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                ),
              ],
              page: 1,
              pageSize: 100,
              total: 1,
            ),
          ),
        ],
        child: const MaterialApp(home: CourseListScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Spanish for Travel'), findsOneWidget);
    expect(find.text('Learn the basics'), findsOneWidget);
  });

  testWidgets('shows a real empty state when no courses are published', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          courseListProvider.overrideWith(
            (ref) async => const CourseListResult(data: [], page: 1, pageSize: 100, total: 0),
          ),
        ],
        child: const MaterialApp(home: CourseListScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No courses are published yet.'), findsOneWidget);
  });

  testWidgets('shows a real error state with a retry action on failure', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          courseListProvider.overrideWith((ref) async => throw Exception('network down')),
        ],
        child: const MaterialApp(home: CourseListScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Could not load courses.'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });
}
