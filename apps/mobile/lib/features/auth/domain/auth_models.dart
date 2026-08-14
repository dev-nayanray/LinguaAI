/// Mirrors `packages/validation/src/identity/index.ts`'s `publicUserSchema`
/// field-for-field — the same contract `apps/web` already consumes.
class PublicUser {
  const PublicUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.avatarUrl,
    required this.locale,
    required this.timezone,
    required this.role,
    required this.status,
    required this.mfaEnrolled,
    required this.organizationId,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PublicUser.fromJson(Map<String, dynamic> json) => PublicUser(
    id: json['id'] as String,
    email: json['email'] as String,
    displayName: json['displayName'] as String,
    avatarUrl: json['avatarUrl'] as String?,
    locale: json['locale'] as String,
    timezone: json['timezone'] as String,
    role: json['role'] as String,
    status: json['status'] as String,
    mfaEnrolled: json['mfaEnrolled'] as bool,
    organizationId: json['organizationId'] as String?,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );

  final String id;
  final String email;
  final String displayName;
  final String? avatarUrl;
  final String locale;
  final String timezone;
  final String role;
  final String status;
  final bool mfaEnrolled;
  final String? organizationId;
  final String createdAt;
  final String updatedAt;
}

/// Mirrors `loginResponseSchema`'s discriminated union
/// (`packages/validation/src/identity/index.ts`) — `AuthenticatedSession`
/// only ever carries a `refreshToken` for the mobile transport
/// (`X-Client-Platform: mobile`, E21 T1's own found gap/fix); web-shaped
/// responses (no header, cookie-only) parse with `refreshToken: null`.
sealed class LoginResult {
  const LoginResult();

  factory LoginResult.fromJson(Map<String, dynamic> json) {
    final status = json['status'] as String;
    return switch (status) {
      'AUTHENTICATED' => AuthenticatedSession(
        accessToken: json['accessToken'] as String,
        user: PublicUser.fromJson(json['user'] as Map<String, dynamic>),
        refreshToken: json['refreshToken'] as String?,
      ),
      'MFA_REQUIRED' => MfaChallengeRequired(challengeToken: json['challengeToken'] as String),
      _ => throw FormatException('Unknown login response status: $status'),
    };
  }
}

class AuthenticatedSession extends LoginResult {
  const AuthenticatedSession({required this.accessToken, required this.user, this.refreshToken});

  final String accessToken;
  final PublicUser user;
  final String? refreshToken;
}

class MfaChallengeRequired extends LoginResult {
  const MfaChallengeRequired({required this.challengeToken});

  final String challengeToken;
}

/// Mirrors `refreshResponseSchema` — `refreshToken` is only ever present
/// for the mobile (body, no cookie) transport (E21 T1).
class RefreshResult {
  const RefreshResult({required this.accessToken, this.refreshToken});

  factory RefreshResult.fromJson(Map<String, dynamic> json) => RefreshResult(
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String?,
  );

  final String accessToken;
  final String? refreshToken;
}
