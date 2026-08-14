/// Build-time configuration (E21 T1/T5) — `--dart-define=APP_ENV=...`
/// selects a named environment (`development`/`staging`/`production`,
/// matching DEPLOYMENT.md's own three-environment convention);
/// `--dart-define=API_BASE_URL=...` overrides that environment's own
/// default for local testing flexibility (e.g. pointing a staging build
/// at a developer's own local backend), the same "env var wins over a
/// hardcoded default" discipline `apps/web`'s own `packages/config`
/// already establishes.
enum AppEnvironment { development, staging, production }

/// A pure function, not inlined into `Env`, specifically so it's
/// unit-testable without needing to actually recompile with different
/// `--dart-define` values per test case.
AppEnvironment environmentFromName(String name) => switch (name) {
  'production' => AppEnvironment.production,
  'staging' => AppEnvironment.staging,
  _ => AppEnvironment.development,
};

/// Real, named backend targets — `development` is the Android-emulator
/// alias for the developer's own machine (`10.0.2.2`, standard Android
/// emulator convention for `localhost`); `staging`/`production` are real
/// DNS names this platform's own infrastructure would need to actually
/// provision (out of this task's own scope — a real, later DevOps step,
/// not a placeholder invented here to look complete).
String defaultApiBaseUrlFor(AppEnvironment environment) => switch (environment) {
  AppEnvironment.development => 'http://10.0.2.2:3000/v1',
  AppEnvironment.staging => 'https://api.staging.linguaai.app/v1',
  AppEnvironment.production => 'https://api.linguaai.app/v1',
};

class Env {
  const Env._();

  static const String _envName = String.fromEnvironment('APP_ENV', defaultValue: 'development');
  static const String _apiBaseUrlOverride = String.fromEnvironment('API_BASE_URL');

  static AppEnvironment get current => environmentFromName(_envName);

  static String get apiBaseUrl =>
      _apiBaseUrlOverride.isNotEmpty ? _apiBaseUrlOverride : defaultApiBaseUrlFor(current);
}
