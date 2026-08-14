import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/push/push_token_provider.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/device_token_api.dart';
import '../data/device_token_registrar.dart';

final deviceTokenApiProvider = Provider<DeviceTokenApi>(
  (ref) => DeviceTokenApi(ref.watch(apiClientProvider).dio),
);

/// `UnavailablePushTokenProvider` today (E21 T4) — see its own doc
/// comment for the real, tracked blocker. Swapping in a real
/// `firebase_messaging`-backed provider once a Firebase project exists
/// only ever requires overriding this one provider.
final pushTokenProviderProvider = Provider<PushTokenProvider>(
  (ref) => const UnavailablePushTokenProvider(),
);

final deviceTokenRegistrarProvider = Provider<DeviceTokenRegistrar>(
  (ref) => DeviceTokenRegistrar(ref.watch(pushTokenProviderProvider), ref.watch(deviceTokenApiProvider)),
);
