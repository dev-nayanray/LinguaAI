# Epic E17 — Analytics Platform & Instrumentation

**Epic ID:** E17 (ROADMAP.md)
**Status:** Design phase — first single-pass design, not yet implemented.
**Tech lead:** Backend Platform (TBD)
**Gate owners assigned:** Architecture, Database, API, Security, Testing, Documentation (Frontend/Accessibility gates apply to a later UI-focused epic that builds the actual admin analytics dashboard screens, not this backend-engine epic — see §3.6)

## 0. Why this document exists now, and what it is not

E16 (Notification System) is implementation-complete (T1–T3, 2026-08-14 — its own §9 task table's full sequence, confirmed no further task remains). Per ROADMAP.md, E17 is the next epic — both its dependencies (E4 Database Schema, E6 Assessment) are already implementation-complete. This is the **first, single-pass design** for the Analytics Platform (PRD.md module 23) — the same process E4–E16 each went through (CLAUDE.md's own workflow rule). This document does not write any application code; it designs the module, surfaces real gaps found while doing so (§3), and proposes the ADR implementation will need (§7).

Like every prior "own dedicated service" epic, `services/analytics-service` is **entirely greenfield application logic** — confirmed by direct inspection: it's a health-check-only skeleton (`app.module.ts` wires only `ObservabilityModule`; `package.json` has no `@linguaai/database`/`@linguaai/events`/`@linguaai/config`/`@linguaai/validation` dependency at all), the exact same stage `notification-service` was at before E16. `LearningEvent`/`AIUsageLog` have been real, migration-ready schema since E4 T10 (`analytics.prisma`).

Unlike E16, this epic does **not** need to fix RISK_REGISTER R-89 itself — E16 T1 (ADR-054) already built the real per-consumer queue fan-out `analytics-service` needs to become the platform's **third** real consumer safely. `analytics-service` is not yet in `packages/events`'s own `DOMAIN_EVENT_CONSUMERS` registry — adding it by name is this epic's own small, first step (§6.1), not a redesign. This epic's own implementation branch stacks on E16 T3's tip (the last completed E16 task) to inherit that fix, per this project's own established branch-stacking convention.

## 1. Epic Definition

PRD.md names one module this epic covers (module 23), plus the analytics-pipeline half of a second (module 30):

| #   | Module                     | Description                                                                                                                                              | Differentiator                    |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 23  | Analytics Platform         | User, learning, AI usage, revenue, retention, CEFR-progression outcome measurement (PRD.md §5.1)                                                         | Internal-only at MVP (PRD.md §23) |
| 30  | Internal Platform Services | Logging, monitoring, jobs, queues, analytics pipeline (analytics-pipeline half only — the rest of module 30 already shipped incrementally across E1–E16) | See ARCHITECTURE.md               |

PRD.md §5.1 treats CEFR-progression measurement as a **required deliverable, not an optional reporting nicety**: "because 'CEFR-level progression rate' is a named success metric (§8), the product instruments re-assessment score deltas over time per user/cohort from MVP." PRD.md §7 names the platform's own core business metrics as sourced from this epic: activation rate, D1/D7/D30 retention, Free→Premium conversion, AI cost per active user, CEFR-progression rate.

**In scope:**

- **Registering `analytics-service` in `packages/events`'s `DOMAIN_EVENT_CONSUMERS` registry** (§6.1) — a one-line, reviewable addition E16 T1's own design already reserved this slot for; no fan-out redesign needed.
- `services/analytics-service`'s own real domain module: a generic event-ingestion consumer (a `Worker` on this service's own fan-out queue, mirroring `recommendation-engine`'s/`notification-service`'s own `DomainEventsModule` structural template) that persists **every** event on the catalog into `LearningEvent` — DATABASE.md's own description of that table is "the persisted form of the domain events cataloged in EVENT_ARCHITECTURE.md," not a hand-picked subset, so a generic sink is the correct, complete scope here, unlike Gamification's (E14) or Notification's (E16) own deliberately-narrow per-event-type business logic.
- Real, best-effort event-level idempotency in this new consumer (§3.1) — a found gap in `EVENT_ARCHITECTURE.md` §4's own claim that "every consumer stores processed eventIds and no-ops on duplicate delivery," which no existing consumer (`recommendation-engine`, `notification-service`) actually implements.
- A real admin-only reporting API in `apps/api` (§5) surfacing the PRD §7/§8 metrics: CEFR-progression rate (over the already-real `ProficiencyLevelHistory`, E6), AI cost per active user (over the already-real `AIUsageLog`, E5 T9), and core business metrics — activation, D1/D7/D30 retention, Free→Premium conversion (over `LearningEvent`, now real via this epic, plus `User`/`Subscription`).
- Real, deliberate, flagged scoping decisions for reporting-query placement (§3.3) and idempotency (§3.1) — not silently glossed over.

