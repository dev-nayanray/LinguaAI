#!/usr/bin/env node
/**
 * ADR-024 (docs/DECISIONS.md) — Flutter design-token export generator.
 * Parses `../src/styles/tokens.css` with `postcss` (syntax-only parse, no
 * plugins — this reads the source AST, it does not compile Tailwind
 * output) and emits a JSON artifact matching ADR-024's documented schema.
 *
 * This artifact is never committed (ADR-024's "Decision"): `apps/mobile`'s
 * build invokes this script fresh on every build, from the current
 * `tokens.css` source, so no stale copy can ever exist. There is
 * deliberately no fallback/best-effort output — a broken source produces a
 * non-zero exit and a visible error, not a partially-correct artifact
 * (ADR-024's "Failure behavior").
 *
 * Naming-convention note: ADR-024's prose states the naming rule as
 * "the property's name, `--` stripped, kebab→camel" for every category,
 * but its own per-category "generated artifact shape" column and worked
 * JSON example both consistently use the *category-prefix-stripped* short
 * form for radius/shadows/breakpoints/motion (`radius: { sm, md, lg, pill
 * }`, not `radius: { radiusSm, ... }`) while using the *full, unstripped*
 * name for colors/typography (`colorPrimaryText`, `typeBodyMd`). This
 * implementation follows the concrete table + worked example (the more
 * specific, mechanically-checkable source) over the more general prose
 * paragraph, which is only actually accurate for 2 of the 7 categories —
 * flagged in the T18 report as a doc inconsistency, not silently picked
 * one way without a record of the other reading.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postcss from 'postcss';

const SCHEMA_VERSION = 1;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_CSS_PATH = path.resolve(__dirname, '../src/styles/tokens.css');

// Tailwind v4's default spacing scale — tokens.css's own header comment
// states this is intentionally not overridden there (it already matches
// DESIGN_SYSTEM.md §2.1), so ADR-024 specifies it as a hardcoded constant
// in the generator rather than parsed from source.
const SPACING_SCALE = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64 };

export class TokenGenerationError extends Error {}

function kebabToCamel(name) {
  return name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function stripLeadingDashes(customPropertyName) {
  return customPropertyName.replace(/^--/, '');
}

function toCamelKey(customPropertyName) {
  return kebabToCamel(stripLeadingDashes(customPropertyName));
}

function stripCategoryPrefix(customPropertyName, prefix) {
  return stripLeadingDashes(customPropertyName).slice(prefix.length);
}

function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parsePx(value, tokenName) {
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed); // unitless (e.g. "0", or the 5xl line-height "1")
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed);
  if (!match) {
    throw new TokenGenerationError(
      `Token "${tokenName}": expected a px or unitless numeric value, got "${value}"`,
    );
  }
  return Number(match[1]);
}

function parseMs(value, tokenName) {
  const match = /^(-?\d+(?:\.\d+)?)ms$/.exec(value.trim());
  if (!match) {
    throw new TokenGenerationError(`Token "${tokenName}": expected a ms duration value, got "${value}"`);
  }
  return Number(match[1]);
}

function parseHexColor(value, tokenName) {
  const trimmed = value.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
    throw new TokenGenerationError(`Token "${tokenName}": expected a 3/6/8-digit hex color, got "${value}"`);
  }
  return trimmed;
}

function parseCubicBezier(value, tokenName) {
  const match = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+)\s*\)$/.exec(value.trim());
  if (!match) {
    throw new TokenGenerationError(`Token "${tokenName}": expected a cubic-bezier(...) value, got "${value}"`);
  }
  return match.slice(1, 5).map((n) => Number(n.trim()));
}

function parseFontFamily(value, tokenName) {
  const first = splitTopLevel(value)[0];
  if (!first) throw new TokenGenerationError(`Token "${tokenName}": empty font-family value`);
  return first.trim().replace(/^['"]|['"]$/g, '');
}

function rgbToHex(r, g, b) {
  const hex = (n) => Math.round(Number(n)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// ADR-024's shadow-layer shape: `<offsetX> <offsetY> <blur> <spread>
// rgb(<r> <g> <b> / <alpha>)`, each length either bare (only valid for a
// zero value) or px-suffixed — the exact grammar every non-`none`
// --shadow-* value in tokens.css uses.
const SHADOW_LAYER_PATTERN =
  /^(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)\s*\)$/;

function parseShadow(value, tokenName) {
  const trimmed = value.trim();
  // ADR-024's explicit keyword-valued shadow rule: `none` maps to `[]`,
  // not a parse failure.
  if (trimmed === 'none') return [];

  return splitTopLevel(trimmed).map((layer) => {
    const match = SHADOW_LAYER_PATTERN.exec(layer);
    if (!match) {
      throw new TokenGenerationError(
        `Token "${tokenName}": shadow layer is neither "none" nor a valid box-shadow shorthand, got "${layer}"`,
      );
    }
    const [, offsetX, offsetY, blur, spread, r, g, b, alpha] = match;
    return {
      offsetX: Number(offsetX),
      offsetY: Number(offsetY),
      blur: Number(blur),
      spread: Number(spread),
      color: rgbToHex(r, g, b),
      opacity: Number(alpha),
    };
  });
}

function declsOf(rule) {
  const map = new Map();
  rule.each((node) => {
    if (node.type === 'decl') map.set(node.prop.trim(), node.value.trim());
  });
  return map;
}

/**
 * Locates the four top-level blocks the generator reads from — the plain
 * `@theme` block, `:root`, `[data-theme='dark']`, and `@theme inline` —
 * and every `@utility type-<name>` block. Only *direct* children of the
 * stylesheet root are considered, so the `@media (prefers-reduced-motion:
 * reduce) { :root { ... } }` override block (which redeclares the same
 * `--duration-*` names at a near-zero value) is never mistaken for the
 * real `:root`/duration values — a nested rule inside an unmatched
 * `@media` at-rule is simply never visited.
 */
