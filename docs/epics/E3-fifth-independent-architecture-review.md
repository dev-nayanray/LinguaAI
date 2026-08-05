# Epic E3 — Fifth Independent Architecture Gate Review

**Reviewer:** Fifth independent Architecture Gate reviewer. No prior involvement in authoring E3's design document, any of its four remediation passes, or any of the first four gate reviews.
**Date:** 2026-08-05
**Artifacts under review:** `docs/epics/E3-design-system-component-library.md` (Remediation Pass #4, 675 lines), `docs/epics/E3-remediation-report-v4.md`, `docs/DECISIONS.md` (ADR-024/025/026 + index), `docs/RISK_REGISTER.md` (R-54 – R-65), plus the repository state those documents make claims about.
**Decision:** **NO GO.**

---

## Executive Summary

Remediation Pass #4 is, on the evidence, the strongest pass this epic has produced. I independently re-derived — by execution and by computation, not by reading the remediation report — every one of the fourth review's ten findings. **Nine of the ten are genuinely closed.** In particular:

- **Every single contrast ratio in §12.1 is arithmetically correct.** I implemented the WCAG 2.1 relative-luminance formula from scratch, validated it against five published reference values, and recomputed all 88 cells the document publishes (64 hue-token cells, 8 primary-text cells, 8 border cells, 8 focus-ring cells, 4 solid-fill ratios, and the failing "old value" rows). Every value matched to three decimal places. This is the first pass whose accessibility arithmetic survives independent re-derivation without a single discrepancy.
- **§6a's central architectural claim is true, and I proved it myself.** Running ESLint on the repository's two deliberately-violating boundary fixtures with the CWD set inside the package (the shape `turbo run lint` actually uses) produces **zero errors**; the same files linted from the repository root produce the expected violations. The `boundaries/root-path` diagnosis is correct. I then built a throwaway, out-of-repository config replicating §6a's corrected settings block verbatim and swept `apps/`, `packages/`, and `services/` — it produced **exactly two** violations, both the pre-existing deliberate fixtures, and nothing else. The design document's most consequential empirical claim is sound.
- **ADR-024 now genuinely holds the complete Flutter export specification** in one canonical place, and the design document's §23 correctly points at it without restating it. F-1's two-way-pointer defect is properly resolved.

Nevertheless, this review returns **NO GO**, on one High finding plus four Mediums.

The High finding (**N-1**) is the same defect class as the fourth review's F-3, recurring for the third consecutive review at one level of indirection further out. §12.1 still asserts that "**every** semantic token is checked against all four defined surfaces, in both themes," and BR-3 still stakes the epic's accessibility claim on it. That statement is still not true. `--color-primary-solid` is named by §12.1's own definition of the token hierarchy, has no value anywhere in the document, and has no row in the solid-fill grid — even though the shipped `Button` renders `bg-primary text-white` today and T1's scope is explicitly "Buttons ... re-themed onto the corrected token scale." There is no AI-purple fill token or computed row at all, despite §12.4 naming the AI message bubble's purple fill as a WCAG 1.4.1 control. And `--color-disabled-bg`/`--color-disabled-text` are named with no value defined anywhere in this document or in `tokens.css`, attached to the word "unchanged" — a back-reference to a revision that does not exist, which is precisely the artifact class the third review made a Critical finding.

The root cause is narrower than the remediation report's own Root Cause Analysis believed. That analysis says the fix was to cross-check the grid "against `tokens.css`'s actual token inventory rather than against the set of tokens this document itself has previously discussed." That reconciliation was performed in one direction only — `tokens.css` → grid, which is how `--color-text` was found. The reverse direction — **tokens this document itself names but never defines or validates** — was never run. Running it is what produced N-1.

The four Medium findings are: a factually incorrect "verified" claim about ESLint's import resolver (**N-2**, which I disproved by reading the installed resolver's source); a RISK_REGISTER.md edit the remediation report claims to have made and did not (**N-3**); the design document's own closing status lines still declaring it ready for the _fourth_ review it has already had (**N-4**); and a token-naming decision introduced by the F-3 fix that contradicts both §12.1's own theming mechanism and ADR-024's export schema (**N-5**).

None of these is a repeat of the _specific_ defects reviews one through four found. But N-1 is a repeat of their _pattern_, and the governance rule this project operates under does not permit a conditional pass.

---

## Verification Method

I treated the remediation report as a set of unverified claims. For each of F-1 through F-10 I asked: does the artifact exist; does the reference resolve; is the claim technically accurate; is the acceptance criterion measurable; can implementation proceed without ambiguity; was anything silently removed; did a previously-closed finding regress.

Independent work performed (not summarized from any document):

| #   | What I did                                                                                                                                                                                                                                                                                                                                                                                       | Where                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 1   | Implemented the WCAG 2.1 contrast formula from scratch (sRGB linearization at the 0.03928 threshold, `0.2126R + 0.7152G + 0.0722B`, `(L₁+0.05)/(L₂+0.05)`), sanity-checked against five published values: `#dc2626`/white = 4.829 (pub. 4.83), `#767676`/white = 4.542 (pub. 4.54), `#777777`/white = 4.478 (pub. 4.48), `#0000ff`/white = 8.592 (pub. 8.59), black/white = 21.000               | throwaway script, scratchpad (outside repo) |
| 2   | Recomputed all 88 published ratios plus the brand anchors' white-on-fill ratios                                                                                                                                                                                                                                                                                                                  | same                                        |
| 3   | Ran ESLint on `packages/__boundary_fixture__/index.ts` from the repo root (fails, `boundaries/element-types`) and with CWD = `packages/` (exit 0 — inert)                                                                                                                                                                                                                                        | real repository, read-only                  |
| 4   | Ran ESLint on `apps/web/src/features/__boundary_fixture_b__/deep-violator.ts` with CWD = `apps/web` (exit 0 — inert)                                                                                                                                                                                                                                                                             | same                                        |
| 5   | Ran `eslint .` in `apps/web` with `ESLINT_PLUGIN_BOUNDARIES_ROOT_PATH` set to the repo root — the fixture violation appears, plus 19 `boundaries/entry-point` errors on real app source, empirically confirming both the CI-breakage claim and the `allow: '*'` micromatch defect                                                                                                                | same                                        |
| 6   | Built an out-of-repository config replicating §6a's full corrected settings block (`root-path`, `ui-package` element, `allow: '**'`) and swept `apps packages services` — result: exactly 2 problems, both pre-existing deliberate fixtures                                                                                                                                                      | `--config` pointed outside the repo         |
| 7   | Read `eslint-plugin-boundaries@4.2.2`'s own `helpers/settings.js` and `core/elementsInfo.js` to confirm the root-path/`process.cwd()` mechanism and the `ESLINT_PLUGIN_BOUNDARIES_ROOT_PATH` env override                                                                                                                                                                                        | `node_modules`, read-only                   |
| 8   | Read `eslint-import-resolver-typescript@3.10.1`'s `initMappers()` to determine how it selects a tsconfig when `typescript: true` is passed with no options                                                                                                                                                                                                                                       | `node_modules`, read-only                   |
| 9   | Read every file §6b names, plus `packages/ui/package.json`, `components.json`, `.storybook/main.ts`, both `next.config.ts`, both `vitest.config.ts`, `packages/ui/vitest.config.ts`, `tsconfig.base.json`, `turbo.json`, `pnpm-workspace.yaml`, `scripts/verify-boundary-lint.mjs`, `packages/ui/src/styles/tokens.css`, `packages/ui/src/components/button.tsx`, `apps/web/src/app/globals.css` | real repository                             |
| 10  | Verified quoted policy text verbatim in `docs/TESTING.md` §9, `docs/PERFORMANCE.md` §1/§7, `docs/DESIGN_SYSTEM.md` §2/§2.1/§2.2/§3/§4/§5/§7; ran `grep -riE "bundle\|gzip" .github/workflows/*.yml` (zero matches, as claimed)                                                                                                                                                                   | real repository                             |
| 11  | Read `infrastructure/terraform/modules/edge/main.tf` and its `.terraform.lock.hcl`                                                                                                                                                                                                                                                                                                               | real repository                             |
| 12  | Enumerated every `##`/`###` header, every `T`-reference, every `ADR-0NN` reference and every `R-` reference in the design document and resolved each                                                                                                                                                                                                                                             | real documents                              |

