import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_controller.dart';
import 'auth_state.dart';

/// A real, minimal proof that a session survives past login — the course
/// consumption/exercise-attempt screens this stub will be replaced by are
/// T2's own scope (docs/epics/E21-mobile-application.md §9), not T1's.
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
        child: Text(user != null ? 'Welcome, ${user.displayName}' : 'Signed in'),
      ),
    );
  }
}