function locateSections(root) {
  let themeRule = null;
  let themeInlineRule = null;
  let rootRule = null;
  let darkRule = null;
  const typeUtilityRules = [];

  root.each((node) => {
    if (node.type === 'atrule' && node.name === 'theme') {
      if (node.params.trim() === 'inline') themeInlineRule = node;
      else themeRule = node;
    } else if (node.type === 'atrule' && node.name === 'utility') {
      if (node.params.trim().startsWith('type-')) typeUtilityRules.push(node);
    } else if (node.type === 'rule' && node.selector === ':root') {
      rootRule = node;
    } else if (node.type === 'rule' && node.selector === "[data-theme='dark']") {
      darkRule = node;
    }
  });

  if (!themeRule) throw new TokenGenerationError('tokens.css: no top-level @theme block found');
  if (!themeInlineRule) throw new TokenGenerationError('tokens.css: no top-level @theme inline block found');
  if (!rootRule) throw new TokenGenerationError('tokens.css: no top-level :root block found');
  if (!darkRule) throw new TokenGenerationError("tokens.css: no top-level [data-theme='dark'] block found");

  return {
    theme: declsOf(themeRule),
    themeInline: declsOf(themeInlineRule),
    rawLight: declsOf(rootRule),
    rawDark: declsOf(darkRule),
    typeUtilityRules,
  };
}

function buildColors(theme, rawLight, rawDark, themeInline) {
  const colors = {};

  // Single-valued color anchors ("brand identity") and `-solid` fills,
  // declared directly in `@theme` — same hex both themes.
  for (const [prop, value] of theme) {
    if (!prop.startsWith('--color-')) continue;
    const hex = parseHexColor(value, prop);
    colors[toCamelKey(prop)] = { light: hex, dark: hex };
  }

  // Dual-valued semantic colors: `@theme inline` maps a public
  // `--color-X` to `var(--raw-color-Y)`; Y's light/dark values live in
  // `:root` / `[data-theme='dark']` respectively.
  for (const [publicProp, value] of themeInline) {
    const match = /^var\((--[a-z0-9-]+)\)$/.exec(value);
    if (!match) {
      throw new TokenGenerationError(
        `Token "${publicProp}": @theme inline value must be a single var(...) reference, got "${value}"`,
      );
    }
    const rawProp = match[1];
    if (!rawLight.has(rawProp)) {
      throw new TokenGenerationError(`Token "${publicProp}": references "${rawProp}", not found in :root`);
    }
    if (!rawDark.has(rawProp)) {
      throw new TokenGenerationError(
        `Token "${publicProp}": references "${rawProp}", not found in [data-theme='dark']`,
      );
    }
    colors[toCamelKey(publicProp)] = {
      light: parseHexColor(rawLight.get(rawProp), publicProp),
      dark: parseHexColor(rawDark.get(rawProp), publicProp),
    };
  }

  if (Object.keys(colors).length === 0) throw new TokenGenerationError('No --color-* tokens found in tokens.css');
  return colors;
}

function buildRadius(theme) {
  const radius = {};
  for (const [prop, value] of theme) {
    if (!prop.startsWith('--radius-')) continue;
    radius[kebabToCamel(stripCategoryPrefix(prop, 'radius-'))] = parsePx(value, prop);
  }
  if (Object.keys(radius).length === 0) throw new TokenGenerationError('No --radius-* tokens found in tokens.css');
  return radius;
}

function buildShadows(theme) {
  const shadows = {};
  for (const [prop, value] of theme) {
    if (!prop.startsWith('--shadow-')) continue;
    shadows[kebabToCamel(stripCategoryPrefix(prop, 'shadow-'))] = parseShadow(value, prop);
  }
  if (Object.keys(shadows).length === 0) throw new TokenGenerationError('No --shadow-* tokens found in tokens.css');
  return shadows;
}

function buildBreakpoints(theme) {
  const breakpoints = {};
  for (const [prop, value] of theme) {
    if (!prop.startsWith('--breakpoint-')) continue;
    breakpoints[kebabToCamel(stripCategoryPrefix(prop, 'breakpoint-'))] = parsePx(value, prop);
  }
  if (Object.keys(breakpoints).length === 0) {
    throw new TokenGenerationError('No --breakpoint-* tokens found in tokens.css');
  }
  return breakpoints;
}

