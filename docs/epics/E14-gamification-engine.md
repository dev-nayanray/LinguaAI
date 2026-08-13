# Epic E14 — Gamification Engine

**Epic ID:** E14 (ROADMAP.md)
**Status:** Design phase — first single-pass design, not yet implemented.
**Tech lead:** Backend Platform (TBD)
**Gate owners assigned:** Architecture, Database, API, Security, Testing, Documentation (Frontend/Accessibility gates apply to the later UI-focused epic that builds the actual celebration/motion UI, not this backend-engine epic — see §3.5)

## 0. Why this document exists now, and what it is not

E13 (Writing Assistant & AI Story Generator) is implementation-complete (T1–T3, 2026-08-13 — its own §9 task table's full sequence, confirmed no further task remains). Per ROADMAP.md, E14 is the next epic — both its dependencies (E4, E3) are already satisfied (E3's design system, `packages/ui`, is real and merged; E4's schema, including `gamification.prisma`, has been real since E4 T4). This is the **first, single-pass design** for the Gamification Engine (PRD.md module 15) — the same process E4–E13 each went through (CLAUDE.md's own workflow rule). This document does not write any application code; it designs the module, surfaces real gaps found while doing so (§3), and proposes the ADR implementation will need (§7).

Unlike every prior epic, this one has **zero existing application logic to extend** — `gamification.prisma`'s own header comments explicitly defer "anti-gaming safeguards" and all real business logic to "E14 (Gamification Engine app logic)," and a full-repo search confirms no service, controller, or module anywhere reads or writes `UserXP`/`Streak`/`Badge`/`UserBadge`/`Mission`/`UserMission`/`League`/`LeaderboardEntry` today. This is real, greenfield application logic on top of an already-real, already-seeded schema.

## 1. Epic Definition

PRD.md names one module this epic covers (module 15):

| #   | Module              | Description                           | Differentiator                                                                           |
| --- | ------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| 15  | Gamification Engine | XP, streaks, levels, badges, missions | Anti-gaming safeguards are launch-blocking, not fast-follow (PRD.md, RISK_REGISTER R-15) |

**In scope:**

- Real XP awarding and level computation, triggered **synchronously, in-process** immediately after the two already-real completion signals `apps/api`'s own `CourseModule` already produces (`learning.exercise.answered`, `learning.lesson.completed`) — not a new asynchronous domain-event consumer (§3.1's own found architectural constraint).
- A real, timezone-correct streak update with an explicit, documented grace-window policy (§3.2), resolving ARCHITECTURE_REVIEW's own named open acceptance criterion.
- A real, concrete anti-gaming safeguard closing the single most acute farming vector this epic's own design surfaces: XP is awarded only once per (learner, exercise) — the _first_ correct attempt, never a repeat (§3.3). This is PRD's own named launch-blocking differentiator, made real, not just a schema comment.
- Real badge-earning (checked against each `Badge.criteria` after every XP/streak update) and mission-progress tracking (`UserMission.progress`, marking `completedAt` on target reached).
- Real emission of the three already-cataloged-but-never-produced `gamification.*` events (`gamification.xp.awarded`, `gamification.streak.updated`, `gamification.badge.awarded`) for `notification-service`/`analytics-service`'s own future consumption.
- Real, minimal learner-facing read endpoints: current XP/level/streak, earned badges, active mission progress.

