import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'core/theme/design_tokens.dart';
import 'core/widgets/home_shell.dart';
import 'features/auth/presentation/auth_controller.dart';
import 'features/auth/presentation/auth_state.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/auth/presentation/mfa_challenge_screen.dart';

final designTokensProvider = FutureProvider<DesignTokens>((ref) => DesignTokens.load());

class App extends ConsumerStatefulWidget {
  const App({super.key});

  @override
  ConsumerState<App> createState() => _AppState();
}

class _AppState extends ConsumerState<App> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(authControllerProvider.notifier).restoreSession());
  }

  @override
  Widget build(BuildContext context) {
    final tokensAsync = ref.watch(designTokensProvider);

    return tokensAsync.when(
      loading: () => const MaterialApp(home: Scaffold(body: Center(child: CircularProgressIndicator()))),
      error: (error, _) => MaterialApp(
        home: Scaffold(body: Center(child: Text('Failed to load app theme: $error'))),
      ),
      data: (tokens) => MaterialApp(
        title: 'LinguaAI',
        theme: AppTheme.light(tokens),
        darkTheme: AppTheme.dark(tokens),
        home: const _AuthGate(),
      ),
    );
  }
}

class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authControllerProvider);
    return switch (authState) {
      AuthInitializing() => const Scaffold(body: Center(child: CircularProgressIndicator())),
      AuthUnauthenticated() => const LoginScreen(),
      AuthMfaRequired() => const MfaChallengeScreen(),
      AuthAuthenticated() => const HomeShell(),
      AuthError(:final message) => Scaffold(body: Center(child: Text(message))),
    };
  }
}
