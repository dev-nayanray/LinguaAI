import 'package:dio/dio.dart';

import '../domain/auth_models.dart';

/// Direct HTTP client for `/v1/auth/*` (`apps/api/src/modules/auth/auth.controller.ts`).
/// Every call here relies on `ApiClient`'s own interceptor already having
/// attached the `X-Client-Platform: mobile` header (E21 T1) — this class
/// never sets it itself, so there is exactly one place that decision is
/// made, not one per call site.
class AuthApi {
  AuthApi(this._dio);

  final Dio _dio;

  Future<PublicUser> register({
    required String email,
    required String password,
    required String displayName,
    required String locale,
    required String timezone,
    required bool tosAccepted,
    required bool privacyPolicyAccepted,
    required bool marketingConsent,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/register',
      data: {
        'email': email,
        'password': password,
        'displayName': displayName,
        'locale': locale,
        'timezone': timezone,
        'tosAccepted': tosAccepted,
        'privacyPolicyAccepted': privacyPolicyAccepted,
        'marketingConsent': marketingConsent,
      },
    );
    return PublicUser.fromJson(response.data!);
  }

  Future<LoginResult> login({required String email, required String password}) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'email': email, 'password': password},
    );
    return LoginResult.fromJson(response.data!);
  }

  Future<LoginResult> mfaChallenge({required String challengeToken, required String code}) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/mfa/challenge',
      data: {'challengeToken': challengeToken, 'code': code},
    );
    return LoginResult.fromJson(response.data!);
  }

  Future<RefreshResult> refresh({required String refreshToken}) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/refresh',
      data: {'refreshToken': refreshToken},
    );
    return RefreshResult.fromJson(response.data!);
  }

  Future<void> logout({required String refreshToken}) => _dio.post<void>(
    '/auth/logout',
    data: {'refreshToken': refreshToken},
  );

  /// `GET /v1/users/me` (`apps/api/src/modules/users/users.controller.ts`)
  /// — a refresh response (`RefreshResult`) carries no `PublicUser`, so
  /// this is how `AuthController.restoreSession` recovers it after an app
  /// relaunch with only a stored refresh token and a freshly minted access
  /// token, without duplicating identity data client-side.
  Future<PublicUser> fetchCurrentUser() async {
    final response = await _dio.get<Map<String, dynamic>>('/users/me');
    return PublicUser.fromJson(response.data!);
  }
}
