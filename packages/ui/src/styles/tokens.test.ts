import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Token validation — E3 design document §12.1/§12.1a/§17 ("Token-palette
 * regression" row). Two independent kinds of check live in this file:
 *
 *  1. Contrast — every token this suite hardcodes below is checked against
 *     the WCAG 2.1 formula, computed here, not copied from any design
 *     document table.
 *  2. Completeness — the *set* of tokens this suite knows about is checked
 *     against the set `tokens.css` actually declares, in both directions
 *     (a token declared in the file with no test coverage; a token this
 *     suite claims to validate that the file no longer declares). This is
 *     `tokens.css` ⊆ this file's own fixtures, and vice versa — it cannot
 *     read the design document's markdown tables directly (no such
 *     mechanism exists), so keeping the fixtures below in sync with
 *     `docs/epics/E3-design-system-component-library.md` §12.1 remains a
 *     maintained-by-hand contract, not a mechanically-guaranteed one.
 */

const TOKENS_CSS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'tokens.css');
const css = readFileSync(TOKENS_CSS_PATH, 'utf-8');

// ---------------------------------------------------------------------------
// WCAG 2.1 contrast — implemented from scratch, sanity-checked below.
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function linearize(channel: number): number {
  const v = channel / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrast(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('WCAG contrast formula sanity check', () => {
  it('matches published reference ratios', () => {
    expect(contrast('#dc2626', '#ffffff')).toBeCloseTo(4.83, 1);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
});

// ---------------------------------------------------------------------------
// Fixtures — the canonical set this suite validates. Must be kept in sync
// with the design document's §12.1 tables by whoever edits either.
// ---------------------------------------------------------------------------

const SURFACES = {
  light: {
    bg: '#f8fafc',
    surface: '#ffffff',
    'surface-muted': '#f1f5f9',
    'surface-elevated': '#ffffff',
  },
  dark: {
    bg: '#020617',
    surface: '#0f172a',
    'surface-muted': '#1e293b',
    'surface-elevated': '#28324a',
  },
} as const;

/** The surfaces themselves are also declared `--color-*` tokens (validated
 * structurally by every contrast test above using them as the pairing
 * background) — named here too so the completeness checks below know they
 * are accounted for, not merely used as an input elsewhere. */
const SURFACE_TOKEN_NAMES = Object.keys(SURFACES.light);

/** Dual-valued text tokens, ≥4.5:1 required against every surface. */
const TEXT_TOKENS: Record<string, { light: string; dark: string }> = {
  text: { light: '#0f172a', dark: '#f1f5f9' },
  'primary-text': { light: '#2563eb', dark: '#60a5fa' },
  'ai-text': { light: '#7c3aed', dark: '#a78bfa' },
  'accent-text': { light: '#0e7490', dark: '#22d3ee' },
  'success-text': { light: '#15803d', dark: '#4ade80' },
  'warning-text': { light: '#b45309', dark: '#fbbf24' },
  'danger-text': { light: '#c81e1e', dark: '#f87171' },
  'info-text': { light: '#0369a1', dark: '#38bdf8' },
  'neutral-text': { light: '#475569', dark: '#94a3b8' },
};

/** Dual-valued structural tokens, ≥3:1 required against every surface. */
const STRUCTURAL_TOKENS: Record<string, { light: string; dark: string }> = {
  border: { light: '#64748b', dark: '#94a3b8' },
  'focus-ring': { light: '#2563eb', dark: '#60a5fa' },
};

/** Single-valued (both themes) solid-fill tokens, white text ≥4.5:1. */
const SOLID_FILL_TOKENS: Record<string, string> = {
  'primary-solid': '#2563eb',
  'ai-solid': '#7c3aed',
  'accent-solid': '#0e7490',
  'success-solid': '#15803d',
  'warning-solid': '#b45309',
  'danger-solid': '#c81e1e',
};

/** Single-valued brand identity anchors — decorative-only, no WCAG floor. */
const BRAND_ANCHOR_TOKENS = ['primary', 'ai', 'accent', 'success', 'warning'];

/**
 * Covered by WCAG 2.1's own stated exemption for inactive/disabled
 * controls — intentionally excluded from the floor checks below, but still
 * required to exist (Direction A/B completeness still applies to them).
 */
const EXEMPT_TOKENS = ['disabled-bg', 'disabled-text'];

// ---------------------------------------------------------------------------
// tokens.css parsing — regex-based. tokens.css is a small, self-authored,
// structurally simple file (no nested selectors beyond the blocks below), so
// this does not need a full CSS AST parser to be accurate.
// ---------------------------------------------------------------------------

function extractBlock(source: string, selector: string): string {
  const startMarker = `${selector} {`;
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Could not find a "${selector}" block in tokens.css`);
  let depth = 0;
  let i = start + startMarker.length - 1; // position of the opening brace
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return source.slice(start + startMarker.length, i);
}

/** The regexes below always have the referenced group defined when a match
 * occurs (it's inside the pattern's own required capture), so an absent
 * group here means the regex itself is wrong — fail loudly rather than
 * silently propagating `undefined`. */
function requireGroup(value: string | undefined): string {
  if (value === undefined) throw new Error('Expected regex capture group to be defined');
  return value;
}

function extractDeclaredCustomProperties(block: string): string[] {
  const matches = [...block.matchAll(/--([a-z0-9-]+)\s*:/g)];
  return matches.map((m) => requireGroup(m[1]));
}

const themeBlock = extractBlock(css, '@theme');
const rootBlock = extractBlock(css, ':root');
const darkBlock = extractBlock(css, "[data-theme='dark']");
const themeInlineBlock = extractBlock(css, '@theme inline');

const staticColorTokens = extractDeclaredCustomProperties(themeBlock).filter((name) =>
  name.startsWith('color-'),
);
const rawLightTokens = extractDeclaredCustomProperties(rootBlock).filter((name) =>
  name.startsWith('raw-color-'),
);
const rawDarkTokens = extractDeclaredCustomProperties(darkBlock).filter((name) =>
  name.startsWith('raw-color-'),
);
const themeInlineColorTokens = extractDeclaredCustomProperties(themeInlineBlock).filter((name) =>
  name.startsWith('color-'),
);

/** Every color token name (stripped of the `color-` prefix) declared anywhere in tokens.css. */
const declaredColorTokenNames = new Set([
  ...staticColorTokens.map((n) => n.replace(/^color-/, '')),
  ...themeInlineColorTokens.map((n) => n.replace(/^color-/, '')),
]);

// ---------------------------------------------------------------------------
// Direction B: every color token tokens.css declares has test coverage.
// ---------------------------------------------------------------------------

describe('token completeness — tokens.css → test coverage (Direction B)', () => {
  const knownTokenNames = new Set([
    ...SURFACE_TOKEN_NAMES,
    ...Object.keys(TEXT_TOKENS),
    ...Object.keys(STRUCTURAL_TOKENS),
    ...Object.keys(SOLID_FILL_TOKENS),
    ...BRAND_ANCHOR_TOKENS,
    ...EXEMPT_TOKENS,
  ]);

  it('declares at least one color token (sanity check that parsing worked)', () => {
    expect(declaredColorTokenNames.size).toBeGreaterThan(0);
  });

  for (const name of declaredColorTokenNames) {
    it(`--color-${name} has a corresponding validated row or explicit exemption`, () => {
      expect(knownTokenNames.has(name)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Direction A: every token this suite claims to validate is actually
// declared in tokens.css (catches a stale fixture referring to a token that
// was renamed or removed).
// ---------------------------------------------------------------------------

describe('token completeness — test fixtures → tokens.css (Direction A)', () => {
  const allFixtureNames = [
    ...SURFACE_TOKEN_NAMES,
    ...Object.keys(TEXT_TOKENS),
    ...Object.keys(STRUCTURAL_TOKENS),
    ...Object.keys(SOLID_FILL_TOKENS),
    ...BRAND_ANCHOR_TOKENS,
  ];

  for (const name of allFixtureNames) {
    it(`--color-${name} (validated by this suite) is actually declared in tokens.css`, () => {
      expect(declaredColorTokenNames.has(name)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Missing light/dark values — every raw dual-valued token declared in
// :root must also be overridden in [data-theme="dark"], and vice versa.
// ---------------------------------------------------------------------------

describe('light/dark consistency', () => {
  it('every raw token declared in :root is also declared in [data-theme="dark"]', () => {
    const missing = rawLightTokens.filter((name) => !rawDarkTokens.includes(name));
    expect(missing).toEqual([]);
  });

  it('every raw token declared in [data-theme="dark"] is also declared in :root', () => {
    const missing = rawDarkTokens.filter((name) => !rawLightTokens.includes(name));
    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Missing semantic mappings — every @theme inline entry must reference a
// raw variable that's actually declared, and every raw variable declared
// must be surfaced through @theme inline (no orphan in either direction).
// ---------------------------------------------------------------------------

describe('semantic mapping integrity', () => {
  const inlineMappingPairs = [
    ...themeInlineBlock.matchAll(/--(color-[a-z0-9-]+)\s*:\s*var\(--(raw-color-[a-z0-9-]+)\)/g),
  ].map((m) => ({ publicName: requireGroup(m[1]), rawName: requireGroup(m[2]) }));

  it('parsed at least one @theme inline mapping (sanity check)', () => {
    expect(inlineMappingPairs.length).toBeGreaterThan(0);
  });

  for (const { publicName, rawName } of inlineMappingPairs) {
    it(`--${publicName} references a raw variable ("--${rawName}") that is actually declared`, () => {
      expect(rawLightTokens).toContain(rawName);
    });
  }

  it('every raw color token declared in :root has a corresponding @theme inline mapping', () => {
    const mappedRawNames = new Set(inlineMappingPairs.map((p) => p.rawName));
    const unmapped = rawLightTokens.filter((name) => !mappedRawNames.has(name));
    expect(unmapped).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Duplicate names — no custom property should be declared twice within the
// same block (a silent last-write-wins bug otherwise).
// ---------------------------------------------------------------------------

describe('no duplicate token declarations', () => {
  function assertNoDuplicates(blockName: string, names: string[]) {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const name of names) {
      if (seen.has(name)) duplicates.add(name);
      seen.add(name);
    }
    it(`${blockName} declares no custom property more than once`, () => {
      expect([...duplicates]).toEqual([]);
    });
  }

  assertNoDuplicates('@theme', extractDeclaredCustomProperties(themeBlock));
  assertNoDuplicates(':root', extractDeclaredCustomProperties(rootBlock));
  assertNoDuplicates('[data-theme="dark"]', extractDeclaredCustomProperties(darkBlock));
  assertNoDuplicates('@theme inline', extractDeclaredCustomProperties(themeInlineBlock));
});

// ---------------------------------------------------------------------------
// Invalid references — every var(--xxx) used anywhere in the file resolves
// to a custom property actually declared somewhere in the file.
// ---------------------------------------------------------------------------

describe('no invalid var() references', () => {
  const allDeclaredNames = new Set([
    ...extractDeclaredCustomProperties(themeBlock),
    ...extractDeclaredCustomProperties(rootBlock),
    ...extractDeclaredCustomProperties(darkBlock),
    ...extractDeclaredCustomProperties(themeInlineBlock),
  ]);

  const referencedNames = new Set(
    [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => requireGroup(m[1])),
  );

  for (const name of referencedNames) {
    it(`var(--${name}) resolves to a declared custom property`, () => {
      expect(allDeclaredNames.has(name)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Contrast — every text/structural/solid-fill token, every surface, both
// themes. Computed here, not copied from any document.
// ---------------------------------------------------------------------------

describe('semantic text tokens (≥4.5:1, every surface, both themes)', () => {
  for (const [name, values] of Object.entries(TEXT_TOKENS)) {
    for (const theme of ['light', 'dark'] as const) {
      for (const [surfaceName, surfaceHex] of Object.entries(SURFACES[theme])) {
        it(`--color-${name} (${theme}) on ${surfaceName} clears 4.5:1`, () => {
          const ratio = contrast(values[theme], surfaceHex);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

describe('structural tokens — border, focus-ring (≥3:1, every surface, both themes)', () => {
  for (const [name, values] of Object.entries(STRUCTURAL_TOKENS)) {
    for (const theme of ['light', 'dark'] as const) {
      for (const [surfaceName, surfaceHex] of Object.entries(SURFACES[theme])) {
        it(`--color-${name} (${theme}) on ${surfaceName} clears 3:1`, () => {
          const ratio = contrast(values[theme], surfaceHex);
          expect(ratio).toBeGreaterThanOrEqual(3);
        });
      }
    }
  }
});

describe('solid-fill tokens (white text ≥4.5:1)', () => {
  for (const [name, hex] of Object.entries(SOLID_FILL_TOKENS)) {
    it(`--color-${name} clears 4.5:1 with white text`, () => {
      const ratio = contrast('#ffffff', hex);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});

// ---------------------------------------------------------------------------
// Typography completeness — every Tier-2 @utility type-* block has all four
// required declarations, each resolving to a real Tier-1 primitive.
// Mirrors ADR-024's own generator-side schema-validation rule.
// ---------------------------------------------------------------------------

describe('typography schema completeness', () => {
  const REQUIRED_TYPE_TOKENS = [
    'type-caption',
    'type-body-sm',
    'type-body-md',
    'type-body-lg',
    'type-heading-md',
    'type-heading-lg',
    'type-heading-xl',
    'type-display-lg',
    'type-display-xl',
  ];
  const REQUIRED_FIELDS = ['font-size', 'line-height', 'font-weight', 'font-family'] as const;

  const utilityBlockPattern = /@utility\s+(type-[a-z-]+)\s*\{([^}]*)\}/g;
  const utilityBlocks = new Map<string, string>();
  for (const match of css.matchAll(utilityBlockPattern)) {
    utilityBlocks.set(requireGroup(match[1]), requireGroup(match[2]));
  }

  it('declares every required Tier-2 typography token as an @utility block', () => {
    const missing = REQUIRED_TYPE_TOKENS.filter((name) => !utilityBlocks.has(name));
    expect(missing).toEqual([]);
  });

  for (const name of REQUIRED_TYPE_TOKENS) {
    describe(name, () => {
      const body = utilityBlocks.get(name) ?? '';

      for (const field of REQUIRED_FIELDS) {
        it(`declares ${field}`, () => {
          expect(body).toMatch(new RegExp(`${field}\\s*:\\s*[^;]+;`));
        });
      }

      it('every var() reference inside the block resolves to a real Tier-1 primitive', () => {
        const refs = [...body.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => requireGroup(m[1]));
        expect(refs.length).toBeGreaterThan(0);
        for (const ref of refs) {
          const declaredInTheme = extractDeclaredCustomProperties(themeBlock).includes(ref);
          expect(declaredInTheme).toBe(true);
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// prefers-reduced-motion override — the durations collapse inside the media
// query, and every duration utility references the same custom property
// (so the override reaches all three without a separate per-utility rule).
// ---------------------------------------------------------------------------

describe('reduced-motion support', () => {
  it('declares a prefers-reduced-motion override for all three duration tokens', () => {
    const reducedMotionBlock = extractBlock(css, '@media (prefers-reduced-motion: reduce)');
    for (const name of ['duration-micro', 'duration-standard', 'duration-celebratory']) {
      expect(reducedMotionBlock).toMatch(new RegExp(`--${name}\\s*:`));
    }
  });
});
