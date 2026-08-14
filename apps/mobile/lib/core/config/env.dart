/// Build-time configuration (T5's own environment-config task extends this
/// per-flavor) — `--dart-define=API_BASE_URL=...` overrides the default,
/// matching `apps/web`'s own env-var-driven config discipline
/// (packages/config) rather than a hardcoded value baked into source.
class Env {
  const Env._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/v1',
  );
}
