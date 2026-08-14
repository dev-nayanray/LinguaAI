import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../course/presentation/course_list_screen.dart';
import '../../progress/presentation/progress_screen.dart';
import '../../vocabulary/presentation/srs_review_screen.dart';
import 'auth_controller.dart';
import 'auth_state.dart';

/// A real, minimal home screen — the actual course-browsing (E21 T2),
/// vocabulary-review, and progress UIs (E21 T3) live in their own
/// features; this screen is the entry point into each, plus a real proof
/// the session survives past login (the caller's own name, sourced from
/// the real `AuthAuthenticated` state).
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(authControllerProvider);
    final user = state is AuthAuthenticated ? state.user : null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('LinguaAI'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
        ],
      ),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(user != null ? 'Welcome, ${user.displayName}' : 'Signed in'),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const CourseListScreen()),
              ),
              child: const Text('Browse courses'),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const SrsReviewScreen()),
              ),
              child: const Text('Review vocabulary'),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const ProgressScreen()),
              ),
              child: const Text('My progress'),
            ),
          ],
        ),
      ),
    );
  }
}
