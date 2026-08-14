import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/design_tokens.dart';

const _sampleJson = {
  'schemaVersion': 1,
  'colors': {
    'colorPrimary': {'light': '#2563eb', 'dark': '#3b82f6'},
  },
  'radius': {'sm': 4, 'md': 8},
  'shadows': {
    'flat': [],
    'low': [
      {'offsetX': 0, 'offsetY': 1, 'blur': 2, 'spread': 0, 'color': '#000000', 'opacity': 0.05},
    ],
  },
  'spacing': {'0': 0, '4': 16},
  'typography': {
    'typeBodyMd': {'fontSize': 16, 'lineHeight': 24, 'fontWeight': 400, 'fontFamily': 'Inter'},
  },
  'breakpoints': {'mobile': 0, 'tablet': 768},
  'motion': {
    'durations': {'standard': 250},
    'easing': {
      'entrance': [0, 0, 0.2, 1],
    },
  },
};

void main() {
  group('DesignTokens.fromJson', () {
    test('parses every top-level category into the expected shape', () {
      final tokens = DesignTokens.fromJson(_sampleJson);

      expect(tokens.schemaVersion, 1);
      expect(tokens.colors['colorPrimary']!.light.toARGB32(), 0xFF2563EB);
      expect(tokens.colors['colorPrimary']!.dark.toARGB32(), 0xFF3B82F6);
      expect(tokens.radius['sm'], 4);
      expect(tokens.spacing['4'], 16);
      expect(tokens.typography['typeBodyMd']!.fontSize, 16);
      expect(tokens.breakpoints['tablet'], 768);
      expect(tokens.motion.durations['standard'], 250);
    });

    test('an empty shadow list (the "flat" tier) parses as an empty list, not null', () {
      final tokens = DesignTokens.fromJson(_sampleJson);

      expect(tokens.shadows['flat'], isEmpty);
      expect(tokens.shadows['low'], hasLength(1));
    });
  });

  group('TypographyToken.toTextStyle', () {
    test('computes a relative line height (Flutter TextStyle.height is a multiplier, not px)', () {
      const token = TypographyToken(
        fontSize: 16,
        lineHeight: 24,
        fontWeight: 400,
        fontFamily: 'Inter',
      );

      final style = token.toTextStyle();

      expect(style.fontSize, 16);
      expect(style.height, 1.5);
      expect(style.fontFamily, 'Inter');
    });

    test('falls back to FontWeight.normal for a weight with no exact FontWeight match', () {
      const token = TypographyToken(
        fontSize: 16,
        lineHeight: 24,
        fontWeight: 450,
        fontFamily: 'Inter',
      );

      expect(token.toTextStyle().fontWeight, FontWeight.normal);
    });
  });

  group('ShadowToken.toBoxShadow', () {
    test('applies opacity to the color alpha channel, not as a separate multiplier', () {
      const token = ShadowToken(
        offsetX: 0,
        offsetY: 1,
        blur: 2,
        spread: 0,
        color: Color(0xFF000000),
        opacity: 0.5,
      );

      final boxShadow = token.toBoxShadow();

      expect(boxShadow.color.a, closeTo(0.5, 0.01));
      expect(boxShadow.offset, const Offset(0, 1));
    });
  });
}
