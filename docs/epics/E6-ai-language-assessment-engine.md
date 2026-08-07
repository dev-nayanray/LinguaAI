# Epic E6 — AI Language Assessment Engine

**Epic ID:** E6 (ROADMAP.md)
**Status:** In design
**Tech lead:** AI/Backend Engineering (TBD)
**Gate owners assigned:** Architecture, Security, Database, API, AI, Performance, Testing, Documentation (Frontend/Accessibility/Deployment gates apply to the later feature epic that builds the actual assessment UI, not this backend-engine epic — see §3.6)

## 0. Why this document exists now, and what it is not

E5 (AI Gateway & Agent Orchestration Core) is implementation-complete (T1–T12, 2026-08-07). Per ROADMAP.md, E6 is the next epic whose dependencies (E4, E5) are both satisfied. This is the **first, single-pass design** for the AI Language Assessment Engine (PRD.md module 2) — following the same process E4 and E5 both went through (CLAUDE.md's own workflow rule: "Architecture and planning precede feature development... do not scaffold or implement application features until the corresponding module has an approved design"). This document does not write any application code; it designs the module, surfaces real gaps found while doing so (§3), and proposes the ADRs implementation will need (§7). Once a direction accepts this document (explicitly, or by the same "proceed by direct instruction" pattern E4/E5's own status lines record), implementation follows IMPLEMENTATION_GUIDE.md's 20-phase lifecycle per task, exactly as E4/E5 did.

## 1. Epic Definition

The AI Language Assessment Engine runs the adaptive placement test (and user-initiated re-assessment) that produces a per-skill CEFR level with a confidence score — PRD.md Journey A, step 2–3. It is the first real application logic against the `Assessment & learning plan` schema E4 T3 already built (schema-only; DATABASE.md §2.2 names E6/E7 as the epics that build the logic on top of it).

**In scope:**

- Adaptive item selection and session lifecycle for a placement/re-assessment attempt, across the 4 objectively-scoreable skills (Reading, Listening, Vocabulary, Grammar) and 1 AI-scored open-ended skill (Writing).
- Deterministic scoring for the 4 objective skills; AI-scored, RAG-grounded scoring for Writing via a new `ai-engine` capability.
- CEFR banding (raw score → A1–C2) and confidence computation.
- Writing `ProficiencyLevel` (current) and `ProficiencyLevelHistory` (trend) per PRD.md §5.1's outcome-analytics requirement.
- Emitting `assessment.attempt.completed` (already cataloged, EVENT_ARCHITECTURE.md) for `recommendation-engine`/`analytics-service` to react to.
- A new, curated **assessment item bank** (§3.1 — a real gap found, not previously scoped by any doc).
- The low-confidence-result fallback flow (PRD.md §5.1) and user-initiated re-assessment (PRD.md §5.1).
- The `apps/api` REST contract a future frontend epic consumes to actually run a session.

