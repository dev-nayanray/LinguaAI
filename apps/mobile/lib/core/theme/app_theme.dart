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
      tertiary: colorOf('colorSuccess'),
      onTertiary: Colors.white,
      error: colorOf('colorDangerSolid'),
      onError: Colors.white,
      surface: colorOf('colorSurface'),
      onSurface: colorOf('colorText'),
      surfaceContainerHighest: colorOf('colorSurfaceMuted'),
      outline: colorOf('colorBorder'),
    );

    final radius = tokens.radius;
    final appColors = AppColors.fromTokens(tokens, brightness);
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius['lg'] ?? 12));
    final fieldShape = OutlineInputBorder(
      borderRadius: BorderRadius.circular(radius['md'] ?? 8),
      borderSide: BorderSide(color: colorScheme.outline.withValues(alpha: 0.4)),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: colorOf('colorBg'),
      textTheme: _textTheme(tokens),
      extensions: [AppSpacing.fromTokens(tokens), AppRadius.fromTokens(tokens), appColors],
      appBarTheme: AppBarTheme(
        backgroundColor: colorOf('colorBg'),
        foregroundColor: colorScheme.onSurface,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: tokens.typography['typeHeadingMd']!.toTextStyle().copyWith(
          color: colorScheme.onSurface,
        ),
      ),
      cardTheme: CardThemeData(
        color: colorOf('colorSurfaceElevated'),
        elevation: 0,
        shape: shape,
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colorOf('colorSurfaceMuted'),
        border: fieldShape,
        enabledBorder: fieldShape,
        focusedBorder: fieldShape.copyWith(
          borderSide: BorderSide(color: colorScheme.primary, width: 2),
        ),
        errorBorder: fieldShape.copyWith(borderSide: BorderSide(color: colorScheme.error)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius['md'] ?? 8)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius['md'] ?? 8)),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: colorOf('colorSurface'),
        indicatorColor: colorScheme.primary.withValues(alpha: 0.15),
        elevation: 0,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: colorOf('colorSurfaceMuted'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius['pill'] ?? 9999)),
        side: BorderSide.none,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: colorScheme.primary),
      dividerTheme: DividerThemeData(color: colorScheme.outline.withValues(alpha: 0.15)),
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

/// Semantic colors `ColorScheme`'s fixed primary/secondary/tertiary/error
/// slots have no room for (success/warning/danger/ai as distinct hues, plus
/// the two extra surface tiers `packages/ui`'s own token set defines) —
/// exposed the same `Theme.of(context).extension<AppColors>()` way as
/// [AppSpacing]/[AppRadius] rather than overloading `ColorScheme` itself.
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.success,
    required this.warning,
    required this.danger,
    required this.ai,
    required this.surfaceMuted,
    required this.surfaceElevated,
    required this.border,
  });

  factory AppColors.fromTokens(DesignTokens tokens, Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    Color of(String name) {
      final token = tokens.colors[name];
      if (token == null) {
        throw StateError('Unknown design token color: $name');
      }
      return isDark ? token.dark : token.light;
    }

    return AppColors(
      success: of('colorSuccessSolid'),
      warning: of('colorWarningSolid'),
      danger: of('colorDangerSolid'),
      ai: of('colorAiSolid'),
      surfaceMuted: of('colorSurfaceMuted'),
      surfaceElevated: of('colorSurfaceElevated'),
      border: of('colorBorder'),
    );
  }

  final Color success;
  final Color warning;
  final Color danger;
  final Color ai;
  final Color surfaceMuted;
  final Color surfaceElevated;
  final Color border;

  @override
  AppColors copyWith({
    Color? success,
    Color? warning,
    Color? danger,
    Color? ai,
    Color? surfaceMuted,
    Color? surfaceElevated,
    Color? border,
  }) => AppColors(
    success: success ?? this.success,
    warning: warning ?? this.warning,
    danger: danger ?? this.danger,
    ai: ai ?? this.ai,
    surfaceMuted: surfaceMuted ?? this.surfaceMuted,
    surfaceElevated: surfaceElevated ?? this.surfaceElevated,
    border: border ?? this.border,
  );

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) {
      return this;
    }
    return AppColors(
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      ai: Color.lerp(ai, other.ai, t)!,
      surfaceMuted: Color.lerp(surfaceMuted, other.surfaceMuted, t)!,
      surfaceElevated: Color.lerp(surfaceElevated, other.surfaceElevated, t)!,
      border: Color.lerp(border, other.border, t)!,
    );
  }
}

/// Widget tests that pump a screen under a bare `MaterialApp(home: ...)`
/// (most of this app's own screen tests — they exercise behavior, not
/// theming, so they never load real `DesignTokens`) get Flutter's own
/// default `ThemeData`, which carries none of these extensions. Falling
/// back to fixed defaults here — rather than the `!` a real app build
/// always satisfies — keeps those tests passing without forcing every one
/// of them to also thread a themed `MaterialApp` through.
const _fallbackRadius = AppRadius({'sm': 4, 'md': 8, 'lg': 12, 'pill': 9999});
const _fallbackColors = AppColors(
  success: Color(0xFF22C55E),
  warning: Color(0xFFF59E0B),
  danger: Color(0xFFC81E1E),
  ai: Color(0xFF7C3AED),
  surfaceMuted: Color(0xFFF1F5F9),
  surfaceElevated: Colors.white,
  border: Color(0xFF64748B),
);
const _fallbackSpacing = AppSpacing({'0': 0, '1': 4, '2': 8, '3': 12, '4': 16, '6': 24, '8': 32});

extension AppThemeExtensionAccess on BuildContext {
  AppSpacing get spacing => Theme.of(this).extension<AppSpacing>() ?? _fallbackSpacing;
  AppRadius get radii => Theme.of(this).extension<AppRadius>() ?? _fallbackRadius;
  AppColors get appColors => Theme.of(this).extension<AppColors>() ?? _fallbackColors;
}
