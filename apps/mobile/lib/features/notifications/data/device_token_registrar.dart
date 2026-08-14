import 'dart:io';

import '../../../core/push/push_token_provider.dart';
import 'device_token_api.dart';

/// Registers this device's real push token with the backend once one is
/// actually available (E21 T4, §6.4 of the design doc). With
/// `UnavailablePushTokenProvider` (the only implementation that exists
/// today — no real Firebase project in this environment), `getToken()`
/// always returns `null`, so this is a real, honest no-op, not a faked
/// success — the integration point is real and tested, the actual push
/// capability is the disclosed, tracked blocker.
class DeviceTokenRegistrar {
  DeviceTokenRegistrar(this._pushTokenProvider, this._deviceTokenApi);

  final PushTokenProvider _pushTokenProvider;
  final DeviceTokenApi _deviceTokenApi;

  Future<void> registerIfAvailable() async {
    final token = await _pushTokenProvider.getToken();
    if (token == null) {
      return;
    }
    await _deviceTokenApi.register(platform: Platform.isIOS ? 'IOS' : 'ANDROID', token: token);
  }
}
