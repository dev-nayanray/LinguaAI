# LinguaAI — Engineering Execution Framework

Status: **v1.0 — Mandatory process** · Owner: CTO · Last updated: 2026-07-29

This is the master process document for turning an approved architecture ([BASELINE.md](BASELINE.md)) into shipped software. It governs every Epic (E1–E23, [ROADMAP.md](ROADMAP.md)) and every feature within them. **No Epic may skip a lifecycle phase or bypass a quality gate.** This framework is itself part of the architecture baseline — changing it requires the same rigor as changing an ADR ([DECISIONS.md](DECISIONS.md)).

This document defines _process_. It does not restate technical standards already owned elsewhere — it points to them. If you're looking for _what_ good code/API/schema/security looks like, see [CODING_STANDARDS.md](CODING_STANDARDS.md), [API_GUIDELINES.md](API_GUIDELINES.md), [DATABASE.md](DATABASE.md), [SECURITY.md](SECURITY.md). This document is _how an Epic moves from idea to production_.

## 1. Why a framework, not ad hoc delivery

The Architecture Review Gate found that good design intent (RLS, RAG grounding, MFA, cost circuit breakers) is worthless if it doesn't survive contact with sprint pressure — several of its 8 blockers were things that were _named_ as requirements but never had an enforcement mechanism. This framework is that enforcement mechanism: a fixed sequence of phases, each producing a concrete artifact (a filled-in template), each gated by a named owner who can block progress. No phase is "understood to have happened" — it either produced its artifact and passed its gate, or the Epic is not done.

## 2. The 20-phase Epic lifecycle

Every Epic — and every non-trivial feature within an Epic — moves through these phases in order. Phases 11–16 (Implementation → Documentation Update) may iterate together within a single feature's build, but none may be skipped, and phases 1–10 must be complete (design gates passed) before phase 11 (Implementation) starts in earnest.

| #   | Phase                       | Produces                                                                  | Template/Reference                                                              |
| --- | --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Epic Definition             | The Epic's scope, boundaries, out-of-scope statement                      | [EPIC_TEMPLATE.md](EPIC_TEMPLATE.md) §1                                         |
| 2   | Business Objective          | Why this Epic, tied to a PRD.md goal or business metric                   | EPIC_TEMPLATE.md §2                                                             |
| 3   | Functional Requirements     | User-facing behavior, acceptance criteria per feature                     | [FEATURE_SPEC_TEMPLATE.md](FEATURE_SPEC_TEMPLATE.md)                            |
| 4   | Non-Functional Requirements | Performance, scale, security, accessibility targets for this Epic         | FEATURE_SPEC_TEMPLATE.md §5, cross-referencing [PERFORMANCE.md](PERFORMANCE.md) |
| 5   | UX Review                   | States, tokens, components, accessibility plan                            | [UI_UX_REVIEW_TEMPLATE.md](UI_UX_REVIEW_TEMPLATE.md) → **Frontend Gate**        |
| 6   | Technical Design            | Component design, data flow, sequencing, dependencies                     | [TECHNICAL_DESIGN_TEMPLATE.md](TECHNICAL_DESIGN_TEMPLATE.md)                    |
| 7   | Architecture Validation     | Confirmation the design doesn't violate ARCHITECTURE.md/DECISIONS.md      | **Architecture Gate**                                                           |
| 8   | Database Design             | Schema changes, migration plan, RLS policy                                | [DATABASE_CHANGE_TEMPLATE.md](DATABASE_CHANGE_TEMPLATE.md) → **Database Gate**  |
| 9   | API Contract                | Endpoint/WS contract per API_GUIDELINES.md                                | [API_SPEC_TEMPLATE.md](API_SPEC_TEMPLATE.md) → **API Gate**                     |
| 10  | Security Review             | Threat delta, data classification, compliance impact                      | [SECURITY_REVIEW_TEMPLATE.md](SECURITY_REVIEW_TEMPLATE.md) → **Security Gate**  |
| 11  | Implementation              | Working code following CODING_STANDARDS.md                                | —                                                                               |
| 12  | Unit Tests                  | Coverage per TESTING.md §1–2                                              | [TEST_PLAN_TEMPLATE.md](TEST_PLAN_TEMPLATE.md)                                  |
| 13  | Integration Tests           | Coverage per TESTING.md §1, cross-tenant tests per MULTITENANCY.md §6     | TEST_PLAN_TEMPLATE.md → **Testing Gate**                                        |
| 14  | Performance Validation      | Measured against PERFORMANCE.md budgets                                   | **Performance Gate**                                                            |
| 15  | Accessibility Validation    | WCAG AA verified, not assumed                                             | **Accessibility Gate**                                                          |
| 16  | Documentation Update        | Canonical docs/ updated in the same PR                                    | **Documentation Gate**                                                          |
| 17  | Code Review                 | Reviewer sign-off                                                         | [CODE_REVIEW_CHECKLIST.md](CODE_REVIEW_CHECKLIST.md)                            |
| 18  | QA Sign-off                 | Independent verification, not author self-certification                   | **Testing Gate** (final)                                                        |
| 19  | Release Readiness           | Deploy plan, rollback plan, monitoring in place                           | [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) → **Deployment Gate**              |
| 20  | Epic Approval               | All gates green, [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md) satisfied | CTO or delegated gate-owner sign-off                                            |

