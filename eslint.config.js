// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';

// Computed from this config file's own location, not `process.cwd()` — see
// the `boundaries/root-path` setting below for why this matters.
const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config({
  ignores: [
    '**/dist/**',
    '**/dist-cjs/**',
    '**/build/**',
    '**/.next/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/storybook-static/**',
    'packages/database/generated/**',
  ],
}, js.configs.recommended, ...tseslint.configs.recommended, eslintConfigPrettier, {
  // Plain CommonJS Node config files (jest.config.js, etc.) — `module`/
  // `require`/`__dirname` aren't recognized globals by default under the
  // TS/ESM-oriented rules above.
  files: ['**/jest.config.js', '**/*.cjs'],
  languageOptions: {
    globals: globals.node,
  },
}, {
  // E3 T18's token-export generator (`packages/ui/scripts/`) — a plain
  // Node ESM build-time script, not `packages/ui/src`'s presentational
  // component code, so none of that directory's browser-only/no-Node-
  // globals restrictions (§13, the `no-restricted-globals` block below)
  // apply to it; `process`/`console` are exactly what a CLI generator is
  // expected to use.
  files: ['packages/ui/scripts/**/*.mjs'],
  languageOptions: {
    globals: globals.node,
  },
}, {
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
}, // Inter-package dependency boundaries (ADR-015, ARCHITECTURE.md §2.1;
// `ui-package` element added for E3 T2, docs/epics/E3-design-system-component-library.md §6a).
// Default-deny: a directory tier is only permitted to import another tier
// if explicitly allow-listed below — a new tier added later is unenforced
// only if someone deliberately allow-lists it, never silently permitted.
{
  files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}', 'services/**/*.{ts,tsx}'],
  plugins: { boundaries },
  settings: {
    // Without this, the plugin's root path defaults to `process.cwd()`,
    // which makes every rule below silently inert when ESLint is invoked
    // with a cwd inside a single package (e.g. `turbo run lint`'s
    // per-package `eslint .` fan-out) — the file's path-relative-to-cwd
    // string then matches no configured element pattern, so it (and every
    // import it makes) goes unclassified and unevaluated. A fixed,
    // absolute root makes classification identical regardless of
    // invocation cwd (E3 §6a).
    'boundaries/root-path': REPO_ROOT,
    'boundaries/elements': [
      // Intra-app frontend feature folders (E1 Part 12, remediates
      // Architecture Review "High 2") — listed BEFORE the broader `apps`
      // pattern below. eslint-plugin-boundaries' `folder` mode resolves a
      // file's element type by array order (first match wins) when
      // patterns overlap/nest, so the more specific pattern must come
      // first or every file under apps/web/src/features/** would silently
      // classify as the coarser `apps` type instead (verified empirically —
      // see node_modules/eslint-plugin-boundaries/src/core/elementsInfo.js).
      { type: 'web-feature', pattern: 'apps/web/src/features/*', mode: 'folder' },
      { type: 'admin-feature', pattern: 'apps/admin/src/features/*', mode: 'folder' },
      // `packages/ui` — listed before the broader `packages` pattern below
      // for the same first-match-wins reason. No trailing `/*`: in `folder`
      // mode the plugin expands a pattern to `<pattern>/**/*`, so `packages/ui`
      // (not `packages/ui/*`) is required for root-level files in the
      // package (e.g. `package.json`, `vitest.config.ts`) to classify as
      // `ui-package` too, rather than falling through to the generic
      // `packages` type (E3 §6a).
      { type: 'ui-package', pattern: 'packages/ui', mode: 'folder' },
      { type: 'apps', pattern: 'apps/*', mode: 'folder' },
      { type: 'packages', pattern: 'packages/*', mode: 'folder' },
      { type: 'services', pattern: 'services/*', mode: 'folder' },
    ],
    // Named project paths (not the bare `{ typescript: true }` boolean):
    // with the boolean form, `eslint-import-resolver-typescript` resolves
    // its tsconfig from `process.cwd()`, not from each linted file — which
    // silently fails for any root-invoked lint (e.g. `verify-boundary-lint.mjs`,
    // this repo's own `pnpm lint`, or a pre-commit hook), since the
    // repository root has no `tsconfig.json` of its own (only
    // `tsconfig.base.json`). Naming every workspace tsconfig here makes
    // root-invoked resolution work the same as per-package invocation
    // (E3 §6b, closing N-2).
    'import/resolver': {
      typescript: {
        project: [
          'tsconfig.base.json',
          'apps/*/tsconfig.json',
          'packages/*/tsconfig.json',
          'services/*/tsconfig.json',
        ],
      },
    },
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          { from: 'apps', allow: ['packages', 'ui-package'] },
          { from: 'services', allow: ['packages'] },
          { from: 'packages', allow: ['packages'] },
          { from: 'ui-package', allow: ['packages'] },
          // web-feature/admin-feature files are classified as their finer
          // feature type instead of the coarser `apps` type they're nested
          // under (see the ordering note above) — they need the same
          // apps-tier allowance restated explicitly (packages, ui-package),
          // PLUS an allowance for importing *other* features (the
          // entry-point rule below is what restricts that to index.ts
          // only — element-types just governs which tiers may talk to
          // which at all).
          { from: 'web-feature', allow: ['packages', 'ui-package', 'web-feature'] },
          { from: 'admin-feature', allow: ['packages', 'ui-package', 'admin-feature'] },
        ],
      },
    ],
    // A feature folder may only be imported via its index.ts (its public
    // entry point) — never a deep internal file. Same-feature internal
    // imports are exempt automatically (the rule only evaluates
    // cross-element dependencies). Scoped deliberately to web/admin
    // features only: `default: 'disallow'` applies to every dependency
    // type that reaches this rule, not just the ones named in `rules` —
    // without the explicit apps/packages/services/ui-package allow-all
    // below, the inter-package boundary (a separate, already-proven
    // mechanism) would incidentally also start requiring index.ts entry
    // points, which was never part of this rule's scope (verified
    // empirically — it did).
    'boundaries/entry-point': [
      'error',
      {
        default: 'disallow',
        rules: [
          // `allow: '*'` only matches a single path segment in micromatch
          // (this plugin's glob engine), so it silently rejected any
          // nested entry point (e.g. `dist/index.d.ts`, `src/index.ts`,
          // `dist/identity/index.d.ts`) the moment this rule was actually
          // evaluated against real files with a resolved element type —
          // which happens when ESLint is invoked from the repo root (e.g.
          // via lint-staged/husky), since `boundaries/root-path` defaults
          // to `process.cwd()`. `allow: '**'` matches any depth.
          { target: ['apps', 'packages', 'services', 'ui-package'], allow: '**' },
          { target: ['web-feature', 'admin-feature'], allow: 'index.ts' },
        ],
      },
    ],
  },
}, // Tailwind raw-palette restriction (E3 design document §14, corrected in
// remediation pass #6 — M-4 — to cover packages/ui as well as apps/web and
// apps/admin, not only the two apps). Forbids the class of ad hoc value
// CODING_STANDARDS.md §3 prohibits — hardcoded Tailwind color-scale
// utilities and arbitrary hex values — in favor of the semantic tokens
// packages/ui defines. Escape hatch: an inline
// `eslint-disable-next-line no-restricted-syntax` with a comment explaining
// why, per this rule's own documented exception mechanism.
//
// This block covers apps/web and apps/admin ONLY — packages/ui's own copy
// of this same restriction is combined into the single packages/ui block
// below, alongside its XSS/network/breakpoint rules. ESLint flat config
// does not merge a rule's array-valued options across multiple matching
// config objects — a later block's `no-restricted-syntax` entry replaces
// an earlier one outright for any file both match (verified empirically
// this pass) — so every `no-restricted-syntax` restriction that must apply
// to packages/ui has to live in exactly one config object for that file
// glob, not be spread across several that happen to overlap.
{
  files: ['apps/web/src/**/*.{ts,tsx}', 'apps/admin/src/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector:
          'JSXAttribute[name.name=/^(className|class)$/] Literal[value=/\\b(?:bg|text|border|ring|from|via|to|divide|outline|decoration|accent|caret|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}\\b/]',
        message:
          'Raw Tailwind palette utilities are forbidden (CODING_STANDARDS.md §3) — use a semantic token from packages/ui/src/styles/tokens.css instead. Escape hatch: eslint-disable-next-line with a comment explaining why.',
      },
      {
        selector:
          'JSXAttribute[name.name=/^(className|class)$/] Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]',
        message:
          'Arbitrary hex-value Tailwind utilities are forbidden (CODING_STANDARDS.md §3) — use a semantic token from packages/ui/src/styles/tokens.css instead. Escape hatch: eslint-disable-next-line with a comment explaining why.',
      },
    ],
  },
}, // packages/ui's combined write-time controls (E3 design document §13
// "AI", §14 "Security", §12.1 breakpoints — T2). One config object per the
// note above, since flat config replaces rather than merges a rule's
// array-valued options across matching blocks: XSS (no raw HTML, no
// javascript:/data: URLs), no network/env access (presentational-only
// boundary), the same Tailwind-palette restriction as the two apps, and
// packages/ui's own breakpoint-prefix restriction, all in this one
// `no-restricted-syntax` array. `no-restricted-globals` is a different rule
// key, so it does not have the same collision risk and could safely live
// in its own block — kept here anyway, next to the rest of this file's
// controls, for readability.
{
  files: ['packages/ui/src/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-globals': [
      'error',
      {
        name: 'fetch',
        message: 'packages/ui is presentational-only (E3 §13) — no network access. Pass data in via props.',
      },
      {
        name: 'XMLHttpRequest',
        message: 'packages/ui is presentational-only (E3 §13) — no network access. Pass data in via props.',
      },
      {
        name: 'process',
        message: 'packages/ui must not read process.env (E3 §13) — pass configuration in via props.',
      },
    ],
    'no-restricted-syntax': [
      'error',
      // XSS (§14)
      {
        selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
        message:
          'dangerouslySetInnerHTML is forbidden in packages/ui (E3 §14 XSS control) — use structured props instead.',
      },
      {
        selector: "JSXAttribute[name.name=/^(href|src)$/] Literal[value=/^\\s*(javascript|data):/i]",
        message: 'javascript:/data: URLs are forbidden in packages/ui (E3 §14 XSS control).',
      },
      {
        selector: "TemplateElement[value.raw=/^\\s*(javascript|data):/i]",
        message: 'javascript:/data: URLs are forbidden in packages/ui (E3 §14 XSS control).',
      },
      // Tailwind raw-palette restriction (§14, same rule as the apps/web
      // and apps/admin block above)
      {
        selector:
          'JSXAttribute[name.name=/^(className|class)$/] Literal[value=/\\b(?:bg|text|border|ring|from|via|to|divide|outline|decoration|accent|caret|fill|stroke)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}\\b/]',
        message:
          'Raw Tailwind palette utilities are forbidden (CODING_STANDARDS.md §3) — use a semantic token from packages/ui/src/styles/tokens.css instead. Escape hatch: eslint-disable-next-line with a comment explaining why.',
      },
      {
        selector:
          'JSXAttribute[name.name=/^(className|class)$/] Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]',
        message:
          'Arbitrary hex-value Tailwind utilities are forbidden (CODING_STANDARDS.md §3) — use a semantic token from packages/ui/src/styles/tokens.css instead. Escape hatch: eslint-disable-next-line with a comment explaining why.',
      },
      // Breakpoint-prefix restriction (§12.1, ownership corrected to T2 in
      // remediation pass #6 — P6-5). packages/ui declares its own
      // three-tier breakpoint scale (tablet:/desktop:, mobile-first base);
      // Tailwind's own default sm:/md:/lg:/xl:/2xl: prefixes must not
      // silently coexist with it.
      {
        selector:
          'JSXAttribute[name.name=/^(className|class)$/] Literal[value=/(?:^|\\s)(?:sm|md|lg|xl|2xl):/]',
        message:
          "Tailwind's default sm:/md:/lg:/xl:/2xl: breakpoint prefixes are forbidden in packages/ui — use tablet:/desktop: (E3 §12.1's breakpoint tokens); mobile is the unprefixed base.",
      },
    ],
  },
}, storybook.configs["flat/recommended"]);