**Explicitly out of scope** (cited against ROADMAP.md/PRD.md's own classification, not silently absorbed):

- **Wiring XP/streak/mission-progress updates into every other already-real completion signal** (`speech.session.ended`, `pronunciation.attempt.scored`, `writing.submission.corrected`) — this epic's own MVP slice proves the real mechanism end-to-end on the two most core, highest-volume activity types (exercise/lesson completion); wiring the remaining three is mechanical repetition of the identical `GamificationService.recordActivity()` call already built here, a real, tracked, separately-scheduled follow-up (§11), not silently dropped.
- **`League`/`LeaderboardEntry` computation** (leaderboards/leagues) — the schema exists (E4 T4) but no document names this required for MVP beyond the schema itself; a real, separately-scoped future task.
- **The actual celebration/motion-aware UI** (ARCHITECTURE_REVIEW's own named deliverable) — matching E4–E13's own precedent, this epic designs the schema/API a future UI consumes, not the actual screen (§3.5).
- **Full bot/farming abuse detection** beyond the concrete per-(learner,exercise) XP-award idempotency built here (e.g. device fingerprinting, ML-based anomaly detection, referral fraud) — RISK_REGISTER R-15's own broader scope; this epic closes the most acute, concrete "same attempt scored twice" farming class, not the entire risk.
- **Streak-freeze / cosmetic streak-repair items** — `gamification.prisma`'s own header comment already defers this to v1.1+, not modeled in the schema this epic builds on.

## 2. Business Objective

PRD.md's own primary engagement/retention lever alongside E7 (Personalized Learning Engine) — the core "XP, streaks, badges, missions" loop that makes daily practice feel rewarding. Directly serves the platform's own retention metric (implicit in PRD.md's exit criteria) and is explicitly named launch-blocking for its anti-gaming half (RISK_REGISTER R-15), not a fast-follow nicety.

## 3. Scoping boundary and conflicts found

### 3.1 A new async domain-event consumer would collide with `recommendation-engine`'s own already-flagged competing-consumers gap (RISK_REGISTER R-89)

`EVENT_ARCHITECTURE.md`'s own catalog names "Gamification" as a future consumer of `learning.lesson.completed`, `speech.session.ended`, `pronunciation.attempt.scored`, and `writing.submission.corrected` — implying a natural design would be a new async BullMQ consumer on the shared `domain-events` queue, mirroring `recommendation-engine`'s own `DomainEventsModule` (E7 T2). This is a real, load-bearing trap: RISK_REGISTER R-89 (found at E7 T2) already documents that `packages/events`' queue is a single shared BullMQ queue with **competing-consumers** semantics, not fan-out — "the moment a _second_ real consumer starts its own Worker on this same queue, the two would silently split events between them instead of each seeing every one." A new Gamification consumer today would silently steal jobs from `recommendation-engine`'s own already-shipped consumer (or vice versa), corrupting both, with no error surfaced anywhere. This epic does not attempt to fix R-89's own real per-consumer fan-out gap (a `packages/events`-level change, out of this epic's own scope) — instead, since Gamification lives in the same process as the two events it needs most (`apps/api`'s own `CourseModule` already produces `learning.exercise.answered`/`learning.lesson.completed`), this design calls `GamificationService.recordActivity()` **synchronously, in-process**, immediately after each event is published — zero new queue consumers, zero R-89 exposure.

### 3.2 Streak timezone-correctness: `toLocalCalendarDate()` already exists, built for exactly this

`packages/utils/src/date/to-local-calendar-date.ts`'s own doc comment states outright: "Streak/streak-adjacent logic... must compare _calendar days in the user's timezone_... this is the pure building block for that comparison, decoupled from any streak-specific rules (grace windows, etc.), which land in E14." This epic is that landing. The real, resolved grace-window policy (§6.2): a streak update compares `toLocalCalendarDate(now, streak.timezone)` against `Streak.lastActiveDate` — a **calendar-date diff of exactly 1** increments the streak (consecutive day); a diff of **0** is a no-op (already logged today); a diff **> 1** resets to 1. The grace window _is_ the local-calendar-day comparison itself — a learner active at 11:58pm and again at 12:02am their own local time is never penalized for a UTC-midnight artifact, closing ARCHITECTURE_REVIEW's own named "Part 1 finding" for real, not just narrating the fix.

### 3.3 XP farming: `ExerciseAttempt` has no re-attempt limit, and every attempt re-fires `learning.exercise.answered`

Confirmed by direct inspection of `ExerciseAttemptsService.submitAttempt()`: a learner can resubmit the same exercise an unlimited number of times, and every single submission — correct or not — publishes a fresh `learning.exercise.answered` event. Awarding XP on every such event would let a learner infinitely farm XP by re-answering one already-solved exercise. The existing `priorAttempt` check (already computed in `submitAttempt()`, used today only to gate lesson-completion re-evaluation) is the exact signal this epic needs for XP dedup too: XP is awarded only when `!priorAttempt && correct` — the learner's own first-ever attempt at that specific exercise, and only when it's right. A repeat attempt (right or wrong) earns zero XP. This is PRD's own "anti-gaming safeguards are launch-blocking" differentiator, made concrete for the single most obvious farming vector this schema's own shape invites.

### 3.4 `learning.exercise.answered` was never named a Gamification consumer in the catalog — a real, found drift

`EVENT_ARCHITECTURE.md`'s own catalog row for `learning.exercise.answered` names only `recommendation-engine`/`analytics-service` as consumers — `learning.lesson.completed`, by contrast, does name Gamification. Since exercise-level XP is this epic's own primary mechanic (§3.3), this is corrected as part of this epic's own documentation update — a real, found catalog drift, not a new decision requiring its own ADR.

### 3.5 This epic is backend/engine + a real, minimal read API — not the actual celebration UI

Matching every prior epic's own precedent (E4–E13), this epic designs and builds the real schema-consuming logic and API contract a future frontend consumes. The actual celebration animations / motion-aware UI (ARCHITECTURE_REVIEW's own named deliverable) are a later, UI-focused epic's own scope.

## 4. Bounded context & ownership

Gamification is its own bounded context (ARCHITECTURE.md §2.1, `gamification.prisma`) living in `apps/api` directly (DECISIONS.md's own existing "core domain in apps/api" framing) — no independent scaling/runtime/blast-radius justification exists for a separate service (ADR-001's own recurring test, applied identically here as it was for `AssessmentModule`/`VocabularyModule`/`WritingModule`).

## 5. Component-by-component design summary

| Component                                | Responsibility                                                                                             | New/Existing       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------ |
| `apps/api` — `GamificationModule`        | `GamificationService.recordActivity()` (XP/streak/badge/mission logic), learner-facing read endpoints (§6) | New                |
| `apps/api` — `CourseModule` (call sites) | `ExerciseAttemptsService` calls `GamificationService.recordActivity()` synchronously (§3.1/§6.1)           | Existing, extended |
| `gamification.prisma`                    | `UserXP`/`Streak`/`Badge`/`UserBadge`/`Mission`/`UserMission` (already real, E4 T4)                        | Existing           |
| `packages/utils` — `toLocalCalendarDate` | Timezone-correct calendar-date comparison (already real, built for this epic, E4-adjacent)                 | Existing           |

## 6. Cross-cutting mechanics

### 6.1 `GamificationService.recordActivity()` — the one real entry point

Called synchronously from `ExerciseAttemptsService.submitAttempt()` right after `learning.exercise.answered` is published, and from the existing `maybeEmitLessonCompleted()` right after `learning.lesson.completed` is published. Takes the caller's own `userId` plus a discriminated activity shape (`{ type: 'EXERCISE_ANSWERED', exerciseId, correct, firstAttempt }` or `{ type: 'LESSON_COMPLETED', lessonId }`). For an exercise: awards a flat per-exercise XP amount only when `firstAttempt && correct` (§3.3); for a lesson: awards a flat, larger per-lesson-completion XP bonus, itself guarded by a real idempotency check (a `UserMission`-independent lightweight "has this `(userId, lessonId)` pair already been XP-awarded" query, defensive regardless of whether the underlying lesson-completion signal could itself ever double-fire). Every real XP award also runs the streak update (§6.2) and badge/mission re-evaluation (§6.3) in the same call — one real transaction, not three separately-triggered side effects that could partially apply.

### 6.2 Streak update

Reads the caller's own `Streak` row (creating one, `currentStreak: 1`, on first-ever activity — no prior streak to compare against). Computes `toLocalCalendarDate(now, streak.timezone)` and diffs it against `streak.lastActiveDate`: diff `0` → no-op; diff `1` → `currentStreak += 1` (and `longestStreak` bumped if exceeded); diff `> 1` → `currentStreak = 1` (broken, fresh start). `streak.timezone` is set from the caller's own `User.timezone` at streak-row creation (falling back to `'UTC'` if unset, the same fallback `DailyGoalService` already established) — not re-synced on every activity, a real, deliberate choice (§10 open question).

### 6.3 Badge/mission evaluation

After every XP/streak change, `GamificationService` re-checks the caller's own current `totalXp`/`currentStreak` against every active `Badge.criteria` the caller hasn't already earned (`UserBadge` has `@@unique([userId, badgeId])`, a real idempotent insert-if-not-exists) and every active, not-yet-completed `UserMission.progress` against its `Mission.targetValue` — marking `completedAt` and awarding `Mission.rewardXp` (itself a further XP award, subject to the same real transaction) the moment a target is reached.

## 7. New ADR proposed (status `Proposed` — full text added to DECISIONS.md at implementation time, starting at ADR-054)

| ADR     | Decision                                                                                                                                                                                                     | Why it's needed now                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-054 | `GamificationService.recordActivity()` is called synchronously, in-process, from `apps/api`'s own existing event-publishing call sites — not a new async BullMQ consumer on the shared `domain-events` queue | Closes §3.1's own found gap: a second real competing consumer on that shared queue would silently corrupt `recommendation-engine`'s own already-shipped consumption (RISK_REGISTER R-89) |

## 8. Alternatives considered

- **A new async `GamificationEventsModule` BullMQ consumer, mirroring `recommendation-engine`'s own `DomainEventsModule`** (rejected, §3.1/ADR-054) — would silently collide with `recommendation-engine`'s own already-shipped consumer on the same shared, competing-consumers queue (RISK_REGISTER R-89), corrupting both with no visible error.
- **Fixing R-89's own real per-consumer fan-out gap in `packages/events` as part of this epic, then building Gamification as a proper async consumer** (rejected — real, valuable future work, but a `packages/events`-level architecture change is a bigger, separately-scoped undertaking than this epic's own M-complexity budget; the synchronous, in-process design achieves a correct, real MVP without first needing that larger fix).
- **Awarding XP on every `learning.exercise.answered`, regardless of repeat attempts** (rejected, §3.3) — a real, unbounded farming vector this epic's own PRD-named "anti-gaming... launch-blocking" differentiator exists specifically to prevent.
- **A literal 24-hour rolling window for streaks instead of local-calendar-date comparison** (rejected, §3.2) — the exact bug class (a learner active at 11:58pm and 12:02am local time penalized by a naive UTC-instant diff) `toLocalCalendarDate()` was purpose-built to avoid; ARCHITECTURE_REVIEW's own named finding is about this specific class of correctness bug.
- **Wiring all five completion signals (exercise, lesson, speech, pronunciation, writing) in this one epic** (rejected, §1's own out-of-scope) — real, disproportionate scope for one epic when the identical `recordActivity()` mechanism, once proven on the two most core activity types, mechanically extends to the rest.

## 9. Task sequence

| Task   | Deliverable                                                                                                                                                                                                                                                                                           | Depends on | Evidence (design-phase)                                                                                                                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T1** | `GamificationModule`/`GamificationService.recordActivity()` — real XP awarding (idempotent per §3.3), timezone-correct streak update (§3.2/6.2), wired synchronously into `ExerciseAttemptsService`; `gamification.xp.awarded`/`gamification.streak.updated` real emission; `GET /v1/gamification/me` | E13        | Unit tests with a mocked Prisma client; a real e2e test against live Postgres proving XP is awarded once (not twice) across a re-attempted exercise, and a streak increments correctly across two distinct local calendar days |
| **T2** | Badge-earning (§6.3) and mission-progress tracking, `gamification.badge.awarded` real emission, `GET /v1/gamification/badges`/`GET /v1/gamification/missions`                                                                                                                                         | T1         | Unit tests with a mocked Prisma client; a real e2e test proving a seeded Badge is really awarded once its criteria is met, never twice                                                                                         |

## 10. Open questions

1. **Whether `Streak.timezone` should re-sync from `User.timezone` if the learner changes their own account timezone later** — this design assumes it is set once, at streak-row creation, and never re-synced (a real, provisional MVP scoping call: re-syncing mid-streak risks a real correctness edge case — a timezone change could retroactively make "yesterday" and "today" collide or gap in a way that unfairly breaks or extends an in-progress streak) — not yet put to the user for a resolution decision.
2. **The exact flat XP amounts** (per correct first-attempt exercise, per lesson completion) — this design assumes small, illustrative, tunable constants (e.g. 10 XP/exercise, 50 XP/lesson, matching the same order of magnitude the seed data's own `Mission.rewardXp` values already use, 50/200), a real product-tuning decision for whoever owns the actual engagement-loop economy, not this epic's own scope to finalize precisely.

## 11. Risks

| Risk                                                                                                                                                                                                                                                                                                                                                                                        | Mitigation                                                                                                                                                                                       | Owner                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| R-98 (new): This epic's own MVP slice wires `GamificationService.recordActivity()` into only two of five already-real completion signals (exercise/lesson) — `speech.session.ended`/`pronunciation.attempt.scored`/`writing.submission.corrected` earn no XP/streak/badge credit yet, even though `EVENT_ARCHITECTURE.md`'s own catalog already names Gamification as their future consumer | Wire the same, already-proven `recordActivity()` call into each remaining module's own completion call site the next time any of them is touched, or as this epic's own dedicated follow-up task | Backend Platform (TBD)                  |
| RISK_REGISTER R-15's own broader anti-gaming scope (bot-farming, referral fraud) remains open beyond the concrete per-exercise XP-dedup this epic closes                                                                                                                                                                                                                                    | Flagged here, not re-litigated; real device-fingerprinting/anomaly-detection work is separately scoped                                                                                           | Backend Platform / Trust & Safety (TBD) |
| RISK_REGISTER R-89's own already-tracked competing-consumers gap in `packages/events` remains unfixed — this epic works around it (§3.1/ADR-054) rather than closing it                                                                                                                                                                                                                     | Flagged here, not re-litigated; a real `packages/events`-level fan-out fix for whoever needs a second true async consumer next                                                                   | Backend Platform (TBD)                  |

## 12. Gate sign-off log

| Gate         | Status        | Reviewer | Date | Notes                                                                               |
| ------------ | ------------- | -------- | ---- | ----------------------------------------------------------------------------------- |
| Architecture | ☐ Not started | —        | —    | The synchronous, in-process `recordActivity()` design avoiding R-89 (§3.1, ADR-054) |
| Database     | ☐ Not started | —        | —    | No migration — confirms `gamification.prisma`'s own E4 T4 schema already fits       |
| API          | ☐ Not started | —        | —    | New learner-facing read endpoints (§6)                                              |
| Security     | ☐ Not started | —        | —    | The real XP-farming safeguard (§3.3) — PRD's own launch-blocking differentiator     |
| Testing      | ☐ Not started | —        | —    | Real e2e proof of XP-award idempotency and timezone-correct streak increments       |

## 13. Epic Approval

Design not yet formally approved by an independent Architecture Gate review — proceeding to implementation by explicit user direction ("next"), the same pattern E9–E13 each followed.