**Explicitly out of scope** (cited against ROADMAP.md/PRD.md's own classification, not silently absorbed):

- **Speaking skill scoring** — PRD.md Journey A conditionally includes it ("if microphone access is granted"); real scoring needs `speech-service` (STT at minimum), which is E10's own scope and remains an unbuilt skeleton, and E10 is not a listed E6 dependency (ROADMAP.md). §3.2 resolves this: the `SPEAKING` skill enum value and every schema/API shape stay structurally ready, but no live Speaking assessment ships in this epic. A future epic (E10, or a follow-up once E10 exists) closes this for real.
- **The admin-facing item-authoring UI** — this epic builds the real, curated item bank as seed content plus the schema/service layer to read it (§3.1); an authorable admin UI for content teams to manage it without a deploy is Course Management System's own pattern (module 5, E8) and PRD.md itself only requires "content authorable by non-engineers" for module 5, not module 2.
- **The Day-1 lesson plan / `LearningPlan`/`DailyGoal` generation** that PRD.md Journey A step 4 describes immediately after assessment — those tables live in the same `assessment.prisma` file but are PRD module 3 (Personalized Learning Engine, E7)'s own scope; this epic only emits the completion event E7 reacts to.
- **Exam-specific mock tests and rubric grounding** (IELTS/TOEFL/etc.) — PRD.md Journey E / module 19, ADR-008's own blocking-dependency framing names E19 (Exam Preparation System) as the owner, not this epic. This epic's own CEFR-descriptor grounding (§6.3) is a distinct, narrower knowledge-base slice.
- **Automatic, trigger-based re-assessment** — PRD.md §5.1 explicitly places this at Version 1.1; only user-initiated re-assessment is MVP.

**Depends on:** E4 (Database Schema & Core Data Layer — `assessment.prisma`'s schema already exists), E5 (AI Gateway & Agent Orchestration Core — `RouterService`/`RagRetrievalService`/`SafetyLayerService`, all real and reusable per §6).

## 2. Business Objective

PRD.md §3's stated MVP goal: "Deliver an AI placement assessment that produces an accurate, explainable proficiency level (CEFR-aligned: A1–C2) in under 15 minutes." PRD.md Journey A is the concrete flow; PRD.md §8's named success metrics include "Assessment completion rate ≥ 70%" and "CEFR-level progression rate" (which requires this epic's own `ProficiencyLevelHistory` writes to be real and correct — the metric is unmeasurable without them).

**Success looks like:**

- A placement attempt completes in ≤15 minutes (PRD.md Journey A acceptance criterion) for the 4-objective-skill + Writing scope this epic ships.
- Every completed attempt produces a per-skill CEFR level with a confidence score, and a plain-language explanation before the user leaves onboarding (deferred to the frontend epic that consumes this contract, but the _data_ this epic returns must support it).
- A low-confidence result never presents as definitive (PRD.md §5.1) — the API contract structurally distinguishes "confident" from "needs retake" results.
- `ProficiencyLevelHistory` gets a real row on every attempt completion and every re-assessment, immediately making the CEFR-progression-rate metric measurable for the first time.

## 3. Scoping boundary and conflicts found

### 3.1 No assessment item bank exists — a real, load-bearing gap

`AssessmentResponse.prompt` (assessment.prisma) is a free-text `String` with no relation to any reusable bank of pre-authored items. `content.prisma`'s `Exercise` model is structurally unusable for a placement test: `Exercise.activityId` is a required (non-nullable) relation to `Activity`, which only exists inside an authored `Course > Level > Unit > Lesson > Activity` hierarchy — a placement assessment runs _during onboarding_, before the user (or the system) has selected any course at all. Confirmed by direct inspection of both schema files, not assumed. Without a real item bank with known (skill, CEFR level, difficulty) metadata to select from, "adaptive testing" is not a buildable claim — PRD.md's own "reproducible scoring" acceptance bar (module 2) is unsatisfiable without it (no fixed item pool means no two placement runs are comparable). **Resolved here:** §6.1/§7 (new ADR) design a real, curated `AssessmentItem` model — closely analogous to `KnowledgeBaseEntry`'s own curated-content pattern (E4 T5) — seeded with a real, if intentionally small, item set per language/skill/CEFR-band, not authored through an admin UI (out of scope, §1).

### 3.2 Speaking assessment's real dependency on an epic that doesn't exist yet

PRD.md Journey A step 2 names Speaking as part of the placement flow ("if microphone access is granted"), and `assessment.prisma`'s `Skill` enum already includes `SPEAKING`. But scoring a spoken response needs, at minimum, a real transcript (STT) — `speech-service` (E10)'s own scope, and E10 remains a 3-file skeleton with zero real code (confirmed by direct inspection, mirroring `ai-engine`'s own pre-E5 state). ROADMAP.md does not list E10 as an E6 dependency. **Resolved here:** this epic ships Reading/Listening/Vocabulary/Grammar/Writing for real; `SPEAKING` stays a structurally-valid enum value and every schema/API shape accepts it without special-casing, but no task in §9 builds live Speaking scoring. This is the same "conditional in the PRD's own wording, real infra gap, explicitly deferred" pattern the PRD text itself already signals, not a silent scope cut.

### 3.3 `recommendation-engine` vs `apps/api` for the adaptive item-selection algorithm

ARCHITECTURE.md §2.1's bounded-context table places "Assessment" (module 2) under the Learning context, "primarily hosted in `apps/api`, `recommendation-engine`" — but EVENT_ARCHITECTURE.md's own already-cataloged `assessment.attempt.completed` row names `apps/api` (Assessment module) as the _producer_, with `recommendation-engine` only as a _consumer_ of the completion event. `recommendation-engine` remains an unclaimed, empty E1 skeleton (confirmed by direct inspection — 3 files, no domain code), and E6 does not list it as a ROADMAP dependency. Per ARCHITECTURE.md §2.1's own service-boundary rule ("`recommendation-engine` owns deterministic/algorithmic decisions... not require a generative model call"), the adaptive item-selection algorithm (§6.2 — a deterministic, non-generative decision) _could_ legitimately live in either place. **Resolved here, flagged as an interpretation, not silently picked:** it lives inside `apps/api`'s own new Assessment module for this epic, matching what EVENT_ARCHITECTURE.md's catalog already implies and avoiding building out a second, entirely-empty service's first real code inside an epic that doesn't otherwise need to — `recommendation-engine`'s own real build-out is E7 (Personalized Learning Engine)'s more natural first claim, matching that epic's own PRD module 3 "adaptive curriculum" charter. If a future Architecture Gate review disagrees, the algorithm is a self-contained service class with no `apps/api`-specific dependency (§6.2), so relocating it is low-cost, the same "designed to be relocatable" precedent ADR-035 already used for the partition-maintenance job.

### 3.4 CEFR banding has no defined algorithm or threshold table anywhere

No document (PRD.md, ARCHITECTURE.md, DATABASE.md) specifies how a raw per-skill score maps to a CEFR level (A1–C2) or how "confidence" is computed. This is a genuinely open pedagogical question (RISK_REGISTER.md R-05, "AI assessment's CEFR-alignment isn't valid against real proficiency," already tracks the deeper validity question) — but a _mechanism_ is still needed to ship anything at all. **Resolved here:** §6.4 proposes a real, working, explicitly-provisional threshold table (percentage-correct bands, weighted for item difficulty) and a confidence formula (response count + score consistency), with the same "conservative placeholder, not a claim of pedagogical validity" honesty this whole platform's other provisional parameters already carry (ADR-034's cost thresholds, T4's rolling-summary trigger count). A real psychometric validation pass (human-rater correlation, PRD.md §9) remains RISK_REGISTER R-05's own open item, not resolved by this epic.

### 3.5 Reusable AI Coaching infrastructure this epic builds directly on, not duplicates

E5 already built exactly the mechanisms Writing-skill scoring needs: `RouterService` (real provider calls, T1), `RagRetrievalService` (real grounding retrieval against curated `KnowledgeBaseEntry` content including the `CEFR_DESCRIPTOR` category, T7), `SafetyLayerService` (input/output boundary handling, T8), `CostMeterService`/`CircuitBreakerService` (T9), and the `apps/api` ↔ `ai-engine` REST contract pattern (`AgentSessionsController`/`AiEngineClientService`, ADR-033, T10). This epic does not rebuild any of these — it adds one new, narrow `ai-engine` capability (§6.3) that composes them, and one new `apps/api`-side client method following T10's own established pattern exactly.

### 3.6 This epic is backend/engine only, not the assessment-taking UI

Matching E5's own precedent (a backend/gateway epic, not a UI epic), this document designs the data model, scoring logic, and API contract — not `apps/web`'s actual assessment-taking screens. A future feature epic (plausibly bundled with E7, or its own small epic) owns the Frontend/Accessibility gates for the real UI; this epic's own Gate sign-off log (§12) marks those N/A here, not silently skipped.

## 4. Bounded context & ownership

Per ARCHITECTURE.md §2.1: this epic is the **Learning** bounded context's assessment slice, hosted in `apps/api` (session lifecycle, objective scoring, adaptive selection, ProficiencyLevel writes) with one narrow, real dependency on the **AI Coaching** context (`ai-engine`) for Writing-skill scoring specifically — the exact "a feature that needs both" case ARCHITECTURE.md §2.1 already describes ("calls `recommendation-engine`/`apps/api` for the decision and `ai-engine` to generate/score the open-ended content"). The two contexts are never allowed to duplicate scoring logic: objective-skill answer-key matching lives only in `apps/api`; Writing scoring's actual judgment lives only in `ai-engine`, called through, never reimplemented locally.

## 5. Component-by-component design summary

| Component                         | What T-tasks (§9) actually build                                                                 | Real gap closed (§3) |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------- |
| Assessment item bank              | New `AssessmentItem` model + migration; seed content per language/skill/CEFR-band                | §3.1                 |
| Session lifecycle                 | `apps/api` `AssessmentModule` — start/submit-response/complete an `AssessmentAttempt`            | —                    |
| Adaptive item selection           | Deterministic algorithm choosing the next item from a running per-skill ability estimate         | §3.3                 |
| Objective scoring                 | Deterministic answer-key matching for Reading/Listening/Vocabulary/Grammar                       | —                    |
| AI-scored Writing                 | New `ai-engine` capability: RAG-grounded (CEFR descriptors), schema-validated structured scoring | §3.5                 |
| CEFR banding & confidence         | A real, provisional threshold table + confidence formula                                         | §3.4                 |
| `ProficiencyLevel`/History writes | Current-state + append-only trend, per completed attempt                                         | —                    |
| Event emission                    | `assessment.attempt.completed` (already cataloged)                                               | —                    |
| API contract                      | REST endpoints for a frontend to run a session, OpenAPI-documented                               | —                    |
| Evaluation                        | A golden-set-style scoring regression suite for the new AI-scoring capability                    | —                    |

## 6. Cross-cutting mechanics

### 6.1 `AssessmentItem` — the new item bank model

A new model in `assessment.prisma`, mirroring `KnowledgeBaseEntry`'s own curated-content shape (versioned, sign-off metadata) rather than `Exercise`'s course-bound shape:

```
model AssessmentItem {
  id            String    @id @default(uuid()) @db.Uuid
  languageId    String    @db.Uuid
  skill         Skill
  cefrLevel     CefrLevel
  /// Relative difficulty within its own (skill, cefrLevel) band — the adaptive algorithm's own selection input, distinct from cefrLevel itself (two items can target the same CEFR band at different difficulty).
  difficulty    Float
  prompt        String
  /// Structured, never raw HTML — same discipline as Exercise.correctAnswer/AssessmentResponse.response.
  correctAnswer Json?     // null for Writing-skill items — scored by ai-engine, not an answer key
  itemType      AssessmentItemType
  isActive      Boolean   @default(true)
  linguistSignOffBy String?
  linguistSignOffAt DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  language  Language              @relation(fields: [languageId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  responses AssessmentResponse[]

  @@index([languageId, skill, cefrLevel, isActive])
  @@map("AssessmentItem")
}

enum AssessmentItemType {
  MULTIPLE_CHOICE
  FILL_IN_BLANK
  OPEN_RESPONSE   // Writing-skill items
}
```

`AssessmentResponse` gains a nullable `itemId` (nullable so a historical response created before this epic, if any dev/test data exists, isn't orphaned — none does in production, since this is greenfield application logic on an existing empty table, but nullable is the correct, low-risk default regardless). Seed content: a real, small, linguist-reviewed set (target ~10–15 items per skill per CEFR band per launch language) — genuinely curated content, not synthetic placeholder text, matching `KnowledgeBaseEntry`'s own seeding discipline (T7 seeded 5 real rows for verification, not more, since exhaustive content authoring is explicitly out of this epic's scope, §1).

### 6.2 Adaptive item-selection algorithm

A simplified, deterministic difficulty-stepping algorithm (not a full IRT/computerized-adaptive-testing implementation — flagged as provisional, §3.4's same honesty class): start each skill at a middle CEFR band (B1), select the item within that band closest to the running per-skill difficulty target that hasn't yet been served this attempt; on a correct response, step the target up one difficulty tier (within-band, or to the next CEFR band at the top of the current one); on an incorrect response, step down. Each skill stops after a fixed item count (provisional: 5 items/skill for the 4 objective skills, 1 item for Writing) or when the running estimate stabilizes (two consecutive responses in the same band) — whichever comes first, bounding total attempt length toward the 15-minute budget. A real, load-bearing simplification: this is rule-based difficulty-stepping, not a calibrated psychometric model (that would need real item-response-theory parameters this epic's own seed content doesn't have yet) — flagged in RISK_REGISTER.md as a future refinement once real attempt-outcome data exists to calibrate against.

### 6.3 AI-scored Writing — new `ai-engine` capability

A new, narrow `services/ai-engine/src/assessment-scoring/` module — deliberately _not_ routed through `OrchestratorService`/`AIAgentSession` (assessment scoring is a one-shot, structured-output task with no session/memory/multi-turn concept, not a conversation). `AssessmentScoringService.scoreWritingResponse(input)`:

1. Retrieves grounding context via the existing `RagRetrievalService.retrieveGroundingContext()`, filtered to the `CEFR_DESCRIPTOR` category and the relevant language — the exact mechanism T7 already built, reused, not reimplemented.
2. Calls `RouterService.generate()` with a new, dedicated scoring prompt template (versioned like every other prompt, PromptManagerService's own convention) instructing the model to return a structured critique object — the same "always returns a structured, schema-validated object, never freeform prose" discipline ADR-007 already established for specialist tool calls, applied here even though this isn't an Orchestrator-invoked specialist.
3. Validates the model's JSON response against a Zod schema (`@linguaai/validation`) before returning — a malformed response is a real, thrown error, never silently passed through as if valid (matching this epic's own "reproducible scoring" bar: an unparseable score is a retry/failure, not a guessed default).
4. Applies `SafetyLayerService.sanitizeOutput()` to any free-text feedback field before it's returned, matching T8's own established output-handling discipline.

New REST surface on `ai-engine` (mirroring ADR-033/T10's pattern exactly): `POST /v1/assessment-scoring/writing`, documented via `@nestjs/swagger`, called by a new method on `apps/api`'s existing `AiEngineClientService` (T10) — not a new client class, since it's the same internal-network-only, `@linguaai/validation`-shared-schema contract T10 already established.

### 6.4 CEFR banding & confidence — provisional, real, not silently decided

Per-skill raw score = percentage of served items answered correctly, weighted by each item's own `difficulty`. Banding table (provisional, flagged): <30% → A1, 30–45% → A2, 45–60% → B1, 60–75% → B2, 75–90% → C1, ≥90% → C2 — a placeholder linear split, not a validated psychometric cut-score set (RISK_REGISTER R-05's own open item). Confidence = a function of (a) how many items were served for that skill (more items narrow the ability estimate) and (b) response consistency (score variance across served items — high variance near a band boundary means low confidence). Below a provisional confidence floor, the skill's result is flagged `LOW_CONFIDENCE` in the API response (not silently presented as definitive, PRD.md §5.1) — the frontend epic's own job is building the retake-offer UX this flag is for.

## 7. New ADRs proposed (status `Proposed` — full text added to DECISIONS.md at implementation time, starting at ADR-037)

| ADR     | Decision                                                                                                                                                               | Why it's needed now                                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-037 | New curated `AssessmentItem` model, not `Exercise` reuse or ungoverned free text                                                                                       | Closes the real §3.1 gap; determines every scoring/selection task's own data source                                                                                                             |
| ADR-038 | Adaptive item-selection algorithm lives in `apps/api`'s own Assessment module, not `recommendation-engine`                                                             | Resolves the real §3.3 bounded-context ambiguity explicitly, per ARCHITECTURE.md §2.1's own stated resolution process                                                                           |
| ADR-039 | Writing-skill AI scoring is a new, narrow `ai-engine` capability outside `OrchestratorService`/`AIAgentSession`, not a specialist tool or a new conversational persona | A one-shot structured-scoring task is architecturally distinct from a conversational agent session — this ADR states why reusing the Orchestrator's own session model would be a category error |

## 8. Alternatives considered

- **Reusing `content.prisma`'s `Exercise`/`Quiz` for assessment items** — rejected: `Exercise.activityId` is a required relation into the authored-curriculum hierarchy, structurally incompatible with a pre-course placement test (§3.1); forcing it would mean either a fake placeholder `Activity` (a real data-model lie) or a schema change to make the relation optional (weakening the guarantee every _other_ `Exercise` consumer, e.g. Course Management, relies on).
- **Building the adaptive algorithm as real code inside `recommendation-engine`** — rejected for this epic specifically (not rejected forever, §3.3): stands up a second service's first-ever real code inside an epic that has no other reason to touch it, when the far smaller, self-contained, relocatable alternative (a service class inside `apps/api`) satisfies every real requirement today.
- **Routing Writing-skill scoring through `OrchestratorService`, treating it as a Personal Language Teacher "assessment session"** — rejected: assessment scoring has no session/memory/multi-turn concept, and forcing it through `AIAgentSession`/`AIMessage` would mean either fabricating a fake single-turn "session" for every scoring call (schema/semantic mismatch — those tables model ongoing coaching conversations) or overloading the Orchestrator's own single-voice invariant with a use case it was never designed for.
- **A full item-response-theory (IRT) adaptive engine at MVP** — rejected: real IRT calibration needs response data this epic's own seed content doesn't have yet (a cold-start problem); the simplified difficulty-stepping algorithm (§6.2) is a real, working, honestly-simplified interim, flagged for future calibration once attempt data exists — the same "interim, a later pass owns the final form" precedent this whole platform's other provisional mechanisms already follow.

## 9. Task sequence

| Task   | Deliverable                                                                                                                                                                                                               | Depends on      | Evidence (design-phase)                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** | ADR-037 + `AssessmentItem` schema/migration (Database Gate) + real seed content (~10–15 items × 4 objective skills × CEFR bands, 1 launch language)                                                                       | E4              | Real migration applied and verified against the live local Postgres, mirroring E4/E5's own verification discipline                                  |
| **T2** | ADR-038 + `apps/api` `AssessmentModule`: attempt lifecycle (start/submit-response/complete), adaptive selection (§6.2), objective scoring for Reading/Listening/Vocabulary/Grammar                                        | T1              | Unit + integration tests against a real Postgres, matching apps/api's own established e2e-suite convention                                          |
| **T3** | CEFR banding + confidence computation (§6.4), `ProficiencyLevel`/`ProficiencyLevelHistory` writes                                                                                                                         | T2              | Tests covering every banding threshold boundary and the low-confidence flag path                                                                    |
| **T4** | ADR-039 + `ai-engine` `AssessmentScoringModule` — Writing-skill AI scoring (§6.3), RAG-grounded, schema-validated                                                                                                         | E5 (T1, T7, T8) | Tests with a mocked Router (matching E5's own established convention); real pgvector retrieval re-verified against seeded `CEFR_DESCRIPTOR` entries |
| **T5** | `apps/api` ↔ `ai-engine` contract for Writing scoring — new `AiEngineClientService` method + new `ai-engine` REST endpoint, OpenAPI-documented                                                                            | T2, T4          | New API_SPEC_TEMPLATE.md instance, matching T10's own precedent                                                                                     |
| **T6** | `assessment.attempt.completed` event emission; user-initiated re-assessment flow; low-confidence retake-offer contract (API shape only, §6.4)                                                                             | T3, T5          | Event-catalog conformance test; re-assessment creates a new `AssessmentAttempt` without disturbing the prior one's `ProficiencyLevelHistory` row    |
| **T7** | Full REST contract for a frontend to run a session (start → serve next item → submit response → complete), OpenAPI-documented                                                                                             | T2–T6           | API_SPEC_TEMPLATE.md instance covering every endpoint                                                                                               |
| **T8** | Interim evaluation suite for Writing-skill AI scoring — golden-set-style fixtures scored against known-band sample responses, mirroring E5 T12's own precedent and its same honestly-stated no-live-model-call limitation | T4              | Design note: what the suite checks and how a false negative would be caught, matching E5 T12/E4 T11's own "interim" evidence bar                    |

## 10. Open questions

Genuinely unresolved as of this draft — not silently decided, and not yet put to the user for a resolution decision the way E4 §10/E5 §10 recorded theirs.

1. **Launch-language seed-content scope for T1** — this document assumes one launch language's worth of real seed items is sufficient to prove the mechanism end-to-end (matching T7's own "5 seeded rows, not exhaustive" precedent), with the other 9 MVP launch languages' item banks being real, tracked follow-up work, not silently assumed complete. Not yet confirmed as a decision.
2. **Whether `apps/mobile`/`apps/web` need different item-serving pagination** (one item at a time vs. a batch) — PRD.md doesn't specify, and this affects §9 T7's exact endpoint shape (a single `GET next item` endpoint vs. a batch-prefetch endpoint). Defaults to one-item-at-a-time (simplest, matches the "adaptive" nature — the next item genuinely can't be chosen until the previous response is scored), flagged as an assumption.
3. **Real psychometric validation** (RISK_REGISTER R-05) — this epic explicitly does not attempt to validate the CEFR-banding table (§6.4) against real proficiency outcomes; who owns commissioning that validation (a pedagogy/linguist function, per AI_GOVERNANCE.md's own accountability table) and when it happens relative to MVP launch is unresolved here.

## 11. Risks

New rows for RISK_REGISTER.md (added in the same PR as implementation begins, matching E4/E5's own precedent):

| Risk                                                                                                                                                                                                           | Mitigation                                                                                                                                                                                    | Owner                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| The simplified difficulty-stepping algorithm (§6.2) is not a calibrated psychometric model — item selection could converge on the wrong CEFR band for edge-case ability profiles                               | Flagged as provisional (§3.4), the same honesty precedent as this platform's other provisional numeric parameters; real IRT calibration is real, tracked future work once attempt data exists | AI Engineering + Pedagogy (TBD) |
| `AssessmentItem` seed content (T1) covers only one launch language at design time — the other 9 could block a broader launch if not resourced in time                                                          | Named explicitly in Open Questions (§10, item 1), not assumed complete                                                                                                                        | Content/Pedagogy (TBD)          |
| Writing-skill AI scoring (T4) inherits every honestly-scoped limitation E5 T12's evaluation suites already documented — no live-model evaluation exists to validate scoring quality before shipping            | Same RISK_REGISTER R-84 constraint this epic's own T8 evaluation suite will inherit, not a new, separate gap                                                                                  | AI Engineering (TBD)            |
| Speaking assessment (§3.2) is deferred, but `assessment.prisma`'s `Skill` enum and every API shape already accept it — a future consumer could be misled into thinking it's live before E10 ships real support | Explicitly flagged in §1/§3.2; a future task wiring Speaking for real should re-confirm this document's own deferral is still accurate, not assume it was already closed                      | AI Engineering (TBD)            |

## 12. Gate sign-off log

Per EPIC_TEMPLATE.md §5 — filled in as each gate passes. Every row below is unchecked; this document does not self-certify any of them.

| Gate          | Owner                                                | Status        | Evidence link | Date |
| ------------- | ---------------------------------------------------- | ------------- | ------------- | ---- |
| Architecture  | TBD                                                  | ☐ Not started | —             | —    |
| Security      | TBD                                                  | ☐ Not started | —             | —    |
| Database      | TBD — applicable for T1's `AssessmentItem` migration | ☐ Not started | —             | —    |
| API           | TBD — applicable for T5/T7's contracts               | ☐ Not started | —             | —    |
| Frontend      | N/A — this epic is backend/engine only (§3.6)        | —             | —             | —    |
| AI            | TBD — applicable for T4/T8                           | ☐ Not started | —             | —    |
| Performance   | TBD — the 15-minute attempt budget (§2)              | ☐ Not started | —             | —    |
| Accessibility | N/A — no UI in this epic (§3.6)                      | —             | —             | —    |
| Testing       | TBD                                                  | ☐ Not started | —             | —    |
| Documentation | TBD                                                  | ☐ Not started | —             | —    |
| Deployment    | TBD                                                  | ☐ Not started | —             | —    |

## 13. Epic Approval

**All gates passed:** ☐ Yes
**DEFINITION_OF_DONE.md satisfied:** ☐ Yes
**Approved by:** [pending]
**Date:** [pending]
