# LinguaAI — API Guidelines (Implementation Reference)

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-07-29

[API.md](API.md) states platform-level API *policy* (style, versioning philosophy, auth model). This document is the **exhaustive implementation reference** engineers use while building an endpoint — conventions here must never be duplicated back into API.md; API.md links here for detail instead.

## 1. Resource naming & routing

- Plural nouns for collections: `/v1/courses`, `/v1/users/:id/vocabulary`.
- Nested resources reflect true ownership only (max 2 levels deep) — `/v1/users/:id/subscriptions`, not `/v1/users/:id/courses/:courseId/lessons/:lessonId/exercises/:exerciseId/attempts` (flatten deep chains: `/v1/exercise-attempts?exerciseId=...`).
- Actions that aren't pure CRUD are modeled as a sub-resource verb-noun, not a verb on the URL: `POST /v1/assessment-attempts/:id/submit`, not `POST /v1/assessment-attempts/:id/doSubmit`.

## 2. HTTP verb usage

| Verb | Usage |
|---|---|
| `GET` | Read, never mutates, always safe to retry/cache |
| `POST` | Create, or a non-idempotent action (requires `Idempotency-Key` — see §6) |
| `PUT` | Full resource replace (rare — most updates are partial) |
| `PATCH` | Partial update |
| `DELETE` | Soft-delete by default (DATABASE.md soft-delete policy); hard-delete only where the entity's policy specifies it |

## 3. Error code registry (extends API.md §4 envelope)

Machine-readable `error.code` values. New codes are added here, never invented ad hoc per endpoint.

| Code | HTTP status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/query failed Zod schema validation |
| `AUTH_REQUIRED` | 401 | Missing/invalid/expired access token |
| `FORBIDDEN` | 403 | Authenticated but not authorized for this resource (role or ownership check failed) |
| `NOT_FOUND` | 404 | Resource doesn't exist or isn't visible to this caller (tenant-scoped 404, not 403, to avoid leaking existence — SECURITY.md) |
| `CONFLICT` | 409 | State conflict (e.g., duplicate email on registration) |
| `SEMANTIC_VALIDATION_ERROR` | 422 | Well-formed but business-rule-invalid (e.g., exam date in the past) |
| `RATE_LIMITED` | 429 | Generic rate limit exceeded |
| `USAGE_LIMIT_EXCEEDED` | 429 | Plan entitlement exhausted (AI_SYSTEM.md cost controls) — client renders an upgrade prompt, not a generic retry |
| `INTERNAL_ERROR` | 500 | Unhandled server error — client shows the generic fallback (CODING_STANDARDS.md §5) |
| `UPSTREAM_UNAVAILABLE` | 502/503 | A dependency (AI provider, speech provider, Stripe) is down — see ARCHITECTURE.md failure-recovery table for the per-dependency degrade behavior |

## 4. Pagination

- **Cursor-based** (`?cursor=...&limit=...`, response includes `nextCursor`) for leaderboards, activity feeds, any list that changes while being paged.
- **Offset-based** (`?page=&pageSize=`) acceptable only for bounded, rarely-changing admin lists (e.g., `Language` catalog).
- Default `limit`/`pageSize` is 20; hard server-side max is 100 regardless of client request, to bound response size and cost.

## 5. Request/response conventions

- Single-resource endpoints return the resource directly; collections return `{ data: T[], meta: {...} }` (API.md §4).
- Timestamps are always ISO 8601 UTC; the client applies user timezone/locale formatting — the API never returns pre-localized dates (a hard requirement given streak-day logic depends on unambiguous UTC storage, ARCHITECTURE.md §7).
- Money values are integer minor units (cents), never floats, paired with an explicit ISO 4217 currency code field.

## 6. Idempotency

- Any `POST` that a client might retry on a flaky mobile connection (exercise submission, subscription creation, payment-adjacent actions) accepts an `Idempotency-Key` header (a client-generated UUID).
- Server stores the key with the response for a defined window (24h) and replays the stored response on a duplicate key rather than re-executing the action.

## 7. Rate limiting implementation

- Enforced via a **Redis-backed distributed limiter** (not per-instance in-memory) — required given the stateless, horizontally-scaled app tier (ARCHITECTURE.md §7); an in-memory limiter would be silently bypassable across instances.
- Limits are keyed by `(userId or IP, endpoint class)`; AI-invoking endpoints have a distinct, stricter class from standard CRUD.

## 8. BFF / aggregation endpoints

- Admin and mobile dashboard views that would otherwise require multiple round-trips get a dedicated aggregation endpoint (`GET /v1/admin/dashboard-summary`, not five separate calls composed client-side) — resolves the over-fetching risk identified in the Architecture Review (ARCHITECTURE.md §6).
- Aggregation endpoints are explicitly named and documented as such (not disguised as a "normal" resource endpoint) so their different caching/versioning behavior is visible to consumers.

## 9. WebSocket message catalog conventions

- Envelope: `{ type: string, payload: object, sessionId: string, ts: number }` (API.md §7).
- `type` values are namespaced by domain: `speech.partial-transcript`, `speech.final-transcript`, `ai.token`, `ai.done`, `ai.error`.
- Every client-sent chunk gets a server acknowledgment (`{ type: "ack", forSeq: n }`) so the client can detect and resend on a dropped ack within a defined timeout.
- Reconnection: client resumes by `sessionId` within a 60-second grace window; beyond that, the session is considered ended and a new one must be created.

## 10. Versioning & deprecation

- Breaking changes require a new major version path (`/v2/...`). A deprecated version stays live for a **minimum of 2 major-version cycles or 6 months, whichever is longer**, with `Deprecation`/`Sunset` response headers from the day deprecation is announced.
- Additive changes (new optional field, new endpoint) never bump the version.

## 11. OpenAPI generation

- Generated exclusively from `@nestjs/swagger` decorators on controllers/DTOs — hand-written OpenAPI YAML is never merged, since it immediately drifts from the implementation (API.md §5).
