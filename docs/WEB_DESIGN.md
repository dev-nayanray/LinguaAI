# WEB_DESIGN.md — LinguaAI Web App (`apps/web`) Design Reference

Status: Living reference, updated alongside `apps/web`. Companion to [docs/DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (cross-platform tokens/components/brand) and [docs/MOBILE_DESIGN.md](MOBILE_DESIGN.md) (the same kind of document for `apps/mobile`) — this document is the web-specific application of the design system: page inventory, navigation/shell architecture, data-fetching pattern, and phasing. It does not redefine tokens or components; see `packages/ui` for those.

## 1. Where this starts from (real state, not assumed)

As of this pass, `apps/web` has real, tested pages for auth only: `/login`, `/register`, `/password-reset`, `/password-reset/confirm`, `/mfa/enroll`, `/profile`. `/` is a placeholder status page, not a landing page. There is no authenticated app shell (nav/sidebar), no data-fetching layer beyond `@linguaai/auth-client`'s auth-specific calls, and no dark-mode toggle wired up yet (`packages/ui`'s tokens already support `data-theme="dark"` — DESIGN_SYSTEM.md's own doc comment in `tokens.css` names "whatever in-app theme toggle a later epic adds" as the missing piece).

On the backend, the picture is uneven **by branch**, not by feature completeness — this matters for what a web page can honestly call real right now:

- **Already on `main`** (this branch's own base, verified via `git ls-tree origin/main`): identity/auth (E2), course catalog browsing + lesson content + exercise attempts (E8), recommendations/daily-goals + learning-plans (E7), AI assessment (E6), vocabulary personal dictionary (E9), organizations, users.
- **Complete but not yet on `main`** (implemented on unmerged feature branches per ROADMAP.md, confirmed in this session's own work): gamification/XP/streaks (E14), subscription billing/Stripe (E15), notifications (E16), device tokens/push, mobile parity (E21).

A page in this document is only wired to a real API if that API exists on `main`. Pages that depend on not-yet-merged backend branches are designed here (so the page inventory is complete and accurate to the PRD) but are explicitly phased as follow-up work, not built against a branch that doesn't exist from this branch's point of view — the same "don't fake it, disclose the gap" discipline the mobile and E21 work already established.

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

| Page                                                    | Route                                      | Backing API                                                                                                                                    | Phase                     |
| ------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Dashboard (daily goal, quick links)                     | `/dashboard`                               | `GET /v1/daily-goals/today` (real, `main`)                                                                                                     | **Phase 1 (this pass)**   |
| Course catalog                                          | `/courses`                                 | `GET /v1/courses` (real, `main`)                                                                                                               | **Phase 1 (this pass)**   |
| Course detail (levels → units → lessons)                | `/courses/[courseId]`                      | `GET /v1/courses/:id` (real, `main`)                                                                                                           | Phase 2                   |
| Lesson / exercise runner                                | `/lessons/[lessonId]`                      | `GET /v1/lessons/:id`, `POST /v1/exercises/:id/attempts` (real, `main`)                                                                        | Phase 2                   |
| Vocabulary / SRS review                                 | `/vocabulary`                              | E9 personal dictionary (real, `main`) — SRS review-queue endpoint mirrors mobile's `apps/mobile` T3 scope; confirm exact route before building | Phase 2                   |
| Assessment (onboarding + re-assessment)                 | `/assessment`                              | E6 (real, `main`)                                                                                                                              | Phase 2                   |
| Speaking practice                                       | `/practice/speaking`                       | E10 (real, `main`, not yet surveyed for exact routes)                                                                                          | Phase 2                   |
| Pronunciation lab                                       | `/practice/pronunciation`                  | E11 (real, `main`)                                                                                                                             | Phase 2                   |
| Listening / Reading                                     | `/practice/listening`, `/practice/reading` | E12 (real, `main`)                                                                                                                             | Phase 2                   |
| Writing assistant / AI stories                          | `/practice/writing`                        | E13 (real, `main`)                                                                                                                             | Phase 2                   |
| Progress / gamification (XP, streaks, badges, missions) | `/progress`                                | E14 — **not on `main` yet**                                                                                                                    | Phase 3                   |
| Exam preparation                                        | `/exam-prep`                               | E19 (real, `main`)                                                                                                                             | Phase 2                   |
| Certificates                                            | `/certificates`                            | E20 (real, `main`)                                                                                                                             | Phase 2                   |
| Billing / subscription / paywall                        | `/billing`                                 | E15 — **not on `main` yet**                                                                                                                    | Phase 3                   |
| Notification preferences                                | `/settings/notifications`                  | E16 — **not on `main` yet**                                                                                                                    | Phase 3                   |
| Profile (existing)                                      | `/profile`                                 | `GET /v1/users/me` (real)                                                                                                                      | Already real — left as-is |

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

- **Phase 1 (this pass, implemented):** theme provider/toggle, marketing `TopNav`/`Footer`, a real modern landing page at `/`, the `(app)` shell (guard + `Sidebar`/`BottomTabBar`), `/dashboard` (daily goal + quick links), `/courses` (real catalog list). React Query + the `packages/auth-client` `request()` addition land as part of this phase since `/dashboard`/`/courses` need them.
- **Phase 2 (follow-up, same `main`-backed APIs, not built this pass):** course detail, lesson/exercise runner, vocabulary/SRS, assessment, speaking/pronunciation/listening/reading/writing practice, exam prep, certificates — all backed by real `main` APIs already, "just" need web UI + wiring, same shape of work as this pass's `/courses`.
- **Phase 3 (blocked on a backend branch merging to `main` first):** `/progress` (gamification), `/billing` (Stripe paywall/checkout), `/settings/notifications` — designed here so the inventory is complete, not implemented against branches this branch can't see.

## 7. Testing

Every new page/component ships with a co-located `*.test.tsx` (existing repo convention — `page.test.tsx` next to every `page.tsx`), consistent with the loading/empty/error/success states DESIGN_SYSTEM.md §5 requires. React Query hooks are tested by mocking `apps/web/src/lib/api/*.ts`'s exported fetchers, not by mocking `fetch` directly, mirroring how existing auth pages mock `@/lib/auth-client` rather than `fetch`.
