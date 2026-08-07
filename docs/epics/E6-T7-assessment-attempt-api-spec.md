# API Spec: `AssessmentController` (E6 T7 — the full assessment-attempt session contract)

Copy of [API_SPEC_TEMPLATE.md](../API_SPEC_TEMPLATE.md), filled for the `apps/api`-facing REST contract a frontend uses to run a full placement/re-assessment session: start → serve next item → submit response → complete. One file covering an endpoint _group_ (the template's own "per endpoint or endpoint group" option), matching how these three routes already live on a single `AssessmentController` — not three independent contracts. Every route already existed and was real/functional as of T2 (start/submit/complete lifecycle) and T6 (re-assessment/retake-offer additions); this document is T7's own evidence-bar deliverable (a formal spec instance), and the point at which the WRITING skill was actually wired into the live session — see §2/§3 below.

**Feature spec:** docs/epics/E6-ai-language-assessment-engine.md §1/§6/§9 (T2, T3, T5, T6, T7)
**Author:** AI/Backend Engineering (this task)
**API Gate reviewer:** Not yet independently reviewed — this task's own implementation is the input to that gate, not a substitute for it, matching every other E6 API spec's own precedent for this line.

## 1. Endpoints

| Method | Path                                    | Auth required                                                                          | Idempotency-Key required                                                                                                                                                                                    | Rate limit class                                       |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `POST` | `/v1/assessment-attempts`               | Yes — any authenticated user (`AuthGuard('jwt')`), no role restriction                 | No — a real, pre-existing, repo-wide gap (RISK_REGISTER R-85): `startAttempt` mitigates the specific double-attempt hazard via the concurrent-attempt 409 (T6), not via true idempotency-key infrastructure | Standard                                               |
| `POST` | `/v1/assessment-attempts/:id/responses` | Yes, same as above; ownership enforced by hand (404 on mismatch, no RLS on this table) | No — same gap; mitigated by the duplicate-submission 409 (per-item, not per-request)                                                                                                                        | Standard (AI-invoking only for WRITING items — see §4) |
| `POST` | `/v1/assessment-attempts/:id/complete`  | Yes, same as above                                                                     | No — mitigated by this endpoint's own idempotent re-completion (returns the same result on retry rather than erroring, T2)                                                                                  | Standard                                               |

## 2. Request

```json
// POST /v1/assessment-attempts
{
  "languageId": "uuid",
  "type": "PLACEMENT | REASSESSMENT" // defaults to PLACEMENT
}
```

**Validation:** `@linguaai/validation/learning` — `startAssessmentAttemptRequestSchema` (T2).

```json
// POST /v1/assessment-attempts/:id/responses
// `response`'s shape is keyed by the *item's own* itemType, looked up
// server-side — never a client-supplied discriminant (scoring-integrity
// discipline, T2's own doc comment on this schema).
{
  "itemId": "uuid",
  "response": { "selectedIndex": 1 }        // MULTIPLE_CHOICE / FILL_IN_BLANK's numeric variant
  // or
  "response": { "text": "string, 1-5000 chars" }  // FILL_IN_BLANK's text variant, or WRITING (OPEN_RESPONSE, E6-T7)
}
```

**Validation:** `@linguaai/validation/learning` — `submitAssessmentResponseRequestSchema` / `submitAssessmentResponseValueSchema` (T2 — the `{ text }` union member existed from T2 itself, unused by any real serving path until this task wired WRITING in).

```json
// POST /v1/assessment-attempts/:id/complete
// no request body
```

## 3. Response

```json
// 201 Created — POST /v1/assessment-attempts
{
  "attempt": {
    "id": "uuid",
    "userId": "uuid",
    "languageId": "uuid",
    "type": "PLACEMENT",
    "status": "IN_PROGRESS",
    "startedAt": "ISO-8601",
    "completedAt": null
  },
  "nextItem": {
    "id": "uuid",
    "skill": "READING",
    "cefrLevel": "B1",
    "difficulty": 0.5,
    "prompt": "string",
    "audioUrl": null,
    "itemType": "MULTIPLE_CHOICE | FILL_IN_BLANK | OPEN_RESPONSE"
    // correctAnswer is never included — a client-visible answer key would
    // defeat the assessment entirely (T2's own scoring-integrity bar)
  }
}
```

```json
// 201 Created — POST /v1/assessment-attempts/:id/responses
{
  "response": {
    "id": "uuid",
    "isCorrect": true, // null for WRITING (OPEN_RESPONSE) — "correct/incorrect" has no meaning for an open-ended essay (E6-T7)
    "score": 1 // 0/1 for objective items; the AI critique's own 0-1 confidence for WRITING (E6-T7)
  },
  "nextItem": {/* same shape as above, or null once every skill has stopped */},
  "attemptStatus": "IN_PROGRESS"
}
```

```json
// 200 OK — POST /v1/assessment-attempts/:id/complete
{
  "attempt": { "...": "as above, status: COMPLETED, completedAt set" },
  "responses": [
    {
      "id": "uuid",
      "attemptId": "uuid",
      "itemId": "uuid",
      "skill": "WRITING",
      "prompt": "string",
      // For WRITING: the AI's own cefrLevel/feedback are persisted inside
      // this same JSON blob alongside the learner's own submitted text
      // (E6-T7 — no dedicated AssessmentResponse columns exist for them,
      // a real, flagged design choice, not an oversight — §5.1 below).
      "response": { "text": "string", "aiCefrLevel": "B2", "aiFeedback": "string" },
      "isCorrect": null,
      "score": 0.8,
      "createdAt": "ISO-8601"
    }
  ],
  "proficiencyLevels": [
    { "skill": "READING", "cefrLevel": "C2", "confidence": 0.6, "lowConfidence": false }
    // one entry per skill that was actually served this attempt — READING/
    // LISTENING/VOCABULARY/GRAMMAR always appear (content is assumed to
    // exist for every language); WRITING only appears if a WRITING item
    // existed and was served (most languages have none yet, T1's own
    // seed-content scope) — a real, deliberate asymmetry, see §5.1
  ],
  "retakeRecommended": false
}
```

**Schemas:** `@linguaai/validation/learning` — `startAssessmentAttemptResponseSchema` (T2), `submitAssessmentResponseResponseSchema` (T2), `completeAssessmentAttemptResponseSchema` (T3's `proficiencyLevels`, T6's `retakeRecommended`).

**Pagination:** N/A — a single attempt/item/result at a time, never a collection.

## 4. Error responses

| HTTP status | `error.code`                    | When                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400         | `VALIDATION_ERROR`              | Request body fails its Zod schema (e.g. missing `languageId`, `response` matching neither union member)                                                                                                                                                                                                                                                                                                                                                     |
| 401         | (Nest's own auth failure shape) | No/invalid Bearer token                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 404         | `NOT_FOUND`                     | Unknown `languageId` (start); attempt doesn't exist or isn't the caller's own (responses/complete, 404 not 403 — API_GUIDELINES.md §3, no RLS on this table so ownership is checked by hand); submitted `itemId` doesn't exist / isn't active / belongs to another language                                                                                                                                                                                 |
| 409         | `CONFLICT`                      | A second attempt started while one is already `IN_PROGRESS` for the same user+language (T6); the submitted item isn't the currently-active one (out-of-order submission); the item was already answered this attempt (duplicate submission); attempt already `COMPLETED`/not `IN_PROGRESS`; `complete` called while a skill still has items left to serve                                                                                                   |
| 422         | `SEMANTIC_VALIDATION_ERROR`     | No assessment items exist yet for this language (start); a `REASSESSMENT` start with no prior `COMPLETED` attempt for this language (T6); a WRITING (OPEN_RESPONSE) item submitted with a `{ selectedIndex }` response instead of `{ text }` (E6-T7)                                                                                                                                                                                                        |
| 500         | `INTERNAL_ERROR`                | WRITING scoring only (E6-T7): `ai-engine`'s `/v1/assessment-scoring/writing` call fails or returns an unusable result — `AiEngineClientService.scoreWriting()` throws a plain `Error`, mapped to the generic 500 by `GlobalExceptionFilter`, the same honestly-flagged "closer to 502 in spirit" gap [E6-T5-assessment-scoring-api-spec.md](E6-T5-assessment-scoring-api-spec.md) §4 already carries for the upstream call itself — not closed by this task |

## 5. Tenant/ownership scoping

`AssessmentAttempt`/`AssessmentItem`/`AssessmentResponse` carry no RLS policy (`assessment.prisma`'s own header comment, confirmed by direct inspection, T1). Ownership ("is this the caller's own attempt") is enforced entirely by hand in `AssessmentService.getOwnedAttempt` (404 on mismatch) — the same discipline `OrganizationsService.assertCallerManagesOrg` established for its own unpoliced tables. `APP_PRISMA_CLIENT` (an ordinary `app_role` connection) is used throughout, never `SERVICE_ROLE_PRISMA_CLIENT` — nothing in this controller touches a Part-9C-style privileged column.

### 5.1 Real design decision, flagged not silently made: WRITING has no dedicated `AssessmentResponse` columns

`AssessmentResponse`'s schema (T1) has only `isCorrect: Boolean?`/`score: Float?` — built for the 4 objective skills' answer-key model, with no column for an AI-returned `cefrLevel` or free-text `feedback`. Adding one was **not** part of this task's own scope (a schema change is its own DATABASE_CHANGE_TEMPLATE.md-gated decision, §6.1 of the epic doc never named it) — instead, `scoreWritingItem` persists the AI critique's `cefrLevel`/`feedback` inside the same `response` JSON blob the learner's own submitted text already occupies (`{ text, aiCefrLevel, aiFeedback }`), and `score` reuses the critique's own `confidence` (0-1, not a 0/1 correctness flag). `computeProficiencyResults` reads this back out on every (idempotent) `complete` call. This is a real, load-bearing choice, not an oversight — flagged here so a future schema change (dedicated columns) is a deliberate migration, not a silent discovery.

A second, equally deliberate choice: a WRITING `proficiencyLevels` entry is **omitted**, not defaulted to a low-confidence A1, when no WRITING item was ever served. Most languages have zero seeded WRITING items today (T1's own scope, real future content-authoring work) — defaulting would misrepresent "never assessed" as "assessed and scored poorly," and would spuriously force `retakeRecommended: true` on every one of those attempts for a content gap that has nothing to do with the learner. See `computeWritingBanding`'s own doc comment (`cefr-banding.util.ts`) for the full reasoning.

## 6. BFF/aggregation classification

Standard resource endpoints — no dashboard-style aggregation across multiple domains.

## 7. Versioning impact

Additive only. T7 added no new endpoint and no breaking field change — `SKILL_ORDER` gaining `WRITING` and `submitResponse`'s new OPEN_RESPONSE branch are internal to `AssessmentService`; the wire schemas (`assessmentItemPublicViewSchema.itemType`, `submitAssessmentResponseValueSchema`'s `{ text }` union member) already supported this shape since T2, unused by any real serving path until now.

## 8. WebSocket variant

N/A — request/response only, no real-time flow.

## 9. API Gate checklist

- [x] Follows resource naming & verb conventions (API_GUIDELINES.md §1–2) — `assessment-attempts` collection, `:id/responses`/`:id/complete` sub-resource actions, matching `organizations`'s own precedent
- [x] Error codes come from the registry, no new code introduced (§4 above)
- [x] Tenant/ownership scoping defined — hand-enforced, no RLS applicable (§5)
- [x] OpenAPI spec generates correctly from `@nestjs/swagger` decorators (`@ApiTags`/`@ApiBearerAuth`/`@ApiOperation` on every route, matching this repo's own established, minimal-but-consistent decorator convention — no controller anywhere in `apps/api` uses `@ApiResponse`/`@ApiParam`/`@ApiBody`, confirmed by direct repo-wide search; Zod-validated bodies aren't reflected into per-field Swagger schemas, a real, pre-existing, repo-wide gap not closed by this task)
- [ ] Reviewed by someone other than the author

**API Gate:** ☐ Passed — [reviewer, date]
