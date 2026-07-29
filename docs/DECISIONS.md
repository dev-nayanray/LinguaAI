# LinguaAI — Architecture Decision Records

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-07-29

This is the durable log of significant architecture decisions and their rationale. When a decision changes, add a new ADR that supersedes the old one — never silently edit history. Each ADR references the review finding or requirement that motivated it where applicable.

Format: Context → Decision → Consequences → Status.

---

### ADR-001 — Turborepo + pnpm workspaces monorepo
**Context:** LinguaAI spans 4 apps, 6 packages, and 5 services with heavy shared-type/contract needs (PRD.md's 30 modules).
**Decision:** Single monorepo, Turborepo for task orchestration/caching, pnpm workspaces for dependency management.
**Consequences:** Fast iteration and guaranteed contract consistency across frontend/backend; requires CI caching discipline to keep build times acceptable as the repo grows.
**Status:** Accepted.

### ADR-002 — Modular monolith core + targeted microservices at the edges
**Context:** 20+ MVP modules could be built as either a single monolith or full microservices from day one.
**Decision:** Core domain (identity, courses, progress, gamification, subscriptions) lives in one NestJS API (`apps/api`); only `ai-engine`, `speech-service`, `recommendation-engine`, `notification-service`, `analytics-service` are separate, justified by independent scaling, runtime isolation, or blast-radius isolation (ARCHITECTURE.md §4).
**Consequences:** Avoids premature distributed-systems tax; requires enforced internal module boundaries (dependency-graph lint) inside `apps/api` to prevent it from becoming an unmanageable monolith as modules accumulate — this enforcement is a required deliverable of Epic E1, not optional tooling.
**Status:** Accepted.

### ADR-003 — REST over GraphQL for the primary API
**Context:** Needed one contract style across web, mobile, and admin.
**Decision:** REST + JSON, shared types (`packages/types`) and Zod schemas (`packages/validation`) as the real contract enforcement mechanism; WebSocket only for real-time flows (API_GUIDELINES.md).
**Consequences:** Simpler operational model than GraphQL federation; dashboard aggregation needs are met with a thin BFF layer (ARCHITECTURE.md §6) rather than a query language.
**Status:** Accepted.

### ADR-004 — pgvector on primary Postgres for AI memory/vector search (MVP)
**Context:** AI memory retrieval (AI_SYSTEM.md) needs vector similarity search.
**Decision:** Use `pgvector` on the same Aurora Postgres instance rather than a separate managed vector DB at MVP.
**Consequences:** Avoids operating a second stateful system before scale demands it; keeps memory retrieval transactionally close to relational data. Revisit trigger: sustained p95 vector query latency degradation or index size exceeding defined thresholds, reviewed quarterly (AI_SYSTEM.md §11).
**Status:** Accepted.

### ADR-005 — Postgres Row-Level Security as the tenant-isolation enforcement mechanism
**Context:** Architecture Review Gate (2026-07-29) identified app-layer-only tenant filtering (`organizationId` scoping in application queries) as a critical cross-tenant data-leak risk — a single missed `WHERE` clause leaks Enterprise data across tenants.
**Decision:** Postgres RLS policies enforce tenant scoping at the database layer, keyed on a session variable (`app.current_org_id`) set by Prisma middleware per request, in addition to (not instead of) application-layer scoping. Full design in MULTITENANCY.md.
**Consequences:** Defense-in-depth against the exact class of bug that caused this finding; adds RLS policy maintenance overhead per new tenant-scoped table, enforced via a schema-review checklist (DATABASE.md).
**Status:** Accepted. **Resolves Architecture Review blocker #2.**

### ADR-006 — AI Gateway pattern: all model calls route through `services/ai-engine`
**Context:** Provider swaps, cost control, and safety filtering need one enforcement point (AI_SYSTEM.md §1).
**Decision:** No application code calls an LLM/STT/TTS provider SDK directly; all traffic goes through the `ai-engine`'s `ModelProvider` interface.
**Consequences:** Provider changes and safety-policy changes are configuration, not code, changes across the whole platform.
**Status:** Accepted.

### ADR-007 — Single Orchestrator agent with tool-calling handoff for multi-agent coordination
**Context:** Architecture Review Gate identified an undecided multi-agent handoff protocol as a blocker — e.g., does the Conversation Partner silently note a grammar error, hand off entirely, or ignore it?
**Decision:** One Orchestrator agent owns session state and the user-facing voice for a given session. Specialist agents (Grammar Coach, Pronunciation Coach, etc.) are invoked as **typed tools** by the Orchestrator when a defined trigger condition is met (e.g., a recurring error pattern crosses a confidence threshold), returning a structured critique object that the Orchestrator weaves into its own response — never as independent chat participants with their own turn in the conversation.
**Consequences:** Preserves one consistent voice and full memory continuity per session; bounds cost (specialist calls happen only on trigger, not by default every turn); produces a testable, structural contract (specialist tool output is schema-validated, not freeform) per TESTING.md §3. Full detail in AI_GOVERNANCE.md.
**Status:** Accepted. **Resolves Architecture Review blocker #3.**

### ADR-008 — RAG grounding is required for factual/pedagogical agent output
**Context:** Architecture Review Gate identified that Grammar Coach and Exam Coach relying on parametric LLM knowledge for grammar rules and exam rubrics is a hallucination risk that directly threatens the product's core trust claim.
**Decision:** A curated, versioned knowledge base (CEFR descriptors, grammar reference content, official exam rubrics) is retrieved and injected as grounding context for any agent response that makes a factual or scoring claim. This is architecturally distinct from the personalization memory store (AI_SYSTEM.md §4) — same retrieval infrastructure (pgvector), different collection and governance (AI_GOVERNANCE.md).
**Consequences:** Adds a knowledge-base curation and versioning workload (owned by a named linguist/pedagogy review function, AI_GOVERNANCE.md), but is treated as a blocking dependency for Grammar Coach and Exam Coach shipping (ROADMAP.md Epic E13/E19) rather than an optional enhancement.
**Status:** Accepted. **Resolves Architecture Review blocker #1.**

### ADR-009 — ECS Fargate over Kubernetes/EKS for MVP compute
**Context:** Needed container orchestration without the operational overhead of running EKS control-plane/node lifecycle with a small platform team.
**Decision:** AWS ECS Fargate for all `apps/*` and `services/*` compute.
**Consequences:** Faster path to a working, autoscaled, rolling-deploy platform; revisited only if a specific workload (e.g., self-hosted GPU inference) requires Kubernetes-specific capability (DEPLOYMENT.md §9).
**Status:** Accepted.

### ADR-010 — Domain events over point-to-point queue calls for cross-module reactions
**Context:** Architecture Review Gate identified that Gamification, Analytics, and Notifications all reacting to the same underlying occurrences (lesson completed, session ended, subscription changed) via direct point-to-point BullMQ enqueue calls creates N:M hidden coupling as consumers multiply.
**Decision:** Introduce a documented domain-event catalog (EVENT_ARCHITECTURE.md) over the same Redis/BullMQ transport — producers publish named, versioned events; consumers subscribe without the producer knowing who's listening.
**Consequences:** Adds a light event-schema-governance process but decouples module evolution — a new consumer (e.g., a future feature reacting to `LessonCompleted`) requires zero changes to the producer.
**Status:** Accepted. **Resolves Architecture Review Part 2 finding #4.**

### ADR-011 — Mandatory MFA for `ADMIN` and `ENTERPRISE_ADMIN` roles
**Context:** Architecture Review Gate identified that MFA was "ready" but not required anywhere, leaving the highest-value account-takeover targets under-protected.
**Decision:** MFA enrollment is required (not optional) before an `ADMIN` or `ENTERPRISE_ADMIN` account can be activated.
**Consequences:** Adds friction to admin onboarding, accepted as proportionate to the privilege level; standard/`TEACHER` accounts retain optional MFA at MVP.
**Status:** Accepted. **Resolves Architecture Review blocker #5.**

### ADR-012 — Platform-level AI cost circuit breaker
**Context:** Per-user entitlement caps limit individual abuse, but nothing previously capped aggregate/runaway platform cost from a provider pricing change or systemic bug — a real financial exposure.
**Decision:** `ai-engine` enforces an aggregate, platform-wide spend-rate cap (per-minute/per-hour) independent of per-user entitlements; breach triggers automatic degrade-to-cheaper-model first, then a hard stop with a graceful user-facing message, plus paging alert (AI_GOVERNANCE.md, OBSERVABILITY.md).
**Consequences:** A rare false-positive circuit trip could degrade service during a legitimate traffic spike — accepted as the safer failure mode versus unbounded cost exposure; thresholds are tuned from real staging/production traffic data, not fixed permanently at initial values.
**Status:** Accepted. **Resolves Architecture Review blocker #4.**

### ADR-013 — Family plan (and its COPPA scope) is descoped from MVP launch
**Context:** Architecture Review Gate identified that a COPPA-compliant parental-consent flow was named as a requirement but not specified in implementable detail, and treated it as launch-blocking for the Family plan specifically.
**Decision:** Rather than under-building a compliance-critical minors' data flow under launch-date pressure, Family plan (module 22) ships in Version 2 (ROADMAP.md), after a fully specified and tested parental-consent flow exists.
**Consequences:** Removes a launch blocker by scope reduction rather than compressed delivery; Premium/Family pricing messaging in PRD.md §7 reflects Free/Premium only at MVP.
**Status:** Accepted. **Resolves Architecture Review blocker #8.**

---

## ADR index

| ID | Title | Status |
|---|---|---|
| ADR-001 | Turborepo + pnpm monorepo | Accepted |
| ADR-002 | Modular monolith + targeted microservices | Accepted |
| ADR-003 | REST over GraphQL | Accepted |
| ADR-004 | pgvector for MVP vector search | Accepted |
| ADR-005 | Postgres RLS for tenant isolation | Accepted |
| ADR-006 | AI Gateway pattern | Accepted |
| ADR-007 | Single Orchestrator + tool-calling agent handoff | Accepted |
| ADR-008 | RAG grounding required for factual AI output | Accepted |
| ADR-009 | ECS Fargate over Kubernetes | Accepted |
| ADR-010 | Domain events over point-to-point queues | Accepted |
| ADR-011 | Mandatory MFA for privileged roles | Accepted |
| ADR-012 | Platform-level AI cost circuit breaker | Accepted |
| ADR-013 | Family plan descoped from MVP | Accepted |

New ADRs are appended, never renumbered or rewritten in place.
