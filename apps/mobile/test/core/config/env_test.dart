import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/env.dart';

void main() {
  group('environmentFromName', () {
    test('recognizes staging and production by name', () {
      expect(environmentFromName('staging'), AppEnvironment.staging);
      expect(environmentFromName('production'), AppEnvironment.production);
    });

    test('falls back to development for the empty/default/unknown case', () {
      expect(environmentFromName(''), AppEnvironment.development);
      expect(environmentFromName('development'), AppEnvironment.development);
      expect(environmentFromName('not-a-real-environment'), AppEnvironment.development);
    });
  });

  group('defaultApiBaseUrlFor', () {
    test('returns the real, distinct default for each named environment', () {
      expect(defaultApiBaseUrlFor(AppEnvironment.development), 'http://10.0.2.2:3000/v1');
      expect(
        defaultApiBaseUrlFor(AppEnvironment.staging),
        'https://api.staging.linguaai.app/v1',
      );
      expect(defaultApiBaseUrlFor(AppEnvironment.production), 'https://api.linguaai.app/v1');
    });
  });

  group('Env (compile-time defaults, no --dart-define passed to this test run)', () {
    test('resolves to the development environment by default', () {
      expect(Env.current, AppEnvironment.development);
    });

    test('apiBaseUrl resolves to the development default when no override is passed', () {
      expect(Env.apiBaseUrl, 'http://10.0.2.2:3000/v1');
    });
  });
}
