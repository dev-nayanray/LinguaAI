# LinguaAI — Architecture Baseline Report

Status: **FROZEN — v1.1 Official Baseline** · Approved: 2026-07-29 · Owner: CTO

This is the official architecture baseline for LinguaAI. It supersedes the Draft v1.0 foundation and consolidates every finding from the Architecture Review Gate (`ARCHITECTURE_REVIEW.md`, now archived) into the canonical documentation set. **No implementation work begins until this baseline is read and understood by the team building against it.** Changes after this point are made by adding a new ADR ([DECISIONS.md](DECISIONS.md)) and a [CHANGELOG.md](CHANGELOG.md) entry — never by silently editing history.

---

## 1. Approved architecture summary

LinguaAI is a **Turborepo/pnpm monorepo** housing a **modular monolith core** (`apps/api`, NestJS) plus five **purpose-justified microservices** (`ai-engine`, `speech-service`, `recommendation-engine`, `notification-service`, `analytics-service`), four applications (`web`, `api`, `admin`, `mobile`), and shared packages for UI, types, validation, config, and utilities. Six bounded contexts (Identity, Learning, AI Coaching, Commerce, Community, Enterprise) organize the domain independent of deployment topology (ARCHITECTURE.md §2.1).

Data lives in a single PostgreSQL instance (Aurora in production) with `pgvector` for AI memory and RAG retrieval, Redis for cache/sessions/queues/domain events, and S3 for media. Multi-tenancy is enforced via Postgres Row-Level Security in addition to application-layer scoping (ADR-005, MULTITENANCY.md). Infrastructure is AWS-native (ECS Fargate, Terraform-managed) with a full CI/CD pipeline, ephemeral preview environments, and canary rollout for AI-engine changes specifically.

## 2. Major design decisions

13 ADRs are locked in ([DECISIONS.md](DECISIONS.md)), the most consequential:

- **ADR-002**: Modular monolith + targeted microservices, not microservices-first — avoids premature distributed-systems tax, with enforced internal module boundaries as the safeguard against monolith sprawl.
- **ADR-005**: Postgres RLS for tenant isolation — closes the Architecture Review's top-ranked security/architecture finding (app-layer-only filtering as a cross-tenant leak vector).
- **ADR-007**: Single-Orchestrator agent with tool-calling handoff — resolves the previously-undecided multi-agent coordination protocol; specialist agents (Grammar Coach, etc.) are typed tools, never independent chat participants.
- **ADR-008**: RAG grounding is required for any factual/pedagogical AI claim — resolves the highest-priority AI finding (hallucination risk in Grammar Coach/Exam Coach output).
- **ADR-010**: Domain events over point-to-point queues — prevents hidden N:M coupling as Gamification/Analytics/Notifications all react to the same occurrences.
- **ADR-011 / ADR-012**: Mandatory admin MFA and a platform-level AI cost circuit breaker — close the two most concrete security/financial exposure gaps.
- **ADR-013**: Family plan descoped to Version 2 — a scope decision, not a compressed compliance build, in response to an under-specified COPPA consent flow.

## 3. Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16+, TypeScript, Tailwind CSS, Shadcn UI, React Query, Zustand |
| Backend | NestJS, TypeScript, Prisma ORM, PostgreSQL (+pgvector), Redis, BullMQ |
| Mobile | Flutter (iOS & Android) |
| AI | Provider-agnostic gateway (Anthropic/OpenAI behind one interface), RAG retrieval, STT/TTS, single-Orchestrator agent architecture |
| Infrastructure | AWS (ECS Fargate, Aurora, ElastiCache, S3, CloudFront), Terraform, GitHub Actions |

Full rationale for each choice: ARCHITECTURE.md, DECISIONS.md.

## 4. Product scope (MVP)

Free/Premium subscription tiers; 10 target learning languages with English as the sole launch UI language; all 7 AI teacher agents; core gamification; 1–2 exam programs at launch; web-first with mobile in the same phase. Family plan, Business plan, Community (full), Teacher Marketplace, Enterprise LMS, AI Avatar Teacher, and the public API are explicitly out of MVP scope — see the full MVP/V1.1/V2/Enterprise/Future classification in [ROADMAP.md](ROADMAP.md). 23 epics (E1–E23) sequence MVP delivery.

## 5. AI architecture summary