**Explicitly out of scope** (cited against ROADMAP.md/PRD.md's own classification, not silently absorbed):

- **The actual admin analytics-dashboard UI screens** — matching E4–E16's own precedent, this epic builds the real API a future UI consumes, not the screen itself (§3.6). E18 (Admin Platform) is the more likely home for that UI, but is itself not yet designed.
- **A real Postgres read replica for analytics reporting queries** — ARCHITECTURE.md §2's own justification for `analytics-service` as an independent service names "isolating it protects the core DB from analytics query load," which a true production realization would satisfy with a read replica or a separately-provisioned analytics store. No such infrastructure exists anywhere in this platform today (confirmed, full-repo search), and provisioning one is genuinely separate infrastructure work, out of this epic's own scope. §3.3 names the real, honest MVP compromise this epic makes instead, and RISK_REGISTER tracks the gap.
- **Retrofitting real eventId-based idempotency into `recommendation-engine`'s `DomainEventDispatcher`/`notification-service`'s `NotificationDispatcher`** — a real, found gap (§3.1) affecting two already-shipped epics, not silently fixed as a side effect of this one; flagged as a separate, tracked follow-up.
- **A CSV/data export or third-party BI-tool integration** — no PRD/ROADMAP requirement names one; not modeled.
- **Live/real-time streaming dashboards** (WebSocket push of metrics) — PRD.md module 23 names no such requirement; this epic's reporting endpoints are ordinary request/response HTTP, matching every other internal reporting precedent in this codebase (e.g. `GET /v1/admin/dashboard-summary`, API_GUIDELINES.md §7).
- **`gamification.*`/`community.*`/`speech.session.ended`-specific bespoke analytics rollups** (e.g. a leaderboard-adjacent metric) — every catalog event lands in the generic `LearningEvent` sink regardless (so the raw data exists), but building a dedicated _reporting query_ over each one individually is real, separately-scheduled follow-up work once a real product need names it, the same "prove the mechanism on the smallest real slice first" precedent E14/E16 both already established.

## 2. Business Objective

Without this epic, LinguaAI cannot answer its own two most important standing questions with real data: **"is the product actually working"** (CEFR-progression rate, PRD.md's own named proof-of-value metric) and **"is the business viable"** (AI cost per active user vs. Premium conversion, PRD.md §7's own margin-critical pairing, already named in ROADMAP.md's Phase 1 exit criteria). Every domain event this platform already produces (24 real, cataloged event types after E16, ~15 with a real producer today) is currently either consumed by exactly one narrow, business-logic-specific consumer (`recommendation-engine`, `notification-service`) or not durably persisted anywhere at all once processed. `LearningEvent` — the table DATABASE.md itself already designed to be this platform's own append-only historical record of "everything that happened" — has zero real rows in it today (confirmed, full-repo search: no real producer exists). This epic is what makes that table, and the metrics PRD.md §7/§8 already commit the business to reporting on, real.

## 3. Real gaps found while designing this epic, and the decisions made about each

### 3.1 `EVENT_ARCHITECTURE.md` §4's idempotency claim is not implemented anywhere — this epic's own consumer builds it for real, does not retrofit others

`EVENT_ARCHITECTURE.md` §4 states: "every consumer stores processed `eventId`s ... and no-ops on a duplicate delivery. At-least-once delivery is the assumed guarantee." Confirmed via direct inspection: **neither `recommendation-engine`'s `DomainEventDispatcher` nor `notification-service`'s `NotificationDispatcher` implements any such check** — both process every delivered job unconditionally. This was a real, tolerable gap for both: `recommendation-engine`'s own domain writes (`LearningPlan` upsert, keyed by a stable `generatedFromAttemptId`) are naturally idempotent regardless; `notification-service`'s own worst case for a duplicate delivery is a duplicate email, a real but low-severity risk not yet worth the added complexity for a 2-event MVP slice.

`analytics-service`'s own new consumer is different: `LearningEvent` is an **append-only historical log**, and a duplicate-processed job would double-count that event in every downstream report this epic itself builds (CEFR-progression rate, retention, AI cost/user) — the exact metrics this epic exists to make trustworthy. Real idempotency is therefore in scope for this consumer specifically, not deferred. `LearningEvent.eventId` is deliberately **not** a unique constraint (DATABASE.md §2.10's own documented reason: "a partitioned table's unique constraints must include the partition column ... no constraint on `eventId` alone can span partitions"), so this epic's consumer does a real, best-effort existence check (`findFirst({ where: { eventId } })`) before inserting — closes the common case (BullMQ's own retry-on-transient-failure redelivery, the actual at-least-once scenario this platform's infrastructure produces) without claiming a cross-partition uniqueness guarantee the schema itself cannot provide. A real, narrow race window remains (two redeliveries processed concurrently, both passing the existence check before either inserts) — flagged honestly in §11, not hidden.

Retrofitting real idempotency into the two already-shipped consumers is real, separately-scheduled follow-up work (§11), not silently done as a side effect of this epic.

### 3.2 `LearningEvent` ingestion is generic, not per-event-type — a deliberate scope difference from E14/E16's own narrower precedent

E14 (Gamification) wired 2 of 5 real completion signals; E16 (Notification) wired 2 of ~11 catalog-named events. Both deliberately scoped down because each event needed bespoke, hand-written business logic per type (XP/streak rules; preference-checked email templates). `LearningEvent` ingestion needs no such per-type logic — DATABASE.md's own description of the table ("the persisted form of the domain events cataloged in EVENT_ARCHITECTURE.md") is already generic, and the consumer's own job is uniform regardless of `type`: validate the envelope shape (not the event-specific `payload` — that stays opaque `Json`, matching the table's own schema), check-and-insert. Scoping this down to "only 2 of 24 event types" would be an artificial, unmotivated restriction with no corresponding reduction in real engineering effort — the per-event-type wiring cost that justified E14/E16's own narrower MVP slice does not apply here. This epic's own consumer therefore ingests every real, cataloged event type from day one.

### 3.3 Reporting queries run directly against the primary Postgres instance — a real, named compromise against ARCHITECTURE.md §2's own read-isolation justification

ARCHITECTURE.md §2's own service-boundaries table justifies `analytics-service` as an independent service partly because "isolating it protects the core DB from analytics query load" — the clearest real-world realization of that intent is a dedicated read replica (or a separately-provisioned analytics store) that reporting queries hit instead of the primary. **No such infrastructure exists anywhere in this platform today** (confirmed, full-repo search — no replica configuration, no second `DATABASE_URL`-shaped connection string for a reporting-only target). Building one is genuinely separate infrastructure work (a Terraform/RDS-replica change, `infrastructure/`'s own scope, DEPLOYMENT.md territory), not an application-layer decision this epic's own scope can make unilaterally.

This epic's own reporting endpoints (§5) therefore run directly against the primary Postgres instance, via `apps/api`'s own `APP_PRISMA_CLIENT` (`app_role`) — the same "apps/api reads another domain's own tables directly for a cross-domain reporting view" precedent already established for billing/gamification admin surfaces, not a new pattern. `analytics-service` itself remains the sole **write** path for `LearningEvent` (§3.2's own consumer); it is not queried over HTTP for reads at all in this epic's own MVP slice, since no second real Postgres target exists yet to make an internal HTTP hop meaningfully protective of anything. RISK_REGISTER tracks the real, deferred consequence: analytics reporting query load is not yet actually isolated from the primary database's own request-serving capacity, contrary to ARCHITECTURE.md §2's own stated intent, until a real replica is provisioned.

### 3.4 Reporting scope: three endpoints, not a general-purpose query API

PRD.md §7/§8 name five concrete metrics (activation, D1/D7/D30 retention, conversion, AI cost/user, CEFR-progression). This epic builds exactly the query logic those five need, exposed as three real, purpose-built endpoints (§5) — not a generic ad hoc analytics-query API (e.g. a SQL-like filter/aggregate DSL), which no PRD/ROADMAP requirement asks for and would be substantial, unscoped surface area for an MVP epic already at "L" complexity.

### 3.5 `AIUsageLog`/`ProficiencyLevelHistory` need no new ingestion — this epic is a pure reporting layer over both

Confirmed via direct inspection: `AIUsageLog` already has a real, live producer (`services/ai-engine/src/cost/cost-meter.service.ts`, built at E5 T9 per ADR-034's own cost-circuit-breaker requirement) and `ProficiencyLevelHistory` already has a real, live producer (`apps/api/src/modules/assessment/assessment.service.ts`, built at E6). This epic's own AI-cost and CEFR-progression reporting endpoints (§5) are therefore pure query layers over already-real data — no new write path, no new event, no new consumer needed for either.

### 3.6 Auth model: `ADMIN`-role-gated, mirroring Course authoring's own already-established pattern

No admin module or dashboard-API auth convention exists yet (`apps/api/src/modules/admin/` does not exist; E18, Admin Platform, has no design doc yet). Rather than inventing a new auth model for "internal-only" access (PRD.md module 23's own stated bar), this epic reuses `CourseModule`'s own already-established, already-reviewed pattern exactly: `@Controller('admin/...')` + `@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)` + `@Roles('ADMIN')` (ADR-041's own precedent). A future E18 Admin Platform epic, once designed, is free to relocate or wrap these endpoints under whatever broader admin-surface convention it establishes — this epic does not preempt that design, it only needs _an_ auth story that exists and is already reviewed, today.

## 4. Schema reference (already real, E4 T10)

`LearningEvent` (`packages/database/schema/analytics.prisma`) — range-partitioned by month (`createdAt`) via `pg_partman` (ADR-028; the scheduled maintenance job already exists, built at E5 T11 inside `ai-engine`'s `PartitionMaintenanceModule`, ADR-035 — this epic does not rebuild it): `id`, `eventId` (indexed, not unique — §3.1), `type`, `version`, `occurredAt`, `producedBy`, `userId` (nullable — anonymized in place on erasure, DATABASE.md §6), `payload` (`Json`), `createdAt`.

`AIUsageLog` — same partitioning scheme: `id`, `userId` (nullable), `agentPersona`, `modelId`, `promptVersion`, `inputTokens`, `outputTokens`, `costUsdMicros` (integer micro-USD, never a float), `latencyMs`, `createdAt`. Already populated by `ai-engine`'s `CostMeterService` (§3.5).

`ProficiencyLevelHistory` (`packages/database/schema/assessment.prisma`) — append-only record of every `ProficiencyLevel` change; `userId` nullable (same anonymize-in-place policy). Already populated by `AssessmentService` (§3.5).

No new migration is needed for ingestion (`LearningEvent` already exists). §5's reporting endpoints read existing tables only — no new column, no new model.

## 5. API surface (T2/T3)

| Endpoint                                   | Auth           | Purpose                                                                                                                                                              |
| ------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/admin/analytics/overview`         | `ADMIN` (§3.6) | Activation rate, D1/D7/D30 retention, Free→Premium conversion rate, AI cost per active user — the PRD.md §7 business-metrics set, over a caller-specified date range |
| `GET /v1/admin/analytics/cefr-progression` | `ADMIN`        | Re-assessment score-delta distribution over time, per language — PRD.md §5.1's own named required deliverable                                                        |
| `GET /v1/admin/analytics/ai-cost`          | `ADMIN`        | AI cost breakdown by `agentPersona`/`modelId` over a caller-specified date range — the underlying detail `overview`'s own single cost-per-user figure rolls up from  |

## 6. Cross-cutting mechanics

### 6.1 Registering `analytics-service` as a real consumer (T1)

```ts
export const DOMAIN_EVENT_CONSUMERS = [
  'recommendation-engine',
  'notification-service',
  'analytics-service',
] as const;
```

The entire integration surface E16 T1's own design promised ("adding a third named consumer is a one-line registration, not a redesign") — no other change to `packages/events` itself.

### 6.2 `AnalyticsEventDispatcher` (T1)

Structurally mirrors `recommendation-engine`'s `DomainEventDispatcher`/`notification-service`'s `NotificationDispatcher`, but with no `jobName` switch — every event type is handled uniformly (§3.2): validate the envelope's own fixed fields (`eventId`/`type`/`version`/`occurredAt`/`producedBy`/`tenantId`/`userId` — `payload` stays opaque `Json`), check-and-insert into `LearningEvent` keyed by `eventId` (§3.1's own best-effort dedup), done.

### 6.3 Reporting query layer (T2/T3)

Plain Prisma aggregate/`groupBy` queries against `LearningEvent`/`AIUsageLog`/`ProficiencyLevelHistory`/`User`/`Subscription`, run via `apps/api`'s own `APP_PRISMA_CLIENT` (§3.3). No new caching layer — these are internal, low-QPS admin endpoints, not learner-facing hot paths; if real usage later demands it, `EntitlementCacheService`'s own Redis cache-aside pattern (E15 T3) is the established precedent to reach for.

## 7. ADR impact

**ADR-055 (proposed):** `analytics-service` becomes the platform's third real domain-event consumer, registered in `packages/events`'s `DOMAIN_EVENT_CONSUMERS` (E16 T1/ADR-054's own reserved extension point), with a generic (not per-event-type) ingestion consumer persisting every cataloged event into `LearningEvent` — the first real write path for that table. Reporting queries (§5) run directly against the primary Postgres instance via `apps/api`'s own `APP_PRISMA_CLIENT`, a deliberate, flagged MVP compromise against ARCHITECTURE.md §2's own "protects the core DB from analytics query load" justification, pending real read-replica infrastructure this epic does not build (§3.3).

## 8. Alternatives considered

- **Per-event-type ingestion, matching E14/E16's own narrower precedent** (rejected, §3.2) — no per-type business logic exists for a generic historical sink; narrowing scope here would be arbitrary, not a real effort reduction.
- **A real Postgres read replica for reporting queries now, rather than deferring it** (rejected, §3.3) — genuinely separate infrastructure work (Terraform/RDS, `infrastructure/`'s own scope), disproportionate to an MVP epic already at "L" complexity; the compromise is named and tracked (RISK_REGISTER), not silently accepted.
- **Routing reporting reads through `analytics-service`'s own internal HTTP API instead of `apps/api` reading Postgres directly** (rejected, §3.3) — with no second real Postgres target (no replica) to make that hop meaningfully protective, it would add a real internal-service dependency and latency for zero real isolation benefit; the same "don't build a boundary that protects nothing yet" reasoning applies as would to any premature abstraction.
- **Retrofitting real eventId dedup into every existing consumer as part of this epic** (rejected, §3.1) — a real, found gap, but a change to two already-shipped epics' own code, out of this epic's own scope; tracked as a separate follow-up (§11) rather than silently bundled in.
- **A generic, filterable analytics-query API instead of three purpose-built endpoints** (rejected, §3.4) — no PRD/ROADMAP requirement asks for one; substantial unscoped surface area with no named consumer today.

## 9. Task sequence

| Task   | Deliverable                                                                                                                                                                                                                                                                               | Depends on                                                        | Evidence (design-phase)                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** | `analytics-service` registered in `packages/events`'s `DOMAIN_EVENT_CONSUMERS` (§6.1, ADR-055); `analytics-service`'s own real `AnalyticsModule` — a `Worker` consumer on its own fan-out queue, `AnalyticsEventDispatcher` (§6.2, generic ingestion + best-effort `eventId` dedup, §3.1) | E16 T3 (branch-stacking — inherits ADR-054's fan-out fix)         | Unit tests on the dispatcher (dedup-check branch, malformed-envelope rejection, a representative real event persisted correctly); a real e2e test proving a published event of an arbitrary, previously-unhandled type (unlike E14/E16's own narrow dispatch) lands as a real `LearningEvent` row, and a duplicate redelivery of the same `eventId` does not create a second row |
| **T2** | `GET /v1/admin/analytics/cefr-progression`, `GET /v1/admin/analytics/ai-cost` (`apps/api`, §5) — pure reporting layers over already-real `ProficiencyLevelHistory`/`AIUsageLog` (§3.5), `ADMIN`-gated (§3.6)                                                                              | E4/E6 (no new dependency on T1 — both source tables already real) | Unit tests on the query/aggregation logic; a real e2e test seeding real `ProficiencyLevelHistory`/`AIUsageLog` rows and asserting the reported figures match                                                                                                                                                                                                                     |
| **T3** | `GET /v1/admin/analytics/overview` (`apps/api`, §5) — activation/D1/D7/D30 retention/conversion/AI-cost-per-user, computed over `LearningEvent` (real via T1) plus `User`/`Subscription`                                                                                                  | T1                                                                | Unit tests; a real e2e test publishing real events through the full T1 pipeline and asserting the reported activation/retention figures reflect them                                                                                                                                                                                                                             |

## 10. Open questions

1. **Exact activation/retention definitions** (e.g. "activated" = assessment + first lesson within 24h, per PRD.md §7's own wording — but the precise SQL window/cohort-boundary semantics) — this design assumes PRD.md §7's own literal wording is the spec; a real product-analytics stakeholder should confirm before T3 ships if a more precise definition is needed.
2. **Whether a real Postgres read replica should be provisioned before this epic's reporting endpoints see meaningful admin traffic** (§3.3) — a real, separately-scoped infrastructure decision, not this epic's own to make.

## 11. Risks

| Risk                                                                                                                                                                                                                                                                                                  | Mitigation                                                                                                                                                                                                                   | Owner                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Reporting queries (§5) run directly against the primary Postgres instance, not an isolated replica — ARCHITECTURE.md §2's own "protects the core DB from analytics query load" justification for `analytics-service`'s existence is not yet actually realized                                         | Provision a real read replica (or dedicated analytics store) once real admin-reporting query volume/frequency justifies it — genuinely separate infrastructure work, `infrastructure/`'s own scope                           | Backend Platform (TBD) |
| `EVENT_ARCHITECTURE.md` §4's own idempotency claim ("every consumer stores processed eventIds") is real only for this epic's own new consumer — `recommendation-engine`'s `DomainEventDispatcher`/`notification-service`'s `NotificationDispatcher` still process every delivered job unconditionally | Retrofit real `eventId`-based dedup into both, the next time either is touched, or as a dedicated follow-up task                                                                                                             | Backend Platform (TBD) |
| `LearningEvent.eventId`'s own best-effort dedup check (§3.1) has a real, narrow race window under concurrent redelivery of the same event                                                                                                                                                             | Acceptable at today's real delivery volume (BullMQ redelivers only on genuine transient failure, not routinely); revisit if observed double-counting ever actually occurs                                                    | Backend Platform (TBD) |
| This epic's own reporting endpoints cover exactly the PRD.md §7/§8-named metrics, not every event `EVENT_ARCHITECTURE.md`'s catalog now durably persists via T1's generic ingestion                                                                                                                   | The raw data already exists in `LearningEvent` for any future metric a real product need names — building its own dedicated reporting query is real, separately-scheduled follow-up work, not blocked on this epic reopening | Backend Platform (TBD) |

## 12. Gate sign-off log

| Gate         | Status        | Reviewer | Date | Notes                                                                                      |
| ------------ | ------------- | -------- | ---- | ------------------------------------------------------------------------------------------ |
| Architecture | ☐ Not started | —        | —    | The direct-Postgres-reporting-query compromise against ARCHITECTURE.md §2 (§3.3, ADR-055)  |
| Database     | ☐ Not started | —        | —    | No migration — confirms `LearningEvent`/`AIUsageLog`/`ProficiencyLevelHistory` already fit |
| API          | ☐ Not started | —        | —    | New `/v1/admin/analytics/*` endpoints (§5)                                                 |
| Security     | ☐ Not started | —        | —    | `ADMIN`-role gating (§3.6), no new PII exposure beyond already-real tables                 |
| Testing      | ☐ Not started | —        | —    | Real e2e proof of generic ingestion, dedup, and reporting-query correctness                |

## 13. Epic Approval

Design not yet formally approved by an independent Architecture Gate review — proceeding to implementation by explicit user direction ("next"), the same pattern E9–E16 each followed.
