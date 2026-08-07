# API Spec: `LearningPlansController` / `DailyGoalsController` (E7 T5 — the `recommendation-engine` read contract)

Copy of [API_SPEC_TEMPLATE.md](../API_SPEC_TEMPLATE.md), filled for the `apps/api`-facing REST contract a frontend dashboard uses to read the caller's own precomputed `LearningPlan`/`DailyGoal` rows — Journey A step 4 ("Day 1 lesson plan already generated") and Journey B ("dashboard showing today's goal"). One file covering an endpoint _group_ across two controllers within one module (the template's own "per endpoint or endpoint group" option, matching E6-T7's own precedent) — `RecommendationsModule` names them as one bounded-context unit even though they're two distinct resources.

**Feature spec:** docs/epics/E7-personalized-learning-engine.md §1/§6.6/§9 (T2, T3, T5)
**Author:** AI/Backend Engineering (this task)
**API Gate reviewer:** Not yet independently reviewed — this task's own implementation is the input to that gate, not a substitute for it, matching every other E7/E6 API spec's own precedent for this line.

## 1. Endpoints

| Method | Path                         | Auth required                                                          | Idempotency-Key required                  | Rate limit class |
| ------ | ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | ---------------- |
| `GET`  | `/v1/learning-plans/current` | Yes — any authenticated user (`AuthGuard('jwt')`), no role restriction | N/A — a pure read, no idempotency concern | Standard         |
| `GET`  | `/v1/daily-goals/today`      | Yes, same as above                                                     | N/A — a pure read                         | Standard         |

Both are pure reads against `recommendation-engine`'s own precomputed rows (E7 T2/T3's own generation jobs) — no live computation on the request path, satisfying the epic's own `<2s p95` dashboard-load budget (§2) by construction, not by optimization. `recommendation-engine` itself has no public HTTP surface to a frontend (ADR-033's internal-only trust model) — `apps/api` reads the shared `LearningPlan`/`DailyGoal` tables directly via `APP_PRISMA_CLIENT`, the same "read the shared table, don't call the owning service over HTTP" pattern `AssessmentService` already established.

## 2. Request

```
// GET /v1/learning-plans/current?languageId=<uuid, optional>
```

**Validation:** `@linguaai/validation/learning` — `currentLearningPlanQuerySchema` (new, this task). `languageId` is optional — see §5.1 for why.

```
// GET /v1/daily-goals/today
// no query params — "today" is resolved server-side from the caller's own User.timezone
```

## 3. Response

```json
// 200 OK — GET /v1/learning-plans/current
{
  "id": "uuid",
  "userId": "uuid",
  "languageId": "uuid",
  "goal": "string",
  "targetDate": "ISO-8601 | null",
  "milestones": {
    "...": "producer-defined JSON — generatedFromAttemptId, weakSkills, etc., E7 T2/T3's own concern"
  },
  "isActive": true,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

```json
// 200 OK — GET /v1/daily-goals/today
{
  "id": "uuid",
  "userId": "uuid",
  "learningPlanId": "uuid | null",
  "date": "YYYY-MM-DD",
  "targetXp": 50,
  "targetMinutes": 15,
  "targetActivities": 3,
  "completed": false,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

**Schemas:** `@linguaai/validation/learning` — `learningPlanResponseSchema` / `dailyGoalResponseSchema` (new, this task), each drift-guarded against a canonical `@linguaai/types/learning` interface (`LearningPlan`/`DailyGoal`, also new this task) the same way `assessmentAttemptSchema` is guarded against `AssessmentAttempt`.

**Pagination:** N/A — a single row at a time, never a collection (the caller's own "current"/"today", not a list).

## 4. Error responses

| HTTP status | `error.code`                    | When                                                                                                                                                                                                                                                      |
| ----------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400         | `VALIDATION_ERROR`              | `?languageId` given but not a valid UUID                                                                                                                                                                                                                  |
| 401         | (Nest's own auth failure shape) | No/invalid Bearer token                                                                                                                                                                                                                                   |
| 404         | `NOT_FOUND`                     | `.../current`: caller has no active `LearningPlan` (e.g. before any assessment has ever completed, or for the given `?languageId`, or the caller's own `User` row can't be resolved (`.../today` only, a defensive check, never expected on a live token) |

No `409`/`422` — these are pure reads with no state transition or semantic-validity concern.

## 5. Tenant/ownership scoping

`LearningPlan`/`DailyGoal` carry no RLS policy (`assessment.prisma`'s own header comment, same as `AssessmentAttempt`/`AssessmentItem`). Ownership is enforced by hand — every query is scoped to `caller.userId` (`LearningPlansService.getCurrent`/`DailyGoalsService.getToday`), the same discipline `AssessmentService.getOwnedAttempt` established. `APP_PRISMA_CLIENT` (an ordinary `app_role` connection) is used throughout, never `SERVICE_ROLE_PRISMA_CLIENT`.

### 5.1 Real design gap found and resolved, not silently left underspecified: `LearningPlan` has no "one active plan per user" constraint

The epic design doc's own §6.6 text names a single "current" `LearningPlan` without addressing multi-language learners — but `LearningPlan`'s schema has no uniqueness constraint scoping "one active plan per user," only `@@index([userId, languageId])`, and `UserProfile.targetLanguages` (identity.prisma) is a real string array, so a genuinely multi-language learner can have more than one active plan simultaneously. Resolved here: `?languageId` is an optional filter — given, it resolves that language's own active plan (404 if none); omitted, it falls back to the caller's most-recently-updated active plan across every language, a documented default for the common single-target-language case. Verified by a real e2e test (`recommendations.e2e-spec.ts`) covering all three shapes: single-language caller, explicit `?languageId` for each of two languages, and the no-param fallback.

### 5.2 Real design decision, resolved per the epic doc's own named open question: timezone-correct "today"

§6.6's own text names this explicitly as "this task's own concrete design decision to make, not resolved here." Resolved by reusing the exact mechanism `DailyGoalService.generateForPlan()` (E7 T3) already writes rows with: `toLocalCalendarDate(now, user.timezone)` computes the caller's own local calendar date, then looks up the `(userId, date)` row that date's own generation run would have upserted. The same function on both the write and read path means "today" can never disagree between them the way two independently-implemented timezone calculations could — verified by a real e2e test using a non-UTC timezone (`America/Los_Angeles`) at a real UTC instant where the local calendar date differs from the UTC one.

## 6. BFF/aggregation classification

Standard resource endpoints — no dashboard-style aggregation across multiple domains (a future dashboard-aggregation endpoint combining these with e.g. streak/XP data is out of this task's own scope, §3.6 of the epic doc).

## 7. Versioning impact

New endpoints, additive only — no existing contract changed.

## 8. WebSocket variant

N/A — request/response only, no real-time flow.

## 9. API Gate checklist

- [x] Follows resource naming & verb conventions (API_GUIDELINES.md §1–2) — `learning-plans`/`daily-goals` collections, `current`/`today` sub-resource reads, matching `assessment-attempts`'s own precedent
- [x] Error codes come from the registry, no new code introduced (§4 above)
- [x] Tenant/ownership scoping defined — hand-enforced, no RLS applicable (§5); a real scoping gap (§5.1) and a real named open design decision (§5.2) both found and resolved, not silently left underspecified
- [x] OpenAPI spec generates correctly from `@nestjs/swagger` decorators (`@ApiTags`/`@ApiBearerAuth`/`@ApiOperation` on every route, matching this repo's own established, minimal-but-consistent decorator convention)
- [ ] Reviewed by someone other than the author

**API Gate:** ☐ Passed — [reviewer, date]
