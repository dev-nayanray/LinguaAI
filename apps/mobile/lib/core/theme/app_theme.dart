import 'package:flutter/material.dart';

import 'design_tokens.dart';

/// Builds a real Flutter `ThemeData` from `DesignTokens` — the app never
/// reads a raw hex string or a magic-number radius directly, mirroring
/// `packages/ui`'s own "consume tokens, not literals" discipline
/// (DESIGN_SYSTEM.md §6).
class AppTheme {
  const AppTheme._();

  static ThemeData light(DesignTokens tokens) => _build(tokens, Brightness.light);

  static ThemeData dark(DesignTokens tokens) => _build(tokens, Brightness.dark);

  static ThemeData _build(DesignTokens tokens, Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    Color colorOf(String name) {
      final token = tokens.colors[name];
      if (token == null) {
        throw StateError('Unknown design token color: $name');
      }
      return isDark ? token.dark : token.light;
    }

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: colorOf('colorPrimary'),
      onPrimary: Colors.white,
      secondary: colorOf('colorAccent'),
      onSecondary: Colors.white,
      error: colorOf('colorWarning'),
      onError: Colors.white,
      surface: isDark ? const Color(0xFF111827) : Colors.white,
      onSurface: isDark ? Colors.white : const Color(0xFF111827),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      textTheme: _textTheme(tokens),
      extensions: [AppSpacing.fromTokens(tokens), AppRadius.fromTokens(tokens)],
    );
  }

  static TextTheme _textTheme(DesignTokens tokens) {
    TextStyle styleOf(String name) => tokens.typography[name]!.toTextStyle();
    return TextTheme(
      bodySmall: styleOf('typeBodySm'),
      bodyMedium: styleOf('typeBodyMd'),
      bodyLarge: styleOf('typeBodyLg'),
      headlineMedium: styleOf('typeHeadingMd'),
      headlineLarge: styleOf('typeHeadingLg'),
      displayMedium: styleOf('typeDisplayLg'),
      displayLarge: styleOf('typeDisplayXl'),
    );
  }
}

/// A `ThemeExtension` so spacing tokens are reachable via
/// `Theme.of(context).extension<AppSpacing>()`, the idiomatic Flutter
/// mechanism for app-specific design tokens beyond `ColorScheme`/`TextTheme`.
class AppSpacing extends ThemeExtension<AppSpacing> {
  const AppSpacing(this.values);

  factory AppSpacing.fromTokens(DesignTokens tokens) => AppSpacing(tokens.spacing);

  final Map<String, double> values;

  double operator [](String key) => values[key] ?? 0;

  @override
  AppSpacing copyWith({Map<String, double>? values}) => AppSpacing(values ?? this.values);

  @override
  AppSpacing lerp(ThemeExtension<AppSpacing>? other, double t) => this;
}

class AppRadius extends ThemeExtension<AppRadius> {
  const AppRadius(this.values);

  factory AppRadius.fromTokens(DesignTokens tokens) => AppRadius(tokens.radius);

  final Map<String, double> values;

  double operator [](String key) => values[key] ?? 0;

  @override
  AppRadius copyWith({Map<String, double>? values}) => AppRadius(values ?? this.values);

  @override
  AppRadius lerp(ThemeExtension<AppRadius>? other, double t) => this;
}
