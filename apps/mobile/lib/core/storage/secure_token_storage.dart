import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The concrete mobile-side implementation of ADR-018's "secure device
/// storage" requirement for the refresh token — Keychain on iOS, Keystore
/// (EncryptedSharedPreferences-backed) on Android. The access token is
/// deliberately never written here: it lives in memory only (§6.2 of
/// docs/epics/E21-mobile-application.md), gone on process death, which is
/// the entire point of a 15-minute-lived credential.
class SecureTokenStorage {
  SecureTokenStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _refreshTokenKey = 'refresh_token';

  final FlutterSecureStorage _storage;

  Future<void> saveRefreshToken(String refreshToken) =>
      _storage.write(key: _refreshTokenKey, value: refreshToken);

  Future<String?> readRefreshToken() => _storage.read(key: _refreshTokenKey);

  Future<void> clear() => _storage.delete(key: _refreshTokenKey);
}