function buildMotion(theme) {
  const durations = {};
  const easing = {};
  for (const [prop, value] of theme) {
    if (prop.startsWith('--duration-')) {
      durations[kebabToCamel(stripCategoryPrefix(prop, 'duration-'))] = parseMs(value, prop);
    } else if (prop.startsWith('--ease-')) {
      easing[kebabToCamel(stripCategoryPrefix(prop, 'ease-'))] = parseCubicBezier(value, prop);
    }
  }
  if (Object.keys(durations).length === 0) {
    throw new TokenGenerationError('No --duration-* tokens found in tokens.css');
  }
  if (Object.keys(easing).length === 0) throw new TokenGenerationError('No --ease-* tokens found in tokens.css');
  return { durations, easing };
}

/**
 * Typography schema-validation rule (ADR-024): every `@utility
 * type-<name>` block must declare all four of font-size/line-height/
 * font-weight/font-family, each a `var(...)` reference that resolves
 * against a `@theme`-declared Tier-1 primitive. A missing declaration or
 * an unresolvable reference fails the build, naming the specific token
 * and field — not a silently-incomplete Flutter `TextStyle`.
 */
function buildTypography(theme, typeUtilityRules) {
  const typography = {};

  for (const rule of typeUtilityRules) {
    const utilityName = rule.params.trim();
    const decls = declsOf(rule);

    const required = ['font-size', 'line-height', 'font-weight', 'font-family'];
    const missing = required.filter((prop) => !decls.has(prop));
    if (missing.length > 0) {
      throw new TokenGenerationError(
        `Typography token "${utilityName}" is missing required declaration(s): ${missing.join(', ')}`,
      );
    }

    const resolveVar = (fieldName) => {
      const declValue = decls.get(fieldName);
      const match = /^var\((--[a-z0-9-]+)\)$/.exec(declValue);
      if (!match) {
        throw new TokenGenerationError(
          `Typography token "${utilityName}": "${fieldName}" must be a var(...) reference to a Tier-1 primitive, got "${declValue}"`,
        );
      }
      const primitiveProp = match[1];
      if (!theme.has(primitiveProp)) {
        throw new TokenGenerationError(
          `Typography token "${utilityName}": "${fieldName}" references "${primitiveProp}", which does not resolve to a declared Tier-1 primitive`,
        );
      }
      return theme.get(primitiveProp);
    };

    typography[kebabToCamel(utilityName)] = {
      fontSize: parsePx(resolveVar('font-size'), `${utilityName} font-size`),
      lineHeight: parsePx(resolveVar('line-height'), `${utilityName} line-height`),
      fontWeight: Number(resolveVar('font-weight')),
      fontFamily: parseFontFamily(resolveVar('font-family'), `${utilityName} font-family`),
    };
  }

  if (Object.keys(typography).length === 0) {
    throw new TokenGenerationError('No @utility type-* tokens found in tokens.css');
  }
  return typography;
}

/** Pure function: CSS source text in, the ADR-024 artifact object out. No filesystem access — the piece the test suite exercises directly for the failure-behavior cases. */
export function generateFromCss(cssText) {
  let root;
  try {
    root = postcss.parse(cssText);
  } catch (err) {
    throw new TokenGenerationError(`tokens.css failed to parse: ${err.message}`);
  }

  const { theme, rawLight, rawDark, themeInline, typeUtilityRules } = locateSections(root);

  return {
    schemaVersion: SCHEMA_VERSION,
    colors: buildColors(theme, rawLight, rawDark, themeInline),
    radius: buildRadius(theme),
    shadows: buildShadows(theme),
    spacing: SPACING_SCALE,
    typography: buildTypography(theme, typeUtilityRules),
    breakpoints: buildBreakpoints(theme),
    motion: buildMotion(theme),
  };
}

/** Reads the real `tokens.css` and generates the artifact — what `apps/mobile`'s build actually invokes. */
export function generate() {
  return generateFromCss(readFileSync(TOKENS_CSS_PATH, 'utf8'));
}

function main() {
  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex !== -1 ? process.argv[outIndex + 1] : null;

  let artifact;
  try {
    artifact = generate();
  } catch (err) {
    if (err instanceof TokenGenerationError) {
      console.error(`generate-tokens: ${err.message}`);
    } else {
      console.error('generate-tokens: unexpected error');
      console.error(err);
    }
    process.exitCode = 1;
    return;
  }

  const json = JSON.stringify(artifact, null, 2) + '\n';
  if (outPath) writeFileSync(outPath, json);
  else process.stdout.write(json);
}

// `file://${process.argv[1]}` would never match `import.meta.url` on
// Windows (a backslash-form `argv[1]` versus a proper `file:///C:/...`
// URL) — comparing resolved filesystem paths via `fileURLToPath` is the
// portable way to detect "this module was run directly," not string-
// building a URL by hand.
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  main();
}
