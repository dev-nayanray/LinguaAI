# API Spec: `AgentSessionsController` (E5 T10, ADR-033)

Copy of [API_SPEC_TEMPLATE.md](../API_SPEC_TEMPLATE.md), filled for the `apps/api` ↔ `ai-engine` internal contract this epic's own §3.2/§6.3 named as a real, previously-undocumented gap. Covers all three endpoints as one group (they share auth model, error registry, and versioning story) rather than three separate instances, per IMPLEMENTATION_GUIDE.md's own "sized to the change" guidance.

**Feature spec:** docs/epics/E5-ai-gateway-agent-orchestration-core.md §6.3/§9 (T10)
**Author:** AI Engineering (this task)
**API Gate reviewer:** Not yet independently reviewed — this task's own implementation is the input to that gate, not a substitute for it, matching E5 T8's own precedent for this exact line.

## 1. Endpoints

| Method | Path                              | Auth required                                                                                                                                            | Idempotency-Key required                                                                                                      | Rate limit class                                                                     |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST` | `/v1/agent-sessions`              | No — `ai-engine` has no auth mechanism of its own; internal-network-only, `apps/api`'s own already-authenticated request is the trust boundary (ADR-033) | No — creating a session is not a retried-on-flaky-connection action in the same sense a payment is                            | N/A (internal service-to-service call, not directly reachable by an end-user client) |
| `POST` | `/v1/agent-sessions/:id/messages` | Same as above                                                                                                                                            | No — a retried "send message" would create a duplicate `AIMessage`/model call; not addressed by this task, flagged below (§4) | Same as above                                                                        |
| `POST` | `/v1/agent-sessions/:id/end`      | Same as above                                                                                                                                            | No — ending an already-ended session is naturally idempotent (Prisma update by id)                                            | Same as above                                                                        |

## 2. Request

```json
// POST /v1/agent-sessions
{
  "userId": "uuid",
  "languageId": "uuid",
  "orchestratorAgent": "PERSONAL_LANGUAGE_TEACHER | CONVERSATION_PARTNER | VOCABULARY_COACH | WRITING_COACH | EXAM_COACH"
}
```

```json
// POST /v1/agent-sessions/:id/messages
{
  "userMessage": "string, 1-8000 chars",
  "variables": { "targetLanguageName": "Spanish" } // optional, defaults to {}
}
```

`POST /v1/agent-sessions/:id/end` — no request body.

**Validation:** `@linguaai/validation/ai-coaching` — `startAgentSessionRequestSchema`, `sendAgentMessageRequestSchema` (new, this task).

## 3. Response

```json
// POST /v1/agent-sessions — 201 Created
{ "sessionId": "uuid" }
```

```
// POST /v1/agent-sessions/:id/messages — 200 OK, Content-Type: text/event-stream
data: {"type":"token","delta":"Hel"}

data: {"type":"token","delta":"lo!"}

data: {"type":"done","assistantMessage":"Hello!","promptVersion":"v1","modelId":"claude-sonnet-5"}

```

`POST /v1/agent-sessions/:id/end` — `204 No Content`.

**Pagination:** N/A — none of these three endpoints return a collection.

**SSE wire format:** API_GUIDELINES.md §13 (new section, this task) — one JSON value per `data: ...\n\n` line, discriminated on `type` (`token` | `done` | `error`), no named SSE `event:` fields. Schema: `@linguaai/validation/ai-coaching`'s `agentMessageStreamEventSchema`.

## 4. Error responses

| HTTP status | `error.code`       | When                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400         | `VALIDATION_ERROR` | Request body fails its Zod schema (e.g. empty `userMessage`, invalid `orchestratorAgent`)                                                                                                                                                                                                                                                                                                                                                                                                  |
| 500         | `INTERNAL_ERROR`   | Session not found (`findUniqueOrThrow` throws — a real, honestly-scoped gap: this currently surfaces as a generic 500, not a `NOT_FOUND` 404; closing this would mean catching Prisma's specific "record not found" error code and is flagged here as unclosed by this task, not silently left ambiguous), circuit breaker HARD_STOP (ADR-034; the message names the reason, but the status code is the generic 500 — the same honestly-scoped gap), any unhandled provider/database error |

For `POST /v1/agent-sessions/:id/messages` specifically: an error occurring **after** the first SSE event has been written cannot change the HTTP status (already sent as 200) — it is instead an `{ "type": "error", "message": "..." }` event within the stream (API_GUIDELINES.md §13), not a row in this table.

**Idempotency gap, honestly flagged:** a retried `POST .../messages` on a flaky connection would create a second `AIMessage`/incur a second real model-call cost — API_GUIDELINES.md §6's `Idempotency-Key` mechanism is not applied here. Not closed by this task; a real gap for whichever task first builds a user-facing client against this endpoint to close (RISK_REGISTER.md, new row this task adds).

## 5. Tenant/ownership scoping

`AIAgentSession`/`AIMessage` are not tenant-scoped tables (E4 §3.3, confirmed — no RLS policy, no `organizationId` column, ai.prisma's own header comment). `userId` ownership is enforced by `apps/api`'s own auth layer before it ever calls this internal contract (the `userId` `ai-engine` receives is caller-supplied, trusted per ADR-033's security-implications note) — `ai-engine` itself performs no ownership check of its own, by design, matching every other `services/*` internal integration in this repo.

## 6. BFF/aggregation classification

Neither — three standard resource-lifecycle endpoints (create, act, end) on `AIAgentSession`, not a dashboard aggregation.

## 7. Versioning impact

Additive — first version of this internal contract, no prior version to break.

## 8. WebSocket variant

Not applicable — ADR-033 explicitly chose SSE over WebSocket for this one-directional stream (§6.3/§8 of the epic design doc); see API_GUIDELINES.md §13 for the real SSE convention this task adds, alongside §9's existing WebSocket catalog for genuinely bidirectional flows.

## 9. API Gate checklist

- [x] Follows resource naming & verb conventions (API_GUIDELINES.md §1–2) — `/v1/agent-sessions`, `:id/end` as a verb-noun sub-resource per §1's non-CRUD-action convention
- [x] Error codes come from the registry, no new code invented (§4 above)
- [x] Tenant/ownership scoping defined — not tenant-scoped, ownership enforced by the caller (§5)
- [x] OpenAPI spec generates correctly from `@nestjs/swagger` decorators — verified via a real `npx tsc --noEmit`/build pass; `/v1/docs` is published outside production, matching `apps/api`'s own convention
- [ ] Reviewed by someone other than the author — not yet independently reviewed (see header)

**API Gate:** ☐ Not yet passed — implementation complete and self-verified (tests, typecheck, lint, build all passing); an independent reviewer sign-off is still owed, per this repo's standing "no gate is self-approved by its own implementer" rule.
