# Definition of Done

Status: **v1.1 — Mandatory process** · Owner: CTO · Last updated: 2026-07-29 (clarified after the Epic E1 remediation)

This is the single, non-negotiable checklist a feature or Epic must satisfy before it is called "Done" (lifecycle phase 20, [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §2). Every item below traces to a specific gate and a specific canonical document — nothing here is invented independent of the rest of the baseline. **"Done" means every applicable box is checked with linked evidence, not a verbal assurance.**

## The checklist

- [ ] **Architecture approved** — TECHNICAL_DESIGN_TEMPLATE.md completed and Architecture Gate passed (ARCHITECTURE.md, DECISIONS.md)
- [ ] **Documentation updated** — every canonical `docs/*.md` affected by this change is updated in the same PR (CLAUDE.md, CONTRIBUTING.md) — Documentation Gate passed
- [ ] **Database migration reviewed** — DATABASE_CHANGE_TEMPLATE.md completed, RLS policy present for tenant-scoped tables, Database Gate passed (DATABASE.md, MULTITENANCY.md)
- [ ] **APIs documented** — API_SPEC_TEMPLATE.md completed, OpenAPI spec generated correctly, API Gate passed (API_GUIDELINES.md)
- [ ] **Unit tests meet the bar** — coverage of business logic per TESTING.md §2 (not a blind percentage on boilerplate); every functional requirement in FEATURE_SPEC_TEMPLATE.md §3 has a corresponding test
- [ ] **Integration tests passing** — happy path, validation failure, auth failure, conflict/edge case, and cross-tenant isolation (if applicable) all covered (TESTING.md §1, MULTITENANCY.md §6)
- [ ] **No critical security issues** — SECURITY_REVIEW_TEMPLATE.md completed (if applicable), Security Gate passed, zero open P0/P1 findings (SECURITY.md)
- [ ] **Accessibility validated** — WCAG 2.1 AA checklist in UI_UX_REVIEW_TEMPLATE.md §7 actually tested (screen reader, keyboard, contrast), not assumed; Accessibility Gate passed
- [ ] **Performance budget met** — measured against the relevant class in PERFORMANCE.md, not estimated; Performance Gate passed
- [ ] **Logging implemented** — structured logs with required fields per OBSERVABILITY.md §1
- [ ] **Metrics implemented** — any new cost/latency/quality signal worth tracking is wired to a dashboard (OBSERVABILITY.md §2, §6)
- [ ] **Feature flags configured (if required)** — risky or gradual rollouts are flagged, not deployed unconditionally (ARCHITECTURE.md §8)
- [ ] **Error handling complete** — every error path in FEATURE_SPEC_TEMPLATE.md §4 is handled, mapped to the standard error envelope (API_GUIDELINES.md §3), and shown to the user per DESIGN_SYSTEM.md §5's error-state requirement
- [ ] **Monitoring added** — alerting thresholds updated if this changes expected traffic/cost/latency patterns; synthetic monitoring extended if this is a critical journey (OBSERVABILITY.md §5, §7)
- [ ] **QA approved** — TEST_PLAN_TEMPLATE.md §8 signed off by someone independent of the implementer, Testing Gate passed
- [ ] **AI Gate passed (if applicable)** — golden-set, factual-accuracy, safety, and cost regression suites all green (AI_GOVERNANCE.md §3); RAG grounding present for any factual/scoring claim (ADR-008)
- [ ] **Release readiness confirmed** — RELEASE_CHECKLIST.md completed, Deployment Gate passed, rollback plan verified (DEPLOYMENT.md)
- [ ] **Risk register current** — any new risk this work introduces is added to RISK_REGISTER.md, not left untracked
- [ ] **Code review complete** — CODE_REVIEW_CHECKLIST.md applied, approved by a reviewer other than the author

## Foundational/infrastructure epics are not exempt

Epic E1's Independent Production Readiness Review (2026-07-29) found its original design skipped "Logging implemented" and "Metrics implemented" on the reasoning that a skeleton epic with no product logic had nothing to log or measure yet — and that this document's checklist implicitly read as feature-scoped. **It is not.** "Logging implemented" and "Metrics implemented" apply to *any* deployable surface, including a foundation epic's first health-check-only skeleton — arguably *more* so, since DEPLOYMENT.md §5 requires observability "wired in from first deploy," and a foundation epic's first deploy is the literal first deploy. E1's remediation ([epics/E1-remediation-report.md](epics/E1-remediation-report.md)) added a dedicated `packages/observability` and instrumentation tasks specifically to close this gap. Any future epic that is "just infrastructure" or "just a skeleton" does not get a pass on this checklist for that reason alone.

## What "Done" is not

- Not "the code is merged" — merged and Done are different states; a merged PR behind a disabled feature flag pending gate sign-off is not Done.
- Not "it works on my machine" — every gate requires evidence a second party can check, not the author's word.
- Not "we'll document it later" — Documentation Gate is a same-PR requirement, not a follow-up ticket, per CLAUDE.md's standing rule.
- Not partial — a feature with 9 of 10 required states/tests/checks complete is **not Done**; it is **In Review**. This framework has no "mostly done" state, consistent with CLAUDE.md's "no half-finished implementations" principle.

## Enforcement

This checklist is attached to (or referenced from) every EPIC_TEMPLATE.md §6 Epic Approval and every feature's tracking artifact. A gate owner's sign-off in EPIC_TEMPLATE.md §5 is what allows a box here to be checked — this document doesn't grant new authority, it aggregates the authority already defined in IMPLEMENTATION_GUIDE.md §3–4.

## Scaling the checklist to change size

Not every commit re-runs the full ceremony (IMPLEMENTATION_GUIDE.md §2's sizing note applies here too) — a one-line copy fix doesn't need a Technical Design doc. But **every item on this list maps to a real failure mode the Architecture Review Gate or this framework's authors have seen matter**; skipping one is a decision made explicitly by the relevant gate owner, recorded, never a default.
