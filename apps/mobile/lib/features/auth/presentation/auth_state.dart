import '../domain/auth_models.dart';

/// The app's own session state — distinct from `LoginResult` (a single
/// API response shape): this is what the UI actually renders off of,
/// including the states `LoginResult` has no opinion on (`initializing`,
/// `unauthenticated`).
sealed class AuthState {
  const AuthState();
}

class AuthInitializing extends AuthState {
  const AuthInitializing();
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

class AuthAuthenticated extends AuthState {
  const AuthAuthenticated(this.user);

  final PublicUser user;
}

class AuthMfaRequired extends AuthState {
  const AuthMfaRequired(this.challengeToken);

  final String challengeToken;
}

class AuthError extends AuthState {
  const AuthError(this.message);

  final String message;
}
