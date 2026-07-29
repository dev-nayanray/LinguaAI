# LinguaAI — Coding Standards

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-07-29

Conventions for writing code in this repository. Complements [CLAUDE.md](../CLAUDE.md) (engineering standards/principles) and [CONTRIBUTING.md](CONTRIBUTING.md) (branching/PR process) — this doc is the "how to write it," not the "how to ship it."

## 1. TypeScript (apps/web, apps/api, apps/admin, packages/*, services/*)

- **Strict mode everywhere.** `any` requires an inline comment explaining why a proper type isn't feasible — it is never a default escape hatch.
- **Explicit return types on all exported functions.** Inferred return types are fine for local/private functions.
- **Naming**: `PascalCase` for types/interfaces/classes/components, `camelCase` for variables/functions, `kebab-case` for filenames (`user-profile.service.ts`), `SCREAMING_SNAKE_CASE` for module-level constants.
- **No default exports** except Next.js route files (`page.tsx`, `layout.tsx`) where the framework requires them — named exports everywhere else, for consistent refactor/import tooling.
- **Domain types live in `packages/types`, subpathed by domain** (`@linguaai/types/identity`, `@linguaai/types/courses`, `@linguaai/types/billing`, …) — not a single flat export surface, which is how shared packages become unmaintainable as the module count grows (Architecture Review Part 2 finding).
- **Validation schemas mirror the same domain subpaths in `packages/validation`** and are the single definition consumed by both the NestJS request pipe and the frontend form.

## 2. Backend (NestJS, `apps/api`, `services/*`)

- **Layering**: Controller (HTTP/WS concerns only) → Service (business logic) → Repository/Prisma (data access). Controllers never contain business logic; services never import `@nestjs/common` HTTP decorators.
- **One NestJS module per bounded sub-context** (ARCHITECTURE.md's context map), not per database table — e.g., a `CourseModule` owns `Course`/`Level`/`Unit`/`Lesson`, not five separate modules.
- **Cross-module calls happen through a module's exported service, never by importing another module's repository directly** — this is the enforced boundary referenced in ADR-002; violations are caught by the dependency-graph lint configured in Epic E1.
- **DTOs are the Zod schemas from `packages/validation`**, wired via a shared `ZodValidationPipe` — no parallel `class-validator` DTO definitions.
- **Errors are typed domain exceptions** (e.g., `EntitlementExceededException`) mapped to the API.md/API_GUIDELINES.md error envelope by a single global exception filter — never `throw new Error("string")` in application code reaching the client.
- **Async work is always enqueued, never awaited inline**, for anything not required to compute the synchronous response (EVENT_ARCHITECTURE.md).

## 3. Frontend (Next.js, `apps/web`, `apps/admin`)

- **Server Components by default**; a component opts into `"use client"` only when it needs interactivity/browser APIs/state.
- **Data fetching**: React Query for client-side/mutation state; Server Component data fetching for initial render — no duplicate fetching logic between the two without a stated reason.
- **Global state (Zustand) is reserved for genuinely cross-tree state** (auth session, active AI session) — not a default replacement for component state or React Query cache.
- **All UI is built from `packages/ui`** — no ad hoc Tailwind color/spacing values in application code; if a design need isn't met by an existing token/component, the token/component is added to `packages/ui` first (DESIGN_SYSTEM.md).
- **Every data-fetching component implements all four required states** (loading/empty/error/success) per DESIGN_SYSTEM.md §5 — this is a code-review blocking item, not a style preference.

## 4. Mobile (Flutter, `apps/mobile`)

- Feature-first folder structure (`lib/features/<feature>/{data,domain,presentation}`), not a layer-first structure at the top level.
- State management: Riverpod, mirroring the "cross-tree state only" discipline from §3.
- Design tokens are generated from the same source values as `packages/ui` (DESIGN_SYSTEM.md) — never hand-copied, to prevent silent drift between web and mobile brand rendering.

## 5. Error handling

- Every error surfaced to a user is one of: a specific recoverable message with a retry path, or a generic "something went wrong, we've been notified" fallback tied to a `requestId` — never a raw exception message or stack trace (API_GUIDELINES.md error envelope, SECURITY.md information-disclosure discipline).
- Errors are logged with full context server-side (OBSERVABILITY.md) regardless of what's shown to the user — the two are deliberately decoupled.

## 6. Testing conventions

Full strategy in [TESTING.md](TESTING.md). Code-level conventions: unit tests colocated as `*.spec.ts` beside source; test names describe behavior (`"rejects an expired refresh token"`, not `"test1"`); no conditional logic (branches, loops) inside a test body — a test that needs a loop to assert correctly is testing too much at once.

## 7. Linting & formatting

ESLint + Prettier are the enforcement mechanism, run via `lint-staged` on commit and as a required CI check (DEPLOYMENT.md §4). Do not hand-fix a formatting nit in code review — fix the tooling config if the tool isn't catching it, and never merge with formatting exceptions carved out per file.

## 8. Comments & documentation in code

Per [CLAUDE.md](../CLAUDE.md): no comments explaining *what* code does (names should do that); a comment is justified only for a non-obvious *why* (a workaround, a subtle invariant, a constraint from another system). Public package exports (`packages/*`) get a one-line doc comment describing the contract, not a multi-paragraph docstring.
