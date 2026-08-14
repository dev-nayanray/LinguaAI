import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

/// Mirrors the artifact shape `packages/ui/scripts/generate-tokens.mjs`
/// (ADR-024) emits — one class per top-level JSON key. Generated fresh on
/// every build (`tool/generate_design_tokens.sh`), never committed, so
/// this loader is the mechanism's first real Flutter-side consumer, not a
/// new design for it.
class DesignTokens {
  const DesignTokens({
    required this.schemaVersion,
    required this.colors,
    required this.radius,
    required this.shadows,
    required this.spacing,
    required this.typography,
    required this.breakpoints,
    required this.motion,
  });

  factory DesignTokens.fromJson(Map<String, dynamic> json) {
    return DesignTokens(
      schemaVersion: json['schemaVersion'] as int,
      colors: (json['colors'] as Map<String, dynamic>).map(
        (key, value) => MapEntry(key, ColorToken.fromJson(value as Map<String, dynamic>)),
      ),
      radius: (json['radius'] as Map<String, dynamic>).map(
        (key, value) => MapEntry(key, (value as num).toDouble()),
      ),
      shadows: (json['shadows'] as Map<String, dynamic>).map(
        (key, value) => MapEntry(
          key,
          (value as List<dynamic>)
              .map((entry) => ShadowToken.fromJson(entry as Map<String, dynamic>))
              .toList(),
        ),
      ),
      spacing: (json['spacing'] as Map<String, dynamic>).map(
        (key, value) => MapEntry(key, (value as num).toDouble()),
      ),
      typography: (json['typography'] as Map<String, dynamic>).map(
        (key, value) => MapEntry(key, TypographyToken.fromJson(value as Map<String, dynamic>)),
      ),
      breakpoints: (json['breakpoints'] as Map<String, dynamic>).map(
        (key, value) => MapEntry(key, (value as num).toDouble()),
      ),
      motion: MotionTokens.fromJson(json['motion'] as Map<String, dynamic>),
    );
  }

  static Future<DesignTokens> load({
    AssetBundle? bundle,
    String assetPath = 'assets/design_tokens.json',
  }) async {
    final raw = await (bundle ?? rootBundle).loadString(assetPath);
    return DesignTokens.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  final int schemaVersion;
  final Map<String, ColorToken> colors;
  final Map<String, double> radius;
  final Map<String, List<ShadowToken>> shadows;
  final Map<String, double> spacing;
  final Map<String, TypographyToken> typography;
  final Map<String, double> breakpoints;
  final MotionTokens motion;
}

class ColorToken {
  const ColorToken({required this.light, required this.dark});

  factory ColorToken.fromJson(Map<String, dynamic> json) {
    return ColorToken(
      light: _parseHexColor(json['light'] as String),
      dark: _parseHexColor(json['dark'] as String),
    );
  }

  final Color light;
  final Color dark;
}

class ShadowToken {
  const ShadowToken({
    required this.offsetX,
    required this.offsetY,
    required this.blur,
    required this.spread,
    required this.color,
    required this.opacity,
  });

  factory ShadowToken.fromJson(Map<String, dynamic> json) {
    return ShadowToken(
      offsetX: (json['offsetX'] as num).toDouble(),
      offsetY: (json['offsetY'] as num).toDouble(),
      blur: (json['blur'] as num).toDouble(),
      spread: (json['spread'] as num).toDouble(),
      color: _parseHexColor(json['color'] as String),
      opacity: (json['opacity'] as num).toDouble(),
    );
  }

  final double offsetX;
  final double offsetY;
  final double blur;
  final double spread;
  final Color color;
  final double opacity;

  BoxShadow toBoxShadow() => BoxShadow(
    color: color.withValues(alpha: opacity),
    offset: Offset(offsetX, offsetY),
    blurRadius: blur,
    spreadRadius: spread,
  );
}

class TypographyToken {
  const TypographyToken({
    required this.fontSize,
    required this.lineHeight,
    required this.fontWeight,
    required this.fontFamily,
  });

  factory TypographyToken.fromJson(Map<String, dynamic> json) {
    return TypographyToken(
      fontSize: (json['fontSize'] as num).toDouble(),
      lineHeight: (json['lineHeight'] as num).toDouble(),
      fontWeight: (json['fontWeight'] as num).toInt(),
      fontFamily: json['fontFamily'] as String,
    );
  }

  final double fontSize;
  final double lineHeight;
  final int fontWeight;
  final String fontFamily;

  TextStyle toTextStyle() => TextStyle(
    fontSize: fontSize,
    height: lineHeight / fontSize,
    fontWeight: FontWeight.values.firstWhere(
      (candidate) => candidate.value == fontWeight,
      orElse: () => FontWeight.normal,
    ),
    fontFamily: fontFamily,
  );
}

class MotionTokens {
  const MotionTokens({required this.durations, required this.easing});

  factory MotionTokens.fromJson(Map<String, dynamic> json) {
    return MotionTokens(
      durations: (json['durations'] as Map<String, dynamic>).map(
        (key, value) => MapEntry(key, (value as num).toInt()),
      ),
      easing: (json['easing'] as Map<String, dynamic>).map(
        (key, value) => MapEntry(
          key,
          (value as List<dynamic>).map((entry) => (entry as num).toDouble()).toList(),
        ),
      ),
    );
  }

  final Map<String, int> durations;
  final Map<String, List<double>> easing;
}

Color _parseHexColor(String hex) {
  final normalized = hex.replaceFirst('#', '');
  final value = int.parse(normalized, radix: 16);
  return Color(0xFF000000 | value);
}
