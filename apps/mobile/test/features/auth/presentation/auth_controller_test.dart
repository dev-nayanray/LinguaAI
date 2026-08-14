import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/storage/secure_token_storage.dart';
import 'package:mobile/features/auth/data/auth_api.dart';
import 'package:mobile/features/auth/domain/auth_models.dart';
import 'package:mobile/features/auth/presentation/auth_controller.dart';
import 'package:mobile/features/auth/presentation/auth_state.dart';
import 'package:mocktail/mocktail.dart';

class _MockAuthApi extends Mock implements AuthApi {}

class _MockSecureTokenStorage extends Mock implements SecureTokenStorage {}

const _user = PublicUser(
  id: 'u-1',
  email: 'ada@test.local',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
  locale: 'en-US',
  timezone: 'UTC',
  role: 'USER',
  status: 'ACTIVE',
  mfaEnrolled: false,
  organizationId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
);

void main() {
  late _MockAuthApi authApi;
  late _MockSecureTokenStorage tokenStorage;
  late ApiClient apiClient;
  late ProviderContainer container;

  setUp(() {
    authApi = _MockAuthApi();
    tokenStorage = _MockSecureTokenStorage();
    apiClient = ApiClient(baseUrl: 'http://unused.test');
    container = ProviderContainer(
      overrides: [
        authApiProvider.overrideWithValue(authApi),
        secureTokenStorageProvider.overrideWithValue(tokenStorage),
        apiClientProvider.overrideWithValue(apiClient),
      ],
    );
  });

  tearDown(() => container.dispose());

  group('restoreSession', () {
    test('no stored refresh token → Unauthenticated, no network calls', () async {
      when(() => tokenStorage.readRefreshToken()).thenAnswer((_) async => null);

      await container.read(authControllerProvider.notifier).restoreSession();

      expect(container.read(authControllerProvider), isA<AuthUnauthenticated>());
      verifyNever(() => authApi.refresh(refreshToken: any(named: 'refreshToken')));
    });

    test('a valid stored refresh token restores a full Authenticated session', () async {
      when(() => tokenStorage.readRefreshToken()).thenAnswer((_) async => 'stored-refresh');
      when(
        () => authApi.refresh(refreshToken: 'stored-refresh'),
      ).thenAnswer((_) async => const RefreshResult(accessToken: 'jwt-1', refreshToken: 'new-refresh'));
      when(() => tokenStorage.saveRefreshToken('new-refresh')).thenAnswer((_) async {});
      when(() => authApi.fetchCurrentUser()).thenAnswer((_) async => _user);

      await container.read(authControllerProvider.notifier).restoreSession();

      final state = container.read(authControllerProvider);
      expect(state, isA<AuthAuthenticated>());
      expect((state as AuthAuthenticated).user.email, 'ada@test.local');
      verify(() => tokenStorage.saveRefreshToken('new-refresh')).called(1);
    });

    test('a stale/invalid stored refresh token clears storage and lands Unauthenticated', () async {
      when(() => tokenStorage.readRefreshToken()).thenAnswer((_) async => 'stale-refresh');
      when(
        () => authApi.refresh(refreshToken: 'stale-refresh'),
      ).thenThrow(Exception('401'));
      when(() => tokenStorage.clear()).thenAnswer((_) async {});

      await container.read(authControllerProvider.notifier).restoreSession();

      expect(container.read(authControllerProvider), isA<AuthUnauthenticated>());
      verify(() => tokenStorage.clear()).called(1);
    });
  });

  group('login', () {
    test('AUTHENTICATED result → Authenticated state, refresh token persisted when present', () async {
      when(
        () => authApi.login(email: 'ada@test.local', password: 'pw'),
      ).thenAnswer(
        (_) async => const AuthenticatedSession(
          accessToken: 'jwt-1',
          user: _user,
          refreshToken: 'mobile-refresh',
        ),
      );
      when(() => tokenStorage.saveRefreshToken('mobile-refresh')).thenAnswer((_) async {});

      await container
          .read(authControllerProvider.notifier)
          .login(email: 'ada@test.local', password: 'pw');

      expect(container.read(authControllerProvider), isA<AuthAuthenticated>());
      verify(() => tokenStorage.saveRefreshToken('mobile-refresh')).called(1);
    });

    test('MFA_REQUIRED result → MfaRequired state carrying the challenge token', () async {
      when(
        () => authApi.login(email: 'admin@test.local', password: 'pw'),
      ).thenAnswer((_) async => const MfaChallengeRequired(challengeToken: 'challenge-1'));

      await container
          .read(authControllerProvider.notifier)
          .login(email: 'admin@test.local', password: 'pw');

      final state = container.read(authControllerProvider);
      expect(state, isA<AuthMfaRequired>());
      expect((state as AuthMfaRequired).challengeToken, 'challenge-1');
    });
  });

  group('completeMfaChallenge', () {
    test('throws when called with no pending MFA challenge, without calling the API', () async {
      final controller = container.read(authControllerProvider.notifier);

      await expectLater(controller.completeMfaChallenge(code: '123456'), throwsStateError);
      verifyNever(
        () => authApi.mfaChallenge(
          challengeToken: any(named: 'challengeToken'),
          code: any(named: 'code'),
        ),
      );
    });

    test('a successful challenge transitions MfaRequired → Authenticated', () async {
      when(
        () => authApi.login(email: 'admin@test.local', password: 'pw'),
      ).thenAnswer((_) async => const MfaChallengeRequired(challengeToken: 'challenge-1'));
      await container
          .read(authControllerProvider.notifier)
          .login(email: 'admin@test.local', password: 'pw');

      when(
        () => authApi.mfaChallenge(challengeToken: 'challenge-1', code: '123456'),
      ).thenAnswer(
        (_) async => const AuthenticatedSession(accessToken: 'jwt-1', user: _user),
      );

      await container.read(authControllerProvider.notifier).completeMfaChallenge(code: '123456');

      expect(container.read(authControllerProvider), isA<AuthAuthenticated>());
    });
  });

  group('logout', () {
    test('clears storage and access token even when the revoke call itself fails (e.g. offline)', () async {
      when(() => tokenStorage.readRefreshToken()).thenAnswer((_) async => 'stored-refresh');
      when(() => authApi.logout(refreshToken: 'stored-refresh')).thenThrow(Exception('offline'));
      when(() => tokenStorage.clear()).thenAnswer((_) async {});

      await container.read(authControllerProvider.notifier).logout();

      expect(container.read(authControllerProvider), isA<AuthUnauthenticated>());
      verify(() => tokenStorage.clear()).called(1);
    });

    test('a no-stored-token logout still clears state without calling AuthApi.logout', () async {
      when(() => tokenStorage.readRefreshToken()).thenAnswer((_) async => null);
      when(() => tokenStorage.clear()).thenAnswer((_) async {});

      await container.read(authControllerProvider.notifier).logout();

      expect(container.read(authControllerProvider), isA<AuthUnauthenticated>());
      verifyNever(() => authApi.logout(refreshToken: any(named: 'refreshToken')));
    });
  });
}
