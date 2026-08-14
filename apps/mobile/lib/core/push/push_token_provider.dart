/// The real seam a future `firebase_messaging`-backed implementation
/// plugs into — `DeviceTokenRegistrar` (feature `notifications`) depends
/// only on this interface, never on `firebase_messaging` directly, so
/// swapping in a real provider once a real Firebase project exists
/// touches exactly one new class, nothing else in this feature.
abstract class PushTokenProvider {
  Future<String?> getToken();
}

/// The real, current implementation (E21 T4) — no Firebase project or
/// credentials exist in this environment (a real, tracked blocker
/// mirroring RISK_REGISTER R-88's own "credential-less environment"
/// precedent for `ai-engine`'s e2e suite), so `firebase_messaging` isn't
/// even added as a dependency yet. Always returns `null`, meaning
/// `DeviceTokenRegistrar.registerIfAvailable()` is a real, honest no-op
/// today — not a fake success, not a crash.
class UnavailablePushTokenProvider implements PushTokenProvider {
  const UnavailablePushTokenProvider();

  @override
  Future<String?> getToken() async => null;
}
