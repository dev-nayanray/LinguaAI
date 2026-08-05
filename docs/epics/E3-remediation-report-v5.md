# Epic E3 — Remediation Report v5 (Pass #5: Final Targeted Closure)

**Author:** Implementer (this is a remediation pass, not an independent review).
**Date:** 2026-08-05
**Scope:** Resolves the Fifth Independent Architecture Gate Review's **NO GO** (overall 76/100): one High finding (N-1), four Medium findings (N-2 through N-5), and three Low findings (N-6 through N-8). No application code, package, component, Storybook artifact, Terraform resource, CI workflow, ESLint configuration, or TypeScript configuration was created or modified. Only the four permitted files were touched: `docs/epics/E3-design-system-component-library.md`, this report, `docs/DECISIONS.md`, `docs/RISK_REGISTER.md`.

## Executive Summary

The fifth review was, on its own account, the strongest independent verification this epic has received: it recomputed all 88 published contrast ratios from scratch and every one matched to three decimals, and it independently reproduced §6a's central boundary-lint diagnosis by direct execution against the real repository. It nonetheless returned NO GO on one High finding — a third consecutive occurrence, at a narrower scope each time, of the same underlying failure mode: a "complete" claim produced by enumerating the cases actively considered rather than by a procedure that could not miss a case. This pass closes that finding by performing the reconciliation the fifth review's own diagnosis prescribed — a genuine two-directional pass, not a repeat of the one-directional check that produced N-1 in the first place — and closes the four Medium and three Low findings alongside it.

**N-1's fix is not merely additive.** Adding rows for the two missing solid-fill tokens and giving the disabled tokens real values was the mechanical part. The harder part, and the part intended to prevent a fourth occurrence of this failure mode, is that §17's automated contrast test now includes a completeness assertion: it parses `tokens.css`'s actual declared custom properties and fails if any color token lacks a grid row, rather than only checking that the rows which exist are individually correct. This converts "every semantic token is validated" from a claim this document makes about itself into a claim T1's own test enforces about `tokens.css`, which is the only way this project's own history suggests such a claim survives a fourth review.

## Files Modified

