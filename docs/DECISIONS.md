# LinguaAI — Architecture Decision Records

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-08-01

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

### ADR-014 — Split test runner: Jest for NestJS surfaces, Vitest elsewhere

**Context:** Epic E1 (Foundation & Engineering Platform Bootstrap) needs one settled test-runner choice per surface before any package/app is scaffolded — deferring this to each Epic individually would produce inconsistent tooling across the monorepo.
**Decision:** `apps/api` and all `services/*` (NestJS) use **Jest** — the framework's default, with zero-friction integration for `@nestjs/testing` and decorator/metadata reflection. `apps/web`, `apps/admin`, and all `packages/*` use **Vitest** — faster, native-ESM, the standard for modern Vite/Next.js-adjacent TypeScript code, with no NestJS-specific constraints to work around.
**Consequences:** Two test runners exist in one monorepo rather than one, which is a real DX cost; accepted because forcing Vitest onto NestJS (or Jest onto the frontend) fights each framework's well-trodden defaults for no functional benefit at this stage. Turborepo's `test` pipeline task treats both uniformly (same `pnpm test` entry point per package regardless of runner). Revisit only if NestJS's own tooling recommends a runner change upstream.
**Status:** Accepted.

### ADR-015 — Dependency-boundary enforcement via ESLint, not a second monorepo tool

**Context:** ADR-002's modular-monolith boundary rules (and ARCHITECTURE.md §2.1's bounded-context map) are only real if a broken boundary fails CI — Epic E1 must deliver that enforcement mechanism, not just document the rule.
**Decision:** Use `eslint-plugin-boundaries` (or equivalent import-boundary ESLint rule) configured against the `apps/ → packages/`, `services/ → packages/`, `packages/ ↛ apps/|services/` dependency direction and the six bounded contexts, rather than adopting a second monorepo/graph tool (e.g., Nx) alongside the already-chosen Turborepo (ADR-001).
**Consequences:** One monorepo toolchain, not two competing ones; boundary violations surface as a standard lint failure in the existing `pnpm lint` / CI pipeline, with no new tool for engineers to learn. The ruleset requires maintenance as new packages/services are added — owned by whoever's Epic introduces them (CODE_REVIEW_CHECKLIST.md already checks for this).
**Status:** Accepted.

### ADR-016 — Observability stack: OpenTelemetry SDK, CloudWatch (logs), AWS X-Ray via ADOT (traces), Sentry (errors), Jaeger locally

