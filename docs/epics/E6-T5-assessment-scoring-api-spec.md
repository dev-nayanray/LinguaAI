# API Spec: `AssessmentScoringController` (E6 T5, ADR-033's pattern applied to Writing-skill scoring)

Copy of [API_SPEC_TEMPLATE.md](../API_SPEC_TEMPLATE.md), filled for the `apps/api` ↔ `ai-engine` internal contract E6 T4/T5 build. One endpoint, matching E5 T10's own "internal contract, own spec instance" precedent — [E5-T10-agent-sessions-api-spec.md](E5-T10-agent-sessions-api-spec.md) is the direct precedent this doc mirrors.

**Feature spec:** docs/epics/E6-ai-language-assessment-engine.md §6.3/§9 (T4, T5)
**Author:** AI Engineering (this task)
**API Gate reviewer:** Not yet independently reviewed — this task's own implementation is the input to that gate, not a substitute for it, matching E5 T10's own precedent for this exact line.

## 1. Endpoint

|                          |                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Method                   | `POST`                                                                                                                                                                                  |
| Path                     | `/v1/assessment-scoring/writing`                                                                                                                                                        |
| Auth required            | No — `ai-engine` has no auth mechanism of its own; internal-network-only, `apps/api`'s own already-authenticated request is the trust boundary (ADR-033), same as T10's three endpoints |
| Idempotency-Key required | No — not applied here, the same honestly-flagged gap T10's own spec (§4 below cross-references) already carries for its `.../messages` endpoint; a real gap, not closed by this task    |
| Rate limit class         | N/A (internal service-to-service call, not directly reachable by an end-user client) — same as T10's three endpoints                                                                    |

## 2. Request

```json
// POST /v1/assessment-scoring/writing
{
  "languageId": "uuid",
  "targetLanguageName": "Spanish",
  "prompt": "Describe your ideal vacation.",
  "learnerResponse": "string, 1-10000 chars"
}
```

**Validation:** `@linguaai/validation/ai-coaching` — `scoreWritingRequestSchema` (new, this task). Same schema is both the wire contract and `AssessmentScoringService.scoreWritingResponse()`'s own input type — no separate internal DTO, matching `startAgentSessionRequestSchema`'s own "one schema, both sides" precedent (T10).

## 3. Response

```json
// 200 OK
{
  "cefrLevel": "A1 | A2 | B1 | B2 | C1 | C2",
  "confidence": 0.72,
  "feedback": "string — sanitized (SafetyLayerService.sanitizeOutput()) before this leaves ai-engine"
}
```

**Schema:** `@linguaai/validation/ai-coaching`'s `writingCritiqueSchema` (E6 T4) — reused as-is for the wire response, not a separate response schema.

**Pagination:** N/A — a single scoring result, not a collection.

## 4. Error responses

| HTTP status | `error.code`       | When                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400         | `VALIDATION_ERROR` | Request body fails its Zod schema (e.g. empty `learnerResponse`, `learnerResponse` over 10000 chars, `languageId` not a UUID)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 500         | `INTERNAL_ERROR`   | The model's response was not valid JSON (after markdown-fence stripping), or failed `writingCritiqueSchema` validation — a real, honestly-scoped gap (the same class T10's own spec §4 already flags for its own 500s): these are really "upstream returned something unusable," closer in spirit to 502, but `AssessmentScoringService` throws a plain `Error`, which `GlobalExceptionFilter` maps to the generic 500/`INTERNAL_ERROR` rather than a more specific code — not closed by this task, flagged here rather than silently left ambiguous. Any unhandled provider/database error also lands here. |

## 5. Tenant/ownership scoping

`AssessmentItem`/`AssessmentAttempt`/`AssessmentResponse` are not tenant-scoped tables (E4 §3.3, E6 T1's own header comment — no RLS policy, no `organizationId` column). This endpoint itself touches no database table at all (`AssessmentScoringService` is a pure RAG+Router+Safety composition, no Prisma dependency) — ownership of the underlying attempt is enforced entirely by `apps/api`'s own `AssessmentService` (404 on mismatch, E6 T2) before any future caller of this endpoint would ever reach it; `ai-engine` performs no ownership check of its own, by design, matching every other `services/*` internal integration in this repo (same as T10's own §5).

## 6. BFF/aggregation classification

Neither — a single-purpose scoring endpoint, not a dashboard aggregation.

## 7. Versioning impact

Additive — first version of this internal contract, no prior version to break.

## 8. WebSocket variant

Not applicable — a one-shot request/response, not a stream (unlike T10's `.../messages` endpoint, which genuinely needed SSE for token-by-token delivery). No real-time framing needed here.

## 9. API Gate checklist

- [x] Follows resource naming & verb conventions (API_GUIDELINES.md §1–2) — `/v1/assessment-scoring/writing`, a verb-noun sub-resource per §1's non-CRUD-action convention, same pattern T10's own `:id/end` uses
- [x] Error codes come from the registry, no new code invented (§4 above)
- [x] Tenant/ownership scoping defined — not tenant-scoped, no data access at all in this service; ownership enforced by the caller (§5)
- [x] OpenAPI spec generates correctly from `@nestjs/swagger` decorators — verified via a real `npx tsc --noEmit`/build pass, matching T10's own verification method
- [ ] Reviewed by someone other than the author — not yet independently reviewed (see header)

**Real finding, not yet closed (carried from E6 T4, RISK_REGISTER R-88):** no real LLM/embedding provider credentials exist in this environment — this endpoint's happy path is verified via 10 unit tests (mocked `RouterService`/`RagRetrievalService`, real `SafetyLayerService`, matching E5's own established convention) and 2 client-side tests (mocked `fetch`), but never against a live model call. A live end-to-end verification (a real request through both `apps/api`'s client and `ai-engine`'s controller, hitting a real model) remains open until real credentials are available.

**Not yet wired into the attempt lifecycle, flagged not silently absorbed:** `AssessmentService` (`apps/api`) does not call `AiEngineClientService.scoreWriting()` yet — adding `WRITING` back into the skill-serving order (`AdaptiveItemSelectionService`'s `SKILL_ORDER`, ADR-038) and folding its AI-determined CEFR level into `completeAttempt`'s `proficiencyLevels` list is E6 T6/T7's own scope, per this task's own dependency list (T2, T4 — not T3's banding logic, which full integration would also need).

**API Gate:** ☐ Not yet passed — implementation complete and self-verified (tests, typecheck, lint, build all passing); an independent reviewer sign-off is still owed, per this repo's standing "no gate is self-approved by its own implementer" rule.
