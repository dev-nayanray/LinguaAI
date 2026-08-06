import { describe, expect, it } from 'vitest';

import { generate, generateFromCss, TokenGenerationError } from './generate-tokens.mjs';

// A compact CSS blob covering one token from every category the generator
// reads, used for the schema/smoke assertions below and as the base for
// the failure-behavior tests (each of which removes or corrupts exactly
// one piece of it). Deliberately smaller than the real tokens.css so a
// broken-input test's mutation is obvious at a glance.
const MINIMAL_VALID_CSS = `
@theme {
  --color-primary: #2563eb;
  --color-primary-solid: #2563eb;
  --radius-sm: 4px;
  --shadow-flat: none;
  --shadow-low: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --breakpoint-mobile: 0px;
  --duration-micro: 150ms;
  --ease-entrance: cubic-bezier(0, 0, 0.2, 1);
  --text-sm: 14px;
  --text-sm-leading: 20px;
  --font-weight-regular: 400;
  --font-sans: 'Inter', sans-serif;
}

:root {
  --raw-color-text: #0f172a;
}

[data-theme='dark'] {
  --raw-color-text: #f1f5f9;
}

@theme inline {
  --color-text: var(--raw-color-text);
}

@utility type-body-sm {
  font-size: var(--text-sm);
  line-height: var(--text-sm-leading);
  font-weight: var(--font-weight-regular);
  font-family: var(--font-sans);
}
`;

describe('generate-tokens: determinism (T18 evidence)', () => {
  it('produces byte-identical output across two runs from the same tokens.css', () => {
    const first = JSON.stringify(generate());
    const second = JSON.stringify(generate());
    expect(first).toBe(second);
  });

  it('produces byte-identical output for the same source parsed twice via generateFromCss', () => {
    const first = JSON.stringify(generateFromCss(MINIMAL_VALID_CSS));
    const second = JSON.stringify(generateFromCss(MINIMAL_VALID_CSS));
    expect(first).toBe(second);
  });
});

describe('generate-tokens: schema validation (T18 evidence)', () => {
  it('matches ADR-024\'s documented shape, including schemaVersion', () => {
    const artifact = generate();
    expect(artifact.schemaVersion).toBe(1);
    expect(artifact).toHaveProperty('colors');
    expect(artifact).toHaveProperty('radius');
    expect(artifact).toHaveProperty('shadows');
    expect(artifact).toHaveProperty('spacing');
    expect(artifact).toHaveProperty('typography');
    expect(artifact).toHaveProperty('breakpoints');
    expect(artifact).toHaveProperty('motion');
  });

  it('shapes a color entry as { light, dark } hex pairs', () => {
    const { colors } = generate();
    expect(colors.colorPrimaryText).toEqual({ light: '#2563eb', dark: '#60a5fa' });
    // Single-valued (theme-invariant) tokens still use the { light, dark } shape, per ADR-024's stated shape column.
    expect(colors.colorPrimarySolid).toEqual({ light: '#2563eb', dark: '#2563eb' });
  });

  it('shapes radius as flat numeric px values', () => {
    expect(generate().radius).toEqual({ sm: 4, md: 8, lg: 12, pill: 9999 });
  });

  it('maps the "none" shadow keyword to an empty array, per ADR-024\'s explicit rule', () => {
    expect(generate().shadows.flat).toEqual([]);
  });

  it('shapes a real shadow as an array of {offsetX, offsetY, blur, spread, color, opacity} layers', () => {
    expect(generate().shadows.low).toEqual([
      { offsetX: 0, offsetY: 1, blur: 2, spread: 0, color: '#000000', opacity: 0.05 },
    ]);
  });

  it('shapes multi-layer shadows as multiple array entries', () => {
    expect(generate().shadows.medium).toHaveLength(2);
  });

  it('emits the hardcoded Tailwind spacing scale, unchanged from ADR-024\'s constant', () => {
    expect(generate().spacing).toEqual({ 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64 });
  });

  it('shapes a typography entry as {fontSize, lineHeight, fontWeight, fontFamily}', () => {
    expect(generate().typography.typeBodyMd).toEqual({
      fontSize: 16,
      lineHeight: 24,
      fontWeight: 400,
      fontFamily: 'Inter',
    });
  });

  it('resolves fontFamily to the first family in the stack, unquoted', () => {
    expect(generate().typography.typeDisplayLg.fontFamily).toBe('Manrope');
  });

  it('shapes breakpoints as flat numeric px values', () => {
    expect(generate().breakpoints).toEqual({ mobile: 0, tablet: 768, desktop: 1280 });
  });

  it('shapes motion as {durations, easing} with cubic-bezier control-point arrays', () => {
    const { motion } = generate();
    expect(motion.durations).toEqual({ micro: 150, standard: 250, celebratory: 600 });
    expect(motion.easing.entrance).toEqual([0, 0, 0.2, 1]);
    expect(motion.easing.exit).toEqual([0.4, 0, 1, 1]);
  });
});

