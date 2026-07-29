# LinguaAI — Architecture Baseline Changelog

Status: **Living document** · Last updated: 2026-07-29

Dated history of the architecture/documentation baseline itself — not the product's feature changelog (which begins once implementation starts). Every entry corresponds to a documentation milestone, not a code release.

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
