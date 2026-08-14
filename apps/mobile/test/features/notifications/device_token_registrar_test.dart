import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/push/push_token_provider.dart';
import 'package:mobile/features/notifications/data/device_token_api.dart';
import 'package:mobile/features/notifications/data/device_token_registrar.dart';
import 'package:mocktail/mocktail.dart';

class _MockPushTokenProvider extends Mock implements PushTokenProvider {}

class _MockDeviceTokenApi extends Mock implements DeviceTokenApi {}

void main() {
  setUpAll(() {
    registerFallbackValue('');
  });

  test('registerIfAvailable is a real no-op when no token is available (UnavailablePushTokenProvider today)', () async {
    final provider = _MockPushTokenProvider();
    when(() => provider.getToken()).thenAnswer((_) async => null);
    final api = _MockDeviceTokenApi();
    final registrar = DeviceTokenRegistrar(provider, api);

    await registrar.registerIfAvailable();

    verifyNever(() => api.register(platform: any(named: 'platform'), token: any(named: 'token')));
  });

  test('registerIfAvailable calls DeviceTokenApi.register with a real token when one is available', () async {
    final provider = _MockPushTokenProvider();
    when(() => provider.getToken()).thenAnswer((_) async => 'real-fcm-token');
    final api = _MockDeviceTokenApi();
    when(
      () => api.register(platform: any(named: 'platform'), token: 'real-fcm-token'),
    ).thenAnswer((_) async {});
    final registrar = DeviceTokenRegistrar(provider, api);

    await registrar.registerIfAvailable();

    verify(
      () => api.register(platform: any(named: 'platform'), token: 'real-fcm-token'),
    ).called(1);
  });

  test('UnavailablePushTokenProvider.getToken always resolves to null', () async {
    const provider = UnavailablePushTokenProvider();

    expect(await provider.getToken(), isNull);
  });
}
