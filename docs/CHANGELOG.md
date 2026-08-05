# LinguaAI — Architecture Baseline Changelog

Status: **Living document** · Last updated: 2026-08-01

Dated history of the architecture/documentation baseline itself — not the product's feature changelog (which begins once implementation starts). Every entry corresponds to a documentation milestone, not a code release.

## 2026-08-01 — Epic E2 final acceptance remediation

An independent post-implementation acceptance review ([E2-final-acceptance-review.md](epics/E2-final-acceptance-review.md) — a fresh reviewer with no involvement in E2's implementation, continuing the no-self-certification discipline every prior gate in this Epic used) found E2's implementation genuinely strong but returned **CONDITIONAL ACCEPTANCE**, not a clean pass: one live authorization gap (organization-member removal didn't invalidate the removed member's existing session claims), the mandatory API security test suite (RLS/governance/audit/MFA/OAuth) was never wired into CI despite the approved implementation plan saying it would be, and both mandatory gates remained unsigned while ROADMAP.md/CHANGELOG.md declared the Epic complete.

All three blocking findings are remediated — see [E2-final-acceptance-remediation.md](epics/E2-final-acceptance-remediation.md) for the full account (root cause, fix, tests added, CI verification, evidence). The remediation's own recommendation is **READY FOR TARGETED FINAL RE-VERIFICATION** — this Epic is not self-declared closed; the gate sign-off log in [E2-identity-access-platform.md](epics/E2-identity-access-platform.md) reflects Architecture as the only independently-passed gate, with Security/Database/API/Testing/Documentation/Performance/Deployment awaiting an independent reviewer.

**Updated:** `apps/api/src/modules/organizations/organizations.service.ts` (`tokensValidAfter` bump on member removal, concurrency-safe idempotent delete), its unit/e2e tests, `docs/epics/E2-identity-access-platform.md` (status header, Architecture Gate checklist, gate sign-off log — all now consistent with `ROADMAP.md`/this changelog rather than contradicting them), `ROADMAP.md`.

**Added:** `.github/workflows/api-security-e2e.yml` — the API security test suite (13 e2e suites, 185 tests: cross-tenant RLS, governance concurrency/authorization, audit immutability, MFA/OAuth security, rate limiting, privileged-column protection) now runs against real Postgres/Redis on every PR, not only when a human runs it locally. `docs/epics/E2-final-acceptance-review.md`, `docs/epics/E2-lessons-learned.md`, `docs/epics/E2-final-acceptance-remediation.md`.

## 2026-08-01 — Epic E2 (Identity & Access Platform) documentation closure

Epic E2 implementation (T1–T29) complete — full auth/RBAC/multi-tenancy/MFA/OAuth/role-governance/audit platform built and tested against live Postgres/Redis, zero open P0/P1 findings ([epics/E2-security-review.md](epics/E2-security-review.md)). Per BASELINE.md's own rule ("changes after this point are made by adding a new ADR and a CHANGELOG.md entry, never by silently editing history") — BASELINE.md itself is not edited; this entry and the six new ADRs are the record.

**Updated:** `DATABASE.md` §2.1 (marked implemented; added `PasswordResetToken`/`MfaChallengeToken`/`RoleChangeRequest`/`AuditLog`/`EntitlementChangeLog`, corrected `OAuthAccount` provider list), `EVENT_ARCHITECTURE.md` (10 new catalog rows), `API_GUIDELINES.md` (new §12, access-token/session-revocation implementation detail), `SECURITY.md` §2 (OAuth provider list corrected to match ADR-020; session-revocation immediacy noted), `RISK_REGISTER.md` (R-06/R-09 marked implemented-and-verified; 13 new risk rows R-33–R-45 carried forward from the design's Part 18 risk table and the T28 security review), `ROADMAP.md` (E2 status marker).

**Added:** ADR-018–023 to `DECISIONS.md` — JWT/refresh-token strategy and `jti` denylist, mandatory TOTP MFA mechanism, Google+Apple-only OAuth provider set, two-person `ADMIN`-approval governance, narrow `BYPASSRLS` service role, and privileged-column protection via column-`REVOKE`/`SECURITY DEFINER` functions.

## 2026-07-29 — v1.1 — Architecture Consolidation

Architecture Review Gate findings (`ARCHITECTURE_REVIEW.md`, v1.0-review) merged into canonical documentation. `ARCHITECTURE_REVIEW.md` is now archived/superseded — see [docs/BASELINE.md](BASELINE.md) for the current authoritative summary.

**Updated:** `PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `AI_SYSTEM.md`, `DESIGN_SYSTEM.md`, `SECURITY.md`, `DEPLOYMENT.md`, `ROADMAP.md`, `TESTING.md`.

**Added:** `DECISIONS.md` (13 initial ADRs), `CODING_STANDARDS.md`, `API_GUIDELINES.md`, `EVENT_ARCHITECTURE.md`, `MULTITENANCY.md`, `AI_GOVERNANCE.md`, `OBSERVABILITY.md`, `PERFORMANCE.md`, `RISK_REGISTER.md`, `CHANGELOG.md` (this file), `BASELINE.md`.

**Key decisions locked in this pass:** Postgres RLS for tenant isolation (ADR-005), single-Orchestrator agent handoff protocol (ADR-007), mandatory RAG grounding for factual AI output (ADR-008), domain-event catalog over point-to-point queues (ADR-010), mandatory admin MFA (ADR-011), platform-level AI cost circuit breaker (ADR-012), Family plan descoped to Version 2 (ADR-013). Full rationale in `DECISIONS.md`.

## 2026-07-29 — v1.0-review — Architecture Review Gate

Full 10-part cross-functional review performed against the Draft v1.0 foundation (`ARCHITECTURE_REVIEW.md`). Identified 8 critical blockers, scored readiness across 6 dimensions (Architecture 72, Product 65, Engineering 75, AI 60, UX 70, Security 62 — out of 100), produced a 23-epic implementation roadmap and an MVP/V1.1/V2/Enterprise/Future feature classification. No findings were applied to source docs at this stage by design — the review was a gate, not a rewrite.

## 2026-07-29 — v1.0 — Initial foundation

Repository structure, root files (`CLAUDE.md`, `README.md`, `package.json`, `docker-compose.yml`, `.env.example`), and the initial 11 canonical documents created: `PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `AI_SYSTEM.md`, `DESIGN_SYSTEM.md`, `SECURITY.md`, `DEPLOYMENT.md`, `ROADMAP.md`, `TESTING.md`, `CONTRIBUTING.md`. No application code written at this stage.

---

## How to add an entry

A new entry is added whenever a documentation change is significant enough to affect the architecture baseline (a new ADR, a scope change, a new doc). Routine doc typo fixes or clarifications do not need an entry. Newest entry at the top; entries are never edited retroactively — a correction gets its own new entry.
