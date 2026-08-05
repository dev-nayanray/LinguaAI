// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';

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
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
}, // Inter-package dependency boundaries (ADR-015, ARCHITECTURE.md §2.1).
// Default-deny: a directory tier is only permitted to import another tier
// if explicitly allow-listed below — a new tier added later is unenforced
// only if someone deliberately allow-lists it, never silently permitted.
{
  files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}', 'services/**/*.{ts,tsx}'],
  plugins: { boundaries },
  settings: {
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
      { type: 'apps', pattern: 'apps/*', mode: 'folder' },
      { type: 'packages', pattern: 'packages/*', mode: 'folder' },
      { type: 'services', pattern: 'services/*', mode: 'folder' },
    ],
    'import/resolver': {
      typescript: true,
    },
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          { from: 'apps', allow: ['packages'] },
          { from: 'services', allow: ['packages'] },
          { from: 'packages', allow: ['packages'] },
          // web-feature/admin-feature files are classified as their finer
          // feature type instead of the coarser `apps` type they're nested
          // under (see the ordering note above) — they need the same
          // apps-tier allowance restated explicitly (packages), PLUS an
          // allowance for importing *other* features (the entry-point rule
          // below is what restricts that to index.ts only — element-types
          // just governs which tiers may talk to which at all).
          { from: 'web-feature', allow: ['packages', 'web-feature'] },
          { from: 'admin-feature', allow: ['packages', 'admin-feature'] },
        ],
      },
    ],
    // A feature folder may only be imported via its index.ts (its public
    // entry point) — never a deep internal file. Same-feature internal
    // imports are exempt automatically (the rule only evaluates
    // cross-element dependencies). Scoped deliberately to web/admin
    // features only: `default: 'disallow'` applies to every dependency
    // type that reaches this rule, not just the ones named in `rules` —
    // without the explicit apps/packages/services allow-all below, T3's
    // inter-package boundary (a separate, already-proven mechanism) would
    // incidentally also start requiring index.ts entry points, which was
    // never part of this task's scope (verified empirically — it did).
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
          { target: ['apps', 'packages', 'services'], allow: '**' },
          { target: ['web-feature', 'admin-feature'], allow: 'index.ts' },
        ],
      },
    ],
  },
}, storybook.configs["flat/recommended"]);
