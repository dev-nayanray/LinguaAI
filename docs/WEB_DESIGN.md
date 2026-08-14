# WEB_DESIGN.md — LinguaAI Web App (`apps/web`) Design Reference

Status: Living reference, updated alongside `apps/web`. Companion to [docs/DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (cross-platform tokens/components/brand) and [docs/MOBILE_DESIGN.md](MOBILE_DESIGN.md) (the same kind of document for `apps/mobile`) — this document is the web-specific application of the design system: page inventory, navigation/shell architecture, data-fetching pattern, and phasing. It does not redefine tokens or components; see `packages/ui` for those.

## 1. Where this starts from (real state, not assumed)

As of this pass, `apps/web` has real, tested pages for auth only: `/login`, `/register`, `/password-reset`, `/password-reset/confirm`, `/mfa/enroll`, `/profile`. `/` is a placeholder status page, not a landing page. There is no authenticated app shell (nav/sidebar), no data-fetching layer beyond `@linguaai/auth-client`'s auth-specific calls, and no dark-mode toggle wired up yet (`packages/ui`'s tokens already support `data-theme="dark"` — DESIGN_SYSTEM.md's own doc comment in `tokens.css` names "whatever in-app theme toggle a later epic adds" as the missing piece).

On the backend, the picture is uneven **by branch**, not by feature completeness — this matters for what a web page can honestly call real right now:

- **Already on `main`** (this branch's own base, verified via `git ls-tree origin/main`): identity/auth (E2), course catalog browsing + lesson content + exercise attempts (E8), recommendations/daily-goals + learning-plans (E7), AI assessment (E6), vocabulary personal dictionary (E9), organizations, users.
- **Complete but not yet on `main`** (implemented on unmerged feature branches per ROADMAP.md, confirmed in this session's own work — each real, but its own separate branch, not merged): gamification/XP/streaks (E14), subscription billing/Stripe (E15), notifications (E16), device tokens/push, mobile parity (E21), and — confirmed directly by searching `apps/api/src/modules/` rather than trusting ROADMAP.md's table, which reports all of these as "epic complete" without reflecting merge state — speaking practice (E10), pronunciation lab (E11), listening/reading (E12), writing assistant (E13), exam preparation (E19), certificates (E20).

A page in this document is only wired to a real API if that API exists on `main`. Pages that depend on not-yet-merged backend branches are designed here (so the page inventory is complete and accurate to the PRD) but are explicitly phased as follow-up work, not built against a branch that doesn't exist from this branch's point of view — the same "don't fake it, disclose the gap" discipline the mobile and E21 work already established.

### 1a. A found gap: `exercisePublicViewSchema` carries no answer content on `main`

Building the lesson/exercise runner (Phase 2a) surfaced a real gap: `exercisePublicViewSchema` (`packages/validation/src/content/index.ts`) on `main` has no `content` field at all — `{ id, activityId, quizId, type, prompt, order }` only. A `MULTIPLE_CHOICE`/`MATCHING`/`LISTENING_COMPREHENSION` exercise has no options/leftItems/rightItems in its payload, so there is nothing to render a real answer form from. (This exact gap was independently found and fixed for `apps/mobile` during E21 T2 — that fix lives on an unmerged branch, not on `main`, so it isn't available here.)

Rather than build a form with no real options to select from, `/lessons/[lessonId]` only accepts answers for `FILL_BLANK`/`TRANSLATION` (free-text, no `content` needed) — every other type renders an honest "not answerable yet" notice instead. `SPEAKING_PROMPT` gets its own notice (needs `services/speech-service`, E10, and is rejected 422 server-side regardless). Fixing `exercisePublicViewSchema` to add a real `content` field is the actual unblock here, mirroring the mobile fix, and should happen on `packages/validation` directly (benefiting both apps) rather than being duplicated.

### 1b. Two more found gaps: no SRS review engine, no `/v1/languages` catalog on `main`

This document's own first draft assumed a "SRS review-queue endpoint" existed for E9, mirroring `apps/mobile`'s T3 flashcard review screen (`listDueCards`/`POST .../deck/:id/reviews`, SM-2 spaced repetition). Building `/vocabulary` found that assumption wrong: no `srs`/`deck`/`review` route exists anywhere under `apps/api/src/modules/vocabulary/` on `main` — that spaced-repetition engine is real, but only on the same unmerged `apps/mobile` branch as the `exercisePublicViewSchema.content` fix (§1a). `/vocabulary` on `main` is therefore built against what E9 T1/T2 actually shipped here: the curated catalog (`GET /v1/vocabulary-items`) and the personal dictionary (`GET`/`POST`/`DELETE /v1/vocabulary/personal-dictionary`) — search, save, and manage a saved-words list, not spaced-repetition review.

Separately, `createPersonalDictionaryEntryRequestSchema` requires a real `languageId` (UUID), but no `/v1/languages` endpoint exists on `main` to discover one — the only real source of a valid `languageId` a web page can reach today is a catalog item's own field (`CourseSummary.languageId`, `VocabularyItemResponse.languageId`). `/vocabulary`'s "Save" action therefore always reuses a `VocabularyItem`'s own `languageId`, never a user-typed or invented one — which is also why the page has no manual "add any word" form, only "search the catalog and save what you find."

### 1c. The same `content`-field gap hits assessment `MULTIPLE_CHOICE` items too

`assessmentItemPublicViewSchema` (`packages/validation/src/learning/index.ts`) has the identical shape of gap as §1a's exercises: `{ id, skill, cefrLevel, difficulty, prompt, audioUrl, itemType }`, no answer-option content at all. A served `MULTIPLE_CHOICE` item (one of the three `ASSESSMENT_ITEM_TYPES`) has nothing to render a choice list from. Unlike a lesson's independent exercises, an assessment attempt is a strict linear sequence — `POST .../responses` must be answered to advance to the next item — so a `MULTIPLE_CHOICE` item genuinely blocks the flow rather than just being one skippable card among many. `/assessment` still serves it honestly (an explicit "not answerable yet" notice, no way to fake a submission past it) rather than hiding the limitation, but a real attempt that happens to serve a `MULTIPLE_CHOICE` item before `FILL_IN_BLANK`/`OPEN_RESPONSE` items exhaust the objective skills will stall. This is the same root cause as §1a/§1b and shares the same fix: add real `content` to the public item view on `packages/validation` directly.

Also worth noting: `/assessment`'s "Start assessment" action has the same `languageId` workaround as `/vocabulary` (§1b) — it silently uses the first course's `languageId` from the catalog rather than presenting a picker, since there's no language name anywhere in the API to label one with.

### 1d. `/progress` — the one Phase-3 page unblocked by cherry-picking, not waiting for a merge

Unlike E10–E13/E15/E16/E19–E21, E14 (Gamification) was a small, self-contained, two-commit epic (`feature/e14-t1-xp-streak-anti-farming`, `feature/e14-t2-badges-missions`) that touched only `apps/api/src/modules/gamification/` (new), `packages/validation/src/gamification/` (new), and `packages/database/schema/gamification.prisma` — no overlap with anything this branch had already built. Both commits were cherry-picked directly onto this branch (not a full branch merge, which would have pulled in unrelated, further-diverged history — see the "27 commits ahead, 20 behind `main`" divergence check before doing this) — real conflicts in `apps/api/src/modules/course/course.module.ts` (a `SpeechServiceClientModule` import from E12, not on this branch, dropped), `docs/EVENT_ARCHITECTURE.md`/`docs/ROADMAP.md` (rows describing E10–E13 progress not real here, kept as this branch's own accurate versions with only the Gamification rows updated), and `packages/validation/package.json` (`./speaking`/`./pronunciation`/`./admin` export-map entries dropped — no matching `src/` directories exist on this branch) were resolved by hand, not blindly accepted. `GamificationService.recordActivity()` is called synchronously in-process from `ExerciseAttemptsService` (ADR-054) — real XP/streak/badge/mission side effects now genuinely fire from `/lessons/[lessonId]`'s own exercise submissions.

One pre-existing, unrelated issue surfaced while verifying this: `apps/api`'s full `typecheck` has one real, pre-existing type error in `personal-dictionary.service.ts` (a `VOCABULARY_SOURCES` enum missing `'WRITING'`, dated to the original E9 T2 commit on `main`, 2026-08-08) — not caused by this cherry-pick, not fixed here (out of scope). `gamification.service.spec.ts` also has one pre-existing, date-dependent flaky unit test (a hardcoded `lastActiveDate` fixture whose "current streak stays the same" assertion silently depends on which real calendar day the suite happens to run on) — 39 of that file's 40 tests pass regardless.

## 2. Full page inventory (per PRD.md's module list + ROADMAP.md's 23 epics)

Every page the product eventually needs, grouped by area, each marked with its real phase:

### 2.1 Marketing (public, unauthenticated)

| Page                                       | Route      | Phase                                 |
| ------------------------------------------ | ---------- | ------------------------------------- |
| Landing page                               | `/`        | **Phase 1 (this pass)**               |
| Pricing                                    | `/pricing` | Phase 3 (needs E15 billing on `main`) |
| (Login/Register/Password reset/MFA enroll) | existing   | Already real                          |

A dedicated `/about`, `/blog`, `/contact` etc. are not part of PRD.md's MVP scope (§6/§9) and are not designed here — inventing marketing pages the product doc doesn't call for would be scope creep.

### 2.2 Authenticated core (the "learning loop", PRD.md journeys A–C)

| Page                                                    | Route                                      | Backing API                                                                                                                                                         | Phase                                                             |
| ------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Dashboard (daily goal, quick links)                     | `/dashboard`                               | `GET /v1/daily-goals/today` (real, `main`)                                                                                                                          | **Phase 1 (this pass)**                                           |
| Course catalog                                          | `/courses`                                 | `GET /v1/courses` (real, `main`)                                                                                                                                    | **Phase 1 (this pass)**                                           |
| Course detail (levels → units → lessons)                | `/courses/[courseId]`                      | `GET /v1/courses/:id` (real, `main`)                                                                                                                                | **Phase 2a (implemented)**                                        |
| Lesson / exercise runner                                | `/lessons/[lessonId]`                      | `GET /v1/lessons/:id`, `POST /v1/exercises/:id/attempts` (real, `main`)                                                                                             | **Phase 2a (implemented, FILL_BLANK/TRANSLATION only — see §1a)** |
| Vocabulary (catalog search, save, personal dictionary)  | `/vocabulary`                              | `GET /v1/vocabulary-items`, `GET/POST/DELETE /v1/vocabulary/personal-dictionary` (real, `main`) — see §1b, this is **not** SRS review                               | **Phase 2b (implemented)**                                        |
| Assessment (onboarding + re-assessment)                 | `/assessment`                              | E6 (real, `main`) — see §1c: MULTIPLE_CHOICE items are not answerable                                                                                               | **Phase 2c (implemented, FILL_IN_BLANK/OPEN_RESPONSE only)**      |
| Speaking practice                                       | `/practice/speaking`                       | E10 (real, `main`, not yet surveyed for exact routes)                                                                                                               | Phase 2                                                           |
| Pronunciation lab                                       | `/practice/pronunciation`                  | E11 (real, `main`)                                                                                                                                                  | Phase 2                                                           |
| Listening / Reading                                     | `/practice/listening`, `/practice/reading` | E12 (real, `main`)                                                                                                                                                  | Phase 2                                                           |
| Writing assistant / AI stories                          | `/practice/writing`                        | E13 (real, `main`)                                                                                                                                                  | Phase 2                                                           |
| Progress / gamification (XP, streaks, badges, missions) | `/progress`                                | `GET /v1/gamification/me`/`badges`/`missions` (real, cherry-picked from `feature/e14-t1-xp-streak-anti-farming`/`e14-t2-badges-missions` onto this branch, see §1d) | **Phase 3 (implemented)**                                         |
| Exam preparation                                        | `/exam-prep`                               | E19 (real, `main`)                                                                                                                                                  | Phase 2                                                           |
| Certificates                                            | `/certificates`                            | E20 (real, `main`)                                                                                                                                                  | Phase 2                                                           |
| Billing / subscription / paywall                        | `/billing`                                 | E15 — **not on `main` yet**                                                                                                                                         | Phase 3                                                           |
| Notification preferences                                | `/settings/notifications`                  | E16 — **not on `main` yet**                                                                                                                                         | Phase 3                                                           |
| Profile (existing)                                      | `/profile`                                 | `GET /v1/users/me` (real)                                                                                                                                           | Already real — left as-is                                         |

## 3. Navigation / shell architecture

**Public (marketing) header:** `TopNav` (`@linguaai/ui/navigation`) with brand mark, `Pricing`/`Log in`/`Get started` items, no sidebar. A plain marketing `Footer` (link columns + copyright) is new, one-off, and lives in `apps/web` directly — it's not a cross-app primitive DESIGN_SYSTEM.md's component catalog names, so it doesn't belong in `packages/ui`.

**Authenticated app shell:** a new `(app)` route group (`apps/web/src/app/(app)/layout.tsx`) providing:

- The same "ensure session on mount, redirect to `/login` on failure" guard `/profile` and `apps/admin`'s `/dashboard` already both hand-roll independently — centralized here as the one real layout-level guard, so every future page placed inside `(app)/` gets it for free instead of re-implementing it per page (`/profile` itself is intentionally left outside the group and unmodified in this pass — it already works and rewriting a fully-tested page's internals to fit a new shared guard is a refactor with no user-facing benefit this pass, not a requirement).
- `Sidebar` (`@linguaai/ui/navigation`) on desktop (`tablet:flex` breakpoint up), `BottomTabBar` on mobile (`flex tablet:hidden`) — exactly the responsive swap pattern both components' own doc comments describe, composed here for the first time in this repo.
- A slim top bar with the signed-in user's name and a `ThemeToggle` (new — see §4).

Route groups don't affect the URL (`(app)/dashboard` still serves `/dashboard`), so this is purely an organizational/shell layer, not a URL redesign.

## 4. Theming

`packages/ui`'s tokens already branch on `[data-theme="dark"]` (`tokens.css`'s own doc comment); nothing in this repo sets that attribute yet. This pass adds:

- `apps/web/src/components/theme-provider.tsx` — a small client component that reads a persisted preference (`localStorage`, key `linguaai-theme`) or falls back to `prefers-color-scheme`, and sets `data-theme` on `<html>`.
- `apps/web/src/components/theme-toggle.tsx` — a real toggle (not a stub), used in both the marketing header and the authenticated shell's top bar.

## 5. Data-fetching layer (a real, identified gap — see §8's `packages/auth-client` change)

`apps/web` has no data-fetching pattern beyond `@linguaai/auth-client`'s own auth-specific methods — nothing exists yet for calling `/v1/courses`, `/v1/daily-goals/today`, or any future endpoint. This pass adds:

- **`@tanstack/react-query`** as a real dependency (`apps/web/package.json`) — the natural fit for the loading/empty/error/success state discipline DESIGN_SYSTEM.md §5 already mandates for every screen, and for the "streaming/real-time AI features" direction PRD.md names for later epics.
- `packages/auth-client` gains one new generic method on the client it already returns — `request<T>(path, options)` — a thin public export of the 401-retry-aware `authed<T>` helper that already exists internally but wasn't exposed beyond auth's own hardcoded call sites. This is a `packages/` change (not apps/web-local) because both `apps/web` and `apps/admin` need authenticated calls to non-auth endpoints, and CLAUDE.md's own rule is that cross-app logic belongs in `packages/`, never duplicated per app.
- `apps/web/src/lib/api/*.ts` — one small typed fetcher file per resource (`courses.ts`, `daily-goals.ts` in this pass), each wrapping `authClient.request<T>()` with the matching `@linguaai/validation` response type and a React Query hook (`useCourses()`, `useDailyGoal()`).

## 6. Phasing summary

- **Phase 1 (implemented):** theme provider/toggle, marketing `TopNav`/`Footer`, a real modern landing page at `/`, the `(app)` shell (guard + `Sidebar`/`BottomTabBar`), `/dashboard` (daily goal + quick links), `/courses` (real catalog list). React Query + the `packages/auth-client` `request()` addition landed as part of this phase since `/dashboard`/`/courses` needed them.
- **Phase 2a (implemented):** `/courses/[courseId]` (levels → units → lessons, native `<details>` disclosure) and `/lessons/[lessonId]` (exercise list + a real, working FILL_BLANK/TRANSLATION answer form wired to `POST /v1/exercises/:id/attempts`) — see §1a for the real `content`-field gap that limits which exercise types are answerable today.
- **Phase 2b (implemented):** `/vocabulary` — catalog search, save-to-personal-dictionary, and a saved-words list, wired to real `main` APIs. Not SRS review — see §1b for why.
- **Phase 2c (implemented):** `/assessment` — the full start → answer → complete attempt lifecycle, wired to real `main` APIs, real banded CEFR results per skill. `MULTIPLE_CHOICE` items are blocked by the same `content`-field gap as §1a/§1c.
- **Phase 3, `/progress` (implemented):** gamification — see §1d. E14's own two commits were small and self-contained enough to cherry-pick directly onto this branch rather than wait for a merge.
- **Phase 3, remaining (still blocked on a backend branch merging to `main`):** speaking/pronunciation/listening/reading/writing practice (E10–E13), exam prep (E19), certificates (E20), `/billing` (E15), `/settings/notifications` (E16) — none of these modules exist under `apps/api/src/modules/` on `main` at all (confirmed by direct search, not just the ROADMAP.md table, which shows all of them as epic-complete but doesn't reflect what's actually merged), and unlike E14 each is either large, still entangled with further-diverged history, or both — not a clean cherry-pick candidate. This document's earlier draft assumed E10–E13/E19/E20 were already on `main`; they are not.

## 7. Testing

Every new page/component ships with a co-located `*.test.tsx` (existing repo convention — `page.test.tsx` next to every `page.tsx`), consistent with the loading/empty/error/success states DESIGN_SYSTEM.md §5 requires. React Query hooks are tested by mocking `apps/web/src/lib/api/*.ts`'s exported fetchers, not by mocking `fetch` directly, mirroring how existing auth pages mock `@/lib/auth-client` rather than `fetch`.
