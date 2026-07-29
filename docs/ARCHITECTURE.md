# LinguaAI — System Architecture

Status: **v1.1 — Consolidated baseline** · Owner: Principal Architect · Last updated: 2026-07-29

Supersedes Draft v1.0. See [BASELINE.md](BASELINE.md) for the current authoritative summary and [DECISIONS.md](DECISIONS.md) for ADRs referenced below. Deep-dive companions to this document: [EVENT_ARCHITECTURE.md](EVENT_ARCHITECTURE.md), [MULTITENANCY.md](MULTITENANCY.md), [API_GUIDELINES.md](API_GUIDELINES.md), [OBSERVABILITY.md](OBSERVABILITY.md), [PERFORMANCE.md](PERFORMANCE.md) — this document stays at the system-design level and links out rather than duplicating their detail.

## 1. Architectural principles

1. **Modular monolith core, microservices at the edges.** The core product domain (identity, courses, progress, gamification, subscriptions) lives in one NestJS API (`apps/api`) organized into strictly bounded modules. Only capabilities that need independent scaling, isolation, or a different runtime become standalone services (`services/*`). This avoids premature distributed-systems tax while keeping true hot spots (AI inference, speech) independently scalable.
2. **AI is a gateway, not a dependency scattered through the codebase.** Every LLM/STT/TTS call goes through `services/ai-engine`'s internal AI gateway. No app or module calls a model provider's SDK directly. This is what makes provider swaps, cost control, prompt versioning, and safety filtering possible platform-wide (see AI_SYSTEM.md).
3. **Contracts before code.** Shared types (`packages/types`) and Zod schemas (`packages/validation`) are the contract between frontend, backend, and services. The API is documented with OpenAPI generated from the same source of truth (see API.md).
4. **Design for millions of users from day one, build for thousands at launch.** Horizontal scalability, stateless services, and async processing are architectural defaults — not something we bolt on later — but we do not over-provision infrastructure for load that doesn't exist yet (see §7 Scaling Strategy).
5. **Every write path considers the read path.** Learning progress, gamification state, and analytics events are high write-volume; the schema and eventing strategy are designed around read patterns (dashboard, leaderboards, admin reports) from the start.

## 2. System context

```
                         ┌─────────────────────────────────────────────┐
                         │                   Clients                    │
                         │  Web (Next.js)  Mobile (Flutter)  Admin (Next)│
                         └───────────────────────┬───────────────────────┘
                                                  │ HTTPS / WSS
                                        ┌─────────▼─────────┐
                                        │   API Gateway /     │
                                        │   Load Balancer      │
                                        │   (AWS ALB + WAF)     │
                                        └─────────┬─────────┘
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          │                       │                       │
                 ┌────────▼────────┐    ┌─────────▼─────────┐   ┌─────────▼────────┐
                 │  apps/api         │    │  services/*         │   │  apps/admin (BFF)  │
                 │  NestJS modular    │    │  ai-engine           │   │  reuses apps/api   │
                 │  monolith (core     │◄──►  speech-service       │   │  with admin scopes │
                 │  domain)            │    │  recommendation-eng. │   └────────────────────┘
                 └────────┬────────┘    │  notification-service│
                          │              │  analytics-service    │
                          │              └─────────┬─────────┘
             ┌────────────┼────────────┐            │
             │            │            │            │
     ┌───────▼──┐  ┌──────▼─────┐ ┌───▼────┐  ┌─────▼──────┐
     │ PostgreSQL │  │ Redis        │ │ BullMQ  │  │ Vector DB   │
     │ (primary)   │  │ (cache/sess.)│ │ (queues)│  │ (pgvector /  │
     │             │  │              │ │         │  │  Pinecone)   │
     └────────────┘  └──────────────┘ └────────┘  └────────────┘
                                                  │
                                       ┌──────────▼──────────┐
                                       │  External providers   │
                                       │  LLM APIs, STT/TTS,     │
                                       │  OCR, Stripe, Email,     │
                                       │  Push (FCM/APNs)          │
                                       └──────────────────────┘
```

## 2.1 Domain boundary map