No repository file was created, modified, or deleted other than this review file. All temporary artifacts were written to the session scratchpad outside the repository.

---

## Previous Findings Verification

### F-1 — ADR-024 pointed at design-doc §23 for content that existed in neither document

**Status: CLOSED.**

**Evidence:**

I read ADR-024 in `docs/DECISIONS.md` (lines 173–231) in full. It contains, as actual content rather than a pointer:

- **Token-category mapping** — a seven-row table with a Z-index row: Color, Radius, Shadow/elevation, Spacing, Typography, Breakpoints, Motion, each with its `tokens.css` source, generated-artifact shape, and Flutter consumption target. I cross-checked each source column against the real `packages/ui/src/styles/tokens.css`: `--radius-sm/md/lg/pill` ✓, `--shadow-flat/low/medium/high/overlay` ✓, `--duration-micro/standard/celebratory` ✓, `--ease-entrance/exit` ✓ (and the worked example's `[0,0,0.2,1]`/`[0.4,0,1,1]` match the shipped `cubic-bezier()` values exactly), `--z-index-base/dropdown/sticky/overlay/modal/toast` ✓. The spacing row's claim that Tailwind's default scale is not declared in `tokens.css` is confirmed by the file's own header comment.
- **Z-index exclusion, with reasoning** — an "Unsupported token categories" paragraph stating Flutter controls stacking via widget-tree order and that emitting a `zIndex` field would give Flutter code a value with nothing correct to do with it.
- **Naming convention** — kebab-to-camelCase with the `--` stripped, grouped under seven named top-level keys, with worked examples (`--color-primary-text` → `colorPrimaryText`).
- **Schema versioning** — plain incrementing integer starting at 1, with bump conditions and explicit non-bump conditions stated.
- **Consumer compatibility / schema-evolution rules** — `apps/mobile` compares the artifact's `schemaVersion` against a constant in its own source; mismatch is a build-time failure, not a warning; additive changes non-breaking, renames/removals/restructures breaking and require the consumer updated in the same PR.
- **Failure behavior** — three named failure conditions (parse failure, missing expected category, type mismatch), non-zero exit, explicitly no fallback-to-last-known-good.
- **Worked example** — a complete JSON block covering all seven emitted categories.

The design document's §23 (lines 630–636) summarizes ADR-024 in one bullet and states explicitly that the full specification "lives entirely in DECISIONS.md's ADR-024 text — not here, and not duplicated here." I grepped the design document for the specification's distinctive content (`schemaVersion`, category-mapping table, naming convention) — it is not restated. **Exactly one canonical copy exists.**

T18's row in §20 (line 606) names ADR-024 as "the sole canonical source for that specification — not restated here" and its evidence column requires a schema-validation test against ADR-024's documented shape including `schemaVersion`. R-55 in RISK_REGISTER.md says "ADR-024 specifies the full token-category mapping, naming convention, and schema-version contract in advance" — this is now accurate, because ADR-024 genuinely does.

ADR-024's Status line reads **Proposed**; the ADR index (line 282) also reads Proposed. No self-approval.

_One Low observation raised as N-6 below:_ the shadow mapping cannot represent the shipped `--shadow-flat: none` under its own stated shape and failure behavior.

---

### F-2 — Alias migration specification incomplete (both apps' `vitest.config.ts` omitted)

**Status: CLOSED** (with a separate new Medium finding, N-2, on one supporting sub-claim).

**Evidence:**

§6b's table (lines 198–209) now names ten files. I read every one and confirmed each is a genuinely distinct resolver that needs the alias:

| File                             | Current state I verified                                                                                            | Needed?                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `packages/ui/tsconfig.json`      | extends `tsconfig.base.json`; declares **no** `baseUrl`, **no** `paths`. `tsconfig.base.json` declares none either. | Yes                         |
| `packages/ui/vitest.config.ts`   | no `resolve` block at all                                                                                           | Yes                         |
| `packages/ui/.storybook/main.ts` | `viteFinal` hook exists (registers `@tailwindcss/vite`); no `resolve.alias`                                         | Yes                         |
| `packages/ui/components.json`    | aliases all `@/…` (`"utils": "@/lib/cn"` etc.) — verbatim as §6b describes                                          | Yes                         |
| `apps/web/tsconfig.json`         | `"paths": { "@/*": ["./src/*"] }` only                                                                              | Yes                         |
| `apps/admin/tsconfig.json`       | identical                                                                                                           | Yes                         |
| `apps/web/next.config.ts`        | `transpilePackages: ['@linguaai/ui', '@linguaai/observability', '@linguaai/auth-client']`, no alias config          | Yes                         |
| `apps/admin/next.config.ts`      | identical                                                                                                           | Yes                         |
| `apps/web/vitest.config.ts`      | `resolve.alias` maps **only** `'@'` → `./src`                                                                       | **Yes — confirmed missing** |
| `apps/admin/vitest.config.ts`    | `resolve.alias` maps **only** `'@'` → `./src`                                                                       | **Yes — confirmed missing** |

The two files F-2 named are now present, and I confirmed by reading both that each app's Vitest run is a fully independent Vite resolver with no inheritance from `packages/ui/vitest.config.ts`.

The two negative claims check out:

- **Jest is not used by either app.** `apps/web/package.json` and `apps/admin/package.json` both declare `"test": "vitest run --coverage"`. (`apps/api` uses Jest per ADR-014, but `apps/api` does not consume `packages/ui` and is not under `transpilePackages`.)
- **Neither app uses TypeScript project references.** Neither `apps/web/tsconfig.json`, `apps/admin/tsconfig.json`, nor `tsconfig.base.json` declares `"references"` or `"composite"`.

T3's row in §20 (line 591) and §6b's acceptance paragraph (line 211) both require the third assertion (a passing Vitest run in both apps), not only type-check and bundler. Measurable and unambiguous.

The **third** negative claim — that ESLint's import resolver needs no separate entry — is _technically inaccurate as stated_. See N-2. It does not reopen F-2, because the ten-file list itself is correct and sufficient, but the design document presents this sub-claim as "a verified claim, not an assumed one," which it is not.

---

### F-3 — WCAG matrix omits `--color-text`

**Status: CLOSED as to `--color-text` specifically. The broader completeness claim it was raised against is still false — see N-1 (High).**

**Evidence:**

I computed every published cell independently. **All 88 values match the document to three decimal places.** Selected verification (my values, computed from scratch):

Semantic text tokens, light `bg`/`surface`/`surface-muted`/`surface-elevated` then dark:

| Token                                        | Light                         | Dark                            |
| -------------------------------------------- | ----------------------------- | ------------------------------- |
| `--color-primary-text` `#2563eb`/`#60a5fa`   | 4.940 / 5.169 / 4.718 / 5.169 | 7.934 / 7.022 / 5.754 / 5.020   |
| `--color-secondary-text` `#7c3aed`/`#a78bfa` | 5.447 / 5.699 / 5.202 / 5.699 | 7.413 / 6.560 / 5.375 / 4.690   |
| `--color-danger-text` `#c81e1e`/`#f87171`    | 5.483 / 5.737 / 5.237 / 5.737 | 7.293 / 6.454 / 5.288 / 4.614   |
| `--color-info-text` `#0369a1`/`#38bdf8`      | 5.671 / 5.934 / 5.416 / 5.934 | 9.417 / 8.333 / 6.829 / 5.958   |
| `--color-warning-text` `#b45309`/`#fbbf24`   | 4.800 / 5.022 / 4.584 / 5.022 | 12.084 / 10.694 / 8.763 / 7.646 |

Every cell ≥ 4.500. The dark `surface-elevated` column is genuinely freshly computed for all eight tokens (M-1 does not regress).

New primary-text row:

| Token                                | vs `bg` | vs `surface` | vs `surface-muted` | vs `surface-elevated` |
| ------------------------------------ | ------- | ------------ | ------------------ | --------------------- |
| `--color-text` `#0f172a` (light)     | 17.063  | 17.853       | 16.296             | 17.853                |
| `--color-text-dark` `#f1f5f9` (dark) | 18.414  | 16.296       | 13.353             | 11.650                |

Corrected border token: light `#64748b` → 4.548 / 4.759 / 4.344 / 4.759; dark `#94a3b8` → 7.868 / 6.963 / 5.705 / 4.978. Old values genuinely fail as claimed: light `#e2e8f0` → 1.178 / 1.233 / 1.125 / 1.233; dark `#334155` → 1.948 / 1.724 / 1.413 / 1.233. Focus ring: 4.940 / 5.169 / 4.718 / 5.169 and 7.934 / 7.022 / 5.754 / 5.020 — all ≥ 3:1 with wide margin. Solid fills: 5.358 / 5.016 / 5.022 / 5.737. The stated anchor failures reproduce exactly: `#dc2626` on `#f1f5f9` = 4.408; `#0284c7` = 3.914 / 4.095 / 3.738.

**Shipped vs. new, verified against `packages/ui/src/styles/tokens.css`:**

- _Already shipped:_ `--color-text: #0f172a`, `--color-bg: #f8fafc`, `--color-bg-dark: #020617`, `--color-primary: #2563eb`, `--color-ai: #7c3aed`, `--color-accent: #06b6d4`, `--color-success: #22c55e`, `--color-warning: #f59e0b`, all radius/shadow/z-index/motion/font tokens.
- _New T1 work (present in no shipped file):_ every `--color-surface*`, every `-text`/`-solid` semantic token, `--color-border` (light and dark), `--color-focus-ring`, `--color-text-dark`, `--color-neutral-text`, breakpoints, the entire typography scale. The document does not misrepresent any of these as shipped — the "already exists" claim is made only for `--color-text`, and it is true.

**Is "every semantic token is validated" true?** No. See N-1.

---

### F-4 — §13 claimed a lint enforcement that does not exist today

**Status: CLOSED.**

**Evidence:**

I grepped the whole design document for `enforced today`, `already works`, `currently protected`, `existing control`, `already correct`, `already-working`, `already-correct`, `works today`, `already enforced`, `already shipped`, `already present`. Hits and my adjudication:

- Lines 41–42 (§0 change table): quotations of what the _prior_ version said, inside a table describing the correction. Correctly framed.
- Line 202 (§6b table): "Extend the existing `viteFinal` hook (already present, registering the Tailwind plugin)". **True** — I read `packages/ui/.storybook/main.ts` and the hook is present, registering `@tailwindcss/vite`.
- Line 365 (§12.1 Motion): "already present, already correctly within DESIGN_SYSTEM.md §2.2's stated ranges, and already exposed via `@utility` blocks". **True** — verified directly, see F-5.
- Lines 163 / 258 / 515–517: correctly hedged.

§13 is now split into labeled **CURRENT STATE** and **POST-T2 STATE** paragraphs. §7 (Module Boundaries) reads "It is currently unenforced against real per-package source" and "the fixtures ... prove the rule mechanism works today, but do not yet prove real production code is evaluated by it." Both accurate.

**I verified the underlying current state empirically rather than accepting the report's account.** Two real, deliberately-violating fixtures already in the repository:

```
# from repo root — CWD-prefix strip succeeds, element classifies, rule fires
$ npx eslint packages/__boundary_fixture__/index.ts --no-warn-ignored
  7:25  error  No rule allowing this dependency was found. File is of type 'packages'.
               Dependency is of type 'apps'   boundaries/element-types      → exit 1

# CWD = packages/ — the shape `turbo run lint` uses
$ npx eslint __boundary_fixture__/index.ts --no-warn-ignored          → exit 0

# CWD = apps/web — the shape `turbo run lint` uses
$ npx eslint src/features/__boundary_fixture_b__/deep-violator.ts     → exit 0
```

Two files that are _guaranteed_ to violate produce **zero** errors when linted the way `turbo run lint` lints them. §6a's and §13's CURRENT STATE diagnosis is exactly right. I confirmed the mechanism in the plugin's own source: `src/helpers/settings.js:46` reads `process.env.ESLINT_PLUGIN_BOUNDARIES_ROOT_PATH || settings['boundaries/root-path']` and falls back to `process.cwd()`; `src/core/elementsInfo.js:195 projectPath()` strips that prefix.

I also confirmed the _consequence_ §6a predicts:

```
# CWD = apps/web, with the root-path fix applied via env override only
$ ESLINT_PLUGIN_BOUNDARIES_ROOT_PATH=<repo root> npx eslint . --no-warn-ignored
  …/src/features/__boundary_fixture_b__/deep-violator.ts
    4:27  error  No rule allows the entry point 'internal.ts' …  boundaries/entry-point
  ✖ 20 problems
```

The permanent fixture does start failing `apps/web`'s own `eslint .` the moment the root-path fix lands — so §6a's `--ignore-pattern` rollout step is genuinely necessary, not defensive padding. The other 19 errors are the `allow: '*'` micromatch defect §6a independently diagnoses (`No rule allows the entry point 'src/index.ts' in dependencies of type 'packages'`), confirming that fix is necessary too.

Finally I applied §6a's **full corrected settings block** verbatim via an out-of-repository config and swept the whole repo:

```
$ npx eslint apps packages services --config <scratchpad>/e3probe.config.mjs
  apps/web/src/features/__boundary_fixture_b__/deep-violator.ts   boundaries/entry-point
  packages/__boundary_fixture__/index.ts                          boundaries/element-types
  ✖ 2 problems
```

Exactly the two pre-existing deliberate fixtures, and nothing else — independently reproducing §6a's "256 files ... exactly the two" claim. `apps/admin/src/` contains no `features/` directory at all, confirming that only `apps/web`'s `lint` script needs the `--ignore-pattern` change. `packages/__boundary_fixture__/` has no `package.json` (confirmed by listing) so it is not a pnpm workspace member, and its existing fixture uses a relative import (`../../apps/__boundary_fixture__/index`), confirming §6a's L-5 fix matches the real precedent.

---

### F-5 — Motion timing conflicted with DESIGN_SYSTEM.md

**Status: CLOSED.**

**Evidence:** I read both files directly rather than trusting either document's account.

`packages/ui/src/styles/tokens.css` (shipped): `--duration-micro: 150ms`, `--duration-standard: 250ms`, `--duration-celebratory: 600ms`, exposed via three `@utility` blocks, with an in-file comment explaining that Tailwind v4 has no customizable `--duration-*` theme namespace.

`docs/DESIGN_SYSTEM.md` §2.2: "micro-interactions 150–200ms, standard transitions 200–300ms, celebratory moments (level-up, streak milestone) up to 600ms."

150 ∈ [150,200] ✓; 250 ∈ [200,300] ✓; 600 ≤ 600 ✓.

Design document §12.1's Motion paragraph (line 365) states these three values, states that T1 carries them forward **unchanged**, and correctly describes the `@utility` mechanism and its reason. The previously-proposed `100/200/400ms` values are gone. `packages/ui/vitest.setup.ts`'s current contents (RTL cleanup + jest-dom only, no `matchMedia` stub) are as described, and the stub is correctly named as new T1 work.

---

### F-6 / F-8 — Stale risk cross-references, R-65, and document-wide reference integrity

**Status: CLOSED as to the specific citations. Two documentation-integrity defects found alongside — N-3 and N-4 below.**

**Evidence:**

_R-58 / R-59._ Both now cite "the design document's §26 Deferred Work" with an explicit correction note naming what was wrong. §26 of the design document contains four bullets, two of which are precisely these topics: "Full cross-browser visual regression testing (TESTING.md §9's own stated sequencing)" and "The broader PERFORMANCE.md §7 bundle-size gap beyond `packages/ui`-touching PRs (R-59)." Both citations now resolve to real content on the correct subject.

I verified the underlying quotes rather than the citations alone. `docs/TESTING.md` §9 contains verbatim: "Full cross-browser visual regression testing — introduced once the design system (DESIGN_SYSTEM.md) stabilizes past initial component development." `docs/PERFORMANCE.md` §1 contains "JS bundle (initial route) | < 200KB gzipped"; §7 contains "Bundle-size check on every `apps/web`/`apps/admin` PR (fails if the initial-route budget in §1 is exceeded without an explicit, reviewed override)." `grep -riE "bundle|gzip" .github/workflows/*.yml` returns zero matches — the "in policy but in no workflow" claim is true.

_R-65 exists and is genuinely distinct from R-56._ I read both rows in full. R-56's subject is the shared-credential authorization model and coarse revocation granularity; the string "WAF" does not appear in it. R-65's subject is the absence of a `CLOUDFRONT`-scoped WAF ACL. Different subject matter, different mitigation, different owner field. Not an overload. R-65 is cited in §18 (line 569), §25 Q4 (line 653), §22's summary (line 626), and ADR-026's Decision paragraph.

I verified R-65's own technical premise against real infrastructure code: `infrastructure/terraform/modules/edge/main.tf` line 6 declares `scope = "REGIONAL"` on `aws_wafv2_web_acl.alb`, associated to the ALB at line 77; the `aws_cloudfront_distribution.this` at line 179 has a single origin with `custom_origin_config` pointing at the ALB and **no** `web_acl_id`. There is no S3 origin, no Origin Access Control, no `aws_cloudfront_function`, and no `aws_cloudfront_key_value_store` anywhere in the module. §18's description of the module is accurate. The `.terraform.lock.hcl` pins the AWS provider at `5.100.0`, as ADR-026's residual note claims.

_Reference integrity, audited independently._ Every `##`/`###` header in the design document: 0–27 contiguous, plus 6a/6b/6c/6d and 12.1/12.1a/12.2–12.5. No gaps, no duplicates. Every `T`-reference: T1–T18, all resolve to a row in §20 (T4 present as an explicit "reserved" row). Every ADR reference: ADR-015, ADR-024, ADR-025, ADR-026 — all four exist in `docs/DECISIONS.md`. Every `R-` reference: R-54 through R-65 — all twelve exist in RISK_REGISTER.md's E3 section.

Semantic spot-check of §-citations (more than the ten requested; each read at both ends):

1. §5/J1 → §6d "category subpath" — §6d is Export surface, lists ten category subpaths ✓
2. §5/J3 → §21 "per-category `UI_UX_REVIEW_TEMPLATE.md` instance" — §21's Frontend gate evidence column says exactly that ✓
3. §3 → §7 "`packages/ui` stays `workspace:*`-internal" — §7 says "`workspace:*` internal only, no npm publish" ✓
4. §3 → §17 "a narrower floor is specified instead" — §17's last row specifies it ✓
5. §6 → ARCHITECTURE.md §2.1 "packages consumed by apps" ✓
6. §6 → DESIGN_SYSTEM.md §4 Forms row "wired to `packages/validation` Zod errors" — verbatim match ✓
7. §12.2 → DESIGN_SYSTEM.md §4's ten categories — exactly ten rows, names match ✓
8. §12.1 → DESIGN_SYSTEM.md §2's color table listing `--color-text` as "Primary Text ... on light backgrounds" and "Dark mode is a first-class palette (`--color-bg-dark` + derived surface/text tokens)" — verbatim ✓
9. §18 → §14 "synthetic-only fixture data" — §14 has that control row ✓
10. §18 → §25 Q4 — Q4 exists and is the WAF question ✓
11. §15 → PERFORMANCE.md §1/§7 — verbatim ✓
12. §12.4/§12.5 → the six named high-risk components — I counted the `**Yes**`/`Yes` cells in §12.4's table: bottom tab bar, streaming renderer, XP toast, paywall modal, admin data table, combobox, voice-session state machine = **seven** marked, against a prose claim of "six." R-54 in the register names the six as streaming renderer, data table, combobox, XP toast, voice-session state machine, paywall modal — the bottom tab bar is the seventh, marked Yes with its own justification. A minor internal count mismatch; folded into N-7 (Low) rather than raised separately.
13. §22 → RISK_REGISTER.md E3 section ✓
14. §26 → TESTING.md §9 / R-59 ✓

Two integrity defects found during this audit, both new: **N-3** (RISK_REGISTER.md's E3 section header and design-history line were not updated, contradicting the remediation report's own "Files Modified" statement) and **N-4** (the design document's §27 checklist and closing line still say "fourth" review).

---

### F-7 — ADR-026's either/or WAF language

**Status: CLOSED.**

**Evidence:** ADR-026's Decision paragraph (line 246) now reads: "**The distribution ships v1 without a dedicated `CLOUDFRONT`-scoped WAF ACL** — not assumed inherited from the `edge` module's own, differently-scoped (`REGIONAL`) ACL, which does not and cannot cover a CloudFront distribution regardless of this decision. This is a stated decision, not an open option," followed by the cost/threat-model reasoning and an explicit pointer to R-65 with the Security/DevOps role as owner. No "either way" construction remains.

**Status line: "Proposed — pending Architecture Gate approval of E3's design, not self-approved."** Unchanged. The ADR index (line 284) also reads Proposed. ADR-024 and ADR-025 likewise remain Proposed in both body and index. **No status was flipped by the document's own author — no self-approval occurred.** I checked this specifically because a flip would have been a Critical finding.

_One Low observation (N-9):_ §18's WAF bullet opens "**WAF, stated as an owned open question**, not a silent either/or (§25 Q4)" and two sentences later says "**This is a decision, not an open option**." Residual pass-3 framing left adjacent to the pass-4 correction. The substance is unambiguous; the sentence pair is not.

---

### F-9 — Dark border equals muted text (observation; document only)

**Status: Accepted observation — documented appropriately, nothing hidden, nothing over-implemented.**

**Evidence:** §12.1 line 335 documents it directly after the corrected border table: dark `--color-border` `#94a3b8` is byte-identical to dark `--color-neutral-text` `#94a3b8`, states it is not a WCAG violation, explains why each value was independently derived, and records it as an input to R-60's UX Director sign-off rather than as a new risk row or open question.

I confirmed **no value was changed as a result**: both tokens are still `#94a3b8` in the document, and my independent computation shows both still clearing their respective floors (7.868 / 6.963 / 5.705 / 4.978 against the four dark surfaces). A genuine "fix" would have required a different hex for one of them; none was applied. This is documentation only, as instructed. `packages/ui/src/styles/tokens.css` is unchanged (it contains neither token — both are T1 work).

---

### F-10 — `@ui/*` deep-import surface (observation; document, don't implement)

**Status: Accepted observation — documented appropriately, no implementation performed.**

**Evidence:** §6d's final paragraph (line 254) distinguishes the supported public API (the root export plus ten category subpaths in `exports`) from the alias's incidental deep-import capability; explains why the capability is unavoidable given `transpilePackages`; states plainly that the corrected `boundaries/entry-point` rule deliberately allows `'**'` for the `ui-package` target so no lint rule catches an application-code deep import; names the future lint-rule shape as a candidate; and states explicitly that it is not built now.

I verified **no configuration change was made**. `eslint.config.js` in its current state contains: no `boundaries/root-path` setting; no `ui-package` element type; `{ from: 'packages', allow: ['packages'] }` unchanged; `boundaries/entry-point` still `allow: '*'` (not `'**'`). `packages/ui/package.json`'s `exports` field still has only `"."` and `"./styles.css"` — the ten category subpaths are correctly stated as a T2 deliverable, not applied. `git status` shows `eslint.config.js` with no working-tree modification. Documentation-only, as instructed.

---

## New Findings

### N-1 (HIGH) — §12.1's completeness claim is still false: named-but-unvalidated and named-but-undefined tokens remain

**Affected sections:** §12.1 (lines 280, 333, 346–353, 361), §12.2 (Buttons row), §12.4 (Message bubble row), §17 (Token-palette regression row), §20 (T1), §24 (final acceptance criterion), BR-3.

**The claim under test.** §12.1's Methodology paragraph states: "Every semantic token is checked against **all four defined surfaces**, in both themes." BR-3 states every component "meets WCAG 2.1 AA for the states and contrast pairings it actually ships in, verified by computation against the real token values (§12.1)." §17's Token-palette regression row and §12.5's layer 3 both scope the automated test to "the full token × surface grid in §12.1" — so anything absent from that grid is absent from the test, permanently.

**What is missing.**

1. **`--color-primary-solid` — named, no value, no row.** §12.1's own opening line defines the three-tier hierarchy as "... → Component (component-scoped references to semantic tokens, e.g. a button's own `--button-bg` referencing `--color-primary-solid`)." That is the only occurrence of the token in the document. The solid-fill table (line 346) covers only `--color-accent-solid`, `--color-success-solid`, `--color-warning-solid`, `--color-danger-solid`. There is no primary solid value and no computed ratio.

   This is not hypothetical. `packages/ui/src/components/button.tsx` ships today with `variant: { primary: 'bg-primary text-white hover:bg-primary/90' }` — white text on the primary fill, a 4.5:1 pairing — and §12.2's Buttons row assigns T1 the job of re-theming Buttons "onto the corrected token scale." T1's implementer has no specified token, no specified value, and no validated ratio for the most-used fill in the library.

2. **No AI-purple fill token or row at all.** §12.4's component table names "Message bubble | AI-purple + persistent icon (WCAG 1.4.1)" as an accessibility-controlled component, and DESIGN_SYSTEM.md §2 reserves `--color-ai` for "AI chat bubbles." A purple-filled bubble carries text. No `--color-ai-solid`/`--color-secondary-solid` exists in the grid or anywhere in the document.

3. **`--color-disabled-bg` / `--color-disabled-text` — named, no value anywhere, attached to a dangling back-reference.** Line 333: "`--color-disabled-bg`/`--color-disabled-text` are **unchanged** and remain covered by WCAG's own stated exemption for inactive controls." Unchanged from _what_? Neither token appears in `packages/ui/src/styles/tokens.css` (I read the whole file) nor anywhere else in this document. The only referent is a prior revision of this document — which §0 line 11 states plainly is not a recoverable artifact. This is the same dangling-pointer construction the third review made a Critical finding, surviving at token granularity. The WCAG exemption argument is correct on its merits, but exemption from a _contrast floor_ is not exemption from _having a defined value_ that T1 can implement.

4. **The brand-anchor classification is factually wrong for two of its five entries.** Line 361 states the anchors are "recorded for reference, **no WCAG floor applies** (decorative/large-fill use only, **never as text** or the sole state signal)" and lists `--color-primary #2563eb` and `--color-ai #7c3aed` among them. Both are used as text-bearing fills — `--color-primary` in the shipped Button, `--color-ai` in the required AI message bubble. The classification is what allows them to be excluded from the grid, and it does not hold.

**Why the pass's own procedural fix did not catch this.** The remediation report's Root Cause Analysis commits to cross-checking "§12.1's grid ... against `tokens.css`'s actual token inventory rather than against the set of tokens this document itself has previously discussed." That reconciliation runs one direction only: shipped file → grid. It is how `--color-text` was found. The reverse direction — **tokens this document names but never defines or validates** — was never run. Running it produces items 1–3 above.

**Severity rationale.** I computed the values that _would_ result: white on `#2563eb` = **5.169** and white on `#7c3aed` = **5.699** — both pass 4.5:1. So there is no latent WCAG _failure_ here, exactly as there was none behind F-3's missing `--color-text` row. The fourth review nonetheless rated F-3 High, and this document explicitly adopted that standard in writing: "Recorded here explicitly, not assumed passing merely because the margin is comfortable — the fourth review's own point was that an _absent_ row is a gating gap regardless of how safe the eventual value turns out to be." Applying the epic's own adopted standard consistently, this is High.

For contrast, the derivation is _not_ safe for the other anchors, which is precisely why `-solid` variants exist for them: white on `--color-accent #06b6d4` = **2.428**, on `--color-success #22c55e` = **2.279**, on `--color-warning #f59e0b` = **2.148** — all far below 4.5:1. An implementer who reads line 361's "no WCAG floor applies" as license to use an anchor as a fill has a documented invitation to ship a 2.1:1 pairing.

**Why it blocks.** T1 cannot produce `tokens.css` from §12.1 without inventing at least three token values, and §17's contrast test iterates only what §12.1 contains, so the invented values would never be checked. §24's final acceptance criterion ("Zero contrast failures across the full §12.1 grid ... re-verified against the actual `tokens.css` content") is unsatisfiable for tokens the grid does not contain. The document's central accessibility assertion is, for the third consecutive review, provably not true as written.

---

### N-2 (MEDIUM) — §6b's ESLint-resolver claim is presented as verified and is technically inaccurate

**Affected section:** §6b, line 194.

**The claim.** "ESLint's own import resolution (`eslint.config.js`'s `'import/resolver': { typescript: true }` setting delegates to **each linted file's own nearest `tsconfig.json`**, so once the `tsconfig.json` entries below exist, ESLint's resolver picks up `@ui/*` automatically — no separate ESLint-level alias configuration is needed)." §6b introduces this as making "'every resolver class' a **verified claim, not an assumed one**."

**What I found.** `eslint-import-resolver-typescript@3.10.1` (the installed version, root devDependency `^3.6.3`), `lib/index.cjs`, `initMappers()`:

```js
cachedCwd = process.cwd();
const configPaths = (typeof options.project === "string" ? [options.project] : (
  Array.isArray(options.project) ? options.project : [cachedCwd]
)).map(...);
...
tsconfigResult = getTsconfig.getTsconfig(projectPath);   // searches upward from CWD
```

When `import/resolver` is `{ typescript: true }`, `options` is the boolean `true`, so `options.project` is `undefined` and `configPaths` falls back to **`process.cwd()`**. The resolver therefore searches upward from the **current working directory**, not from each linted file. The two are not the same thing.

**Consequence.** Under `turbo run lint` (CWD = the package directory) the conclusion happens to hold by coincidence: `packages/ui`'s CWD tsconfig is `packages/ui/tsconfig.json` and each app's CWD tsconfig is its own — all three of which T3 gives an `@ui/*` entry. But when ESLint is invoked **from the repository root** — which is exactly how `scripts/verify-boundary-lint.mjs` invokes it (`pnpm exec eslint <exact path>`), how the root `pnpm lint` reaches it, and how `lint-staged`/husky runs `eslint --fix` — `getTsconfig(<repo root>)` finds nothing, because **the repository root has no `tsconfig.json`** (only `tsconfig.base.json`; I checked). No paths matcher is built, so `@ui/*` specifiers are unresolvable and `eslint-plugin-boundaries` silently treats them as external and evaluates no rule against them.

**Why it matters.** After T3, `packages/ui`'s own source uses `@ui/*` internally by design, and §6d already documents that application code can deep-import through the same alias. The Architecture quality gate (§21 row 1) is "`packages/ui`'s boundary rule verified against **real repository source**, not only fixtures," with `verify-boundary-lint.mjs` — a root-invoked tool — as its evidence. A resolver that silently returns "unresolved" for the epic's own new alias in exactly that invocation is a real enforcement blind spot. It does not break the build and does not invalidate the ten-file list (T2's new fixture correctly uses a relative import), which is why this is Medium and not High.

**What the fix looks like** (not prescribed, for the implementer): either add a root `tsconfig.json`, or set `'import/resolver': { typescript: { project: [...] } }` naming the workspace tsconfigs explicitly, or state the blind spot as an accepted, tracked limitation. What is not acceptable is the current text, which asserts a mechanism that the installed resolver does not implement, under the banner of a verified claim. `docs/epics/E3-remediation-report-v4.md` line 40 does flag this as "the one claim in this pass not verified by direct execution" — but the design document, which is the authoritative artifact, carries the unhedged version.

---

### N-3 (MEDIUM) — A RISK_REGISTER.md edit the remediation report states it made was not made

**Affected files:** `docs/RISK_REGISTER.md` lines 77–79; `docs/epics/E3-remediation-report-v4.md` line 19.

The remediation report's "Files Modified" section states: "`docs/RISK_REGISTER.md` — R-58 and R-59 ... new row R-65 ..., **the E3 section's design-history line extended to include this pass's report**."

R-58, R-59 and R-65 are all present and correct (verified under F-6). The third item was not done. RISK_REGISTER.md's E3 section header still reads:

> `### Added from Epic E3 (Design System & Component Library v1) — design phase, updated through Remediation Pass #3`

and its design-history line still terminates at `[epics/E3-remediation-report-v3.md]`. I grepped the entire `docs/` tree: **no file other than the report itself references `E3-remediation-report-v4.md`.** The register therefore claims currency through Pass #3 while containing three rows annotated "corrected/added, remediation pass #4" — an internally inconsistent document, and a broken traceability chain for the next reviewer who tries to reconstruct the design history from the register (which is exactly what the register's own header line exists to support).

This is Medium rather than Low because it is a _false statement of work performed_ in a governance document whose entire purpose in this project is to let a subsequent independent reviewer trust the record — the same "claim of verification with no evidence" pattern the regression check explicitly asks me to look for.

---

### N-4 (MEDIUM) — The design document's own gate-status lines still declare it ready for the fourth review

**Affected section:** §27 (line 670) and the document's closing line (line 674).

Line 3 (status): "Not self-approved; pending a **fifth**, independent, targeted Architecture Gate review." Correct.

Line 670 (§27 Architecture Gate checklist): "- [ ] Reviewed by someone other than the author — **not yet done**, pending a **fourth** independent review, by someone who has not authored or reviewed any prior pass."

Line 674 (closing line, the last line of the document): "**READY FOR FOURTH INDEPENDENT TARGETED ARCHITECTURE GATE REVIEW.**"

The fourth review has already happened; this entire pass exists to answer it. A reader who opens the document at its Architecture Gate checklist — the section whose whole function is to state the gate's status — is told the wrong gate is pending, and the document's final, most emphatic line repeats the error.

This is the defect class the third review raised as L-6 ("ADR-025's status line hardcoded a pass number that goes stale every pass") and this pass claims to have fixed in DECISIONS.md (it did — ADR-025's status line no longer names a pass). The identical defect was left in place in the design document itself, in the two places where it is most load-bearing. F-8's resolution claims "a full pass confirmed every §, ADR, R-, and T- reference in this document resolves" — true as far as it goes, but the audit's scope did not include the document's own status assertions, and the claim reads as broader than what was checked.

---

### N-5 (MEDIUM) — `--color-text-dark` contradicts §12.1's own theming mechanism and ADR-024's export schema

**Affected sections:** §12.1 (lines 308–315, 369–383), §20 (T1), DECISIONS.md ADR-024 (colors row, naming convention, worked example).

The F-3 fix introduces a new token **named** `--color-text-dark`, justified as "chosen to match the naming convention already established by `--color-bg`/`--color-bg-dark`."

But §12.1's own Theme-application mechanism paragraph (lines 369–383) specifies a _different_ pattern for every dual-valued token in this document: a raw variable declared in `:root` and overridden in `[data-theme="dark"]`, surfaced through `@theme inline`:

```css
:root {
  --raw-color-primary-text: #2563eb;
}
[data-theme='dark'] {
  --raw-color-primary-text: #60a5fa;
}
@theme inline {
  --color-primary-text: var(--raw-color-primary-text);
}
```

Under that pattern there is exactly **one** token name per semantic role, resolving per theme — which is why the eight hue tokens, the border token and the focus-ring token are each presented as a single name with two values. `--color-text` is presented the same way in its own table (one row, light and dark values). Introducing a second _name_ for the dark value is inconsistent with the mechanism the same section mandates, and T1's deliverable list (line 589) reads "new `--color-text-dark`", locking the inconsistency into the task.

The conflict propagates into ADR-024. Its Color row emits `colors: { <camelCase name>: { light: "#hex", dark: "#hex" } }`, and its naming convention is a mechanical kebab-to-camel conversion with no renaming. A `--color-text-dark` custom property therefore generates the key `colorTextDark` carrying its own `{light, dark}` pair — a nonsensical artifact entry — while `colorText` would carry only a light value. ADR-024's worked example shows the correct shape (`"colorPrimaryText": { "light": …, "dark": … }`), which `--color-text-dark` cannot produce.

The precedent cited (`--color-bg-dark`) is a pre-E3 token that predates this mechanism, and §12.1 itself explains why the naive approach it represents does not work ("overriding a property inside a `[data-theme="dark"]` selector does not retroactively change utility classes already generated from a non-`inline` `@theme` block").

**Why it blocks:** T1 and T18 receive two mutually incompatible instructions for the same token, and there is no statement in the document resolving which wins. The _value_ (`#f1f5f9`) is fine and my computation confirms it clears every dark surface with margin; the _token identity_ is unresolved architectural ambiguity in the epic's foundational deliverable.

---

### N-6 (LOW) — ADR-024's shadow mapping cannot represent the shipped `--shadow-flat: none`

ADR-024's Shadow/elevation row specifies every shadow as "an array of `{offsetX, offsetY, blur, spread, color, opacity}` parsed from the CSS `box-shadow` shorthand," and its Failure behavior section requires the generator to fail the build when "a mapped value does not match its expected type." The shipped `tokens.css` declares `--shadow-flat: none` — a keyword, not a shorthand, and not parseable into that shape. The worked example shows only `low`, so the intended representation of `flat` (empty array? `null`? omitted?) is undefined. T18's smoke test ("every mapped category present and non-empty") does not disambiguate at the per-token level. Small, but it is a spec gap in newly-written ADR content that T18's implementer will hit on the first run.

### N-7 (LOW) — Two overstated audit claims in the remediation report, and a count mismatch in the design document

(a) The report's Verification Checklist asserts: "No banned self-reference phrase ('unchanged', 'see previous pass', 'see pass 1/2', 'see remediation', 'already described') appears in the design document." `grep -n "unchanged"` returns **eight** hits (lines 9, 11, 19, 42, 333, 365, 532, 666). Seven are benign uses ("unchanged in substance," "carried forward unchanged," "inherited unchanged from E1"). One — line 333, the disabled-token sentence — is a genuine dangling back-reference and is folded into N-1.

(b) §12.4 states "Six components are named above as requiring mandatory manual screen-reader verification," and §12.5/§17/§21/R-54 all repeat "six." Counting the `Yes` cells in §12.4's own table gives **seven**: bottom tab bar, streaming-token renderer, XP toast, paywall modal, admin data table, combobox, voice-session state machine. R-54 enumerates the six and omits the bottom tab bar, which the table marks Yes with its own stated justification. Either the count or the table is wrong; the Accessibility quality gate (§21) counts instances, so this needs settling before T8/T16.

### N-8 (LOW) — Residual open-question framing contradicts the ADR-026 decision in the same bullet

§18's WAF bullet opens "**WAF, stated as an owned open question**, not a silent either/or (§25 Q4)" and two sentences later states "**This is a decision, not an open option**." §25 Q4's Status column reads "Decided by default ... may be overridden." The substance is clear and F-7 is satisfied; the leftover pass-3 sentence opener directly contradicts the pass-4 sentence that follows it.

---

## Regression Check

I looked specifically for the seven failure modes that produced NO GO in reviews one through four.

| Pattern                                                             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Documentation deleted with no replacement**                    | **None found.** The one deletion this pass performed (ADR-024's specification leaving the design document's §23) is a _consolidation_, and the destination content exists and is complete — I verified all nine required elements are present in DECISIONS.md. The design document is 675 lines, materially longer than the 662-line pre-regression Pass-1 size the document itself cites, and every section 0–27 is written out in full. C-1 does not regress.                                                                                                                                   |
| **2. Unresolvable "see previous pass" self-references**             | **One found (line 333, `--color-disabled-*` "unchanged"), folded into N-1.** No other prior-revision pointer exists; the two references to "pass #2"/"pass #4" in §23 both resolve to correction notes that genuinely exist in DECISIONS.md's ADR-024.                                                                                                                                                                                                                                                                                                                                            |
| **3. Broken section / task / risk / ADR reference**                 | **None found.** Headers 0–27 contiguous with 6a–6d and 12.1–12.5; T1–T18 all resolve; ADR-015/024/025/026 all exist; R-54–R-65 all exist. Fourteen §-citations checked semantically at both ends — all correct except the "six/seven" count in N-7(b).                                                                                                                                                                                                                                                                                                                                            |
| **4. Claim of verification with no evidence**                       | **Two found.** N-2 (the ESLint-resolver claim, asserted as verified, mechanism incorrect) and N-3 (a RISK_REGISTER.md edit claimed in "Files Modified" and not made). Against that: the pass's _major_ verification claims — the boundary-lint execution, the contrast computation, the `tokens.css` reads, the `tsconfig`/`package.json` reads — I re-derived independently and every one held.                                                                                                                                                                                                  |
| **5. ADR content moved without every referencing document updated** | **None found.** ADR-024's move is reflected in §23, §20's T18 row, R-55's text, and ADR-024's own Canonical-source note. All four ends agree.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **6. Risk-register drift**                                          | **One found (N-3).** No risk was silently closed, renumbered, or overloaded: R-61 remains present marked "Closed (superseded)" with its resolution note per the register's own never-delete rule; R-65 is genuinely distinct from R-56 (I read both in full); R-64 exists and is cited. The drift is the stale section header and un-extended design-history line.                                                                                                                                                                                                                                |
| **7. Acceptance criterion referencing a non-existent artifact**     | **One found, via N-1.** §24's final criterion ("Zero contrast failures across the full §12.1 grid ... re-verified against the actual `tokens.css` content") and §17's Token-palette regression row are unsatisfiable for `--color-primary-solid`, an AI-purple fill, and `--color-disabled-*`, because those tokens have no row for the test to iterate and no value for `tokens.css` to be checked against. Every other acceptance criterion I traced (T1–T3, T16–T18, §21's nine gate rows) references a real, existing artifact or a task deliverable that is explicitly named as future work. |

**Regressions of previously-closed findings: none.** C-2 (the CI-breaking fixture) remains closed and I re-verified its rollout fix is necessary and correct. H-1/F-2 (the alias file list) remains closed and expanded correctly. H-2 (border/focus tokens) remains closed and arithmetically correct. M-1 (stale grid cells) remains closed — the dark `surface-elevated` column is genuinely freshly computed for all eight tokens. M-3/F-7 (WAF either-or) closed. M-4 (R-64) closed. L-1 through L-6 all verified closed, including L-3 (I confirmed ADR-026 and §18 both name `aws_cloudfront_key_value_store` and `aws_cloudfrontkeyvaluestore_key` in the correct roles) and L-4 (the dashboard-grid Fragment limitation is stated as deliberate).

---

## Score Table

Independently derived from the findings above; not anchored to any prior review's numbers.

| Dimension                | Score  | Principal deductions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**         | 84     | The boundary-rule design is the strongest artifact in this epic — I reproduced its diagnosis and its corrected spec end to end, and the spec is exactly right. The alias design is complete across every resolver that matters. Deductions: N-2 (a resolver claim that does not hold at root invocation), N-5 (token-identity ambiguity between §12.1's mechanism and ADR-024's schema).                                                                                                                              |
| **Frontend Engineering** | 74     | Component contracts are specific and testable; the four fully-specified components are genuinely implementable; the export-surface decision is well reasoned. Deductions: N-1 leaves the shipped Button's own fill token undefined in the very task that re-themes it; N-5; N-7(b)'s six/seven mismatch.                                                                                                                                                                                                              |
| **Accessibility**        | 66     | The arithmetic is flawless — 88 of 88 cells reproduced exactly, and the layered six-tier strategy with named axe blind spots is genuinely good practice. But the section's headline completeness claim is false for the third consecutive review, the two most-used brand fills have no validated pairing, `--color-disabled-*` has no value at all, and line 361's "no WCAG floor applies ... never as text" is an actively misleading instruction given `#22c55e`/`#f59e0b` sit at 2.28:1 and 2.15:1 against white. |
| **Security**             | 84     | §14's control table maps each control to an enforcement layer and an owning task; ADR-026's KVS mechanism is buildable and I verified its infrastructure premises against the real `edge` module and provider lock; R-64/R-65 honestly scope what is unverified. Deduction: the mechanism remains untested against real AWS (acknowledged, not hidden), and the deep-import surface is documented but unmitigated.                                                                                                    |
| **Testing**              | 78     | Six accessibility layers, determinism/schema/smoke tests for the generator, a render-count assertion for streaming, a CLS dimension assertion, tree-shaking verified by fixture, T16 wiring stated explicitly. Deduction: the contrast test iterates §12.1's grid, so N-1's gaps are invisible to it by construction; N-7(b) makes the manual-check count ambiguous.                                                                                                                                                  |
| **Performance**          | 86     | Honest: implements PERFORMANCE.md's real canonical metric rather than inventing a parallel one, scopes it to what the epic can own, and names the residual gap as R-59 with an explicit "needs an owner outside E3." I verified both quoted budgets verbatim and confirmed the zero-workflow-coverage claim.                                                                                                                                                                                                          |
| **Maintainability**      | 72     | Single-canonical-source discipline is now correctly applied to ADR-024, and the "negative space" resolver list in §6b is a genuinely good procedural improvement. Deductions: N-3 and N-4 are both stale-metadata drift of exactly the kind this epic has now been penalized for four times, and N-1 shows the completeness-reconciliation procedure was applied in one direction only.                                                                                                                               |
| **Developer Experience** | 82     | The alias fix, the `--ignore-pattern` rollout that keeps `pnpm lint` green, and the preservation of `transpilePackages` hot-reload are all correct and considerate. Deduction: N-2's silent resolution gap is the kind of thing that costs an engineer an afternoon.                                                                                                                                                                                                                                                  |
| **Production Readiness** | 68     | Design-phase only, correctly. Q1 (UX Director sign-off) blocks T1 and Q2 (icon system) blocks T4 → T5/T8/T10/T14 — a large fraction of the epic sits behind two unresolved external decisions, honestly disclosed. N-1 additionally blocks T1 on internal grounds.                                                                                                                                                                                                                                                    |
| **Overall**              | **76** | Substantially better than the 72 the fourth review recorded, and the first pass whose empirical claims survive independent re-derivation intact. One High finding prevents approval.                                                                                                                                                                                                                                                                                                                                  |

---

## Remaining Risks

1. **N-1 is the fifth consecutive appearance of the same failure mode:** a completeness claim produced by enumerating the cases the author was thinking about. The report's own Root Cause Analysis names this precisely and then implements a one-directional fix. A durable fix is a _bidirectional_ reconciliation — every token named anywhere in the document ∪ every token in `tokens.css`, minus every token with a grid row, must be the empty set — and, better, an implemented version of that check as part of T1's contrast test rather than a promise in prose.
2. **N-2's blind spot is silent, not loud.** An unresolvable specifier makes `eslint-plugin-boundaries` skip the import, so the failure mode of a mis-specified resolver is _no error at all_. That is the same class of invisible non-enforcement §6a was written to eliminate, one layer up.
3. **R-64 remains genuinely open and cannot be closed by design work.** ADR-026's mechanism is correct against documented AWS capability (I verified the provider pin at 5.100.0 and the absence of any existing S3/OAC/Function/KVS resource) but has never been applied. T17's deploy-time 401 assertion is the right closing evidence.
4. **Two open questions block a large share of the task graph.** Q1 (UX Director) blocks T1, which blocks eleven downstream tasks. Q2 (icon system / ADR-025) blocks T4, which blocks T5/T8/T10/T14. Neither has a target date. R-62's task-count-versus-"M"-complexity concern is owned by a role, not a person.
5. **Verification asymmetry persists.** §6a and §12.1 were executed against the real repository and hold up under independent re-derivation. §18/ADR-026 was reasoned from documentation. The document is honest about the difference; the reviewer after me should keep treating the second category differently from the first.

---

## Final Decision

**NO GO.**

One High-severity finding (**N-1**) is open: §12.1's assertion that every semantic token is validated against all four surfaces in both themes remains false. `--color-primary-solid` is named by §12.1's own definition of the token hierarchy with no value and no computed row, while the shipped `Button` renders white text on that fill today and T1 is tasked with re-theming it; no AI-purple fill token or row exists despite §12.4 designating the AI message bubble a WCAG 1.4.1 control; `--color-disabled-bg`/`--color-disabled-text` are named with no value defined anywhere and an "unchanged" back-reference to a revision that does not exist; and the brand-anchor paragraph's "no WCAG floor applies ... never as text" classification is contradicted by both of those uses and would, if followed for `--color-success`/`--color-warning`, license 2.28:1 and 2.15:1 pairings. Because §17's contrast test is scoped to iterate §12.1's grid, these tokens are outside the automated gate by construction, and §24's final acceptance criterion is unsatisfiable for them. T1 cannot begin without inventing values the document was written to prevent being invented.

Four Medium findings (N-2, N-3, N-4, N-5) are additionally open, two of which (N-3, N-4) are documentation-integrity defects and one of which (N-5) is unresolved architectural ambiguity in the epic's foundational deliverable.

Nine of the fourth review's ten findings are independently verified closed, and F-3 is closed as to `--color-text` specifically — the arithmetic and the boundary-lint engineering in this pass are, on my own re-derivation, correct. That is real progress and should be recognized as such. It is not sufficient under this project's governance, which requires a clean decision rather than a conditional pass.

No ADR was self-approved; all three remain **Proposed** in both body and index. This review made no code, configuration, or documentation change to any existing file.

Epic E3 remains not approved for implementation.
