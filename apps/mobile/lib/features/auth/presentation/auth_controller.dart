import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../../../core/storage/secure_token_storage.dart';
import '../data/auth_api.dart';
import '../domain/auth_models.dart';
import 'auth_state.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(baseUrl: Env.apiBaseUrl);
});

final secureTokenStorageProvider = Provider<SecureTokenStorage>((ref) => SecureTokenStorage());

final authApiProvider = Provider<AuthApi>((ref) {
  return AuthApi(ref.watch(apiClientProvider).dio);
});

final authControllerProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

/// Owns the app's one session: the in-memory access token
/// (`ApiClient.setAccessToken`), the persisted refresh token
/// (`SecureTokenStorage`, ADR-018's "secure device storage" for mobile),
/// and the `AuthState` every screen renders off of. Wires `ApiClient`'s
/// own 401→refresh callback back to this class's `_silentRefresh`, closing
/// the circular dependency (`ApiClient` needs a refresh function;
/// `AuthController` needs `ApiClient` to make its own calls) without
/// either owning the other.
class AuthController extends Notifier<AuthState> {
  late final AuthApi _authApi;
  late final ApiClient _apiClient;
  late final SecureTokenStorage _tokenStorage;

  @override
  AuthState build() {
    _authApi = ref.watch(authApiProvider);
    _apiClient = ref.watch(apiClientProvider);
    _tokenStorage = ref.watch(secureTokenStorageProvider);
    _apiClient.refreshAccessToken = _silentRefresh;
    _apiClient.onSessionExpired = () => state = const AuthUnauthenticated();
    return const AuthInitializing();
  }

  /// Called once at app startup (`§6.2` of the E21 design doc) — a stored
  /// refresh token with no session yet is a real, ordinary case (app
  /// relaunch), not an error.
  Future<void> restoreSession() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken == null) {
      state = const AuthUnauthenticated();
      return;
    }
    try {
      final result = await _authApi.refresh(refreshToken: refreshToken);
      _apiClient.setAccessToken(result.accessToken);
      if (result.refreshToken != null) {
        await _tokenStorage.saveRefreshToken(result.refreshToken!);
      }
      final user = await _authApi.fetchCurrentUser();
      state = AuthAuthenticated(user);
    } catch (_) {
      await _tokenStorage.clear();
      state = const AuthUnauthenticated();
    }
  }

  Future<void> register({
    required String email,
    required String password,
    required String displayName,
    required String locale,
    required String timezone,
    required bool tosAccepted,
    required bool privacyPolicyAccepted,
    required bool marketingConsent,
  }) async {
    await _authApi.register(
      email: email,
      password: password,
      displayName: displayName,
      locale: locale,
      timezone: timezone,
      tosAccepted: tosAccepted,
      privacyPolicyAccepted: privacyPolicyAccepted,
      marketingConsent: marketingConsent,
    );
    await login(email: email, password: password);
  }

  Future<void> login({required String email, required String password}) async {
    final result = await _authApi.login(email: email, password: password);
    await _applyLoginResult(result);
  }

  Future<void> completeMfaChallenge({required String code}) async {
    final current = state;
    if (current is! AuthMfaRequired) {
      throw StateError('completeMfaChallenge called with no pending MFA challenge');
    }
    final result = await _authApi.mfaChallenge(
      challengeToken: current.challengeToken,
      code: code,
    );
    await _applyLoginResult(result);
  }

  Future<void> logout() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken != null) {
      try {
        await _authApi.logout(refreshToken: refreshToken);
      } catch (_) {
        // The session is being torn down client-side regardless (a failed
        // revoke call — e.g. offline — must never trap the caller signed
        // in) — the token still expires naturally within its own TTL.
      }
    }
    await _tokenStorage.clear();
    _apiClient.setAccessToken(null);
    state = const AuthUnauthenticated();
  }

  Future<void> _applyLoginResult(LoginResult result) async {
    switch (result) {
      case MfaChallengeRequired():
        state = AuthMfaRequired(result.challengeToken);
      case AuthenticatedSession():
        _apiClient.setAccessToken(result.accessToken);
        if (result.refreshToken != null) {
          await _tokenStorage.saveRefreshToken(result.refreshToken!);
        }
        state = AuthAuthenticated(result.user);
    }
  }

  Future<String?> _silentRefresh() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken == null) {
      return null;
    }
    try {
      final result = await _authApi.refresh(refreshToken: refreshToken);
      if (result.refreshToken != null) {
        await _tokenStorage.saveRefreshToken(result.refreshToken!);
      }
      return result.accessToken;
    } catch (_) {
      await _tokenStorage.clear();
      return null;
    }
  }
}