The Architecture Review Gate found that services were described by *infrastructure* rationale (§4 below) without a *bounded-context* map, risking domain logic bleeding across module lines as `apps/api` accumulates 20+ modules. Six bounded contexts own the domain, independent of which app/service happens to host their code:

| Bounded context | Owns | Primarily hosted in |
|---|---|---|
| Identity | Users, auth, roles, organizations, consent (module 1) | `apps/api` |
| Learning | Assessment, curriculum, courses, vocabulary, gamification (modules 2–3, 5–6, 15) | `apps/api`, `recommendation-engine` |
| AI Coaching | Agents, conversation, speech, memory, RAG (modules 4, 7–14, 29) | `ai-engine`, `speech-service` |
| Commerce | Subscriptions, billing, entitlements (module 22) | `apps/api` |
| Community | Friends, groups, discussions, moderation (module 16) | `apps/api` |
| Enterprise | Organizations, LMS, reporting, marketplace (modules 18, 20) | `apps/api`, `apps/admin` |

**Explicit service-boundary rule (resolves the `recommendation-engine`/`ai-engine` ambiguity flagged in review):** `recommendation-engine` owns deterministic/algorithmic decisions — SRS scheduling, next-best-activity ranking, weakness-detection scoring — content that does not require a generative model call. `ai-engine` owns any decision that requires generating novel content or reasoning via an LLM. A feature that needs both (e.g., "explain why this lesson was recommended") calls `recommendation-engine` for the decision and `ai-engine` to generate the explanation — the two are never allowed to duplicate the same decision logic.

A NestJS module inside `apps/api` may only depend on another module through its exported service (CODING_STANDARDS.md §2); cross-bounded-context calls additionally go through the domain-event catalog (EVENT_ARCHITECTURE.md) where the interaction is a reaction to something happening, not a synchronous read. This boundary is enforced by a dependency-graph lint introduced in Epic E1 (ROADMAP.md) — a violation fails CI, not just code review.

**Extraction-readiness criteria:** a module is a candidate to extract from `apps/api` into its own service only when at least one is true: sustained write QPS contends with core OLTP paths, it needs a different runtime/language, or its failure blast radius must be isolated from the rest of the platform. This is a data-driven trigger, not a standing roadmap item — reviewed alongside RISK_REGISTER.md R-10.

## 3. Applications (`apps/`)

| App | Purpose | Notes |
|---|---|---|
| `web` | Primary consumer product (marketing + app) | Next.js 16 App Router, SSR for marketing/SEO pages, CSR for authenticated app shell |
| `api` | Core domain API — identity, courses, progress, gamification, subscriptions, community | NestJS, modular monolith, REST (see API.md), internal event emitter feeding BullMQ |
| `admin` | Internal admin platform (module 24) | Next.js, calls `apps/api` with admin-scoped tokens; separate deploy for blast-radius isolation |
| `mobile` | iOS/Android consumer app | Flutter, calls the same `apps/api` and `services/*` contracts as web |

## 4. Services (`services/`)

Each service is independently deployable, independently scalable, and owns its own runtime lifecycle. They communicate with `apps/api` via internal REST/gRPC and with each other via the BullMQ queue for async work.

| Service | Responsibility | Why it's separate |
|---|---|---|
| `ai-engine` | AI gateway: routes to LLM providers, manages prompts, agent orchestration, AI memory, model selection/fallback, cost metering | Distinct scaling curve (bursty, GPU/inference-bound), the single choke point for provider swaps and safety controls (see AI_SYSTEM.md) |
| `speech-service` | STT and TTS orchestration, audio streaming, pronunciation/phoneme scoring | Needs low-latency streaming infra distinct from request/response REST; may run on different compute (audio codecs, WebRTC) |
| `recommendation-engine` | Adaptive curriculum decisions, weakness detection, spaced-repetition scheduling, next-best-activity | Computationally distinct (batch + real-time scoring), evolves independently from core CRUD domain |
| `notification-service` | Email, push, in-app notification delivery and preference enforcement | High fan-out, benefits from independent queue/worker scaling and provider isolation |
| `analytics-service` | Event ingestion, aggregation, and the analytics pipeline feeding module 23 | Write-heavy, append-only workload; isolating it protects the core DB from analytics query load |

