# Epic E3 — Seventh Independent Architecture Gate Review

**Subject:** `docs/epics/E3-design-system-component-library.md` (Remediation Pass #6, last updated 2026-08-05)
**Reviewer:** Seventh independent Architecture Gate reviewer — not the author of the design or of any of the six remediation passes, and not any of the first six reviewers.
**Date:** 2026-08-05
**Review type:** **Verification-focused**, against a deliberately different and more lenient decision standard than the six prior reviews (stated in §1 below). This is not a from-scratch re-review of the whole document; six prior passes already did that exhaustively.

**Decision: GO** (see §6).

---

## 1. Executive Summary

This review verifies whether Remediation Pass #6 actually closed the sixth review's findings, and then makes a final architecture-readiness judgment under a decision rule that asks one question: **would any remaining issue force a redesign of packages, dependency direction, APIs, the token model, the accessibility model, Storybook architecture, or governance once implementation starts?**

The answer is no. Every item on the verification list is genuinely closed, and I re-derived the load-bearing claims myself rather than accepting the remediation report's account.

The single most important verification is the one Pass #6 itself flagged as its own unverified residual. Pass #6 fixed P6-1 (the Tier-2 typography layer that had no implementable CSS form) by moving Tier 2 to `@utility type-<name>` blocks, and stated plainly that it had _not_ run that construct through the installed Tailwind toolchain, inviting the seventh reviewer to do so. **I did.** I compiled a multi-declaration `@utility` block through the repository's own installed `tailwindcss@4.3.3` compiler API and confirmed it emits all four declarations (`font-size`, `line-height`, `font-weight`, `font-family`) into a single `.type-caption` class. The mechanism is real, buildable, parseable by a CSS parser (so ADR-024's postcss generator has a genuine source), and it is the same construct `tokens.css` already ships for `--duration-*`. P6-1 is closed on evidence, not on argument.

I also independently recomputed a load-bearing sample of the WCAG grid — the primary/border/focus/solid-fill/disabled tokens plus the _new_ M-3 claim that `--color-text` on `--color-surface-muted` clears 4.5:1 — after implementing the WCAG 2.1 formula from scratch and sanity-checking it against three published ratios. **Every recomputed value matches the document to three decimal places, including the two new pairings introduced by this pass.** I read `packages/ui/src/components/button.tsx` directly and confirmed §14's CURRENT-STATE claim is literally accurate: all five named raw-palette violations exist in the shipped file. I read `RISK_REGISTER.md` and confirmed R-66 exists with substantive content and R-54 now names eight components including Tabs. I confirmed ADR-024, ADR-025 and ADR-026 all remain `Status: Proposed` in **both** their own blocks and the ADR index — there is no status flip and no self-approval.

Nine findings remain. **None is an Architecture Blocker.** Four are Implementation Tasks (a Tier-1 declaration-site choice, an unperformed date-picker risk re-classification, a still-unowned generic confirmation dialog, and a salt-storage nuance in the Storybook credential design). Five are Documentation Follow-ups (stale illustrative examples that survived the typography redesign, one finding-ID mislabel, one stale historical statement, one summary-table enumeration wobble). Every one of them can be resolved inside T1/T13/T17's ordinary implementation work without changing a single architectural decision.

The architecture is internally consistent. The dependency-direction fix, the resolver-class analysis, the token model, the accessibility strategy, the Storybook access model, and the governance structure (ADRs Proposed, risks registered, gates with named evidence) all hold together and all rest on claims I could re-derive. I am approving it.

---

## 2. Verification Performed

Everything below was executed or read by me during this review. No claim from the design document, from `E3-remediation-report-v6.md`, or from the sixth review was accepted without independent re-derivation where re-derivation was possible.

**Documents read in full:** `docs/epics/E3-design-system-component-library.md` (850 lines), `docs/epics/E3-remediation-report-v6.md`, `docs/epics/E3-sixth-independent-architecture-review.md`, `docs/DECISIONS.md` ADR-024/025/026 blocks and the full ADR index, `docs/RISK_REGISTER.md` E3 section (R-54–R-66), `docs/DESIGN_SYSTEM.md` §1–§4 (color table, semantic color rules, typography, component categories), `packages/ui/src/styles/tokens.css`, `packages/ui/src/components/button.tsx`, `eslint.config.js` (targeted).

**(a) The Tailwind `@utility` claim — EXECUTED, the one claim Pass #6 explicitly did not verify.**

I invoked the installed compiler directly (`node_modules/.pnpm/tailwindcss@4.3.3/.../dist/lib.mjs`, the `compile()` API), from a throwaway script outside the repository, feeding it a multi-declaration `@utility` block of exactly §12.1a's shape:

```
=== type-caption emitted? === true
  .type-caption {
    font-size: var(--text-xs2);
    line-height: var(--text-xs2-leading);
    font-weight: var(--font-weight-regular);
    font-family: var(--font-sans-x);
  }
  .duration-micro {
    transition-duration: var(--duration-micro);
  }
```

All four declarations survive compilation into one class. Tailwind v4.3.3 imposes no single-declaration restriction on `@utility`. The `--duration-*` precedent the document reasons from is real and shipped (I read it in `tokens.css`). **§12.1a's mechanism is confirmed buildable against the installed toolchain.**

**(b) WCAG contrast — independently reimplemented and recomputed.** sRGB linearization at the 0.03928 threshold, `0.2126R + 0.7152G + 0.0722B`, `(L_lighter+0.05)/(L_darker+0.05)`. Sanity check before use: `#dc2626`/white = 4.829 (published 4.83), `#767676`/white = 4.542 (published 4.54), black/white = 21.000. Then recomputed against all four surfaces per theme:

| Token / pairing                                            | My computation                                                            | Document   | Match |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- | ----- |
| `--color-primary-text` light `#2563eb`                     | 4.940 / 5.169 / 4.718 / 5.169                                             | identical  | ✓     |
| `--color-primary-text` dark `#60a5fa`                      | 7.934 / 7.022 / 5.754 / 5.020                                             | identical  | ✓     |
| `--color-ai-text` light `#7c3aed`                          | 5.447 / 5.699 / 5.202 / 5.699                                             | identical  | ✓     |
| `--color-ai-text` dark `#a78bfa`                           | 7.413 / 6.560 / 5.375 / 4.690                                             | identical  | ✓     |
| `--color-border` light `#64748b`                           | 4.548 / 4.759 / 4.344 / 4.759                                             | identical  | ✓     |
| `--color-border` dark `#94a3b8`                            | 7.868 / 6.963 / 5.705 / 4.978                                             | identical  | ✓     |
| `--color-border` old light `#e2e8f0` (fail demo)           | 1.178 / 1.233 / 1.125 / 1.233                                             | identical  | ✓     |
| `--color-focus-ring` both themes                           | 4.940…5.169 / 7.934…5.020                                                 | identical  | ✓     |
| `--color-text` light + dark                                | 17.063 / 17.853 / 16.296 / 17.853 · 18.414 / 16.296 / 13.353 / **11.650** | identical  | ✓     |
| Solid fills white-on-fill (6)                              | 5.169 · 5.699 · 5.358 · 5.016 · 5.022 · 5.737                             | identical  | ✓     |
| Raw anchors white-on-fill (3)                              | 2.428 · 2.279 · 2.148                                                     | identical  | ✓     |
| Disabled tokens (informational)                            | light 2.340–2.564, dark 2.682–4.239                                       | identical  | ✓     |
| Danger/info anchor justifications                          | 4.408 · 3.914 / 4.095 / 3.738                                             | identical  | ✓     |
| **NEW (M-3): `--color-text` on `--color-surface-muted`**   | light **16.296**, dark **13.353**                                         | identical  | ✓     |
| **NEW (M-3): `--color-border` on `--color-surface-muted`** | light 4.344, dark 5.705 (both ≥3:1)                                       | consistent | ✓     |

Zero discrepancies. The two new pairings M-3 introduces are not new colors and are genuinely already validated in the grid, exactly as claimed.

**(c) `button.tsx` — read directly.** Confirmed present today: `border-neutral-300`, `bg-neutral-100`, `text-neutral-900`, `hover:bg-neutral-200`, `dark:border-neutral-700`, `dark:bg-neutral-800`, `dark:text-neutral-50`, `dark:hover:bg-neutral-700`, `bg-red-600`, `hover:bg-red-700`. The `secondary` variant is neutral, not purple — the collision M-3 describes is real, and §14's CURRENT-STATE list is accurate to the file.

**(d) ADR status — checked in both places.** `DECISIONS.md` lines 236, 246, 256: all three read `**Status:** Proposed — pending Architecture Gate approval of E3's design, not self-approved.` ADR index lines 287–289: `Proposed`, `Proposed`, `Proposed`. **No status flip. No self-approval.** §23 of the design document matches the literal ADR text.

**(e) `RISK_REGISTER.md`.** R-66 exists (Technical/Maintainability, Medium/Low, Frontend owner, `Open — deferred`), describes the `@ui/*` deep-import surface accurately including _why_ no boundary rule catches it (the deliberate `'**'` entry-point allowance for `ui-package`), and names the two future-fix candidates §6d names. R-54 now names eight components and includes Tabs with a stated reason. The E3 header and design-history line run through Pass #6 and cite `E3-remediation-report-v6.md` by its real filename.

**(f) Boundary-lint internal consistency — spot re-checked, not re-executed.** The sixth review re-executed §6a's diagnosis end to end and found no defect; Pass #6 did not touch §6a. I verified the CURRENT-STATE premises still hold against the live file: `eslint.config.js` still has no `boundaries/root-path`, no `ui-package` element type, still uses `allow: '*'` on `boundaries/entry-point` (line 99) and the bare `typescript: true` resolver (line 60). Nothing about §6a/§6b/§13 has gone stale. `git diff --stat` confirms Pass #6 modified only `docs/DECISIONS.md`, `docs/RISK_REGISTER.md`, and the design document — no configuration or source file was touched, as claimed.

**(g) Rename consistency (M-3).** Grepped `--color-secondary` across the design document, `DECISIONS.md`, `RISK_REGISTER.md` and `DESIGN_SYSTEM.md`. Six hits remain, **all of them correct historical narration** (two §0 changelog rows describing prior passes, three explicit "renamed from" annotations, one T1 deliverable note). No live token is still named `--color-secondary-*`. The rename is complete, not partial.

**(h) Manual-check count propagation (seven → eight).** Verified at every site: §5 J2, §6c Toast row, §12.4 (both the table's seven `Yes` cells plus Tabs, and the explicit reconciliation sentence), §12.5 layer 5, §17's Accessibility (manual) row, §21's Accessibility gate, and `RISK_REGISTER.md` R-54. All eight sites say eight. Consistent.

**(i) Component-count arithmetic (P6-10) — recounted from §12.2 myself.** 5 buttons + 7 forms + 4 cards + 4 navigation + 1 dashboard + 8 AI chat + 5 progress + 5 gamification + 4 commerce + 2 admin = **45**. Minus the five now fully specified (dashboard grid, voice-session state machine, admin data table, combobox, thinking/typing) = **40**. §1, §2, §6d and §12.4 all state exactly these numbers. Arithmetic correct.

**(j) `DESIGN_SYSTEM.md` cross-checks.** §2's color table contains exactly `--color-primary`, `--color-ai`, `--color-accent`, `--color-success`, `--color-warning`, `--color-bg`, `--color-bg-dark`, `--color-text` — **five brand hue anchors, no danger row, no info row**. §3's Non-Goals correction (P6-6) is therefore accurate. §2's purple-exclusivity rule reads exactly as M-3 quotes it. §4's AI-chat row does require the "'thinking' vs. 'typing' state distinction" — M-1 addresses a real canonical requirement.

**(k) ADR-024 / ADR-026 content consistency.** ADR-024's Typography row now sources from "§12.1a's Tier 2 `@utility type-<name>` blocks," describes the generator parsing the four declarations and resolving each `var()` against `:root` Tier-1 values, and a new **Typography schema-validation rule** (line 201) makes a missing or unresolvable declaration a build-time failure naming the specific token and field; the Failure-behavior paragraph references it. §17's typography-completeness assertion mirrors it at T1 time. ADR-026's salt text matches §18's clause for clause (independently generated Terraform salt, `SHA-256(salt + credential)`, both entries in KVS, rotation coupled to credential rotation, Security/DevOps ownership, fail-closed `401`). No divergence between the two copies.

**Repository state:** no repository file was modified by this review. All verification artifacts (the Tailwind compile probe and the WCAG script) were written to the session scratchpad outside the repository and deleted. The only change this review introduces is this file.

---

## 3. Findings

Verification outcome on the required list first, then this pass's own findings.

### 3.1 Verification of the sixth review's findings

| ID              | Sixth review's finding                                                                                           | Verdict                              | Basis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P6-1** (HIGH) | Tier-2 `--type-*` had no implementable CSS form; ADR-024's generator had no source for `fontWeight`/`fontFamily` | **CLOSED — verified by execution**   | §12.1a now specifies nine real `@utility type-<name>` blocks, each composing four `var()`-referenced primitives; I compiled this construct through the installed `tailwindcss@4.3.3` and confirmed all four declarations emit into one class. Tier-1 line-heights are now named primitives (`--text-<size>-leading`), closing the second half of the finding. ADR-024's Typography row and its new schema-validation rule match §12.1a exactly, and §17 gains a mirroring T1-time assertion. This is a genuine architectural fix, not a paper one.                           |
| **M-1**         | No "thinking" vs "typing" contract                                                                               | **CLOSED**                           | §12.4 carries a full contract: purpose (distinguishing pre-output reasoning from active streaming), visual treatment (deliberately not a spinner), `phase` prop, `aria-live="polite"` with a **single** one-time announcement and DOM removal on transition so it never double-announces with the streaming renderer, reduced-motion degradation to static, loading-state = the `thinking` phase itself with a CLS-safe fixed height, unit + interaction testing, and an ADR-006/§13 presentational-only statement. Every element the verification list required is present. |
| **M-2**         | DropdownMenu/Popover/Tabs/Tooltip had no contracts; Tabs' roving-tabindex risk unaddressed                       | **CLOSED**                           | All four now have keyboard / focus-management / ARIA / screen-reader / testing contracts. Tabs' contract specifies the roving-tabindex mechanism concretely (0 on active, −1 elsewhere, arrow/Home/End semantics, manual activation chosen over automatic **with the reason given**), and Tabs is added to the mandatory manual-screen-reader list — the risk is addressed by its own contract, not merely cross-referenced. Ownership is stated (T3 installs; consuming tasks own stories/tests).                                                                           |
| **M-3**         | `--color-secondary-*` was AI-purple; Button `secondary`/`ghost` had no token target                              | **CLOSED**                           | Renamed to `--color-ai-text`/`--color-ai-solid`, applied consistently everywhere (verified by grep — remaining hits are historical only). The new Brand-vs-Action token model is a sound and correctly reasoned separation. `secondary`/`ghost` now target `--color-surface-muted`/`--color-border`/`--color-text` — **I confirmed all three already exist and are already validated in the grid**, and recomputed the resulting pairings (16.296 light / 13.353 dark for text on muted; 4.344 / 5.705 for border on muted). No new unvalidated color was introduced.        |
| **M-4**         | §21's gate blocked on something §14's control didn't cover, with a known-failing file                            | **CLOSED**                           | §14's control row and §21's Frontend gate both now carry an explicit CURRENT-STATE / POST-IMPLEMENTATION split. I verified the CURRENT-STATE claim against `button.tsx` itself — all five named violations are really there. T2 owns the `packages/ui`-inclusive rule; **T1 is named explicitly as the task that removes the existing violations**, with the correct observation that a lint rule prevents regression but does not fix an existing file.                                                                                                                     |
| **P6-5** (Low)  | Breakpoint lint rule owned by no task                                                                            | **CLOSED** (main); one sub-item open | Reassigned to T2 in both §12.1's prose and §20's T2 deliverable row. The sub-observation about `--breakpoint-mobile`'s declaration form remains — see S7-1b.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **P6-6** (Low)  | danger/info anchors misattributed to `DESIGN_SYSTEM.md`                                                          | **CLOSED**                           | §3 now states five anchors and explicitly records danger/info as E3's own semantic-tier additions. I verified `DESIGN_SYSTEM.md` §2 has neither row.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **P6-7** (Low)  | `@ui/*` deep-import gap had no risk row                                                                          | **CLOSED**                           | R-66 exists with accurate, substantive content; §6d cites it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **P6-8** (Low)  | KVS salt source/rotation/ownership/failure unspecified                                                           | **CLOSED** as specified              | §18 and ADR-026 both specify all four, identically. One residual security nuance noted as S7-4 (not a specification gap).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **P6-9** (Low)  | Stale `--color-text-dark` changelog row                                                                          | **CLOSED**                           | §0's Pass-#4 row is corrected in place with an explanatory note; a reader no longer meets the superseded statement first.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **P6-10** (Low) | Component count                                                                                                  | **CLOSED**                           | 45 / 5 / 40, arithmetic shown inline, recounted by me and correct.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### 3.2 This review's own findings

---

**S7-1 — Tier-1 typography primitives' declaration site is unstated**
**Severity:** Low · **Classification: B — Implementation Task**

_Evidence._ §12.1a names Tier-1 tokens (`--text-xs` … `--text-5xl`, `--text-<size>-leading`) and their values but never says where they are declared. §17's typography assertion and ADR-024's schema rule both presuppose `:root` ("resolves to a `:root`-declared Tier-1 primitive"), which is a workable and probably intended reading — but if T1 instead puts them in `@theme`, `--text-*` is a real Tailwind v4 theme namespace (I confirmed it in the installed `theme.css`) and `--text-xs-leading` would generate a spurious `text-xs-leading` font-size utility. Separately, every proposed size value is byte-equal to Tailwind's own default (`--text-xs` 12px = 0.75rem, etc.), so no value conflict exists either way.

_Why this is not a blocker._ The `@utility` blocks reference their primitives by `var()`, which resolves identically from `:root` or from `@theme`'s emitted properties. Nothing about the token model, the generator contract, or the test assertions changes based on which one T1 picks. It is a one-line choice at implementation time with a clearly indicated default.

_Recommendation._ T1 declares Tier-1 typography primitives in `:root` (matching §17's and ADR-024's own wording) and records the choice in `tokens.css`'s comment block, as the file already does for `--duration-*`.

---

**S7-1b — `--breakpoint-*` declaration form still unstated (carried over from P6-5's sub-observation)**
**Severity:** Low · **Classification: B — Implementation Task**

_Evidence._ §12.1 describes `--breakpoint-mobile` as "<768px," while Tailwind v4's `--breakpoint-*` namespace generates min-width variants only; ADR-024's worked example emits `"mobile": 0`. The intended declaration (`0px`, producing an always-true `mobile:` variant, versus simply treating mobile as the unprefixed base) is still not stated.

_Why this is not a blocker._ §12.3's mobile-first mandate makes the intent unambiguous — mobile is the base, tablet and desktop are the min-width steps. Whether `--breakpoint-mobile: 0px` is declared for symmetry or omitted affects one line of `tokens.css` and one entry in the generated artifact, not the model.

_Recommendation._ T1 states the form in `tokens.css`; if `mobile` is base-only, ADR-024's `"mobile": 0` entry is still correct as a Flutter-side threshold constant and needs no change.

---

**S7-2 — Date/time picker's manual-screen-reader classification was not re-evaluated**
**Severity:** Low–Medium · **Classification: B — Implementation Task**

_Evidence._ The sixth review's P6-2 remediation instruction had three parts; Pass #6 executed two (the thinking/typing contract, the four composite widgets) and did not execute the third: "Re-evaluate the date/time picker against §12.4's stated manual-check criterion and either include it or record why it is excluded." §12.4's table (line 662) still reads `Date/time picker | Native-input-backed where possible, ARIA date-picker pattern otherwise | — | No`, with no recorded rationale. Pass #6's report marks M-2 "Closed" without mentioning this item. The tension the sixth review identified is real: a hand-built ARIA date picker (grid pattern, roving tabindex, focus into and out of a popover) meets the document's own inclusion criterion at least as squarely as the bottom tab bar, which is included.

_Why this is not a blocker._ This is a QA-scope decision about one component's verification depth, made per-component at T13. Including it later adds a `UI_UX_REVIEW_TEMPLATE.md` §7 instance and moves the count from eight to nine; it changes no contract, no token, no task graph edge, and no gate mechanism. The document's own escape hatch ("native-input-backed where possible") may well mean no custom ARIA is built at all.

_Recommendation._ T13 makes the call explicitly before implementation: if the picker is native-input-backed, record that as the exclusion rationale in §12.4; if a custom ARIA grid is built, add it to the mandatory list and update the count (and R-54) in the same change, per the reconciliation discipline passes #5 and #6 already established for six→seven and seven→eight.

---

**S7-3 — No component or task owns §6c's "confirmation flows" consumer**
**Severity:** Low · **Classification: B — Implementation Task**

_Evidence._ §6c justifies installing Dialog/AlertDialog partly for "confirmation flows," but §12.2's Commerce category names only the paywall/upgrade modal, and no §12.4 row or §20 task delivers a generic confirmation dialog. The sixth review recorded this as an observation rather than a finding, correctly noting the design is faithful to `DESIGN_SYSTEM.md` §4, which also lists only the paywall modal. It carries forward unchanged.

_Why this is not a blocker._ The primitive is installed by T3 either way; a confirmation dialog composed from it is a component addition inside an existing category with an existing owner, not a structural change. §14 already assigns focus-trap/Escape behavior to T3 (inherited from Radix), so the accessibility substrate exists regardless.

_Recommendation._ Either add a confirmation-dialog row to §12.2's Commerce category under T13, or narrow §6c's stated consumer list to what the epic actually delivers. Either resolves it in one line.

---

**S7-4 — The Storybook KVS salt is stored beside the hash, and SHA-256 is not a KDF**
**Severity:** Low · **Classification: B — Implementation Task**

_Evidence._ §18 and ADR-026 both specify writing **both** `credential-hash` and the plaintext `credential-salt` into the same KeyValueStore. An attacker who can read the KVS therefore obtains the salt along with the hash, so the salt provides no protection in the compromise scenario ADR-026's own Security-implications line contemplates — its remaining value is against precomputed rainbow tables only. Separately, `SHA-256` is a fast digest, not a password-hardening KDF; `cloudfront-js-2.0`'s `crypto` module offers no PBKDF alternative, so the choice is forced by the runtime, not careless.

_Why this is not a blocker._ ADR-026's stated security claim — "a KVS compromise alone does not disclose the credential" — remains literally true. The design's own threat model (a low-sensitivity internal preview tool, synthetic fixture data only, shared credential already accepted under R-56) does not depend on offline-attack resistance. The salt's source, rotation, ownership and fail-closed behavior — the four things the sixth review actually asked for — are all now specified, unambiguously and identically in both documents. This is a residual property of a decision already taken and already risk-registered, not an unspecified mechanism.

_Recommendation._ T17 generates the credential with high entropy (a Terraform `random_password` of sufficient length, not a human-chosen string), which makes the SHA-256/co-located-salt combination adequate for this threat model. Optionally note in ADR-026 that the salt is not treated as a secret and exists for rainbow-table resistance only, so the property is stated rather than inferred.

---

**S7-5 — Stale `--type-heading-lg` examples survived the typography redesign**
**Severity:** Low · **Classification: C — Documentation Follow-up**

_Evidence._ Two illustrative references still describe Tier-2 typography as a CSS custom property, a form §12.1a deliberately abolished: the design document's §12.1 three-tier definition (line 315, "Semantic (named roles — `--color-danger-text`, `--type-heading-lg`)"), and `DECISIONS.md` ADR-024's naming-convention example (line 193, "`--type-heading-lg` → `typeHeadingLg`").

_Why this is harmless._ Both are examples, not normative rules, and neither produces an ambiguous outcome: the class name `type-heading-lg` converts to the identical key `typeHeadingLg`, and ADR-024's Typography _mapping_ row — the normative one — correctly sources from the `@utility` blocks. The generated artifact's shape is unaffected.

_Recommendation._ Update both examples in whichever PR next touches these sections. Not worth a dedicated change.

---

**S7-6 — §12.4's intro attributes the thinking/typing contract to finding M-2 instead of M-1**
**Severity:** Trivial · **Classification: C — Documentation Follow-up**

_Evidence._ Line 577: "plus the AI thinking/typing distinction, added this pass … closing the sixth review's M-2." The contract itself (line 602) correctly says M-1, and §0's change table (line 67) correctly says M-1. A single-token mislabel in one sentence.

_Recommendation._ Correct to M-1 opportunistically.

---

**S7-7 — §0's "this file has no version history (it is untracked in git)" is now false**
**Severity:** Trivial · **Classification: C — Documentation Follow-up**

_Evidence._ The document's historical note explains Pass 2's "unchanged from Pass 1" defect by stating the file is untracked. `git diff --stat` now reports `docs/epics/E3-design-system-component-library.md | 845 ++++---` — it is a tracked file with recoverable history.

_Why this is harmless._ The statement was accurate when written and its _purpose_ (explaining why no section may point at a prior revision) is unaffected — the discipline it establishes is good regardless of tracking status.

_Recommendation._ Reword to past tense when convenient.

---

**S7-8 — The "Remaining 40 components" table does not enumerate exactly 40**
**Severity:** Trivial · **Classification: C — Documentation Follow-up**

_Evidence._ The table introduced as covering the remaining 40 includes three rows marked "(fully specified above)" (admin data table, combobox, voice-session state machine) while omitting the other two fully-specified components (dashboard grid, thinking/typing). It is functioning as a whole-library summary with cross-references, not as a strict complement set.

_Why this is harmless._ P6-10's substantive defect — a stated count that matched neither the total nor the remainder — is genuinely fixed; the prose arithmetic (45 − 5 = 40) is correct and shown inline. This is presentation inconsistency in a summary table, with no downstream consumer.

_Recommendation._ Either add the two missing cross-reference rows for symmetry or retitle the table as the library summary it actually is.

---

**S7-9 — Locale-aware typography is specified for line-height only; `DESIGN_SYSTEM.md` §3 also requires locale-aware font stacks**
**Severity:** Low · **Classification: B — Implementation Task**

_Evidence._ `DESIGN_SYSTEM.md` §3 states target-language content "uses locale-aware font stacks **and** line-height overrides layered on top of the base type scale." §12.1's "Locale-aware line-height" paragraph covers the line-height half; no locale-aware font stack is defined anywhere in E3. Additionally, now that Tier-2 blocks set `line-height` as one of four composed declarations, the override mechanism deserves one sentence of specification.

_Why this is not a blocker._ The cascade makes this work without any design change: `@utility` output lives in Tailwind's utilities layer, and an unlayered `[lang="…"]` rule beats layered styles regardless of specificity, so a locale override cleanly wins over one declaration of the composite block. And `DESIGN_SYSTEM.md` itself frames learning-content typography as "a distinct concern" — the font-stack half is reasonably a later content epic's scope, consistent with §3's Non-Goals.

_Recommendation._ T1 states the override mechanism in one sentence in §12.1a (an unlayered `[lang]`-scoped rule, or a `lang`-scoped `@utility` variant). If the font-stack half is out of scope for E3, say so explicitly in §3 Non-Goals so the canonical requirement is visibly deferred rather than silently unmet.

---

## 4. Architecture Score

| Dimension                      | Score  | Basis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**               | 93     | The dependency-direction fix (§6a) survived a prior reviewer's full re-execution and its premises still hold against the live `eslint.config.js`. §6b's resolver-class enumeration is complete and honest about what is not applied. The token model now has an implementable representation at every tier — I verified the last unimplementable one by compiling it. Brand-vs-Action token separation is a genuine model improvement, not a rename. Deductions are for stale examples only.  |
| **Frontend Engineering**       | 88     | Five components fully specified and genuinely implementable from the document alone; four composite widgets now carry real keyboard/ARIA contracts. Typography is buildable. `secondary`/`ghost` have validated token targets. Deductions: 40 components remain at minimum-depth rows (deliberate and stated, with per-category review templates as the carrier); S7-1's declaration-site choice.                                                                                             |
| **Accessibility**              | 89     | Layered strategy correctly treats axe as necessary-not-sufficient and names its own blind spots; the Tabs contract now closes the one blind spot the strategy named without a backing contract. Eight-component manual list is consistent across all eight reference sites and R-54. The contrast grid is exhaustively correct — my sample of ~60 recomputed cells found zero discrepancies, including the two new M-3 pairings. Deduction: S7-2's unmade date-picker call.                   |
| **Security**                   | 86     | XSS surface closed structurally (typed props, no `dangerouslySetInnerHTML`, lint rule now scoped to `packages/ui`). Storybook mechanism buildable against the real runtime capability set, with the salt now fully specified and fail-closed. Deduction: S7-4's salt-storage nuance and the forced non-KDF digest.                                                                                                                                                                            |
| **Testing**                    | 85     | Every layer has an owner; the typography-completeness assertion is a genuine, buildable T1-time check that mirrors ADR-024's generator rule, so a gap is caught twice. The completeness-assertion honesty correction (stating `tokens.css ⊆ test-fixture` rather than claiming markdown parsing, with an explicit disabled-token exemption list) removes the sixth review's internal contradiction outright. Deduction: §24 is still stronger as design-pass acceptance than epic acceptance. |
| **Performance**                | 85     | Budget sourced from canonical `PERFORMANCE.md`, the pre-existing CI gap honestly measured and scoped to R-59, tree-shaking and CLS specified with real assertion mechanisms.                                                                                                                                                                                                                                                                                                                  |
| **Maintainability**            | 88     | Single-canonical-source discipline holds (ADR-024 in exactly one place, both ends agreeing). The token rename was applied completely, not partially — I checked. Every admitted residual now has a register row (R-63…R-66). Deductions: S7-5/S7-7/S7-8 editorial residue.                                                                                                                                                                                                                    |
| **Developer Experience**       | 87     | `@ui/*` avoids the `@/` collision and is honest that nothing is applied; the `--ignore-pattern` rollout keeps `pnpm lint` green; a T1 implementer can now build the typography tier by copying nine blocks out of the document — the exact opposite of the "implementer must invent it" failure the fifth and sixth reviews gated on.                                                                                                                                                         |
| **Overall Architecture Score** | **90** |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## 5. Production Readiness Score

**76.**

This is a design-phase epic, and the score reflects that honestly rather than penalizing it for being one. What is genuinely ready: the token model (buildable, computed, complete in both directions), the boundary rule and its CI rollout (specified from execution, with the CI-breaking consequence pre-solved), the component contracts for the five specified components and four composite widgets, the accessibility strategy and its evidence chain, and the task graph (acyclic, evidence-bearing, no orphaned deliverables after P6-5's reassignment).

What is not, all of it disclosed by the document itself: Q1 (UX Director sign-off) blocks T1; Q2 (icon system) blocks T4 and therefore T5/T8/T10/T14; R-64 states plainly that ADR-026 cannot be closed by any design-phase work and closes only at T17's real deployment; R-66 and R-59 remain genuinely open. Three ADRs are Proposed and require this gate's approval to become Accepted. None of these is a defect — they are correctly identified, owned, and registered dependencies, which is what design-phase readiness looks like.

## 6. Final Decision

# GO

Applying the stated decision rule: the architecture is internally consistent, and I could not construct a scenario in which any of the nine remaining findings forces a redesign after implementation begins. None touches package structure, dependency direction, the export surface, the design-token model, the accessibility model, Storybook's architecture, or governance. Four are ordinary implementation decisions inside T1, T13 and T17. Five are editorial.

I want to record two things plainly, because a six-NO-GO history exerts pressure in both directions.

First, I did not lower the bar to end the streak. The claim I scrutinized hardest is the one Pass #6 itself admitted it had not verified — that a multi-declaration `@utility` block is real, buildable Tailwind v4 CSS — and I verified it by compiling it through the repository's own installed compiler rather than by reasoning about it. Had it failed, P6-1 would have been an Architecture Blocker and this would have been a seventh NO GO. It did not fail. I also recomputed the WCAG values that M-3's new button-token claim depends on, rather than accepting that "these tokens are already validated elsewhere"; they are, exactly as stated. And I checked for the one thing that would have been fatal regardless of everything else — an ADR quietly flipped from Proposed to Accepted — and found all three still Proposed in both their own blocks and the index.

Second, the findings that remain are real and should not evaporate. Under the six prior reviews' standard, S7-2 and S7-4 would likely have been written up as Mediums. Under this review's standard they are Implementation Tasks, which means they are owned, scheduled, and expected to be closed by T13 and T17 respectively — not waived. They are recorded in §3.2 with recommendations precisely so that classifying them as non-blocking does not mean forgetting them.

The design is implementable as written. The remaining work is implementation work.

Epic E3 Architecture is approved for implementation.