A feature within an Epic can be small enough that several templates collapse into a short paragraph each (a one-line API contract for a trivial endpoint doesn't need a five-page API_SPEC_TEMPLATE.md fill-out) — but the phase is never _skipped_, only _sized to the change_. Judgment on sizing belongs to the Epic's tech lead, not to expedience.

## 3. Engineering Quality Gates

A gate is a **named owner explicitly approving that a specific concern has been satisfied**, evidenced by an artifact (a filled template, a test report, a scan result) — not a verbal "looks fine to me." An Epic cannot advance past a gate it hasn't passed, and cannot ship if any gate is failing.

| Gate                          | Checks                                                                                                                                                           | Owner                                             | Evidence                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| **Architecture Gate**         | Design respects bounded contexts (ARCHITECTURE.md §2.1), doesn't contradict an ADR, service-boundary rules honored                                               | Principal Solution Architect                      | Completed TECHNICAL_DESIGN_TEMPLATE.md, reviewed         |
| **Security Gate**             | AuthN/Z correct, tenant isolation (RLS) present if tenant-scoped data is touched, no new unmitigated OWASP/AI-specific risk                                      | Security Architect                                | Completed SECURITY_REVIEW_TEMPLATE.md                    |
| **Database Gate**             | Schema change reviewed, migration is safe/reversible, RLS policy shipped with any tenant-scoped table, retention/soft-delete classification assigned             | Database Architect                                | Completed DATABASE_CHANGE_TEMPLATE.md, migration diff    |
| **API Gate**                  | Contract follows API_GUIDELINES.md, versioning/error-code registry respected, OpenAPI spec generated correctly                                                   | Principal Backend Engineer                        | Completed API_SPEC_TEMPLATE.md, generated OpenAPI diff   |
| **Frontend Gate**             | Design tokens/components from `packages/ui` used, all four states implemented, mobile-first                                                                      | Principal Frontend Engineer / UX Director         | Completed UI_UX_REVIEW_TEMPLATE.md                       |
| **AI Gate** _(if applicable)_ | Golden-set + factual-accuracy + safety + cost regression suites pass (AI_GOVERNANCE.md §3), RAG grounding present for factual claims, handoff protocol respected | AI Platform Architect                             | Evaluation suite results attached to PR                  |
| **Performance Gate**          | Meets the relevant budget(s) in PERFORMANCE.md                                                                                                                   | Principal Architect / DevOps Lead                 | Load/latency test results                                |
| **Accessibility Gate**        | WCAG 2.1 AA verified (keyboard nav, contrast, screen-reader, reduced-motion) — tested, not assumed                                                               | UX Director                                       | Completed UI_UX_REVIEW_TEMPLATE.md accessibility section |
| **Testing Gate**              | Unit/integration coverage per TESTING.md, QA sign-off independent of the author                                                                                  | QA Lead                                           | Completed TEST_PLAN_TEMPLATE.md, CI test report          |
| **Documentation Gate**        | Every canonical doc affected by this change is updated in the same PR (CLAUDE.md, CONTRIBUTING.md)                                                               | Any reviewer, spot-checked by Principal Architect | Diff includes docs/ changes                              |
| **Deployment Gate**           | Rollback plan exists, monitoring/alerting wired (OBSERVABILITY.md), feature-flagged if risky, canary applies if `ai-engine`                                      | DevOps Lead                                       | Completed RELEASE_CHECKLIST.md                           |

**AI Gate applies whenever the Epic/feature touches `services/ai-engine`, prompts, agent definitions, or model routing — otherwise it is marked not-applicable, explicitly, not silently omitted.**

## 4. Roles and gate ownership

Gate ownership is a named function, not a rotating volunteer — consistent with the founding-team roles established at the start of this project (BASELINE.md). A gate owner may delegate day-to-day review but remains accountable for the gate's integrity. A gate owner who is also the feature's implementer must have a second, independent reviewer for that specific gate (no self-approval on Security, Database, or Architecture gates under any circumstance).

## 5. How this framework applies to ROADMAP.md's epics

Each of E1–E23 (and the Growth/Enterprise-phase epics E24–E29) is planned using [EPIC_TEMPLATE.md](EPIC_TEMPLATE.md) before its first feature enters Implementation (phase 11). An Epic's constituent features each get their own FEATURE_SPEC_TEMPLATE.md; large or architecturally significant features additionally get their own TECHNICAL_DESIGN_TEMPLATE.md, API_SPEC_TEMPLATE.md, and DATABASE_CHANGE_TEMPLATE.md as relevant. Small features may share a single Epic-level technical design if the Architecture Gate owner agrees the split isn't warranted.

## 6. Escalation and exceptions

There is no standing mechanism to skip a gate. If a gate owner and an Epic's tech lead disagree about whether a gate is satisfied, the disagreement escalates to the CTO — it is never resolved by proceeding anyway. A gate can be explicitly waived only by its owner, in writing, with the reason recorded in the Epic's tracking artifact and in [RISK_REGISTER.md](RISK_REGISTER.md) if the waiver introduces a tracked risk — a silent skip is a process violation, not a judgment call.

## 7. Relationship to existing documents

This framework does not duplicate what [CONTRIBUTING.md](CONTRIBUTING.md) already states about branching, commits, and PR hygiene — it operates one layer up, at the Epic/feature-delivery level, and CONTRIBUTING.md's PR-level checklist is a subset of what CODE_REVIEW_CHECKLIST.md and DEFINITION_OF_DONE.md require. Where the two overlap, this framework is authoritative for Epic-level delivery; CONTRIBUTING.md remains authoritative for individual commit/PR mechanics.
