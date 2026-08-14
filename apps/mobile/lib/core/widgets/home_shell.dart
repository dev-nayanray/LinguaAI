import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/auth_state.dart';
import '../../features/course/presentation/course_list_screen.dart';
import '../../features/notifications/presentation/notifications_providers.dart';
import '../../features/progress/presentation/progress_screen.dart';
import '../../features/vocabulary/presentation/srs_review_screen.dart';
import '../config/env.dart';
import '../theme/app_theme.dart';

/// The real post-login navigation shell (replaces the old button-list
/// `HomeScreen`) — a Material 3 bottom `NavigationBar` across the app's four
/// top-level destinations, each kept alive in an `IndexedStack` so switching
/// tabs doesn't re-trigger a course/review/progress fetch every time. Also
/// the real call site for `DeviceTokenRegistrar.registerIfAvailable()`
/// (E21 T4) — a genuine no-op today (`UnavailablePushTokenProvider`, no real
/// Firebase project in this environment), but a real, tested, correctly
/// wired integration point for whenever one exists.
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  static const _destinations = [
    NavigationDestination(icon: Icon(Icons.menu_book_outlined), selectedIcon: Icon(Icons.menu_book), label: 'Learn'),
    NavigationDestination(icon: Icon(Icons.style_outlined), selectedIcon: Icon(Icons.style), label: 'Review'),
    NavigationDestination(
      icon: Icon(Icons.emoji_events_outlined),
      selectedIcon: Icon(Icons.emoji_events),
      label: 'Progress',
    ),
    NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
  ];

  @override
  void initState() {
    super.initState();
    ref.read(deviceTokenRegistrarProvider).registerIfAvailable();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(
          index: _index,
          children: const [CourseListScreen(), SrsReviewScreen(), ProgressScreen(), _ProfileTab()],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: _destinations,
      ),
    );
  }
}

class _ProfileTab extends ConsumerWidget {
  const _ProfileTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(authControllerProvider);
    final user = state is AuthAuthenticated ? state.user : null;
    final colors = context.appColors;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.15),
                    child: Text(
                      (user?.displayName.isNotEmpty ?? false) ? user!.displayName[0].toUpperCase() : '?',
                      style: Theme.of(
                        context,
                      ).textTheme.headlineMedium!.copyWith(color: Theme.of(context).colorScheme.primary),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user?.displayName ?? 'Signed in', style: Theme.of(context).textTheme.headlineMedium),
                        if (user != null) Text(user.email, style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Environment'),
                  Chip(
                    label: Text(Env.current.name),
                    backgroundColor: colors.ai.withValues(alpha: 0.12),
                    labelStyle: TextStyle(color: colors.ai, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
            label: const Text('Log out'),
          ),
        ],
      ),
    );
  }
}