describe('generate-tokens: smoke test (T18 evidence)', () => {
  it('every mapped category is present and non-empty', () => {
    const artifact = generate();
    for (const category of ['colors', 'radius', 'shadows', 'spacing', 'typography', 'breakpoints']) {
      expect(Object.keys(artifact[category]).length, `${category} should be non-empty`).toBeGreaterThan(0);
    }
    expect(Object.keys(artifact.motion.durations).length).toBeGreaterThan(0);
    expect(Object.keys(artifact.motion.easing).length).toBeGreaterThan(0);
  });

  it('does not emit a zIndex category — deliberately unsupported per ADR-024', () => {
    expect(generate()).not.toHaveProperty('zIndex');
  });
});

describe('generate-tokens: failure behavior (ADR-024)', () => {
  it('fails on malformed CSS that cannot be parsed', () => {
    expect(() => generateFromCss('@theme { --color-primary: #2563eb;')).toThrow(TokenGenerationError);
  });

  it('fails when the @theme block is entirely missing', () => {
    const css = MINIMAL_VALID_CSS.replace(/@theme\s*{[\s\S]*?\n}\n/, '');
    expect(() => generateFromCss(css)).toThrow(/no top-level @theme block/);
  });

  it('fails when :root is entirely missing', () => {
    const css = MINIMAL_VALID_CSS.replace(/:root\s*{[\s\S]*?\n}\n/, '');
    expect(() => generateFromCss(css)).toThrow(/no top-level :root block/);
  });

  it("fails when [data-theme='dark'] is entirely missing", () => {
    const css = MINIMAL_VALID_CSS.replace(/\[data-theme='dark'\]\s*{[\s\S]*?\n}\n/, '');
    expect(() => generateFromCss(css)).toThrow(/no top-level \[data-theme='dark'\] block/);
  });

  it('fails when @theme inline is entirely missing', () => {
    const css = MINIMAL_VALID_CSS.replace(/@theme inline\s*{[\s\S]*?\n}\n/, '');
    expect(() => generateFromCss(css)).toThrow(/no top-level @theme inline block/);
  });

  it('fails naming the specific token and field when a typography block is missing a required declaration', () => {
    const css = MINIMAL_VALID_CSS.replace('font-family: var(--font-sans);\n', '');
    expect(() => generateFromCss(css)).toThrow(/type-body-sm.*font-family/);
  });

  it('fails when a typography declaration references an unresolvable primitive', () => {
    const css = MINIMAL_VALID_CSS.replace('var(--text-sm)', 'var(--text-does-not-exist)');
    expect(() => generateFromCss(css)).toThrow(/does not resolve to a declared Tier-1 primitive/);
  });

  it('fails on an invalid hex color value', () => {
    const css = MINIMAL_VALID_CSS.replace('--color-primary: #2563eb;', '--color-primary: not-a-color;');
    expect(() => generateFromCss(css)).toThrow(/hex color/);
  });

  it('fails on a duration value with no "ms" unit', () => {
    const css = MINIMAL_VALID_CSS.replace('--duration-micro: 150ms;', '--duration-micro: 150;');
    expect(() => generateFromCss(css)).toThrow(/ms duration value/);
  });

  it('fails on a shadow value that is neither "none" nor a valid box-shadow shorthand', () => {
    const css = MINIMAL_VALID_CSS.replace(
      '--shadow-low: 0 1px 2px 0 rgb(0 0 0 / 0.05);',
      '--shadow-low: garbage-value;',
    );
    expect(() => generateFromCss(css)).toThrow(/box-shadow shorthand/);
  });

  it('fails when @theme inline value is not a single var(...) reference', () => {
    const css = MINIMAL_VALID_CSS.replace(
      '--color-text: var(--raw-color-text);',
      '--color-text: #0f172a;',
    );
    expect(() => generateFromCss(css)).toThrow(/must be a single var\(\.\.\.\) reference/);
  });

  it('fails when @theme inline references a raw property missing from :root', () => {
    const css = MINIMAL_VALID_CSS.replace(
      '--color-text: var(--raw-color-text);',
      '--color-text: var(--raw-color-missing);',
    );
    expect(() => generateFromCss(css)).toThrow(/not found in :root/);
  });

  it('ignores duration overrides declared inside an unrelated @media block', () => {
    const css =
      MINIMAL_VALID_CSS +
      `
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-micro: 0.01ms;
  }
}
`;
    // The real value from @theme (150ms), not the @media override, wins —
    // proving the generator only reads direct children of the stylesheet
    // root, not every nested :root anywhere in the file.
    expect(generateFromCss(css).motion.durations.micro).toBe(150);
  });
});