**Context:** The Epic E1 Independent Production Readiness Review (2026-07-29, [epics/E1-production-readiness-review.md](epics/E1-production-readiness-review.md)) found E1 shipped the first deployable applications with no logging, metrics, or tracing wired in — a direct contradiction of DEPLOYMENT.md §5's existing "wired in from first deploy, not retrofitted" commitment, and a finding that E1 could not satisfy its own [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md). A concrete technology decision was required, not just a restated policy.
**Decision:** All apps/services instrument via the **OpenTelemetry SDK** (one vendor-neutral instrumentation layer, per OBSERVABILITY.md's existing tooling direction), wrapped in a new shared package `packages/observability` so no app/service hand-rolls its own bootstrap. Export targets: structured JSON logs to **CloudWatch Logs**; traces via the **AWS Distro for OpenTelemetry (ADOT)** collector to **AWS X-Ray**; errors to **Sentry**; metrics via the OTel Metrics SDK to **CloudWatch Metrics** (through the same ADOT collector). Locally, the same OTel SDK exports to a lightweight **Jaeger all-in-one** container (traces) and console/stdout (logs, metrics) via `docker-compose.yml` — no local Prometheus/Grafana stack, to avoid overbuilding local infrastructure ahead of real usage. The correlation ID used in logs, the JSON error envelope's `requestId` field (API_GUIDELINES.md §3), and the OTel trace ID are **the same identifier** — no parallel ID scheme is maintained.
**Consequences:** One instrumentation layer (OTel) across every language/framework the platform uses, consistent with the AWS-native infrastructure choice (ADR-009); ADOT is AWS's own supported distribution for exactly this CloudWatch/X-Ray export path, minimizing custom glue code. `packages/observability` becomes a required dependency of every `apps/*`/`services/*` skeleton from Epic E1 onward, not bolted on later.
**Status:** Accepted. **Remediates Architecture Review blocker (Critical 1, E1 review).**

### ADR-017 — Container supply-chain security: Syft (SBOM) + Trivy (scan) + cosign (sign) + GitHub native attestation (provenance)

**Context:** The same E1 review found no SBOM, image signing, or build-provenance attestation planned for any container image the CI/CD pipeline produces — a direct, named gap against the SLSA supply-chain framework.
**Decision:** Every container image built in CI passes through a fixed chain before it is eligible for deployment: **Syft** generates an SPDX SBOM → **Trivy** scans the image (and SBOM) for vulnerabilities, blocking on Critical/High severity CVEs with an available fix (CVEs with no fix yet are logged and tracked per SECURITY.md §6's patch SLA, not blocking) → **cosign** signs the image **keylessly** via GitHub Actions OIDC (Sigstore Fulcio/Rekor — no long-lived signing key to manage or leak) → **GitHub's native `actions/attest-build-provenance`** generates a SLSA-aligned provenance attestation → the deploy workflow **verifies** the signature and provenance before referencing the image in an ECS task definition update, and aborts with an alert if verification fails.
**Consequences:** No new key-management burden (keyless signing); the chain is fully automatable in GitHub Actions with first-party or well-maintained actions, avoiding a custom-built signing pipeline. A CVE with no upstream fix does not perpetually block deployment, but is tracked, not silently ignored.
**Status:** Accepted. **Remediates Architecture Review blocker (Critical 2, E1 review).**

### ADR-018 — JWT access token (Bearer, 15 min) + rotating refresh token (httpOnly cookie for web, secure device storage for mobile, 30 days)

**Context:** SECURITY.md §2 already commits to "short-lived JWT access tokens + rotating, revocable refresh tokens," and to refresh tokens being "stored httpOnly/secure/SameSite=strict for web" — but specified neither the access-token transport mechanism (needed for the Flutter mobile app, E21, which has no cookie jar) nor concrete lifetimes, and API_GUIDELINES.md did not state the access-token transport either.
**Decision:** Access tokens are short-lived (15 minute) JWTs sent via `Authorization: Bearer` header — a single, platform-agnostic transport for web, mobile, and any future first-party client, rather than a web-only cookie that would force a second, different mechanism for mobile. Claims: `sub`, `role`, `organizationId`, `orgRole`, `jti`, `iat`, `exp`. Refresh tokens are long-lived (30 day), one-time-use with atomic rotation-on-use (reuse of an already-rotated token revokes the entire session chain; a race between two near-simultaneous uses resolves to exactly one winner via a conditional update, the other treated as reuse), stored per SECURITY.md §2's existing cookie requirement for web and platform-secure storage (Keychain/Keystore) for mobile. Immediate revocation for a single session is backed by a short-TTL Redis denylist keyed on JWT `jti`; immediate propagation of a **role or org-membership change** (a distinct problem — the denylist alone doesn't handle "this still-valid token now claims a stale role") is handled via `User.tokensValidAfter`: every request additionally checks `jwt.iat >= user.tokensValidAfter`, so a role change invalidates the affected user's outstanding tokens on their next request, not at natural expiry.
**Consequences:** One access-token transport across every client, no web/mobile auth code fork; Redis is a hard dependency for immediate single-session revocation guarantees (fail-open on Redis outage — a documented, accepted 15-minute worst-case exposure window, not a silent one) — an acceptable dependency since Redis is already required elsewhere (API_GUIDELINES.md §7's rate limiter, E1's `docker-compose.yml`); `tokensValidAfter` adds one indexed/cacheable column read per authenticated request, a small, deliberate cost traded for closing a real privilege-staleness window. The `jti` denylist itself was not built in E2's initial implementation pass despite being specified here — closed in E2-T28 (`JtiDenylistService`), verified via a dedicated e2e test proving a revoked session's access token stops working immediately, and a negative test proving revocation is scoped per-session, not per-user.
**Status:** Accepted.

### ADR-019 — TOTP (RFC 6238) as the mandatory MFA mechanism for `ADMIN`/`ENTERPRISE_ADMIN`

**Context:** ADR-011 mandates MFA enrollment for `ADMIN`/`ENTERPRISE_ADMIN` before activation but did not specify a mechanism.
**Decision:** Time-based One-Time Password (TOTP, RFC 6238), compatible with standard authenticator apps (Google Authenticator, Authy, 1Password, etc.) — no SMS, no email-based second factor at MVP.
**Consequences:** No SMS-provider integration or per-message cost; works offline once enrolled; slightly higher enrollment friction than SMS (a user must install an authenticator app) — accepted as proportionate for `ADMIN`/`ENTERPRISE_ADMIN` accounts specifically (ADR-011's own reasoning: these are the highest-value account-takeover targets). Standard/`TEACHER` accounts remain unaffected (MFA optional, not required, for those roles).
**Status:** Accepted.

### ADR-020 — OAuth provider set at MVP: Google and Apple only (Facebook deferred)

**Context:** PRD.md §6's module 1 feature row states MVP scope as "Email + Google + Apple auth"; SECURITY.md §2 separately listed "OAuth (Google, Apple, Facebook)" as preferred over password auth — a real discrepancy, with no ADR resolving which was authoritative.
**Decision:** Google and Apple only at MVP, matching PRD.md's explicit feature-scope statement. Apple Sign-In carries a near-mandatory requirement for iOS apps offering other social login (App Store Review Guideline 4.8), giving Google+Apple a concrete, dated reason to ship together; Facebook has no equivalent forcing function and is deferred, not rejected outright.
**Consequences:** `OAuthAccount.provider` enum is `GOOGLE | APPLE` only; adding Facebook later is an additive enum value, not a breaking schema change. SECURITY.md §2's provider list is corrected to match in the same PR that accepts this ADR (E2-T29) — this ADR is the authoritative resolution going forward.
**Status:** Accepted.

### ADR-021 — Two-person approval for `ADMIN` role grants/revocations; single-party for `TEACHER`/`ENTERPRISE_ADMIN`

**Context:** An Architecture Gate review of the E2 design found no mechanism for changing a `User.role`, including no way the first `ADMIN` account could ever be created.
**Decision:** Role changes involving `ADMIN` (promotion to, or demotion from) require two-person approval: a requesting `ADMIN` initiates via `POST /v1/users/:id/role-change-requests`, and a second, different `ADMIN` must approve via `POST .../approve` before the change takes effect (`RoleChangeRequest`, expires unapproved after 72h). `TEACHER` and `ENTERPRISE_ADMIN` changes remain single-party, matching ADR-011's existing risk-proportionate reasoning (lower blast radius than platform-wide `ADMIN`). The very first `ADMIN` in a fresh environment is created by a one-time, out-of-band bootstrap procedure (`packages/database/scripts/bootstrap-admin.ts`) outside the API surface entirely, since no existing `ADMIN` can approve a request when none yet exists; the same procedure doubles as the documented emergency-recovery path if every `ADMIN` account is ever lost, publishing a distinct `identity.role.emergency_recovery` event (not blended into routine bootstrap volume) since a recovery run is a security incident by definition. Demoting the last remaining `ADMIN` (platform-wide) or the last remaining `ENTERPRISE_ADMIN` (per org) is blocked outright.
**Consequences:** Privilege escalation to the platform's highest-trust role now requires collusion between two named individuals, not a single compromised or malicious account; adds latency to legitimate `ADMIN` grants (accepted, matching ADR-011's own "adds friction, proportionate to privilege level" reasoning) and a genuine operational risk if an organization only ever has one real `ADMIN` (tracked in RISK_REGISTER.md).
**Status:** Accepted. **Resolves E2 Architecture Gate review Critical-1.**

### ADR-022 — Narrow, `BYPASSRLS`-granted service role for the handful of operations that must legitimately cross tenant boundaries

**Context:** Completing the RLS policy matrix (ADR-005) for `User` surfaced a real problem: registration and first-touch OAuth account creation must write a `User` row before any `app.current_user_id`/`app.current_org_id` session context exists to satisfy a per-request RLS policy against, and the GDPR-erasure background job and the bootstrap procedure must legitimately act across tenant boundaries by design.
**Decision:** A separate Postgres role (`app_service_role`), granted `BYPASSRLS` (a native, superuser-only-grantable Postgres privilege), used **only** by a small, explicitly named set of code paths: registration, OAuth account creation, the bootstrap-admin CLI, and the GDPR-erasure job. The default, per-request application connection role never has this privilege. Any new use of `app_service_role` is called out in CODE_REVIEW_CHECKLIST.md as requiring elevated review, since it is the one place RLS's defense-in-depth layer is deliberately absent.
**Consequences:** A small, auditable set of code paths carries full responsibility for their own tenant-scoping correctness with no RLS backstop — a real, accepted trade-off, scoped as narrowly as the actual requirement allows, rather than broadening `BYPASSRLS` to the standard role and losing RLS's protection everywhere.
**Status:** Accepted. **Resolves E2 Architecture Gate review Critical-2.**

### ADR-023 — Privileged-column protection via `REVOKE`/`GRANT` column allowlisting + `SECURITY DEFINER` governance functions

**Context:** A second Architecture Gate review of the E2 design found that row-level RLS policies (ADR-005, extended in ADR-022) do not restrict which columns a permitted row-level write can touch — an `ENTERPRISE_ADMIN`'s legitimate `user_update` access could also be used to write `User.role` directly, bypassing ADR-021's two-person-approval workflow with no database-level objection. The same review separately found that `RoleChangeRequest` approval lacked the atomic conditional-update pattern already established elsewhere (ADR-018's refresh-token rotation), and that a role change and its `AuditLog` write weren't guaranteed to be transactionally atomic.
**Decision:** Two complementary controls: (1) `REVOKE`/`GRANT` column-level privilege allowlisting on `User`, `OrganizationMembership`, and `RoleChangeRequest`, removing standard-role write access to every field identified as privileged (`role`, `organizationId`, `mfaEnrolled`, `mfaSecret`, `tokensValidAfter`, `status`, `passwordHash`, `orgRole`, and `RoleChangeRequest`'s resolution fields); (2) a small set of `SECURITY DEFINER` PL/pgSQL functions (`approve_role_change`, `set_org_role`, `complete_mfa_enrollment`) that are the _only_ writers of those columns, each performing its entire state transition — including the `tokensValidAfter` bump and the `AuditLog` write — inside one atomic function call. `app_role` receives `EXECUTE` on these functions, never direct column access. Both functions are owned by a narrowly-privileged, purpose-specific Postgres role, never the migration/superuser role.
**Consequences:** Privilege escalation via a direct `UPDATE` is prevented by Postgres's own privilege system, not application-code discipline — closing the exact class of gap RLS itself was introduced to close for tenant isolation, now applied to role governance. Every future privileged field this or a later Epic introduces must be evaluated against the same survey criteria before deciding whether it needs the same treatment. `SECURITY DEFINER` functions are a genuine, small new security-critical surface (they run with the privileges of their owner, not the caller) — CODE_REVIEW_CHECKLIST.md's elevated-review requirement for `app_service_role` (ADR-022) is extended to cover any new `SECURITY DEFINER` function too.
**Amendment:** a subsequent, function-body-level targeted review found the function _bodies_, as first drafted, didn't fully deliver this ADR's own stated guarantee — no platform-wide "last `ADMIN`" check existed at all in `approve_role_change()`, `set_org_role()`'s equivalent check had a cross-row TOCTOU race, and neither function verified its caller-supplied identity/authorization independently of the application layer. This is not a change to the decision above — column allowlisting plus `SECURITY DEFINER` functions as the only writers remains the approved model — it is the model's concurrency and authorization guarantees being fully specified rather than partially specified. Closed via: `pg_advisory_xact_lock` keyed per-invariant (a fixed key for the platform-wide `ADMIN` floor, an org-hash-derived key for the per-org `ENTERPRISE_ADMIN` floor), so a concurrent second caller can only ever evaluate the invariant against state committed by the first, never stale data; and explicit `current_setting('app.current_user_id')` cross-checks plus a fresh in-function lookup of the approver's/actor's own role, rather than trusting either the caller-supplied ID or the application layer's own authorization check alone.
**Status:** Accepted. **Resolves E2 Architecture Gate review's second-pass mandatory findings #1/#2; amendment resolves the subsequent function-body-level targeted review's findings.**

### ADR-024 — Flutter design-token export via a build-only, never-committed generated artifact

**Context:** ARCHITECTURE.md §5 and CODING_STANDARDS.md §4 both assert Flutter's design tokens are generated from `packages/ui`'s own source values, "never hand-copied, to prevent silent drift" — but no mechanism for this existed anywhere in the codebase, confirmed absent by direct inspection during E3's design (docs/epics/E3-design-system-component-library.md). A first draft of this ADR (E3 Pass 1) specified a committed artifact with a value-match/determinism test; an independent Architecture Gate review (docs/epics/E3-architecture-gate-review.md, finding F-H9) found that design could not actually detect drift — a `tokens.css` change with no regeneration produces a stale committed file that passes both tests.
**Decision:** The generated artifact (`design-tokens.json`) is **never committed to the repository**. `apps/mobile`'s own build pipeline invokes a generation script (`packages/ui`'s `generate:tokens`, parsing `tokens.css`'s `@theme`/`@utility` blocks with a real CSS parser) fresh on every build, from the current source. This eliminates the drift class of bug by construction — there is no stale copy that can exist, because no copy is ever persisted outside a build.

**Canonical-source note (E3 remediation pass #4):** the full specification below (token-category mapping, naming convention, schema versioning, consumer compatibility rules, schema evolution, failure behavior, unsupported categories, and a worked example) is specified **only here, in this ADR** — it is not duplicated in `docs/epics/E3-design-system-component-library.md`. An earlier revision of that design document pointed here in reverse ("specified in E3's design document §23"), and a later revision of that same document deleted the content §23 was supposed to hold without anyone updating this pointer — leaving both documents pointing at the other's absence. This ADR is now the single source of truth for this mechanism; the design document's §23 states this explicitly and does not restate the content.

**Token category mapping — every token category in `tokens.css` and its Flutter-side representation:**

| Category         | Source (`tokens.css`)                                                                                                                                                                                                                                                                                                                                                 | Generated artifact shape                                                                                                                                                                                                                                               | Flutter consumption                                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color            | `@theme` custom properties under "§2 Color system" and E3's semantic-tier additions (primitive anchors, `-text`/`-border`/`-solid` semantic tokens, `--color-border`, `--color-focus-ring`)                                                                                                                                                                           | `colors: { <camelCase name>: { light: "#hex", dark: "#hex" } }`                                                                                                                                                                                                        | A `ColorScheme`-shaped Dart map built at app-init from the generated JSON, keyed identically                                                                                                                |
| Radius           | `--radius-sm/md/lg/pill`                                                                                                                                                                                                                                                                                                                                              | `radius: { sm, md, lg, pill }` (numbers, px)                                                                                                                                                                                                                           | Flutter `BorderRadius.circular(value)` constants                                                                                                                                                            |
| Shadow/elevation | `--shadow-flat/low/medium/high/overlay`                                                                                                                                                                                                                                                                                                                               | `shadows: { flat, low, medium, high, overlay }` (each an array of `{offsetX, offsetY, blur, spread, color, opacity}` parsed from the CSS `box-shadow` shorthand — **except `flat`, see the explicit rule below**)                                                      | Flutter `BoxShadow` lists per elevation tier                                                                                                                                                                |
| Spacing          | Tailwind's default 4px-base scale (§2.1 — not overridden in `tokens.css`, since it already matches DESIGN_SYSTEM.md §2.1)                                                                                                                                                                                                                                             | `spacing: { 0, 1, 2, 3, 4, 6, 8, 12, 16 }` (numbers, px — the same named steps as the Tailwind scale, generated from a hardcoded constant in the generation script since Tailwind's default scale is not itself declared in `tokens.css` as an overridable value)      | Flutter `EdgeInsets`/spacing constants                                                                                                                                                                      |
| Typography       | §12.1a's Tier 2 `@utility type-<name>` blocks of the E3 design document, once T1 lands (**corrected, remediation pass #6, closing the sixth review's P6-1**: Tier 2 was previously specified as a single, unimplementable custom property per name; it is now a set of real, multi-declaration `@utility` blocks, the same construct already used for `--duration-*`) | `typography: { <camelCase semantic name>: { fontSize, lineHeight, fontWeight, fontFamily } }` — the generator parses each `@utility type-<name>` block's four declarations directly and resolves each `var()` reference against the `:root`-declared Tier-1 raw values | Flutter `TextStyle` map, one entry per Tier-2 semantic type token                                                                                                                                           |
| Breakpoints      | `--breakpoint-mobile/tablet/desktop` (§12.1 of the E3 design document, once T1 lands)                                                                                                                                                                                                                                                                                 | `breakpoints: { mobile, tablet, desktop }` (numbers, px)                                                                                                                                                                                                               | Flutter responsive-layout constants (`LayoutBuilder` thresholds)                                                                                                                                            |
| Motion           | `--duration-micro/standard/celebratory`, `--ease-entrance/exit`                                                                                                                                                                                                                                                                                                       | `motion: { durations: { micro, standard, celebratory }, easing: { entrance: [x1,y1,x2,y2], exit: [x1,y1,x2,y2] } }` (durations in ms; easing as the four cubic-bezier control points)                                                                                  | Flutter `Duration` constants; a custom `Curve` built from the same four control points (Flutter's `Cubic` class takes exactly this shape, so no lossy translation to a named `Curves.*` constant is needed) |
| Z-index          | `--z-index-base/dropdown/sticky/overlay/modal/toast`                                                                                                                                                                                                                                                                                                                  | **Not emitted** — see "Unsupported token categories" below                                                                                                                                                                                                             | N/A                                                                                                                                                                                                         |

**Naming convention:** every generated key is the source CSS custom property's name with the leading `--` stripped and kebab-case converted to camelCase (e.g. `--color-primary-text` → `colorPrimaryText`; `--type-heading-lg` → `typeHeadingLg`), grouped under the top-level category keys shown in the table above (`colors`, `radius`, `shadows`, `spacing`, `typography`, `breakpoints`, `motion`). No category is flattened into another, and no key is renamed beyond the mechanical kebab-to-camel conversion, so a Flutter engineer reading `tokens.css` and the generated JSON side by side can find any value without a lookup table.

**Schema versioning:** the artifact carries a top-level `schemaVersion` field, a plain incrementing integer starting at `1` (not a semver string — there is exactly one producer and one consumer of this schema, so semver's independent-party compatibility signaling adds no value here). It is bumped whenever a category is added, removed, or restructured (a key renamed, a value's shape changed, e.g. `shadows` moving from a single object to an array). It is **not** bumped for an ordinary value change within an existing shape (a new color added to the `colors` map, a hex value corrected) — those are exactly the changes this mechanism exists to propagate without drift, and gating them behind a version bump would defeat the purpose.

**Consumer compatibility rules & schema evolution:** `apps/mobile`'s build reads the generated artifact's `schemaVersion` and compares it against the version its own token-consumption code was written against (a constant checked into `apps/mobile`'s own source, updated only when that code is deliberately migrated to a new schema shape). A mismatch is a **build-time failure**, not a warning or a silent best-effort mapping — per CODING_STANDARDS.md §4's "never hand-copied, to prevent silent drift," a silently-adapted-to mismatch would reintroduce a different flavor of the same drift risk this ADR exists to eliminate. Adding a new token within an existing category's shape is non-breaking and requires no version bump or `apps/mobile` change. Renaming or removing a key, or restructuring a category's shape, is breaking, requires a version bump, and requires `apps/mobile`'s consuming code to be updated in the same PR that bumps the version — mirroring CLAUDE.md's "a PR changing an architecture contract updates the corresponding doc" rule, extended here to a generated-schema contract rather than a documentation contract.

**Keyword-valued shadow rule (added, remediation pass #5, closing the fifth review's N-6):** the shipped `tokens.css` declares `--shadow-flat: none` — a bare CSS keyword, not a `box-shadow` shorthand value, and not parseable into the `{offsetX, offsetY, blur, spread, color, opacity}` shape every other shadow tier uses. The generation script maps a `none`-valued shadow token to an **empty array** (`"flat": []`) in the generated artifact, stated here as an explicit rule rather than left for T18's implementer to discover as an edge case. This is not a failure condition (see Failure behavior below) — `none` is a valid, expected CSS value for this specific token, and Flutter's own convention for "no shadow" is an empty `BoxShadow` list, so the mapping requires no further translation on the consumer side.

**Typography schema-validation rule (added, remediation pass #6, closing the sixth review's P6-1):** each `typography.<name>` entry the generator emits must contain all four of `fontSize`, `lineHeight`, `fontWeight`, and `fontFamily`, each successfully resolved to a concrete value (a numeric px/unitless value for the first three, a font-family string for the fourth). This is a build-time failure condition, not a warning: if any `@utility type-<name>` block in `tokens.css` is missing one of its four required declarations, or if a declaration's `var()` reference cannot be resolved against a `:root`-declared Tier-1 primitive, the generator fails the build and names the specific token and the specific missing/unresolvable field in its error output — an implementer adding a tenth Tier-2 token who forgets `font-family`, for example, gets a build failure naming exactly that, not a Flutter `TextStyle` silently missing a font.

**Failure behavior:** the generation script (`packages/ui`'s `generate:tokens`) fails the build (non-zero exit, no partial/best-effort output) if: `tokens.css` fails to parse under `postcss`; a token category expected by the mapping table above is entirely absent from the parsed `@theme`/`@utility` output; a typography token fails the schema-validation rule immediately above; or a mapped value does not match its expected type (e.g. a color token whose value is not a valid 3/6/8-digit hex string, a duration token that does not parse as a numeric `ms` value, or — excluding the `none`/empty-array case above — a shadow value that is neither a valid `box-shadow` shorthand nor the literal keyword `none`). There is no fallback-to-last-known-good behavior — a broken source produces a broken build, visibly, not a stale or partially-correct artifact.

**Unsupported token categories:** `--z-index-*` is deliberately excluded from the generated artifact, stated explicitly rather than silently dropped. CSS z-index has no meaningful Flutter equivalent — Flutter controls stacking order via widget-tree order (`Stack` + `Positioned`, or simply paint order), not a numeric layering property applied to an individual element. Emitting a `zIndex` field into the artifact would give Flutter code a value with nothing correct to do with it. If a future need arises for Flutter-side stacking guidance, it should be modeled as an explicit widget-composition convention documented in a future mobile epic, not force-mapped from this CSS-specific concept.

**Worked example**, illustrating the shape (abbreviated, not exhaustive):

```json
{
  "schemaVersion": 1,
  "colors": {
    "colorPrimaryText": { "light": "#2563eb", "dark": "#60a5fa" },
    "colorBorder": { "light": "#64748b", "dark": "#94a3b8" }
  },
  "radius": { "sm": 4, "md": 8, "lg": 12, "pill": 9999 },
  "shadows": {
    "flat": [],
    "low": [
      { "offsetX": 0, "offsetY": 1, "blur": 2, "spread": 0, "color": "#000000", "opacity": 0.05 }
    ]
  },
  "spacing": { "0": 0, "1": 4, "2": 8, "3": 12, "4": 16, "6": 24, "8": 32, "12": 48, "16": 64 },
  "typography": {
    "typeBodyMd": { "fontSize": 16, "lineHeight": 24, "fontWeight": 400, "fontFamily": "Inter" }
  },
  "breakpoints": { "mobile": 0, "tablet": 768, "desktop": 1280 },
  "motion": {
    "durations": { "micro": 150, "standard": 250, "celebratory": 600 },
    "easing": { "entrance": [0, 0, 0.2, 1], "exit": [0.4, 0, 1, 1] }
  }
}
```

**Consequences:** No committed-artifact drift is possible by construction — a stronger guarantee than a CI-diff-check against a committed file would provide even if implemented correctly. `apps/mobile`'s build gains a build-time dependency on `packages/ui`'s source tree, which a monorepo-internal token dependency already implies. Testing shifts from "does the committed file match" (meaningless once nothing is committed) to determinism, schema-validation, and smoke tests against the generator itself — T18's determinism test confirms byte-identical output across two runs from the same source; T18's schema-validation test confirms the output matches the shape specified above; T18's smoke test confirms every mapped category (`colors` through `motion`) is present and non-empty. **Correction (E3 remediation pass #2, second Architecture Gate review finding N-13):** this section originally claimed the CSS parser needed to implement the generation script (`postcss`) was "already a transitive dependency of the installed Tailwind toolchain — no new dependency." Verified false against `pnpm-lock.yaml` and pnpm's isolated `node_modules` layout: `postcss` reaches the workspace's dependency tree only via `apps/web`/`apps/admin`'s `@tailwindcss/postcss`, never via `packages/ui`, and would not resolve from a script inside `packages/ui` without being added there directly. `postcss` is therefore a new, explicit, small devDependency of `packages/ui` — negligible in cost (already present elsewhere in the workspace's lockfile) but a real, not fictitious, new dependency edge.
**Security implications:** None — token values are non-sensitive design constants.
**Reversibility:** High — a future move to a committed-artifact-plus-diff-check model, or a different export format (e.g. an open Design Tokens standard), only requires rewriting the generation script, not touching any consumer.
**Status:** Proposed — pending Architecture Gate approval of E3's design, not self-approved.

### ADR-025 — `lucide-react` as the v1 icon library for `packages/ui`

**Context:** DESIGN_SYSTEM.md §4's component categories (form validation icons, navigation, AI message bubble's required persistent icon signaling AI-purple content per WCAG 1.4.1, admin data-table sort indicators) need a functional icon set at foundation depth, distinct from DESIGN_SYSTEM.md §7's explicitly-deferred full illustration/iconography system. No icon package was installed anywhere in the codebase, confirmed absent during E3's design; an independent Architecture Gate review (docs/epics/E3-architecture-gate-review.md, finding F-H6) found the choice left undecided blocked four component tasks and one accessibility control with no owner or date.
**Decision:** `lucide-react` (MIT licensed) — tree-shakeable per-icon named exports, `aria-hidden` by default (overridden with an `aria-label` on the containing control for icon-only interactive elements), 24px/stroke-width-2 default matching the already-adopted Shadcn convention. Consumed only through a single internal re-export module (`packages/ui/src/icons.ts`), never imported directly per-component, so a future library swap is a one-file change.
**Alternatives considered:** Heroicons (smaller set, less frequent releases at evaluation time, no differentiating advantage over the Shadcn-ecosystem default); Phosphor Icons (larger, more stylistically opinionated than this epic's foundation-depth need justifies); a custom-built icon set (rejected as premature — DESIGN_SYSTEM.md §7 already defers the full iconography system, and building custom icons now for purely functional needs would duplicate effort once that system lands).
**Consequences:** One new runtime dependency; one consistent accessibility convention for every icon usage in the library instead of per-component invention; the re-export-indirection makes a future swap mechanical rather than architectural.
**Security implications:** None beyond the existing Shadcn-CLI-adjacent supply-chain control (inherited from E1, unchanged).
**Reversibility:** High, by design (the re-export module).
**Status:** Proposed — pending Architecture Gate approval of E3's design, not self-approved.

### ADR-026 — Storybook access control via CloudFront Function + CloudFront KeyValueStore, superseding the unbuildable Secrets-Manager-direct-read design

**Context:** E3's design requires a hosted, access-restricted preview of `packages/ui`'s Storybook build for team review. The first remediation pass (E3 Pass 1) proposed a CloudFront Function reading a credential from AWS Secrets Manager at request time. The second independent Architecture Gate review (docs/epics/E3-second-independent-review.md, finding N-5) found this **not buildable**: CloudFront Functions execute in a restricted `cloudfront-js-2.0` runtime with no network access, filesystem access, or AWS SDK, and cannot call Secrets Manager. The review also found the `edge` Terraform module provided less reuse than claimed (a `REGIONAL`-scoped WAF ACL tied to the ALB, no S3 origin, no Origin Access Control, no CloudFront Function precedent).
**Decision:** Keep the edge-compute tier choice (CloudFront Functions — still the cheapest, lowest-latency option genuinely suited to a stateless per-request check) but pair it with a **CloudFront KeyValueStore**, a store purpose-built for small amounts of data read by a CloudFront Function at the edge. Terraform — which has full AWS SDK/network access at `apply` time, unlike the edge function at request time — resolves the real credential from Secrets Manager, generates an independent salt (a Terraform-generated random value, not derived from the credential), and writes both the resulting `SHA-256(salt + credential)` hash and the plaintext salt into the KVS as separate entries (full mechanism, rotation, ownership, and fail-closed failure behavior specified in the E3 design document §18, corrected there in remediation pass #6). The function reproduces the same salted-hash computation against the request's `Authorization: Basic` header using `cloudfront-js-2.0`'s `crypto` module and compares the two hashes, entirely within the runtime's actual, documented capabilities. A new, minimal S3 origin with Origin Access Control is provisioned for the static Storybook build (the `edge` module's existing distribution has no S3 origin today). **The distribution ships v1 without a dedicated `CLOUDFRONT`-scoped WAF ACL** — not assumed inherited from the `edge` module's own, differently-scoped (`REGIONAL`) ACL, which does not and cannot cover a CloudFront distribution regardless of this decision. This is a stated decision, not an open option: a new WAF ACL is a real, ongoing cost/maintenance addition, and the threat model it would address (volumetric/bot abuse) does not meaningfully apply to a low-traffic internal preview tool already behind Basic Auth. The decision is revisitable — RISK_REGISTER.md R-65 tracks it explicitly, with the Security/DevOps role as owner, and a WAF ACL can be added at any later `terraform apply` without touching the KVS/function pair this ADR specifies — but it is not left open pending T17.
**Alternatives considered:** Lambda@Edge (genuine network/SDK access, rejected for v1 on latency/cost/deployment-complexity grounds relative to this simple a check — the right choice if the model later needs real statefulness); CloudFront signed cookies issued via a GitHub-OAuth-backed token endpoint (genuinely per-user and instantly revocable via GitHub org membership — the better long-term posture, evaluated in detail, rejected for v1 specifically as a materially larger build — new OAuth App, new Lambda/Function URL, new IAM surface — than a low-sensitivity internal preview tool justifies at this epic's M complexity; named as the explicit recommended upgrade path); Cognito (rejected — would introduce a second, redundant identity system alongside the one Epic E2 already built in `apps/api`, for a concern that isn't customer-facing identity); private/VPN-only hosting (rejected — no existing VPN/bastion pattern exists in this project's infrastructure to extend, and building one is a larger, unrelated investment).
**Consequences:** The credential remains shared, not per-user, and revocation (a `terraform apply` rewriting the KVS entry) is fast (seconds, via KVS's edge-propagation design) but not instant or individually scoped — an explicit, accepted limitation (RISK_REGISTER.md R-56), not improved or hidden by this ADR, only made buildable. Terraform gains a new, small, security-relevant responsibility (resolving the real secret and computing/writing its hash) that should carry the same elevated-review discipline CODE_REVIEW_CHECKLIST.md already applies to comparable narrow-privilege surfaces elsewhere in this project.
**Security implications:** The KVS stores a salted hash, never the raw credential; a KVS compromise alone does not disclose the credential.
**Reversibility:** High — moving to Lambda@Edge or the GitHub-OAuth model later replaces only the function/KVS pair, not the S3 origin, OAC, or the rest of the distribution.
**Status:** Proposed — pending Architecture Gate approval of E3's design, not self-approved.

---

## ADR index

| ID      | Title                                                                         | Status   |
| ------- | ----------------------------------------------------------------------------- | -------- |
| ADR-001 | Turborepo + pnpm monorepo                                                     | Accepted |
| ADR-002 | Modular monolith + targeted microservices                                     | Accepted |
| ADR-003 | REST over GraphQL                                                             | Accepted |
| ADR-004 | pgvector for MVP vector search                                                | Accepted |
| ADR-005 | Postgres RLS for tenant isolation                                             | Accepted |
| ADR-006 | AI Gateway pattern                                                            | Accepted |
| ADR-007 | Single Orchestrator + tool-calling agent handoff                              | Accepted |
| ADR-008 | RAG grounding required for factual AI output                                  | Accepted |
| ADR-009 | ECS Fargate over Kubernetes                                                   | Accepted |
| ADR-010 | Domain events over point-to-point queues                                      | Accepted |
| ADR-011 | Mandatory MFA for privileged roles                                            | Accepted |
| ADR-012 | Platform-level AI cost circuit breaker                                        | Accepted |
| ADR-013 | Family plan descoped from MVP                                                 | Accepted |
| ADR-014 | Split test runner: Jest (NestJS) / Vitest (elsewhere)                         | Accepted |
| ADR-015 | Dependency-boundary enforcement via ESLint                                    | Accepted |
| ADR-016 | Observability stack: OTel + CloudWatch + X-Ray (ADOT) + Sentry + local Jaeger | Accepted |
| ADR-017 | Container supply chain: Syft + Trivy + cosign + GitHub attestation            | Accepted |
| ADR-018 | JWT Bearer access token + rotating refresh token, `jti` denylist              | Accepted |
| ADR-019 | TOTP as mandatory MFA mechanism for privileged roles                          | Accepted |
| ADR-020 | OAuth provider set at MVP: Google + Apple only                                | Accepted |
| ADR-021 | Two-person approval for `ADMIN` role grants/revocations                       | Accepted |
| ADR-022 | Narrow `BYPASSRLS` service role for cross-tenant operations                   | Accepted |
| ADR-023 | Privileged-column protection: `REVOKE`/`GRANT` + `SECURITY DEFINER`           | Accepted |
| ADR-024 | Flutter design-token export: build-only, never-committed artifact             | Proposed |
| ADR-025 | `lucide-react` as the v1 icon library                                         | Proposed |
| ADR-026 | Storybook access control: CloudFront Function + KeyValueStore                 | Proposed |

New ADRs are appended, never renumbered or rewritten in place.