Services are only created when they meet at least one of: independent scaling need, runtime/language isolation, or blast-radius isolation. Everything else is a NestJS module inside `apps/api`.

## 5. Shared packages (`packages/`)

| Package | Contents |
|---|---|
| `ui` | Design-system components (Shadcn-based), tokens, icons — see DESIGN_SYSTEM.md. Consumed by `web`, `admin`, and (via Flutter design tokens export) referenced by `mobile`. |
| `database` | Prisma schema, migrations, seed scripts, generated client — single source of schema truth (see DATABASE.md) |
| `types` | Shared TypeScript types/interfaces, subpathed by bounded context (`@linguaai/types/identity`, `/courses`, `/billing`, …) per CODING_STANDARDS.md §1 — not a single flat export surface |
| `validation` | Zod schemas shared by frontend forms and backend request validation, mirroring the same subpath structure as `types` — one definition, two enforcement points |
| `config` | Typed environment/config loading, shared constants (CEFR levels, supported languages, plan definitions) |
| `utils` | Pure, framework-agnostic utilities (date/timezone handling for streaks, string/locale helpers) |

## 6. Data flow examples

### Speaking practice session (real-time)
1. Client opens a WebSocket to `apps/api`, which authenticates and hands off session control to `services/speech-service` via an internal token.
2. Client streams audio chunks → `speech-service` → STT provider → partial transcript streamed back to client for live captioning.
3. Final transcript → `ai-engine` (Conversation Partner agent, loaded with the user's AI memory) → response text.
4. Response text → `speech-service` → TTS → audio stream back to client.
5. On session end, `ai-engine` writes session summary + extracted vocabulary to Postgres and the vector store (AI memory); `analytics-service` receives a session-completed event via BullMQ.

### Daily curriculum generation (async/batch)
1. Nightly job (BullMQ, scheduled) in `recommendation-engine` reads each active user's recent progress and weakness signals from Postgres.
2. Produces/updates the next day's personalized lesson plan, written back to Postgres.
3. `notification-service` picks up a "plan ready" event to optionally send a reminder push, respecting user notification preferences.

### Subscription upgrade
1. Client calls `apps/api` to create a Stripe Checkout session.
2. Stripe webhook → `apps/api` webhook handler → validates signature → updates subscription/entitlement state in Postgres → emits event to BullMQ.
3. `analytics-service` and `notification-service` (receipt email) consume the event asynchronously; entitlement is available to the API synchronously on the same request that updated it (no read-your-write lag for paywall gating).

### Admin/mobile dashboard aggregation (BFF pattern)
Rather than composing a dashboard from multiple client-side round-trips, `apps/api` and `apps/admin` expose dedicated, explicitly-named aggregation endpoints (`GET /v1/admin/dashboard-summary`) that assemble the response server-side — resolves the over-/under-fetching risk the Architecture Review identified for dashboard-heavy views. Full convention in API_GUIDELINES.md §8. This is a thin BFF layer scoped to read aggregation only, not a GraphQL migration.

## 7. Scaling strategy

- **Stateless app tier**: `apps/api`, `apps/web`, `apps/admin`, and all `services/*` are stateless and horizontally scaled behind the ALB/API gateway; session state lives in Redis, not process memory.
- **Database**: PostgreSQL with read replicas introduced when read load (dashboards, leaderboards, admin reports) contends with write-heavy learning-progress paths; connection pooling via PgBouncer from day one to avoid a late migration. Partitioning candidates identified early: `learning_events`/analytics-style append-only tables (see DATABASE.md).
- **Multi-tenancy**: Enterprise data is isolated via Postgres Row-Level Security in addition to application-layer scoping (ADR-005) — full design in MULTITENANCY.md. This is the authoritative enforcement mechanism, not an aspiration.
- **Caching**: Redis for session state, hot leaderboard data, and frequently-read reference data (course/lesson content, language metadata). Cache invalidation is explicit and tied to the `content.published` domain event (EVENT_ARCHITECTURE.md), not TTL-only, for anything user-facing as "current."
- **Queues & background processing**: BullMQ/Redis for direct job dispatch (e.g., "send this email now"); the domain-event catalog (EVENT_ARCHITECTURE.md) rides the same Redis infrastructure for "something happened, react if you care" fan-out (notifications, gamification, analytics all reacting to `learning.lesson.completed` independently, without the producer knowing who's listening) — this is what replaced the point-to-point queue coupling flagged in the Architecture Review (ADR-010). Scheduled/cron jobs (nightly curriculum generation, leaderboard recomputation) use BullMQ's repeatable-job feature. Failed jobs retry with exponential backoff, then dead-letter (EVENT_ARCHITECTURE.md §5).
- **AI inference**: the highest-variance cost and latency component. `ai-engine` implements model tiering (cheaper/faster models for high-volume tasks like grammar checks, frontier models for open-ended tutoring conversation), response streaming, and per-user/per-tier rate limiting, plus a platform-level cost circuit breaker (ADR-012). See AI_SYSTEM.md §8, AI_GOVERNANCE.md §5.
- **CDN & static assets**: course media (audio, images, generated story content) served via CloudFront in front of S3; Next.js static assets and marketing pages edge-cached.
- **Multi-region**: not required at MVP; the architecture avoids region-specific assumptions (UTC timestamps, i18n-first schema) so a later multi-region expansion is additive, not a rewrite. See DEPLOYMENT.md.

## 7.1 Failure recovery & graceful degradation

Every external dependency has a defined behavior when it's unavailable — silently hanging or a raw 500 is never the fallback:

| Dependency down | Degrade behavior |
|---|---|
| Primary LLM provider | `ai-engine` fails over to a secondary provider for the same request class (AI_GOVERNANCE.md §7) |
| STT/TTS provider | Speaking session degrades to text-only rather than failing entirely (PRD.md Journey C) |
| Stripe | Checkout shows a clear retry state; existing entitlements are never revoked due to a transient webhook delivery failure (reconciliation job catches missed webhooks) |
| Redis (cache) | Reads fall through to Postgres at higher latency rather than erroring; rate limiting fails closed (denies) rather than open, per SECURITY.md |
| A downstream `services/*` call from `apps/api` | Circuit breaker (standard trip/half-open/reset pattern) prevents a struggling service from cascading failure into `apps/api`'s own availability |

Retry policy is exponential backoff with jitter, bounded attempt counts, and idempotency-key-aware (API_GUIDELINES.md §6) so retries are never duplicative side effects.

## 8. Cross-cutting concerns

- **Observability**: full standard in [OBSERVABILITY.md](OBSERVABILITY.md) — structured logging, distributed tracing (OpenTelemetry), error tracking (Sentry), SLOs, and alerting are wired into `apps/api` and every `services/*` from their first commit, not retrofitted.
- **Feature flags**: used to gate paywall triggers, new AI agent rollouts, and experimental modules without a deploy.
- **Internationalization**: all user-facing strings are externalized from the start; UI locale and target-learning-language are distinct concepts modeled separately in the schema (PRD.md §5.1).
- **API versioning & implementation conventions**: see [API_GUIDELINES.md](API_GUIDELINES.md) — breaking changes are versioned, never silently deployed against existing clients (critical once `mobile` ships and can't force-update instantly).
- **Performance budgets**: see [PERFORMANCE.md](PERFORMANCE.md) — the single canonical source for every latency/throughput number referenced elsewhere in this document.

## 9. Explicitly deferred architectural decisions

Tracked here so they are visible, not silently skipped (see also RISK_REGISTER.md for the risk-framed view of the same items):
- Vector DB provider at scale (pgvector vs. managed Pinecone/Weaviate) — start on pgvector, revisit at defined query-volume/latency thresholds (ADR-004).
- Multi-region active-active — deferred until Enterprise-phase demand or latency data justifies it; `Organization.dataRegion` is schema-reserved (MULTITENANCY.md §5) so this is additive when it happens.
- Public developer API gateway (module 27) — deferred to post-MVP; internal contracts (API_GUIDELINES.md) are designed to not preclude it later.
- Kubernetes/EKS migration — deferred unless a specific workload (e.g., self-hosted GPU inference) requires it beyond ECS Fargate's capability (ADR-009).
