# LinguaAI — API Standards

Status: **v1.1 — Consolidated baseline** · Owner: Principal Architect · Last updated: 2026-07-29

Supersedes Draft v1.0. This document states platform-level API *policy*. For the exhaustive implementation reference (error code registry, pagination detail, idempotency, BFF conventions, WebSocket message catalog) engineers use while building an endpoint, see **[API_GUIDELINES.md](API_GUIDELINES.md)** — that detail is intentionally not duplicated here.

## 1. Style & transport

- **REST over HTTPS** for standard CRUD and command endpoints, JSON payloads (`application/json`). GraphQL is not adopted — REST + strongly shared TypeScript types (`packages/types`) gives us contract safety without the added query-complexity surface.
- **WebSocket (WSS)** for real-time flows only: live speaking sessions, live conversation streaming, real-time leaderboard/notification pushes. Namespaced separately from REST (`/realtime/...`).
- **Internal service-to-service calls** (`apps/api` ↔ `services/*`) use REST/JSON over the internal network with service-auth tokens; gRPC is adopted only if/when a specific internal path proves latency-sensitive enough to justify it.
- Base URL structure: `https://api.linguaai.app/v{n}/...`. Admin-scoped endpoints live under the same API with role-gated access, not a separate host, to keep one contract surface.

## 2. Versioning

- URI-based major versioning (`/v1/...`). A new major version is introduced only for breaking changes; additive changes (new optional fields, new endpoints) ship without a version bump.
- A deprecated version stays live for a **minimum of 2 major-version cycles or 6 months, whichever is longer** (API_GUIDELINES.md §10), published in release notes — mobile clients cannot force-update instantly, so breaking a live version without notice is not acceptable (see ARCHITECTURE.md §8).
- Deprecated endpoints return a `Deprecation` and `Sunset` header before removal.

## 3. Authentication & authorization

- **Access**: short-lived JWT (see `.env.example` `JWT_ACCESS_TTL`) in the `Authorization: Bearer` header.
- **Refresh**: long-lived refresh token, httpOnly secure cookie for web, secure storage for mobile; refresh endpoint rotates the token and supports server-side revocation via the `RefreshToken` table (see DATABASE.md).
- **Authorization**: role-based (`USER | TEACHER | ADMIN | ENTERPRISE_ADMIN`) enforced via NestJS guards at the controller level, plus resource-level ownership checks (a `USER` can only mutate their own progress; an `ENTERPRISE_ADMIN` is scoped to their `Organization`).
- **Service-to-service**: signed internal tokens, distinct from user-facing JWTs, scoped per calling service.

## 4. Request/response conventions

- Request and response bodies are validated against Zod schemas from `packages/validation` on both the NestJS pipe layer and (for forms) the frontend — one schema, enforced twice.
- **Envelope**: successful responses return the resource directly (no unnecessary wrapper) for single-resource endpoints; collection endpoints return `{ data: T[], meta: { page, pageSize, total } }`.
- **Pagination**: cursor-based for high-volume/real-time-adjacent lists (leaderboards, activity feeds); offset-based (`page`/`pageSize`) acceptable for bounded admin lists.
- **Errors**: a consistent problem shape —
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Human-readable summary",
      "details": [{ "field": "email", "issue": "Invalid email format" }],
      "requestId": "req_01hxyz..."
    }
  }
  ```
  `code` is a stable machine-readable enum — full registry in API_GUIDELINES.md §3 — never a raw stack trace or provider error leaked to the client (SECURITY.md information-disclosure discipline). `requestId` ties the response to server-side logs/traces (OBSERVABILITY.md) for support and debugging.
- **HTTP status codes** are used correctly and consistently: `400` validation, `401` unauthenticated, `403` unauthorized, `404` not found, `409` conflict, `422` semantic validation failure, `429` rate limited, `5xx` server error. Client code and tests rely on status codes, not string-matching error messages.
- **Idempotency**: mutating endpoints that may be retried by clients on poor mobile networks (e.g., exercise submission, subscription creation) accept an `Idempotency-Key` header (API_GUIDELINES.md §6).
- **Dashboard aggregation (BFF)**: admin/mobile dashboard views use dedicated, explicitly-named aggregation endpoints rather than client-composed multi-call fetching (ARCHITECTURE.md §6, API_GUIDELINES.md §8).

## 5. Documentation

- OpenAPI 3.1 spec generated directly from NestJS decorators (`@nestjs/swagger`) — the spec is generated from code, not hand-maintained separately, so it cannot drift from the implementation.
- Published at `/v1/docs` in non-production environments; production exposes the generated spec file to internal tooling only (module 27 public API docs are a future, separate deliverable).
- Every endpoint documents: purpose, auth requirement, request/response schema, and error codes it can return.

## 6. Rate limiting & abuse prevention

- Per-user and per-IP rate limits enforced via a **Redis-backed distributed limiter** (see `.env.example` `RATE_LIMIT_*`) — required given the stateless, horizontally-scaled app tier (ARCHITECTURE.md §7); a per-instance in-memory limiter would be silently bypassable across instances. Stricter limits apply to unauthenticated and AI-invoking endpoints.
- AI-invoking endpoints (conversation, assessment, writing feedback) additionally enforce plan-based usage entitlements (see DATABASE.md `Entitlement`), returning a distinct `429`-with-`code: USAGE_LIMIT_EXCEEDED` so clients can render an upgrade prompt rather than a generic rate-limit error.

## 7. Real-time API conventions (WebSocket)

- Connections authenticate via the same access JWT, passed at handshake.
- Message envelope: `{ type: string, payload: object, sessionId: string, ts: number }`.
- Server acknowledges receipt of client audio/message chunks and streams partial results (e.g., partial transcripts, streaming AI tokens) rather than waiting for full completion — required for the perceived-latency budget in AI_SYSTEM.md.
- Reconnection is client-driven with session resumption by `sessionId` within a defined grace window, so a dropped connection mid-conversation doesn't lose context.

## 8. Webhooks (inbound)

- Stripe (billing events), and future third-party providers, are received on dedicated endpoints (`/v1/webhooks/stripe`) that verify provider signatures before processing, are idempotent (safe to receive the same event twice), and enqueue processing onto BullMQ rather than doing heavy work synchronously in the webhook handler.

## 9. Explicitly deferred

- Public, externally-consumable developer API (module 27) — the conventions above are designed to not preclude it, but authentication (API keys/OAuth for third parties), quota tiers, and a public developer portal are out of scope until that phase (see ROADMAP.md).
- gRPC for internal service calls — adopted only if a measured latency need justifies the added tooling cost.