All model calls route through a single AI gateway (`services/ai-engine`, ADR-006). One Orchestrator agent per session invokes specialist agents as typed tools on defined triggers (ADR-007). Any factual or scoring claim is grounded against a curated, versioned knowledge base via RAG (ADR-008) — never left to parametric model knowledge alone. Cost is bounded by per-user entitlements *and* a platform-level circuit breaker (ADR-012). Full lifecycle governance (evaluation gates, knowledge-base curation, safety policy, fallback chain) is in [AI_GOVERNANCE.md](AI_GOVERNANCE.md); latency budgets are canonically owned by [PERFORMANCE.md](PERFORMANCE.md) §2.

## 6. Security summary

Zero Trust as a governing principle (SECURITY.md §0): no request is trusted by network location or prior auth alone. Tenant isolation is defense-in-depth (app layer + Postgres RLS + required cross-tenant integration tests — MULTITENANCY.md). MFA is mandatory for privileged roles (ADR-011). AI-specific risks (prompt injection, output-side sanitization, abuse/cost-abuse) have explicit controls. Compliance mapping (SECURITY.md §7.1) ties GDPR/CCPA/COPPA/OWASP obligations to concrete controls, not aspirational statements.

## 7. Implementation principles

From [CLAUDE.md](../CLAUDE.md) and [CODING_STANDARDS.md](CODING_STANDARDS.md), unchanged by this consolidation and binding on all future work: no demo-level work, no temporary solutions without a tracked ADR/tech-debt note, documentation updates ship in the same PR as the change they describe, every screen implements all four required states (loading/empty/error/success), strict TypeScript, enforced module/domain boundaries, and security/accessibility are launch requirements, not hardening passes.

## 8. Known risks

20 tracked risks in [RISK_REGISTER.md](RISK_REGISTER.md), reviewed at every phase transition. Highest-attention open items: content-pipeline throughput for the 10-language launch (R-03), speech-provider latency risk requiring a de-risking spike before full commitment (R-04), assessment CEFR-validity requiring human-rater validation (R-05), and `apps/api` module-boundary erosion requiring tooling delivered in Epic E1 (R-10).

## 9. Deferred features

Public developer API (module 27), AI Avatar Teacher (module 17), white-labeling, multi-region active-active infrastructure, Kubernetes migration, and SOC 2 Type II certification are all explicitly deferred with a stated revisit trigger each (not open-ended) — see ARCHITECTURE.md §9, AI_SYSTEM.md §12, DEPLOYMENT.md §9, SECURITY.md §10, ROADMAP.md Phase 3.

## 10. Implementation readiness score

| Dimension | Score (v1.0 Review) | Score (v1.1 Baseline) | Basis for change |
|---|---:|---:|---|
| Overall architecture | 72/100 | **88/100** | Domain-event catalog, bounded-context map, RLS, and BFF pattern are now specified, not gaps |
| Product readiness | 65/100 | **85/100** | Outcome analytics, billing off-ramps, localization/accessibility/offline strategy, and edge cases are now specified |
| Engineering readiness | 75/100 | **90/100** | Coding standards, API guidelines, and event architecture now codified; module-boundary tooling remains a delivery item (E1), not a documentation gap |
| AI readiness | 60/100 | **85/100** | RAG grounding, agent handoff protocol, evaluation framework, and cost circuit breaker are now specified — remaining gap is execution (linguist knowledge-base curation, ADR-008) rather than design |
| UX readiness | 70/100 | **88/100** | Foundational tokens, motion principles, and previously-missing components are now specified |
| Security readiness | 62/100 | **87/100** | RLS, mandatory MFA, output sanitization, and compliance mapping are now specified — penetration testing remains a pre-GA execution item, not a design gap |

Scores reflect **documentation/design completeness**, not delivered code — this baseline describes what will be built, correctly and consistently, not a claim that it has been built. The remaining gap to 100 in each dimension is closed by execution against Epics E1–E23 (ROADMAP.md), not further design work.

---

## Baseline freeze statement

This baseline is internally consistent as of 2026-07-29: product requirements align with architecture, architecture aligns with the database design, the database aligns with API conventions, API conventions align with the design system's error/loading/empty/success contract, the AI architecture aligns with the product's trust and accuracy requirements, security controls align with the stated compliance obligations, and the roadmap's epics align with the phased product scope. No unresolved contradiction between canonical documents is known at freeze time.

**This baseline is approved for implementation to begin, starting with Epic E1 (Foundation & DevOps Bootstrap).**