- `docs/epics/E3-design-system-component-library.md` — §0 (status line to Pass #5, new Pass #5 change table), §5/J2 (six→seven), §6b (ESLint resolver claim corrected: current limitation vs. required T2 fix), §6c (six→seven, Toast row), §12.1 (`--color-text-dark` folded into `--color-text`; disabled tokens given real values; solid-fill table gains `--color-primary-solid`/`--color-secondary-solid`; brand-anchor paragraph corrected), §12.5 (six→seven), §17 (completeness assertion added; six→seven), §18 (WAF bullet's contradictory framing removed), §20 (T1/T2/T3 deliverables and evidence updated; T3 now depends on T2), §21 (six→seven), §24 (new acceptance criterion for grid completeness), §27 (checklist item added; stale "fourth" references corrected to "sixth"), closing line (updated to request the sixth review).
- `docs/DECISIONS.md` — ADR-024 (explicit keyword-shadow rule added for `--shadow-flat: none`; worked example gains a `"flat": []` entry).
- `docs/RISK_REGISTER.md` — E3 section header and design-history line actually extended through pass #5 (previously only claimed to be); R-54 corrected from "six" to "seven" named components, with the bottom tab bar added and a correction note.
- `docs/epics/E3-remediation-report-v5.md` — this file (new).

No other file was read for editing purposes and no other file was modified.

## Root Cause Analysis

N-1 is the third consecutive review to find a completeness claim that was not actually complete (F-3 in the fourth review found `--color-text` missing; N-1 in the fifth review found `--color-primary-solid`, the AI-purple fill, and the disabled tokens missing). The fourth-pass remediation's own Root Cause Analysis correctly diagnosed the general failure mode — enumerating the cases the author was thinking about rather than running a procedure guaranteed to enumerate every case — but the fix it actually implemented was **one-directional**: it cross-checked `tokens.css`'s existing custom properties against the grid, which is how `--color-text` was found, but never ran the reverse check — every token _named in this document's own prose_ against the grid. `--color-primary-solid` was named in §12.1's own opening definition of the token hierarchy (as its own worked example) and never checked against that definition. `--color-disabled-bg`/`--color-disabled-text` were named in the same paragraph that discusses the border token and never checked either. This pass runs both directions explicitly (documented in the resolution below) and, more durably, encodes the reverse direction as an automated test assertion rather than a promise to re-check by hand next time — since a promise to re-check by hand is exactly what failed three times in a row.

## Finding-by-Finding Resolution

### N-1 (HIGH) — "Complete token validation" was still incomplete

**Direction A performed** (every token named in the document has a definition/value/theme behavior/semantic purpose/contrast validation): traced every occurrence of a `--color-*` token name in the document's prose against §12.1's tables. Found three gaps, all now closed:

1. **`--color-primary-solid`** — added to the solid-fill table with its light value (`#2563eb`, the existing `--color-primary` brand anchor, unchanged), computed ratio (5.169, PASS), semantic purpose (the fill for solid-variant buttons and any other primary-colored, white-text surface), and a note tying it explicitly to the shipped `Button` component's current `bg-primary text-white` implementation, which T1 is tasked with re-theming onto this exact token.
2. **AI-purple fill token** — added as `--color-secondary-solid`, light value `#7c3aed` (the existing `--color-ai` brand anchor, unchanged), computed ratio (5.699, PASS), semantic purpose stated explicitly (the AI message bubble's fill, a named WCAG 1.4.1 control per §12.4), and its allowed usage stated (through this token only, never the raw anchor).
3. **`--color-disabled-bg`/`--color-disabled-text`** — given real light/dark values (reusing existing hex codes from elsewhere in this token set, not inventing new ones), a stated theme-application mechanism (the same `@theme inline` pattern as every other token), a stated usage rule, and stated contrast expectations (WCAG's disabled-control exemption applies; values are recorded for transparency, not as a pass/fail gate). The "unchanged" back-reference to a non-existent prior revision is removed.

**Direction B performed** (every token used by shipped code or existing design references appears in documentation): re-read `packages/ui/src/components/button.tsx` and confirmed its `bg-primary text-white` variant is exactly what `--color-primary-solid` now documents; re-read DESIGN_SYSTEM.md §2's AI-purple usage note and confirmed `--color-secondary-solid` is the correct new token for it; re-read `packages/ui/src/styles/tokens.css` in full again and confirmed no other color custom property exists without a corresponding row (the same check the fourth-pass remediation performed, re-run to confirm no regression).

**Brand-anchor clarification, per the brief's explicit instruction to resolve both the white-on-success and white-on-warning failures and the false "never as text" claim:** the brand-anchor paragraph is rewritten. It no longer claims "never as text" as a blanket, factually-false statement (two of the five anchors _are_ used as text-bearing fills, via the new `-solid` tokens). The corrected rule: a raw anchor may be used decoratively (illustration, marketing, brand marks) but never as a text/icon color and never as a white-text fill directly — functional/text/fill usage must go through a validated semantic token. For `--color-primary`/`--color-ai`, that validated token is numerically identical to the anchor (both already pass). For `--color-accent`/`--color-success`/`--color-warning`, the raw anchor **fails** white-on-fill (2.428/2.279/2.148, all computed this pass, matching the fifth review's own figures) — which is exactly why `--color-accent-solid`/`--color-success-solid`/`--color-warning-solid` already existed as separately-derived values, not copies of their anchors. The brief offered two options (prohibit white text on anchors, or introduce accessible variants) — the accessible variants already existed for three of five anchors and are added for the remaining two, so this pass completes the existing pattern rather than introducing a new one.

**§17 automation, per the brief's explicit instruction that the acceptance criteria must become achievable:** the Token-palette regression row now specifies a completeness assertion, not only a correctness assertion — the test parses `tokens.css`'s actual declared color custom properties and fails if any lacks a grid row. §24's acceptance criteria gain a corresponding item stating the completeness check itself must pass. This is what makes "every semantic token is validated" an achievable, self-verifying claim rather than a claim resting on the next remediation pass remembering to check by hand.

**Status: Closed**, pending the sixth review's own independent verification.

### N-2 (MEDIUM) — §6b's ESLint-resolver claim

**Resolution.** §6b's claim that ESLint's resolver "delegates to each linted file's own nearest `tsconfig.json`" is removed and replaced with the mechanism the fifth review actually found by reading `eslint-import-resolver-typescript@3.10.1`'s source: with `{ typescript: true }`, the resolver's `options.project` is `undefined` and it falls back to searching from `process.cwd()`, not from each file. The section now states **CURRENT LIMITATION** plainly (root-invoked lint — `verify-boundary-lint.mjs`, the root `pnpm lint` script — cannot resolve `@ui/*`, because the repository root has no `tsconfig.json`, only `tsconfig.base.json`) and **FUTURE STATE** as a corrected, concrete T2 deliverable: change `import/resolver` from the bare boolean to an explicit form naming the workspace's tsconfig files. T2's row in §20 and T3's acceptance evidence both gain a fourth assertion — a root-invoked `eslint <path>` run against a `@ui/*`-using file must resolve correctly, not silently as an unresolved external import — since none of the prior three assertions (`typecheck`, `next build`, `pnpm test`) exercise ESLint at all.

**What this pass does not do:** it does not modify `eslint.config.js` itself (out of scope for this pass) and does not prescribe the exact resolver syntax as final — it names the required shape (`{ typescript: { project: [...] } }` naming the workspace tsconfigs) as a corrected T2 deliverable, consistent with every other not-yet-applied item in §6a/§6b.

**Status: Closed.**

### N-3 (MEDIUM) — RISK_REGISTER.md history claim

**Resolution.** The pass-#4 remediation report claimed the register's design-history line was extended through pass #4; it was not. This pass performs the extension for real, through pass #5, listing every prior review and report document in order, with a correction note explaining what the prior claim got wrong rather than silently fixing it without acknowledgment.

**Status: Closed.**

### N-4 (MEDIUM) — Stale "fourth review" status text

**Resolution.** The design document's status line (top of file), §27's Architecture Gate checklist, and the document's closing line all previously said "fourth" in places that should have tracked the document's actual, current gate status. All three are corrected: the status line now describes the fifth review's findings and states this document is pending a sixth review; §27's unchecked item now says "pending a sixth independent review"; the closing line now reads "READY FOR SIXTH INDEPENDENT ARCHITECTURE GATE REVIEW." A full-document search for "fourth"/"Fourth" was performed; every remaining occurrence is a correct historical reference (describing what the fourth review found or did, in past tense, inside a change-log table or a "this pass closes X" sentence) — none is a live status claim. The same search was performed for "fifth"/"Fifth," "previous pass," and "remediation pass" references; all are either correct historical references or (in §0's per-pass change tables) accurate descriptions of what changed in that specific numbered pass.

**Status: Closed.**

### N-5 (MEDIUM) — `--color-text-dark` naming conflict

**Resolution.** The separate token name is removed. `--color-text` is now presented as a single token name with a light raw value (`#0f172a`, unchanged, already shipped) and a dark raw value (`#f1f5f9`, unchanged from pass #4's proposal — only its name is corrected), following the identical `@theme inline` + `:root`/`[data-theme="dark"]` pattern used by every other dual-valued token in this document. The paragraph explains why the `--color-bg`/`--color-bg-dark` precedent pass #4 cited does not apply to new tokens: that pair predates this document's own theming mechanism and is not a pattern this document's own §12.1 recommends for anything it defines itself. T1's deliverable list and §17's evidence text are both corrected to refer to "`--color-text` with a dark raw value," not two token names.

**Status: Closed.**

### N-6 (LOW) — ADR-024's shadow mapping omitted `--shadow-flat: none`

**Resolution.** DECISIONS.md's ADR-024 gains an explicit rule: a `none`-keyword shadow value maps to an empty array (`[]`) in the generated artifact — stated as a rule, not left for T18's implementer to discover, and explicitly not a failure condition (the Failure-behavior paragraph is updated to exclude this case from its type-mismatch trigger). The worked example is updated to include `"flat": []`.

**Status: Closed.**

### N-7 (LOW) — Six/seven manual-screen-reader-check count mismatch

**Resolution.** §12.4's table has, since pass #3, marked seven components (including the bottom tab bar, with its own stated justification — the sidebar↔tab-bar responsive swap is a genuine behavior change). The surrounding prose in §5, §6c, §12.4, §12.5, §17, and §21, plus RISK_REGISTER.md's R-54, all said "six." All seven locations are corrected to "seven," matching the table (the table's own content was already correct and required no change), with R-54 gaining a correction note.

**Status: Closed.**

### N-8 (LOW) — WAF bullet's residual contradictory framing

**Resolution.** §18's WAF bullet opened with pass-3 framing ("stated as an owned open question, not a silent either/or") immediately followed by pass-4's correction ("This is a decision, not an open option") — two adjacent sentences disagreeing about whether a decision had been made. The opening sentence is rewritten to state the correction directly, with a note explaining what was wrong and why, rather than leaving the superseded framing in place next to its own correction.

**Status: Closed.**

## Validation Evidence

- Every hex value touched by this pass (`--color-primary-solid`, `--color-secondary-solid`, the disabled tokens, `--color-text`'s dark raw value) was either reused unchanged from an already-verified computation (the brand anchors, `#f1f5f9`) or computed fresh this pass using the same WCAG 2.1 formula established in prior passes; the white-on-anchor failures cited for accent/success/warning (2.428/2.279/2.148) were recomputed this pass and match the fifth review's own independently-derived figures exactly.
- `eslint.config.js` was read but not modified this pass — confirmed via `git status` showing no working-tree change to it.
- The section-header, task-reference, risk-reference, and ADR-reference audits described in the Required Validation section below were run against the finished document, not assumed from the edits made.

## Required Validation — Documentation Consistency Audit

- [x] Every token has a definition — `--color-primary-solid`, `--color-secondary-solid`, `--color-disabled-bg`, `--color-disabled-text`, `--color-text` (single name) all now have one.
- [x] Every token has theme behavior — all five state the `@theme inline` mechanism or explicitly note where an exemption applies (disabled tokens).
- [x] Every semantic token appears in validation — §12.1's grid now includes all tokens named anywhere in the document's prose; §17's completeness assertion enforces this going forward rather than relying on manual re-audit.
- [x] Every contrast claim has supporting calculation — all new/changed ratios shown with their computed values.
- [x] Every task reference exists — T1–T18 all resolve to a row in §20 (verified by direct grep against the task table).
- [x] Every ADR reference resolves — ADR-015/024/025/026 all exist in DECISIONS.md; all three E3 ADRs remain Proposed (verified by reading every Status line after editing).
- [x] Every risk reference resolves — R-54 through R-65 all exist in RISK_REGISTER.md's E3 section (verified by direct grep).
- [x] No stale review references remain — full-document search for "fourth"/"pending a fourth"/"READY FOR FOURTH" confirms only correct historical references remain; the live status lines now correctly say "fifth" (findings responded to) and "sixth" (pending review).
- [x] No "see previous pass" references remain — none found by grep.
- [x] No "unchanged" dangling references remain — every remaining "unchanged" occurrence was individually reviewed; all describe either (a) a genuinely unchanged canonical value with its identity/location corrected, or (b) accurate historical narration; none points at a prior document revision that does not exist.
- [x] No acceptance criterion depends on missing artifacts — §24's criteria all reference real sections/tests; the previously-unsatisfiable completeness criterion is now satisfiable by construction via §17's new test.

## Remaining Risks

- This pass's own completeness fix is itself a claim, not yet executed — T1's actual implementation of the completeness assertion (parsing `tokens.css` and diffing against a token inventory) has not been built, since this is a documentation-only pass. The design is sound and concrete, but "the test exists and passes" remains a T1/T16 deliverable to verify, not something this pass can verify directly.
- N-2's fix names the required shape of the `eslint.config.js` `import/resolver` correction but does not specify it with the same level of executable precision as §6a's boundary-rule fix (which was verified this pass's predecessor by actual execution). The sixth reviewer should treat this as a stated requirement, not yet independently executed against the installed resolver version.
- As with every prior pass, this report's own claims should be independently re-verified rather than trusted on account — this project's five-review history is itself the argument for that discipline, not an exception to it.

## Open Items

- §25's open questions (UX Director sign-off Q1, icon system Q2, versioning/deprecation policy Q3, WAF ACL Q4 — decided by default, revisitable) remain open; none was closed by this pass, and closing them was not required to resolve the fifth review's findings.
- No new open question was introduced by this pass.

## Decision Log

- **N-1:** Reused existing, already-validated brand-anchor values for the two new solid-fill tokens rather than deriving new colors, since both anchors already pass 4.5:1 white-on-fill — the gap was documentation and validation, not color selection.
- **N-2:** Named the required `import/resolver` fix conceptually (explicit project list) rather than prescribing an exact syntax, since verifying the exact correct syntax against the installed resolver version requires execution this documentation-only pass does not perform — left as a concrete, correctly-scoped T2 deliverable instead.
- **N-5:** Chose to fold `--color-text-dark` into `--color-text` (removing the second name) rather than the reverse (renaming every other token to a two-name pattern), because the single-name pattern is what §12.1's own mechanism section, ADR-024's schema, and every other token in the document already use — this is the minimal-architecture-change resolution, not a new decision.
- **N-7:** Corrected the prose count to match the table (seven) rather than removing the bottom tab bar from the table, since the table's own stated justification for including it was sound and un-contested by any prior review.

## Verification Checklist

- [x] Findings N-1 through N-8 all addressed with evidence shown.
- [x] Every allowed-file edit is inside the four permitted files; no other file modified (`git status` confirms).
- [x] All three ADRs remain Proposed; no status flip; no self-approval.
- [x] Document-wide reference audit performed (section headers, T-refs, R-refs, ADR-refs) — all resolve.
- [x] No implementation, package installation, component creation, CI change, or Terraform change performed.

## Recommendation

**READY FOR SIXTH INDEPENDENT ARCHITECTURE GATE REVIEW.**

This report does not approve Epic E3, does not begin implementation, and does not start Epic E4.
