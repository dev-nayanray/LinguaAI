# Epic E3 — Sixth Independent Architecture Gate Review

**Subject:** `docs/epics/E3-design-system-component-library.md` (Remediation Pass #5, last updated 2026-08-05)
**Reviewer:** Sixth independent Architecture Gate reviewer — not the author, not any of the first five reviewers, no prior involvement in any E3 design or remediation pass.
**Date:** 2026-08-05
**Method:** Every claim below was re-derived from repository state by direct file read, command execution, or independent computation. No claim from the design document, from any `E3-remediation-report-v*.md`, from `docs/DECISIONS.md`, or from `docs/RISK_REGISTER.md` was accepted without re-derivation. Prior reviews' "closed" verdicts were re-checked, not inherited.

**Decision: NO GO** (see §11).

---

## 0. Executive Summary

The design document is materially stronger than a five-NO-GO history suggests. I independently re-executed the two hardest technical claims in it — the `eslint-plugin-boundaries` root-path diagnosis and the entire WCAG contrast grid — and **both are correct in every particular I could test**. I implemented the WCAG 2.1 contrast formula from scratch, sanity-checked it against five published reference ratios, and recomputed 100+ published cells: **every single published ratio in §12.1 matches my independent computation to three decimal places.** I reproduced the boundary-lint discrepancy, the `allow: '*'` nested-path defect, the `ui-package` element-pattern granularity fix, the bare-specifier fixture-import failure mode, and the `@ui/*` `tsc` failure — all by execution, all confirmed. The fifth review's N-1 through N-8 are all genuinely closed. ADR-024/025/026 all remain `Status: Proposed` in both their own blocks and the ADR index; there is no self-approval.

That said, my own verification found defects the previous five passes did not look for. The blocking one is **P6-1**: the entire Tier-2 typography token layer (`--type-*`) — one of the four token scales `BR-4` names as the single source of truth, a named T1 deliverable, and a required ADR-024 export category — has **no implementable representation**. Tailwind v4.3.3 (the installed version) has no `--type-*` theme namespace; a single CSS custom property cannot carry the size _and_ weight the §12.1a table assigns to each Tier-2 token; and ADR-024 requires the generator to emit `{fontSize, lineHeight, fontWeight, fontFamily}` per Tier-2 name by parsing `tokens.css`, where two of those four values exist in no declaration at all. This is exactly the defect class the document itself diagnosed and solved for `--duration-*` (via `@utility` blocks) and left unsolved one section later. T1 and T18 both inherit an undefined contract.

Alongside that: three Medium findings (a required component with no contract plus an unspecified composite-widget family; an AI-purple token named `secondary` that collides with the shipped `secondary` Button variant and with `DESIGN_SYSTEM.md`'s purple-exclusivity rule; a quality gate whose blocking criterion has no enforcing control and a known-failing file), and six Lows.

---

## 1. Document Integrity Verification

**Self-containment — verified mechanically.** I extracted every internal `§` reference in the design document and compared it against every heading actually present:

```
$ grep -oE '§ ?[0-9]+[a-z]?(\.[0-9]+[a-z]?)*' docs/epics/E3-design-system-component-library.md | tr -d ' ' | sort -u
```

Internal references used: §0, §1, §3, §6, §6a, §6b, §6c, §6d, §7, §8, §9, §12.1, §12.1a, §12.2, §12.4, §12.5, §13, §14, §15, §17, §18, §20, §21, §23, §24, §25, §26, §27. Headings present cover all of these (lines 15–698). §2/§2.1/§2.2/§3/§4/§5/§7/§9 also appear as references into `DESIGN_SYSTEM.md`, `TESTING.md`, `PERFORMANCE.md` and `CODING_STANDARDS.md`; each resolves (verified individually below). **No dangling internal reference exists.** No "unchanged from Pass 1"/"see previous pass" pointer exists — I grepped for `unchanged from`, `prior revision`, and `previous pass`; the only occurrences are the §0 narrative explaining _why_ such pointers were removed, plus the explicitly-labelled changelog tables.

Task references T1–T18: all defined in §20 (T4 explicitly reserved). Risk references R-54–R-65: all present in `RISK_REGISTER.md` (verified below). Every component category's "Owning task" in §12.2 (T1, T5, T7–T14) resolves to a real §20 row.

**ADR resolution.**

| ADR     | Resolves in `DECISIONS.md`? | Status in own block                                                                            | Status in index table | Content check                                                                                                                                                                                                                                                                             |
| ------- | --------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-024 | Yes, lines 173–234          | `**Status:** Proposed — pending Architecture Gate approval of E3's design, not self-approved.` | `Proposed`            | **Complete specification present, not a pointer** — token-category mapping table (8 categories), naming convention, schema versioning, consumer compatibility rules, schema evolution, failure behavior, unsupported categories (`--z-index-*`), keyword-shadow rule, worked JSON example |
| ADR-025 | Yes, lines 236–244          | `**Status:** Proposed — ... not self-approved.`                                                | `Proposed`            | Decision, alternatives, consequences, security, reversibility all present; no pass-number hardcoded (L-6 closed)                                                                                                                                                                          |
| ADR-026 | Yes, lines 246–254          | `**Status:** Proposed — ... not self-approved.`                                                | `Proposed`            | WAF decision stated plainly, not either/or (see §7 below)                                                                                                                                                                                                                                 |

**All three remain Proposed in both places. No status flip occurred. No self-approval.** §23 of the design document also states "All three remain **Proposed** — none is self-approved by this document," which matches the literal `DECISIONS.md` text.

**Decision-relocation check.** ADR-024's full specification was moved from the design document's §23 into `DECISIONS.md`. Both ends now agree: §23 says "The full specification ... lives entirely in DECISIONS.md's ADR-024 text — not here, and not duplicated here," and ADR-024's own "Canonical-source note (E3 remediation pass #4)" says the same in reverse. **Both ends updated; no orphaned pointer.** The design document no longer inlines ADR text anywhere, so the ADR-026 double-copy defect (L-2) is structurally closed.

**One residual document-integrity defect found (P6-9, Low):** §0's Remediation-Pass-#4 changelog table (line 40) still describes the current state as "§12.1 adds a computed 'Primary (default) text token' table: `--color-text` (light, existing) and **a new `--color-text-dark`**." Seventeen lines later, the Pass-#5 table (line 57) records that `--color-text-dark` was removed. A reader of §0 encounters the superseded statement first, presented in the present tense.

---

## 2. Token System Verification (Critical)

### 2.1 My own contrast implementation

I implemented WCAG 2.1 relative luminance and contrast from scratch (sRGB linearization at the 0.03928 threshold, `0.2126R + 0.7152G + 0.0722B`, `(L_lighter + 0.05)/(L_darker + 0.05)`) in a throwaway Node script outside the repository, and sanity-checked it against five published reference ratios before using it:

```
#dc2626 vs #ffffff (published 4.83): 4.829
#767676 vs #ffffff (published 4.54): 4.542
#000000 vs #ffffff (published 21.00): 21.000
#2563eb vs #ffffff (published ~5.17): 5.169
#777777 vs #ffffff (published 4.48): 4.478
```

All five match. The implementation is sound.

### 2.2 Recomputation of the published grid — every cell

I recomputed **every** cell of §12.1's tables against all four surfaces in both themes, not a sample. Results, abbreviated:

| Table                                                                            | Cells recomputed | Discrepancies vs. published |
| -------------------------------------------------------------------------------- | ---------------- | --------------------------- |
| Semantic text tokens, light (8 tokens × 4 surfaces)                              | 32               | **0**                       |
| Semantic text tokens, dark (8 tokens × 4 surfaces)                               | 32               | **0**                       |
| `--color-text` light + dark (2 × 4)                                              | 8                | **0**                       |
| `--color-border` old values (fail demonstration, 2 × 4)                          | 8                | **0**                       |
| `--color-border` corrected (2 × 4)                                               | 8                | **0**                       |
| `--color-focus-ring` (2 × 4)                                                     | 8                | **0**                       |
| Solid fills, white-on-fill (6)                                                   | 6                | **0**                       |
| Raw anchors, white-on-fill (5)                                                   | 5                | **0**                       |
| Disabled tokens, informational ranges (2 × 4)                                    | 8                | **0**                       |
| Corrected-value justifications (danger anchor on muted; info anchor on all four) | 8                | **0**                       |

Specific spot checks the review scope named:

- **Border cells.** Light `#64748b`: 4.548 / 4.759 / 4.344 / 4.759. Dark `#94a3b8`: 7.868 / 6.963 / 5.705 / 4.978. All ≥ 3:1, all ≥ 4.5:1 as the document claims. Old values genuinely fail (light `#e2e8f0`: 1.178 / 1.233 / 1.125 / 1.233 — a 2.4–2.7× shortfall against the 3:1 floor, consistent with the document's "~2.5–4×" characterisation).
- **Focus-ring cells.** Light `#2563eb`: 4.940 / 5.169 / 4.718 / 5.169. Dark `#60a5fa`: 7.934 / 7.022 / 5.754 / 5.020. All ≥ 3:1.
- **Solid-fill cells.** primary 5.169, secondary 5.699, accent 5.358, success 5.016, warning 5.022, danger 5.737. All ≥ 4.5:1, all matching.
- **Primary text token.** `--color-text` light `#0f172a`: 17.063 / 17.853 / 16.296 / 17.853. Dark `#f1f5f9`: 18.414 / 16.296 / 13.353 / **11.650** — matching the document's stated minimum of 11.650 exactly.
- **Disabled tokens.** Light `#94a3b8` ranges 2.340–2.564 (document: "2.340–2.564:1"). Dark `#64748b` ranges 2.682–4.239 (document: "2.682–4.239:1"). Exact match. The WCAG 2.1 non-text-contrast exemption for inactive/disabled components is correctly invoked, and the exclusion from §17's pass/fail test is correctly justified as structural.
- **The `--color-surface-elevated` dark correction claim.** The document says old `#334155` "left four dark-mode text tokens below 4.5:1." I computed all eight against `#334155`: primary 4.073, secondary 3.805, danger 3.743, neutral 4.038 fail; accent 5.730, success 5.942, warning 6.203, info 4.834 pass. **Exactly four.** Claim verified.
- **The corrected-values justifications.** Danger anchor `#dc2626` on `--color-surface-muted` = 4.408 (document: 4.408, below 4.5 — correct). Info anchor `#0284c7` = 3.914 / 4.095 / 3.738 / 4.095 (document: "3.914 / 4.095 / 3.738" — correct, fails every light surface). Raw anchor white-on-fill: accent 2.428, success 2.279, warning 2.148 (document: identical).

**Not one published number in §12.1 is wrong.** This is a genuinely rigorous piece of work and it is the strongest section of the document.

### 2.3 Bidirectional reconciliation — Direction B (`tokens.css` → document)

I read `packages/ui/src/styles/tokens.css` in full (76 lines). It declares exactly eight color custom properties:

`--color-primary` `#2563eb`, `--color-ai` `#7c3aed`, `--color-accent` `#06b6d4`, `--color-success` `#22c55e`, `--color-warning` `#f59e0b`, `--color-bg` `#f8fafc`, `--color-bg-dark` `#020617`, `--color-text` `#0f172a`.

| Shipped token     | Covered in §12.1?                                                         |
| ----------------- | ------------------------------------------------------------------------- |
| `--color-primary` | Yes — brand anchor + `--color-primary-solid` row (5.169)                  |
| `--color-ai`      | Yes — brand anchor + `--color-secondary-solid` row (5.699)                |
| `--color-accent`  | Yes — anchor, white-on-fill computed (2.428), decorative-only rule stated |
| `--color-success` | Yes — anchor (2.279), decorative-only                                     |
| `--color-warning` | Yes — anchor (2.148), decorative-only                                     |
| `--color-bg`      | Yes — surfaces table                                                      |
| `--color-bg-dark` | Yes, implicitly — the dark column of the `--color-bg` surfaces row        |
| `--color-text`    | Yes — own computed table, both raw values                                 |

**Direction B is clean.** No shipped color token is missing from the document.

### 2.4 Bidirectional reconciliation — Direction A (document → validated row)

I enumerated every `--`-prefixed identifier in the design document mechanically and audited each color token:

Every one of `--color-accent{,-solid,-text}`, `--color-ai`, `--color-bg{,-dark}`, `--color-border`, `--color-danger{,-solid,-text}`, `--color-disabled-{bg,text}`, `--color-focus-ring`, `--color-info{,-text}`, `--color-neutral-text`, `--color-primary{,-solid,-text}`, `--color-secondary-{solid,text}`, `--color-success{,-solid,-text}`, `--color-surface{,-muted,-elevated}`, `--color-text`, `--color-warning{,-solid,-text}` **has a defined value, a stated semantic meaning, light and dark values where applicable, and either a validated row or an explicitly-justified exemption.**

`--color-text-dark` still appears twice, but only in the two changelog rows narrating its introduction and removal — it is not a live token. `--button-bg` is the Component-tier worked example and correctly references the now-validated `--color-primary-solid`.

**Conclusion: N-1 is genuinely closed. The bidirectional reconciliation now holds in both directions.** This is the first pass for which that is true, and I state it plainly.

Two asymmetry observations, neither a Direction-A or Direction-B gap (neither token is named anywhere or shipped anywhere, so neither is a validation failure): there is no `--color-info-solid` despite `--color-info-text` existing alongside five other hue pairs that all have one; and there is no `--color-secondary` anchor name, only `-text`/`-solid` variants whose anchor is `--color-ai` — which produces P6-3 below.

### 2.5 Cross-check against `DESIGN_SYSTEM.md`

- **§2 color table:** contains exactly `--color-primary`, `--color-ai`, `--color-accent`, `--color-success`, `--color-warning`, `--color-bg`, `--color-bg-dark`, `--color-text`. It contains **no `danger` and no `info` row.** The design document's §3 Non-Goals nevertheless states it will not reopen "DESIGN_SYSTEM.md's brand decisions (the anchor hex values for primary/AI-purple/accent/success/warning/**danger/info**)" — attributing two anchors to the canonical document that the canonical document does not contain, and contradicting the design document's own §12.1, which correctly says there are **five** anchors. (P6-6, Low.)
- **§2.1 spacing/radius/elevation/z-index:** matches `tokens.css` exactly; the design document does not propose changing them. Correct.
- **§2.2 motion:** floor is "micro-interactions 150–200ms, standard transitions 200–300ms, celebratory ... up to 600ms." Shipped `tokens.css` has 150/250/600ms. The design document now correctly carries these forward unchanged (F-5 closed — verified by reading both files).
- **§3 typography:** "a fixed modular scale ... from `xs` ... through `4xl`/`5xl`" — §12.1a's Tier 1 matches this literally. Tier 2 does not have an implementable form (see §8 / P6-1).
- **§5 accessibility:** "Minimum 4.5:1 contrast for body text, 3:1 for large text/UI components, validated for both light and dark themes" — §12.1's floors match.
- **AI-purple exclusivity:** "Purple is reserved exclusively for AI-originated content/actions. It must never be reused for generic decoration." See P6-3.

---

## 3. Boundary Enforcement Verification

### 3.1 Current repository state — read directly

`eslint.config.js` (105 lines, read in full) confirms every claim in §6a's "Current state" paragraph:

- Element types: `web-feature`, `admin-feature`, `apps`, `packages`, `services` — **no `ui-package` type** (lines 44–58).
- `boundaries/element-types` rules include `{ from: 'packages', allow: ['packages'] }` (line 71) — any package may import any package, `packages/ui` included.
- `boundaries/entry-point`: `{ target: ['apps', 'packages', 'services'], allow: '*' }` (line 99).
- `'import/resolver': { typescript: true }` — the bare boolean form (lines 59–61).
- **No `boundaries/root-path` setting anywhere.**
- Repository root contains `tsconfig.base.json` only — **no root `tsconfig.json`** (verified by `ls tsconfig*.json`).

### 3.2 Plugin mechanism — read from installed source

Installed version confirmed `4.2.2`, matching `package.json`'s `^4.2.2`.

`node_modules/eslint-plugin-boundaries/src/helpers/settings.js`:

```js
const rootPathUserSetting = process.env[ENV_ROOT_PATH] || settings[ROOT_PATH];
if (rootPathUserSetting) { return isAbsolute(...) ? ... : resolve(process.cwd(), ...); }
return process.cwd();
```

`node_modules/eslint-plugin-boundaries/src/core/elementsInfo.js`:

```js
function projectPath(absolutePath, rootPath) {
  return replacePathSlashes(absolutePath).replace(`${replacePathSlashes(rootPath)}/`, '');
}
// used at line 206 (dependency) and line 248 (linted file)
```

`ENV_ROOT_PATH` resolves to `ESLINT_PLUGIN_BOUNDARIES_ROOT_PATH` (`src/constants/settings.js:24` + `src/constants/plugin.js:2`). **The design document's mechanism description is exactly correct, including the env-var name it used for its own testing.**

### 3.3 (a) The per-package-vs-root discrepancy — EXECUTED

Same pre-existing fixture, same current committed config, two invocation shapes:

```
$ cd apps/web && ../../node_modules/.bin/eslint src/features/__boundary_fixture_b__/deep-violator.ts --no-warn-ignored
EXIT=0                                            # ZERO errors

$ cd <repo root> && ./node_modules/.bin/eslint apps/web/src/features/__boundary_fixture_b__/deep-violator.ts --no-warn-ignored
  4:27  error  No rule allows the entry point 'internal.ts' in dependencies of type 'web-feature'  boundaries/entry-point
EXIT=1
```

**The design document's central diagnosis is TRUE today.** `turbo run lint`'s per-package fan-out (`eslint .` with cwd = the package directory, confirmed from `apps/web/package.json`'s `"lint": "eslint ."`) evaluates **no** boundary rule against real per-package source. The only place boundary rules currently bite is `scripts/verify-boundary-lint.mjs`'s eight explicit-path, root-invoked checks (I read the script; there are exactly eight, six ESLint-based and two dependency-cruiser-based, matching the document).

### 3.4 The CI-breaking consequence — EXECUTED

```
$ cd apps/web && ESLINT_PLUGIN_BOUNDARIES_ROOT_PATH="C:/Users/USER/Desktop/LinguaAI" \
    ../../node_modules/.bin/eslint src/features/__boundary_fixture_b__/deep-violator.ts --no-warn-ignored
  4:27  error  ...  boundaries/entry-point
EXIT=1
```

**Confirmed:** the moment the root-path fix lands, `apps/web`'s own `eslint .` — and therefore `turbo run lint` → `pnpm lint` → CI — fails permanently on a permanent fixture. §6a's operational rollout fix is genuinely necessary, and its `--ignore-pattern` mitigation works (verified: with `--ignore-pattern 'src/features/__boundary_fixture_*/**'` the fixture directory is fully excluded). `verify-boundary-lint.mjs` passes no such flag, so its explicit-path check is unaffected. `apps/admin/src/features` **does not exist** (verified by `ls`), so the document's claim that only `apps/web`'s lint script needs changing is correct.

### 3.5 (b) The corrected settings block — BUILT AND SWEPT

I built a temporary ESLint config replicating §6a's corrected settings block verbatim (`boundaries/root-path` computed from the config file's own location, `ui-package` at `packages/ui` with no trailing `/*`, `allow: '**'` for the entry-point rule, and the six element-type rules) and swept the whole workspace:

```
$ ./node_modules/.bin/eslint --config <temp> --no-config-lookup apps packages services
apps/web/src/features/__boundary_fixture_b__/deep-violator.ts
  4:27  error  ... boundaries/entry-point
packages/__boundary_fixture__/index.ts
  7:25  error  ... File is of type 'packages'. Dependency is of type 'apps'  boundaries/element-types

✖ 2 problems (2 errors, 0 warnings)
```

**Exactly two violations, both pre-existing deliberate fixtures — matching the document's claim precisely.**

I then probed each intended rule outcome with throwaway fixtures:

| Probe                                                                       | Result                                                                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `packages/__boundary_fixture__` → `packages/ui` (relative import)           | **Caught**: `File is of type 'packages'. Dependency is of type 'ui-package'`                                      |
| `packages/database/src` → `packages/ui` (relative import)                   | **Caught**: same message                                                                                          |
| `packages/ui/src` → `services/ai-engine`                                    | **Caught**: `File is of type 'ui-package'. Dependency is of type 'services'`                                      |
| `packages/ui/__e3probe_root__.ts` (root-level file) → `services/*`          | **Caught, classified `ui-package`** — confirms the `packages/ui` (no `/*`) pattern granularity fix                |
| `apps/web` → `packages/ui` (real `@linguaai/ui` import in `login/page.tsx`) | **Allowed** (zero errors in the sweep)                                                                            |
| `packages/__boundary_fixture__` → `@linguaai/ui` (**bare specifier**)       | **Silently NOT caught** — confirms L-5's diagnosis and the requirement that the new fixture use a relative import |

**The intended rule set is confirmed exactly as specified: `apps/* → packages/ui` allowed; `packages/* → packages/ui`, `packages/ui → services/*` forbidden.** I found no infra/deployment-tier import path in `packages/ui` to test (none exists).

I additionally verified §6a's _second_ claimed defect, the `allow: '*'` nested-path failure, against the **current committed** config with only the root-path env override applied:

```
  2:20  error  No rule allows the entry point 'src/index.ts' in dependencies of type 'packages'  boundaries/entry-point
```

Reproduced for both a `packages/*` importer and an `apps/*` importer. Under the corrected `allow: '**'` the same imports produce no entry-point error. **Claim verified.**

All temporary fixtures and the temporary config were deleted; `git status --porcelain | grep e3probe` returns nothing.

**§6a is, in my assessment, correct and fully verified. I found no defect in it.**

---

## 4. Alias and Resolver Verification

All eleven configuration surfaces read directly.

| File                             | Current state (verified)                                          |
| -------------------------------- | ----------------------------------------------------------------- |
| `packages/ui/tsconfig.json`      | Extends `tsconfig.base.json`; **no `baseUrl`, no `paths`**        |
| `tsconfig.base.json`             | **No `paths`**; `moduleResolution: "Bundler"`                     |
| `apps/web/tsconfig.json`         | `"paths": { "@/*": ["./src/*"] }` only                            |
| `apps/admin/tsconfig.json`       | Identical — `"@/*"` only                                          |
| `apps/web/next.config.ts`        | `transpilePackages: ['@linguaai/ui', ...]`; **no alias**          |
| `apps/admin/next.config.ts`      | Identical                                                         |
| `packages/ui/vitest.config.ts`   | **No `resolve` block at all**                                     |
| `apps/web/vitest.config.ts`      | `resolve.alias` for `@` only                                      |
| `apps/admin/vitest.config.ts`    | `resolve.alias` for `@` only                                      |
| `packages/ui/.storybook/main.ts` | `viteFinal` present (registers `@tailwindcss/vite`); **no alias** |
| `packages/ui/components.json`    | Every alias under `@/` (`"utils": "@/lib/cn"` etc.)               |
| `eslint.config.js`               | `'import/resolver': { typescript: true }`                         |

**Reproduction of the TypeScript failure — EXECUTED.** I created a probe inside `packages/ui/src` importing `@ui/lib/cn`, made it reachable from `apps/web`'s program via a temporary consumer file, and ran the app's own type-check:

```
$ ./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
packages/ui/src/__e3probe_alias__.ts(2,20): error TS2307: Cannot find module '@ui/lib/cn' or its corresponding type declarations.
```

**Exactly the failure the document reports, for exactly the reason it gives.** Both probes deleted.

**Per-resolver-class assessment for `import { cn } from "@ui/lib/cn"` written inside `packages/ui`'s own source:**

| Resolver class                                                            | Resolves today?                                                                                      | Is the document's claim true today?                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS compiler, `packages/ui`'s own `typecheck`                              | **No** — no `paths` anywhere in its config chain                                                     | Yes — stated as a T3 deliverable                                                                                                                                                                                                                                                                                                            |
| TS compiler, `apps/web` / `apps/admin` programs (via `transpilePackages`) | **No** — reproduced above                                                                            | Yes — stated as a T3 deliverable, with the exact `tsc` output                                                                                                                                                                                                                                                                               |
| Next bundler (Turbopack/webpack), both apps' builds                       | **No** — no `resolveAlias`/`resolve.alias` in either `next.config.ts`                                | Yes — stated as a T3 deliverable                                                                                                                                                                                                                                                                                                            |
| `packages/ui`'s own Vitest                                                | **No** — no `resolve` block                                                                          | Yes — stated as a T3 deliverable                                                                                                                                                                                                                                                                                                            |
| `apps/web` / `apps/admin` Vitest                                          | **No** — `@` only                                                                                    | Yes — stated as a T3 deliverable (F-2's fix)                                                                                                                                                                                                                                                                                                |
| Storybook Vite                                                            | **No** — `viteFinal` has no alias                                                                    | Yes — stated as a T3 deliverable                                                                                                                                                                                                                                                                                                            |
| ESLint `eslint-import-resolver-typescript@3.10.1`                         | **No at root invocation** (no root `tsconfig.json` — verified); would work per-package once T3 lands | **Yes, and honestly stated.** §6b explicitly retracts the prior incorrect claim, describes the real `initMappers()`/`process.cwd()` mechanism, labels the current state a "real, silent enforcement blind spot," and adds a corrected T2 deliverable (an explicit `import/resolver` project list) plus a fourth T3 acceptance-evidence item |
| Jest                                                                      | N/A — neither app uses it (`"test": "vitest run --coverage"` in both `package.json`s, verified)      | Yes                                                                                                                                                                                                                                                                                                                                         |
| TS project references                                                     | N/A — neither app declares `references` or `composite` (verified)                                    | Yes                                                                                                                                                                                                                                                                                                                                         |

**The ten-file list is complete for every resolver class I could identify**, and the document is scrupulously honest that none of it is applied: every entry is labelled "a T3 deliverable, none of it applied to the repository by this document." N-2 is genuinely closed. I found no additional resolver class the list misses.

_Non-blocking observation:_ the specified Turbopack form is `turbopack.resolveAlias: { '@ui': '../../packages/ui/src' }`. Turbopack reads `tsconfig.json` `paths` natively, so the `tsconfig` entry may make this redundant; conversely, Turbopack's `resolveAlias` is documented primarily for module-name mapping rather than webpack-style prefix aliasing, so the exact form warrants a build check at T3 rather than assumption. The document's own T3 evidence requirement (`next build` succeeding for both apps) already covers this.

---

## 5. Accessibility Verification

### 5.1 Layered strategy

§12.5 defines six layers and lists six. It states automated tooling is **"necessary and not sufficient"** in bold and names its own blind spots (focus order/restoration after overlay close; live-region announcement timing and verbosity; roving-tabindex correctness in composite widgets). **Automated axe is correctly not treated as sufficient.**

### 5.2 The mandatory-human-review count — audited exhaustively

I counted the `Yes`/`**Yes**` cells in §12.4's table: bottom tab bar, streaming-token renderer, XP toast/celebration, paywall/upgrade modal, admin data table, combobox, voice-session state machine = **seven**.

Every other reference:

| Location                       | States                                                                                 | Match? |
| ------------------------------ | -------------------------------------------------------------------------------------- | ------ |
| §5 J2 (user journey)           | "one of the seven named high-risk ones"                                                | Yes    |
| §6c (Toast primitive row)      | "one of the seven components requiring mandatory manual screen-reader verification"    | Yes    |
| §12.4 prose (line 532)         | "Seven components are named above"                                                     | Yes    |
| §12.5 layer 5                  | "required for the seven named high-risk components"                                    | Yes    |
| §17 Accessibility (manual) row | "Screen-reader pass for the seven named high-risk components"                          | Yes    |
| §21 Accessibility gate         | "Seven named high-risk components ... each have a manual screen-reader pass on record" | Yes    |
| `RISK_REGISTER.md` R-54        | names all seven individually, including the bottom tab bar                             | Yes    |

**N-7 is fully closed. The count is internally consistent in all seven places.**

### 5.3 Per-component contract depth for the components the scope names

| Component            | Keyboard                                                                                                    | Focus mgmt                                            | ARIA                                                                                                                                                       | Screen-reader                                            | Assessment                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Button**           | Native `<button>` (implicit)                                                                                | `focus-visible` wired to `--color-focus-ring` (§12.1) | `aria-busy` on loading                                                                                                                                     | —                                                        | Adequate for a native element                                                                          |
| **Dialog/Modal**     | Escape (via Radix, §14)                                                                                     | Focus-trap **+ restoration** named explicitly         | `aria-modal` (§6c)                                                                                                                                         | Mandatory manual check (paywall)                         | Adequate — but only the _paywall_ modal is a deliverable; no generic Dialog contract exists (see P6-2) |
| **Dropdown**         | **Not specified anywhere**                                                                                  | Not specified                                         | Not specified                                                                                                                                              | Not flagged                                              | **Gap — P6-2**                                                                                         |
| **Combobox**         | Typeahead filtering; arrow keys move `aria-activedescendant`, not DOM focus; Escape closes without clearing | Focus never leaves the input                          | Full ARIA 1.2 combobox: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`                                                       | Mandatory manual check                                   | **Excellent — genuinely specified**                                                                    |
| **Admin data table** | Sort toggles, page navigation, keyboard row focus (testing section)                                         | —                                                     | `aria-sort` on sortable headers; pagination announced via polite live region                                                                               | Mandatory manual check                                   | Good; six states each named and distinct                                                               |
| **Voice components** | —                                                                                                           | —                                                     | Voice-session: `aria-live="assertive"` for `error`, `polite` for the other four; waveform: `role="img"` + text alternative                                 | Voice-session state machine has a mandatory manual check | Good; all five states + all seven transitions enumerated                                               |
| **AI message/chat**  | —                                                                                                           | —                                                     | Message bubble: AI-purple **plus persistent icon** (WCAG 1.4.1); streaming renderer: throttled `aria-live="polite"`, append-only, mid-stream failure state | Streaming renderer has a mandatory manual check          | Good, except the missing "thinking vs typing" component (P6-2)                                         |

**Verdict:** the four fully-specified components (dashboard grid, voice-session state machine, admin data table, combobox) are genuinely implementable from the document alone. Dropdown/Popover/Tabs/Tooltip and the thinking-vs-typing distinction are not (P6-2).

---

## 6. Component Contract Completeness

The §12.4 contract template names eleven elements (Props · Variants · Sizes · States · Slots · Keyboard model · ARIA pattern · Responsive behavior · Theme behavior · Composition rules · Testing requirements) and claims it is "applied to every component."

**Four components carry the full template.** All four are sound. I re-checked the dashboard-grid dev-mode composition check specifically (L-4): it now states plainly that the check "does not recurse into a `Fragment`'s own children" and calls this "an accepted gap in the dev-mode lint's coverage, not a claim of exhaustiveness," with the false-positive reasoning given. **L-4 closed.**

**Components with no contract at all (P6-2):**

1. **"Thinking" vs "typing" state distinction.** `DESIGN_SYSTEM.md` §4's AI-chat row requires it. E3's own §12.2 AI-chat row lists it. §12.4's ~36-component table has **no row for it** — I enumerated every row. It is a required component reduced to a bare noun.
2. **DropdownMenu, Popover, Tabs, Tooltip.** §6c installs all four with named consumers ("Nav menus, admin data-table row actions"; "Settings/admin screens"; "Icon-only buttons, truncated text") and says T3 "installs and themes" them. None appears in §12.2's category table, none has a §12.4 contract, none has a keyboard/ARIA model, none has an owning component task with stories or tests. §12.5 simultaneously names **tabs** as one of the composite widgets where "roving-tabindex correctness" is a known axe blind spot — a widget the document flags as high-risk in its accessibility strategy and never specifies.
3. **Generic Dialog/Modal.** §6c installs Dialog/AlertDialog for "Modals, paywall/upgrade modal, confirmation flows" and §14 assigns "Modal/dialog focus-trap and Escape handling" to T3, but no task delivers a generic Dialog or a confirmation flow. (Faithful to `DESIGN_SYSTEM.md` §4, which also lists only the paywall modal — recorded as an observation, not a scope violation.)

**Thin-but-acceptable rows** (contract deferred to a per-category `UI_UX_REVIEW_TEMPLATE.md` instance at implementation time, which §12.4 states explicitly): agent persona header; badge grid / leaderboard row / mission card / streak calendar (four components collapsed into one row with no states, despite §12.2's own "every component ships with a default, loading, disabled and error variant" rule — leaderboard row and streak calendar plainly need loading and empty states); pronunciation comparison UI.

**Risk-classification inconsistency:** the date/time picker is specified as "ARIA date-picker pattern otherwise" and marked **No** for mandatory manual screen-reader verification. The document's own stated inclusion criterion is "the highest-risk combination of custom ARIA, live-region timing, or focus management." A hand-built ARIA date picker (grid pattern, roving tabindex, focus management into and out of a popover) meets that criterion at least as squarely as the bottom tab bar, which _is_ included.

**Count check:** §12.2 enumerates 45 components (5 buttons + 7 forms + 4 cards + 4 navigation + 1 dashboard + 8 AI chat + 5 progress + 5 gamification + 4 commerce + 2 admin). Minus the 4 fully specified, "remaining" is 41, not the "~36" §12.4 states. (P6-10, Low.)

---

## 7. Storybook and Infrastructure Review

**`infrastructure/terraform/modules/edge/` read in full** (`main.tf` 241 lines, `outputs.tf` 15, `variables.tf` 54, `versions.tf` 11). Every §18 claim about it verified:

| §18 / ADR-026 claim                                                 | Actual module state                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Existing WAF ACL is `REGIONAL`-scoped and ALB-associated            | **True** — `aws_wafv2_web_acl.alb` with `scope = "REGIONAL"`, plus `aws_wafv2_web_acl_association.alb` to `aws_lb.this` |
| The distribution's only origin is an ALB via `custom_origin_config` | **True** — one `origin` block, `origin_id = "alb"`, `custom_origin_config`                                              |
| No S3 origin, no Origin Access Control                              | **True** — neither appears anywhere in the module                                                                       |
| No CloudFront Function precedent                                    | **True** — no `aws_cloudfront_function`, no `function_association`                                                      |
| No KeyValueStore                                                    | **True** — no `aws_cloudfront_key_value_store`                                                                          |
| AWS provider pinned past the KVS-introducing version                | **True** — `.terraform.lock.hcl` pins `hashicorp/aws` at `5.100.0` (KVS resources landed in 5.36)                       |

**Terraform resource names (L-3 check):** §18 names `aws_cloudfront_key_value_store` for the store and `aws_cloudfrontkeyvaluestore_key` for the entry. Both are the correct provider resource names (the entry resource genuinely uses the unhyphenated service-name form). **L-3 closed.**

**CloudFront Functions capability reasoning.** The claim is that `cloudfront-js-2.0` has no network/filesystem/SDK access but _does_ expose a KVS read API and a `crypto` module. This is consistent with what I know to be true of the runtime: KVS support is precisely the capability that distinguishes `cloudfront-js-2.0` from `cloudfront-js-1.0`, KVS reads are excluded from the function's CPU-time budget for exactly this class of use, `crypto` (SHA/HMAC digest) is available in 2.0, the `Authorization` header is readable in a `viewer-request` function, and `viewer-request` fires on every request including cache hits — all four properties the design depends on. The superseded Secrets-Manager-direct-read design is correctly identified as unbuildable. **The mechanism is technically plausible and correctly reasoned.**

_One under-specification (P6-8, Low):_ §18 and ADR-026 both say Terraform "writes its **salted** hash into the KVS" and the function "compares the request's `Authorization: Basic` header against the KVS-stored hash." Comparing a presented credential against a _salted_ hash requires the function to know the salt and the digest algorithm. Neither document states where the salt lives (a second KVS entry? a function constant? a per-deploy value?) or which algorithm is used. This is a real gap in an otherwise carefully-specified mechanism, and it is the kind of detail a T17 implementer would have to invent.

**WAF decision.** Stated plainly and identically in both documents. `DECISIONS.md` ADR-026: "**The distribution ships v1 without a dedicated `CLOUDFRONT`-scoped WAF ACL** ... This is a stated decision, not an open option." §18's bullet: "**This is a decision, not an open question (§25 Q4 records it as decided-by-default, revisitable): the distribution ships v1 without a distribution-scoped WAF ACL.**" The residual "an owned open question" opener N-8 flagged is **gone**. §25 Q4 reads "Decided by default (ship v1 without one, R-65); may be overridden before T17." **N-8 closed; F-7 closed.**

**Named, correctly-scoped risk row:** R-65 exists, describes the WAF-ACL decision specifically (not the shared-credential model), owner `Security/DevOps`, status "Accepted (design trade-off, E3) — revisitable, not blocking T17." Distinct from R-56 (shared credential) and R-64 (unverified-against-real-infrastructure residual). **Correctly scoped.**

**Deployment precedent claims verified:** `preview-cleanup.yml`'s own header comment reads "preview.yml's `teardown` job handles the normal case (PR closed), but this is the safety net" and it runs on a nightly `cron: '0 4 * * *'`. `preview.yml` has a `teardown:` job at line 197. **Both claims correct.**

---

## 8. Testing and CI Readiness

**§17 layer table.** Seven layers plus the deliberate deferral, each with an owning task. TESTING.md §9's deferral quote is exact — line **68** of `docs/TESTING.md` reads verbatim: "Full cross-browser visual regression testing — introduced once the design system (DESIGN_SYSTEM.md) stabilizes past initial component development." **Quote and line number both correct.**

**§15 performance claims verified.** `PERFORMANCE.md` line 14: "JS bundle (initial route) | < 200KB gzipped" ✓. Line 61: "Bundle-size check on every `apps/web`/`apps/admin` PR (fails if the initial-route budget in §1 is exceeded without an explicit, reviewed override)" ✓. And:

```
$ grep -rniE "bundle|gzip" .github/workflows/*.yml
(no output)
```

**The claimed zero-match grep is correct.** The policy genuinely exists with no implementing workflow, and R-59 correctly tracks the broader gap as unowned outside E3.

**The newly-added completeness assertion (§17 token-palette row) — assessed carefully.** As written it has three problems:

1. _"or is named anywhere in this document's prose."_ This half of the assertion would require a `packages/ui` Vitest test to parse a per-epic markdown design document in `docs/epics/`. The document specifies no mechanism for that, and it is the half that would actually have caught N-1 (a token named in the document but absent from `tokens.css`). Without it the assertion is one-directional.
2. _The "grid row" cannot be the markdown table._ Any buildable version of this test compares `tokens.css` against a data structure **inside the test file**. Nothing mechanically ties that fixture to §12.1's tables. So the test enforces `tokens.css ⊆ test-fixture`, not `tokens.css ⊆ §12.1` — which is what §24's criterion actually claims ("every color custom property `tokens.css` actually declares has a corresponding validated **row**, so this criterion is achievable **by construction** rather than by manual re-audit"). The link to §12.1 remains manual.
3. _A direct internal contradiction._ §12.1 states the disabled tokens are "excluded from §17's pass/fail contrast test." §17 simultaneously requires that "every declared color custom property has a corresponding grid row." After T1, `--color-disabled-bg`/`--color-disabled-text` **will** be declared color custom properties. The document specifies no exemption list, so the two requirements in the same §17 row conflict at implementation time.

The direction the assertion _does_ cover (a shipped token with no validated row) is the more consequential one, and the idea is sound. But "achievable by construction" is an overclaim.

**§24 acceptance criteria.** Six criteria. Four are genuinely checkable (`pnpm lint` clean on T2's PR; UX Director sign-off before T1 merges; zero contrast failures re-verified against real `tokens.css`; the completeness assertion, subject to the above). Two are review-process criteria rather than testable outcomes ("every claim in this document ... was actually computed"; "re-verified by whoever implements T1/T2/T3"). §24 functions as acceptance criteria for _this design pass_, not for the epic — epic-level acceptance lives in §21's Quality Gates and §20's per-task Evidence column, which are more complete. Acceptable, but §24 does not stand alone.

**§20 evidence columns.** All 18 tasks have deliverables, dependencies, and evidence. The dependency graph is acyclic (T15 depends only on T1; T5/T8/T10/T13/T14 depend on T15 one-directionally). T4 is honestly marked reserved and its downstream blocking effect is disclosed in §25 Q2. **One orphaned deliverable found (P6-5):** §12.1's breakpoint paragraph says "A lint rule (T3) prevents the two scales from silently coexisting in component code," but T3's deliverables in §20 are only the primitive install and the `@ui/*` alias, and T2 — which owns every other lint rule — does not list it either. The rule belongs to no task.

**One quality-gate/control mismatch found (P6-4):** §21's Frontend gate blocks on "zero ad hoc Tailwind palette values inside **`packages/ui` itself** or in `apps/web`/`apps/admin`'s migrated auth pages," with "T2's palette lint rule passing" as its only evidence. But §14's corresponding control row scopes that rule to "`apps/web`/`apps/admin` source" only. Meanwhile `packages/ui/src/components/button.tsx` **today** contains `bg-neutral-100`, `border-neutral-300`, `text-neutral-900`, `dark:bg-neutral-800`, `dark:border-neutral-700`, and `bg-red-600` — i.e. the gate's own blocking criterion is currently violated by the library's only real component, with no control scoped to catch it and no task assigned to fix it beyond T1's generic "re-themed onto the corrected token scale."

---

## 9. Risk Register Audit

E3 section spans R-54 through R-65 — twelve rows, all present, all with a Category, Likelihood, Impact, Mitigation, Owner and Status.

| ID   | Owner field                                          | Real owner?                                                          | Status accurate against the design document's current text?                                                                                                                                                                                    |
| ---- | ---------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-54 | Frontend + Accessibility                             | Role — honest                                                        | Yes; names all **seven** components individually (N-7 fix verified)                                                                                                                                                                            |
| R-55 | Frontend + Mobile                                    | Role                                                                 | Yes — points at ADR-024 by name for the schema contract, which is where the content now lives                                                                                                                                                  |
| R-56 | DevOps + Security                                    | Role                                                                 | Yes — correctly scoped to the shared-credential _model_, with the mechanism correction noted separately                                                                                                                                        |
| R-57 | Frontend                                             | Role                                                                 | Yes — matches T6's "unmodified test suites" evidence                                                                                                                                                                                           |
| R-58 | Frontend                                             | Role                                                                 | Yes — now cites **§26 Deferred Work**, which exists and contains the item (F-8 stale-reference fix verified)                                                                                                                                   |
| R-59 | Frontend (E3) + **unassigned** (broader gap)         | Honestly stated as partly unowned                                    | Yes — cites §26, which contains the item; matches my zero-match workflow grep                                                                                                                                                                  |
| R-60 | UX Director                                          | Role                                                                 | Yes — matches §25 Q1 and the "blocks T1" statement in §20/§24                                                                                                                                                                                  |
| R-61 | UX Director + Frontend                               | Role                                                                 | **Closed with resolution note, and the closure is correct** — I verified the separate border-token tier no longer exists; §12.1 reuses each `-text` value for border use, and every such value clears 4.5:1 (a strictly harder floor than 3:1) |
| R-62 | **Tech Lead (role owner; individual not yet named)** | **Honest — no false claim of a named individual** (L-1 fix verified) | Yes — matches §25 Q5's identical phrasing                                                                                                                                                                                                      |
| R-63 | Frontend                                             | Role                                                                 | Yes — matches §6d's explicit non-decision and §25 Q3                                                                                                                                                                                           |
| R-64 | DevOps (T17 implementer)                             | Role                                                                 | Yes — matches §18's own verification-honesty note verbatim in substance (M-4 fix verified)                                                                                                                                                     |
| R-65 | Security/DevOps                                      | Role                                                                 | Yes — matches §18 and ADR-026's plainly-stated decision                                                                                                                                                                                        |

**No owner field falsely claims a named individual.** **No row is marked Closed that is actually unresolved** — R-61 is the only Closed row and I independently verified its resolution. The section header's design-history line now runs through pass #5 and cites `E3-remediation-report-v5.md` and `E3-fifth-independent-architecture-review.md` (**N-3 fix verified — the extension the pass-#4 report only claimed has now actually been made**).

**One unresolved design limitation with no risk row (P6-7, Low):** §6d records the `@ui/*` deep-import surface as "a real, named gap, not a silent one ... not fixed in this pass ... a candidate for a future lint rule — not built now." It has no risk-register row. This is precisely the defect class R-64 was created to close (an admitted, unresolved residual named in the design with no register entry), reappearing one section over. The `packages/ui` versioning gap got R-63; the WAF decision got R-65; the ADR-026 buildability residual got R-64; this one got nothing.

_Minor cross-reference nit:_ R-56 cites "(§19)" for the synthetic-fixture-data control; the control itself lives in §14, and §18 cites §14 correctly. §19 does reference the control conditionally, so this resolves — noted, not raised.

---

## 10. Score Table

Scores are derived from my own findings in this review, not anchored to any prior pass.

| Dimension                | Score  | Basis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Architecture**         | 87     | §6a is the best artifact in the epic — I reproduced its diagnosis, its CI-breaking consequence, its rollout mitigation, and every clause of its corrected settings block by execution, and found no error. §6b's ten-file list is complete across every resolver class I could identify, and now honest about the ESLint blind spot. §6d's export-surface reasoning is sound. Deductions: P6-1 (an entire token tier with no implementable form); P6-5 (an orphaned deliverable).                                                                                              |
| **Frontend Engineering** | 71     | Four fully-specified components are genuinely implementable; the theming mechanism (`@theme inline` + `:root`/`[data-theme]`) is correctly reasoned and correctly justified against Tailwind v4's actual build semantics. Deductions: P6-1 blocks the typography half of T1 outright; P6-2 leaves a required component and four installed composite widgets with no contract; P6-3 leaves the shipped `secondary` Button variant with a colliding token name and no defined neutral treatment; P6-4's gate has a known-failing file.                                           |
| **Accessibility**        | 82     | The layered strategy is correct in kind — axe explicitly "necessary and not sufficient," blind spots named specifically, seven-component manual list now internally consistent in all seven places I checked. The combobox and voice-session contracts are exemplary. The contrast grid is exhaustively correct — I recomputed every published cell. Deductions: Dropdown/Tabs/Tooltip have no keyboard or ARIA model while §12.5 names tabs as a blind-spot widget; the ARIA date picker is excluded from mandatory manual verification against the document's own criterion. |
| **Security**             | 84     | The XSS surface is correctly identified as the single hard one and closed structurally (typed props, no `dangerouslySetInnerHTML`, a lint rule). The Storybook mechanism is buildable and correctly reasoned against the real runtime capability set. Deduction: the salt/algorithm for the KVS hash comparison is unspecified in both §18 and ADR-026; §14's palette control is narrower than §21's gate.                                                                                                                                                                     |
| **Testing**              | 74     | The layer table is complete and every layer has an owner; T16 explicitly folds in T18's three generator tests; the boundary-regression fixture pairs are real and I verified the mechanism they guard. Deductions: the completeness assertion overclaims "by construction" and contains an internal contradiction with the disabled-token exemption; §17's "every Tier-2 token resolves to its documented value" is unimplementable for `--type-*` (P6-1); §24 is thin as epic-level acceptance.                                                                               |
| **Performance**          | 85     | Budget correctly sourced from the canonical `PERFORMANCE.md` §1/§7 (both quotes verified verbatim), the pre-existing CI gap honestly measured and honestly scoped, tree-shaking verification specified concretely, the CLS rule specified with a real assertion mechanism, the streaming-renderer render-count assertion is a genuine test.                                                                                                                                                                                                                                    |
| **Maintainability**      | 76     | Single-canonical-source discipline is now correctly applied (ADR-024 lives in exactly one place with both ends agreeing); the "resolver classes checked and found not to need an entry" negative-space list is a genuine procedural improvement; the bidirectional token reconciliation now actually holds. Deductions: P6-6 (canonical-document misattribution), P6-9 (stale changelog row), P6-10 (component count), P6-7 (an admitted gap with no register row).                                                                                                            |
| **Developer Experience** | 79     | The `@ui/*` alias design correctly avoids the `@/` collision and is honest that nothing is applied; the `--ignore-pattern` rollout keeps `pnpm lint` green (verified); Storybook-per-state is a real review artifact. Deduction: P6-1 leaves a T1 implementer with no way to build the typography tier without inventing a mechanism, which is precisely the "implementer must invent it" failure the fifth review gated on.                                                                                                                                                   |
| **Production Readiness** | 70     | Design-phase only, correctly. Q1 (UX Director) blocks T1, Q2 (icon system) blocks T4 → T5/T8/T10/T14 — both honestly disclosed. R-64 correctly states ADR-026 cannot be closed by design-phase work. P6-1 adds a third internal blocker on T1 and T18.                                                                                                                                                                                                                                                                                                                         |
| **Overall**              | **78** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

---

## 11. Decision

# NO GO

Remediation required. One High and three Medium findings below are blocking. All were verified by me directly; I have listed nothing I could not verify myself, and omitted nothing I did find.

I want to record plainly, because five consecutive NO GOs create their own pressure in both directions: **the fifth review's N-1 through N-8 are all genuinely closed, and the two hardest technical artifacts in this document — §6a's boundary-lint specification and §12.1's contrast grid — survived hostile re-execution and re-computation without a single error.** That is a real result and it should not be diminished by this decision. The blocking finding below is a gap none of the five prior passes examined, not a recurrence of one they missed.

---

## 12. Blocking Findings

### P6-1 — HIGH — Tier-2 typography tokens (`--type-*`) have no implementable representation; T1 and T18 both inherit an undefined contract

**Evidence.**

1. I enumerated the theme namespaces the _installed_ Tailwind version actually supports:
   ```
   $ grep -oE '^\s+--[a-z0-9]+-' node_modules/.pnpm/tailwindcss@4.3.3/node_modules/tailwindcss/theme.css | sort -u
   --animate-  --aspect-  --blur-  --breakpoint-  --color-  --container-  --default-
   --drop-  --ease-  --font-  --inset-  --leading-  --max-  --perspective-
   --radius-  --shadow-  --text-  --tracking-
   ```
   **There is no `--type-*` namespace.** Declaring `--type-heading-lg` in `@theme` emits a custom property that generates no utility class — the identical situation the document itself diagnosed for `--duration-*` and solved with `@utility` blocks (§12.1's Motion paragraph, line 399, which correctly cites `tokens.css`'s own comment on this).
2. `grep -n "@utility" docs/epics/E3-design-system-component-library.md` returns **one** occurrence, in the Motion paragraph. No `@utility` mechanism, no composite encoding, and no component-level convention is specified anywhere for `--type-*`.
3. §12.1a's Tier-2 table assigns each token **both** a size mapping and a weight (`--type-heading-lg` → `text-2xl`, semibold). A single CSS custom property can carry one value. The document specifies no resolution.
4. §12.1's own token-hierarchy definition (line 299) names `--type-heading-lg` as a Semantic-tier **token**, and §20's T1 deliverable includes "typography scale (§12.1a)" — so these are specified as real tokens, not as a human-readable mapping table.
5. §17's Token-palette regression row requires "Every **Tier-2**/derived token resolves to its documented value, both themes." A `--type-*` token has no single documented value to resolve to. The test is unimplementable for this tier as specified.
6. `DECISIONS.md` ADR-024 compounds it. Its Typography row (line 188) sources from "§12.1a's Tier 1 (`--text-*` sizes/line-heights) and Tier 2 (`--type-*` semantic names)" and requires the generator — which parses `tokens.css` with postcss — to emit `typography: { <camelCase semantic name>: { fontSize, lineHeight, fontWeight, fontFamily } }`, "one entry per Tier-2 semantic type token." **`fontWeight` exists only as prose in §12.1a's table and `fontFamily` is not part of any `--type-*` token at all.** ADR-024 handled the exactly-analogous "value not present in `tokens.css`" case for Spacing explicitly ("generated from a hardcoded constant in the generation script"); it does not do so for Typography. T18's smoke test ("every mapped category present and non-empty") therefore cannot pass for `typography` without a decision the document does not contain.
7. Separately, the real Tailwind v4 line-height mechanism is a companion property — `--text-xs--line-height` (verified at `theme.css:348`). §12.1a's table has a "Line-height" column but never names this mechanism, so even Tier 1's line-heights have an unstated encoding.

**Why this is High, not Medium.** This is the same standard the fifth review applied to N-1 and the fourth review to F-3: a token named as a deliverable that an implementer would have to invent the mechanism for. Here it is not one token but an entire tier — one of the four scales `BR-4` names as the cross-platform single source of truth — plus a required ADR-024 export category. It blocks T1 (the typography deliverable), T18 (the generator's typography mapping and smoke test), and §17's Tier-2 regression test.

**Required remediation.**

1. Specify the concrete CSS representation of each Tier-2 typography token — an `@utility` block per semantic token (mirroring the `--duration-*` precedent the document already establishes), a set of composite custom properties, or an explicit statement that Tier 2 is a documentation-only mapping with a stated component convention, in which case §12.1's hierarchy definition, T1's deliverable, §17's Tier-2 assertion and ADR-024's typography row must all be corrected to match.
2. State the Tier-1 line-height encoding (`--text-<size>--line-height`).
3. Correct ADR-024's typography row so the generator has a derivable source for `fontWeight` and `fontFamily`, in the same explicit way the Spacing row already handles a value absent from `tokens.css`.

---

### P6-2 — MEDIUM — A `DESIGN_SYSTEM.md`-required component has no contract, and four installed composite widgets have no keyboard/ARIA specification

**Evidence.**

- **"Thinking" vs "typing" state distinction.** Required by `DESIGN_SYSTEM.md` §4's AI-chat row ("'thinking' vs. 'typing' state distinction") and listed in E3's own §12.2 AI-chat row. I enumerated every row of §12.4's ~36-component table: **there is no row for it.** No pattern, no state, no ARIA, no manual-check designation. It is a bare noun.
- **DropdownMenu, Popover, Tabs, Tooltip.** §6c installs all four with named consumers and assigns T3 to "install and theme" them. None appears in §12.2's category table; none has a §12.4 contract row; none has a keyboard interaction model, an ARIA pattern, a state list, or an owning component task with Storybook stories or tests. §12.5 simultaneously names **tabs** as one of the composite widgets where "roving-tabindex correctness" is a documented axe blind spot — a widget the accessibility strategy flags as high-risk and the contract section never specifies.
- **Risk-classification inconsistency.** The date/time picker is specified as "ARIA date-picker pattern otherwise" and marked **No** for mandatory manual screen-reader verification, against the document's own inclusion criterion ("the highest-risk combination of custom ARIA, live-region timing, or focus management"). A hand-built ARIA date picker meets that criterion at least as squarely as the bottom tab bar, which is included.
- **Consequence for the Frontend quality gate.** §21 blocks on "Every category (§12.2) present per its §12.4 contract." A component present in §12.2 with no §12.4 contract makes that criterion unevaluable.

**Required remediation.** Add a §12.4 contract row for the thinking/typing distinction. Either give DropdownMenu/Popover/Tabs/Tooltip §12.4 rows with keyboard and ARIA models and an owning task, or state explicitly that they are internal primitives consumed only by named components and remove the standalone consumers §6c currently cites for them. Re-evaluate the date/time picker against §12.4's stated manual-check criterion and either include it or record why it is excluded.

---

### P6-3 — MEDIUM — `--color-secondary-*` is AI-purple, colliding with the shipped `secondary` Button variant and with `DESIGN_SYSTEM.md`'s purple-exclusivity rule; no token is defined for the secondary/ghost button treatment T1 must produce

**Evidence.**

1. §12.1 defines `--color-secondary-text` **"(AI-purple)"** `#7c3aed`/`#a78bfa` and `--color-secondary-solid` **"(AI-purple fill)"** `#7c3aed`. The canonical token name in both `DESIGN_SYSTEM.md` §2 and the shipped `tokens.css` is `--color-ai`. E3 renames it to the generic role name `secondary` in the semantic tier, and no document records the rename.
2. `DESIGN_SYSTEM.md` §2: "Purple is reserved **exclusively** for AI-originated content/actions. It must never be reused for generic decoration — this preserves it as a meaningful signal." A semantic tier that calls AI-purple "secondary" actively invites the misuse the canonical rule prohibits.
3. §12.2's Buttons row requires "Primary, **secondary**, ghost, destructive, icon-only," and assigns T1 to re-theme Buttons "onto the corrected token scale." I read `packages/ui/src/components/button.tsx`: the `secondary` variant ships today as `border border-neutral-300 bg-neutral-100 text-neutral-900 ... dark:bg-neutral-800`. There is **no token in §12.1's grid for a neutral secondary/ghost fill**; the only `--color-secondary-*` tokens available are AI-purple. A T1 implementer re-theming `variant.secondary` onto "the corrected token scale" has, on the document's own naming, exactly one same-named candidate — and using it produces a purple secondary button in direct violation of §2's exclusivity rule.
4. The defect propagates cross-platform. `DECISIONS.md` ADR-024's naming convention is a mechanical kebab→camel conversion with "no key renamed beyond the mechanical conversion," so the generated Flutter artifact exports `colorSecondaryText`/`colorSecondarySolid`. A Flutter engineer reading the artifact — which ADR-024 explicitly designs so that they "can find any value without a lookup table" — has no signal that these are AI-only.

**Required remediation.** Either rename the semantic tokens to `--color-ai-text`/`--color-ai-solid` (matching the canonical anchor and preserving the semantics through the ADR-024 export), or keep `secondary` and state explicitly in §12.1 and in an amendment to `DESIGN_SYSTEM.md` §2 that the name is AI-scoped, with a stated usage prohibition. In either case, define the token(s) the `secondary` and `ghost` Button variants actually use — this is the same "T1's implementer would have had to invent the value" gap §12.1 states as its own justification for adding `--color-primary-solid`.

---

### P6-4 — MEDIUM — §21's Frontend quality gate has no enforcing control and a known-failing file

**Evidence.** §21's Frontend gate blocking criterion: "zero ad hoc Tailwind palette values inside **`packages/ui` itself** or in `apps/web`/`apps/admin`'s migrated auth pages," evidence: "T2's palette lint rule passing." §14's corresponding control row scopes that rule to "`apps/web`/`apps/admin` source" only — `packages/ui` is not covered. Meanwhile `packages/ui/src/components/button.tsx`, the library's only real component, contains today: `border-neutral-300`, `bg-neutral-100`, `text-neutral-900`, `dark:border-neutral-700`, `dark:bg-neutral-800`, `dark:text-neutral-50`, `text-neutral-50`, `hover:bg-neutral-200`, `hover:bg-neutral-700`, `bg-red-600`, `hover:bg-red-700`. The gate's blocking criterion is violated by the shipped code, the control that would detect it does not cover the directory, and no task is assigned to remediate the file beyond T1's generic "re-themed onto the corrected token scale" (which P6-3 shows has no target token for two of the four variants).

**Required remediation.** Extend §14's palette-restriction control to `packages/ui` source (or narrow §21's criterion to match §14's scope), and name the `button.tsx` re-theme explicitly as a T1 deliverable with the tokens it targets.

---

## 13. Non-Blocking Findings

| ID        | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P6-5**  | Low      | §12.1's breakpoint paragraph assigns a lint rule to "(T3)" ("prevents the two scales from silently coexisting"), but §20's T3 deliverables are only the primitive install and the `@ui/*` alias, and T2 — which owns every other lint rule — does not list it. The deliverable belongs to no task. Relatedly, `--breakpoint-mobile` is described as "<768px" while `--breakpoint-*` in Tailwind v4 generates min-width variants only, and ADR-024's worked example emits `"mobile": 0` — the intended declaration form is unstated. |
| **P6-6**  | Low      | §3 Non-Goals states it will not reopen "DESIGN_SYSTEM.md's brand decisions (the anchor hex values for primary/AI-purple/accent/success/warning/**danger/info**)." `DESIGN_SYSTEM.md` §2's colour table has **no danger row and no info row** (verified by direct read) — and §12.1 of the same design document correctly states there are **five** anchors. An internal contradiction plus a misattribution to the canonical document.                                                                                              |
| **P6-7**  | Low      | §6d's admitted `@ui/*` deep-import gap ("a real, named gap, not a silent one ... not fixed in this pass") has **no risk-register row**. R-63, R-64 and R-65 were each created for exactly this class of admitted residual; this one has nothing.                                                                                                                                                                                                                                                                                    |
| **P6-8**  | Low      | Two under-specifications in the §17/§18 additions: (a) §17's completeness assertion cannot mechanically link to §12.1's markdown tables, the "named anywhere in this document's prose" half has no stated mechanism, and it contradicts §12.1's explicit disabled-token exemption — so §24's "achievable by construction" is an overclaim; (b) §18 and ADR-026 both specify a **salted** hash in the KVS compared against a raw `Authorization: Basic` header without stating where the salt or the digest algorithm live.          |
| **P6-9**  | Low      | §0's Remediation-Pass-#4 changelog row (line 40) still describes `--color-text-dark` as a current addition, contradicted by the Pass-#5 row 17 lines later. A reader encounters the superseded statement first, in the present tense.                                                                                                                                                                                                                                                                                               |
| **P6-10** | Low      | §12.4 says "Remaining ~36 components." §12.2 enumerates 45 (5+7+4+4+1+8+5+5+4+2); minus the four fully specified, the remainder is 41. §1's "~40-component library" is closer. Also, the four-components-in-one-row entry (badge grid / leaderboard row / mission card / streak calendar) lists no loading or empty state despite §12.2's own universal loading/disabled/error rule.                                                                                                                                                |

---

## 14. Repository State

No repository file was modified by this review. All probe artifacts created during verification — a temporary ESLint config at the repository root, four boundary fixtures, and two `@ui/*` alias probes — were deleted before this report was written. `git status --porcelain | grep -iE "e3probe|__probe"` returns nothing. The only change this review introduces is this file.
