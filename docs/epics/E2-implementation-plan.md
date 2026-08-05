# Epic E2 — Implementation Plan

Status: **Architecture approved** ([fourth targeted review](E2-fourth-targeted-review.md): GO) — implementation planning, no code written. Tech lead: [TBD] · Last updated: 2026-07-30

> This document turns [E2-identity-access-platform.md](E2-identity-access-platform.md)'s approved design (Parts 1–19, 9A–9C, ADR-018–023) into an executable sequence: phases, tasks (`E2-T1`…`E2-T29`), dependencies, migration ordering, and the operational procedures (RLS deployment, `SECURITY DEFINER` migration, rollback) the design itself specifies _what_ to build but not _in what order and how to deploy it safely_. **No application code, migration, or scaffolding is produced by this document** — per the brief this phase was commissioned under, this is planning only.

---

## 1. Implementation phases

| Phase | Name                         | Tasks      | Purpose                                                                                                                                |
| ----- | ---------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Schema & Database Foundation | E2-T1–T7   | Every table, RLS policy, governance function, and privilege grant this Epic needs — nothing above this phase can start until it's done |
| 1     | Core Authentication          | E2-T8–T10  | Email/password registration, login, JWT/refresh lifecycle, session management                                                          |
| 2     | OAuth                        | E2-T11–T12 | Google/Apple sign-in, CSRF protection, account linking                                                                                 |
| 3     | MFA                          | E2-T13     | TOTP enrollment/verification, rate limiting                                                                                            |
| 4     | RBAC & Multi-tenancy         | E2-T14–T15 | Role/tenant enforcement middleware, organization management                                                                            |
| 5     | Role Governance & Audit      | E2-T16–T17 | The privileged-role lifecycle and audit-log surface Parts 9A/9B/9C exist to protect                                                    |
| 6     | Supporting Flows             | E2-T18–T21 | Profile management, GDPR erasure, password reset, domain events, rate limiting                                                         |
| 7     | Frontend                     | E2-T22     | Minimal auth UI exercising the API end-to-end                                                                                          |
| 8     | Testing & Hardening          | E2-T23–T28 | The mandatory test classes Part 16 defines, plus performance validation and the Security Gate artifact                                 |
| 9     | Documentation & Closure      | E2-T29     | Canonical docs updated, ADRs appended, Epic Approval prerequisites satisfied                                                           |

Phases 1–4 have internal parallelism opportunities (noted per-task); Phase 0 and Phase 5 do not — both are strictly sequential internally, for reasons given in §6/§7 below.

---

## 2. Task breakdown

| #      | Task                                                                                                                                                                                     | Dependencies                                 | Complexity | Acceptance criteria                                                                                                                                                                                                                                                                                                                                              | Deliverables                                                                                                                      | Required tests                                                                                                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2-T1  | `packages/types`/`validation` `identity` subpath: DTOs + Zod schemas for every Part 5 entity                                                                                             | E1                                           | M          | Types/schemas resolve from `apps/api`; schema field-for-field matches Part 5                                                                                                                                                                                                                                                                                     | `packages/types/src/identity/*`, `packages/validation/src/identity/*`                                                             | Schema unit tests (valid/invalid payload per DTO)                                                                                                                                             |
| E2-T2  | Prisma schema: core entities — `User`, `OAuthAccount`, `UserProfile`, `Session`, `RefreshToken`, `ConsentRecord`, `DeviceToken`, `PasswordResetToken` (no RLS, no privilege changes yet) | E2-T1                                        | L          | `prisma migrate dev` succeeds; all FK/unique constraints from Part 5 present                                                                                                                                                                                                                                                                                     | Migration file(s), updated `schema.prisma`                                                                                        | Migration applies cleanly against a fresh DB; Prisma Client generation succeeds                                                                                                               |
| E2-T3  | Prisma schema: org/governance entities — `Organization`, `OrganizationMembership`, `RoleChangeRequest`, `AuditLog`, `EntitlementChangeLog`                                               | E2-T2                                        | M          | Same bar as E2-T2; FK integrity to `User` confirmed                                                                                                                                                                                                                                                                                                              | Migration file(s)                                                                                                                 | Same as E2-T2                                                                                                                                                                                 |
| E2-T4  | RLS policy migration: `User`/`Organization`/`OrganizationMembership` — the full matrix from Part 9                                                                                       | E2-T3                                        | L          | Every `CREATE POLICY` statement in Part 9 present; RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) on all three tables                                                                                                                                                                                                                                 | Migration file                                                                                                                    | Cross-tenant negative-example queries (Part 9) run manually against staging and confirmed to return zero rows before this task is marked done                                                 |
| E2-T5  | `SECURITY DEFINER` functions + owner role + `app_service_role`/`BYPASSRLS` + bootstrap-admin CLI                                                                                         | E2-T4                                        | XL         | `approve_role_change`/`set_org_role`/`complete_mfa_enrollment` created exactly as specified in Part 9C (post-pass-#4 version); owned by a narrowly-privileged role, not the migration role (closes the standing Part 17/third-review item); `app_service_role` created with `BYPASSRLS`; bootstrap CLI produces a working first `ADMIN` in a scratch environment | Migration file(s), `scripts/bootstrap-admin.ts` (or equivalent CLI), owner-role creation script (infra-level, one-time — see §12) | Every negative scenario in the [fourth targeted review](E2-fourth-targeted-review.md) (last-admin, race, caller-mismatch, approver-authorization) reproduced against a real Postgres instance |
| E2-T6  | Column-level privilege allowlist (`REVOKE`/`GRANT`) — closes direct write access, **only after E2-T5 is verified working**                                                               | E2-T5                                        | M          | `app_role` cannot `UPDATE` any privileged column listed in Part 9C's survey table; the four allowed `User` columns (`displayName`/`avatarUrl`/`locale`/`timezone`) remain writable                                                                                                                                                                               | Migration file                                                                                                                    | A raw `UPDATE` attempt against each privileged column, as `app_role`, fails with a Postgres privilege error (Part 16's privileged-column-protection test class)                               |
| E2-T7  | `AuditLog`/`EntitlementChangeLog` immutability grants                                                                                                                                    | E2-T3 (parallelizable with E2-T4/T5/T6)      | S          | `UPDATE`/`DELETE` not granted to `app_role`; `INSERT`/`SELECT` are                                                                                                                                                                                                                                                                                               | Migration file                                                                                                                    | Attempted `UPDATE`/`DELETE` as `app_role` fails at the privilege level (Part 16's audit-immutability test)                                                                                    |
| E2-T8  | `AuthModule`: registration (via `app_service_role`, Part 9) + email/password login                                                                                                       | E2-T2, E2-T5                                 | L          | Integration tests for `/v1/auth/register`, `/v1/auth/login` pass; duplicate-email returns `CONFLICT`                                                                                                                                                                                                                                                             | `auth.module.ts`, `auth.controller.ts`, `auth.service.ts` (partial), `strategies/local.strategy.ts`                               | Happy path, validation failure, duplicate email, Argon2id hash verified never logged/returned                                                                                                 |
| E2-T9  | JWT issuance (claim shape per Part 8) + atomic refresh rotation + `tokensValidAfter` staleness check                                                                                     | E2-T8                                        | L          | Access token contains `sub`/`role`/`organizationId`/`orgRole`/`jti`/`iat`/`exp`; a token issued before a `tokensValidAfter` bump is rejected; concurrent refresh-token reuse triggers full-session revocation                                                                                                                                                    | `strategies/jwt.strategy.ts`, refresh-rotation logic in `auth.service.ts`                                                         | Refresh-token race test (two concurrent uses of one token — exactly one wins); staleness-check test                                                                                           |
| E2-T10 | Session endpoints: logout, list sessions, revoke a session                                                                                                                               | E2-T9                                        | M          | `/v1/auth/logout`, `/v1/users/me/sessions`, `DELETE .../sessions/:id` pass integration tests                                                                                                                                                                                                                                                                     | `users.controller.ts` (partial), `users.service.ts` (partial)                                                                     | Revoking a session invalidates its tokens on the next request                                                                                                                                 |
| E2-T11 | OAuth: Google + Apple Passport strategies, `state`-parameter CSRF protection                                                                                                             | E2-T8                                        | M          | Callback rejects missing/invalid/reused `state`; creates `User`+`OAuthAccount` only on genuinely new `(provider, providerAccountId)`                                                                                                                                                                                                                             | `strategies/google.strategy.ts`, `strategies/apple.strategy.ts`                                                                   | OAuth security test class (Part 16): state-param rejection, no email-based auto-link                                                                                                          |
| E2-T12 | OAuth account linking (authenticated)                                                                                                                                                    | E2-T11                                       | S          | `POST /v1/users/me/oauth-accounts` requires an active session; never auto-links by email                                                                                                                                                                                                                                                                         | `auth.controller.ts` (partial)                                                                                                    | Linking test: existing password account + new OAuth login does not merge without explicit authenticated linking                                                                               |
| E2-T13 | MFA: TOTP enrollment/verification, `MfaGuard`, rate limit + lockout                                                                                                                      | E2-T5 (for `complete_mfa_enrollment`), E2-T8 | M          | `MfaGuard` blocks every `ADMIN`/`ENTERPRISE_ADMIN` route pre-enrollment; 6th failed `mfa/verify` attempt in 10 min is rejected                                                                                                                                                                                                                                   | `mfa/mfa.service.ts`, `guards/mfa.guard.ts`                                                                                       | MFA-enforcement test class, MFA rate-limit/lockout test                                                                                                                                       |
| E2-T14 | `RolesGuard` + `@Roles()` decorator + `tenant.middleware.ts` (all four session variables)                                                                                                | E2-T2, E2-T4                                 | M          | Authorization boundary tests pass; `app.current_user_id`/`app.current_org_id`/`app.caller_org_role`/`app.is_platform_admin` all set correctly per request                                                                                                                                                                                                        | `guards/roles.guard.ts`, `organizations/tenant.middleware.ts`                                                                     | Cross-tenant leak test class (Part 16) — first real exercise of this middleware                                                                                                               |
| E2-T15 | `OrganizationsModule`: create org (platform-`ADMIN`-only), add/remove members, CSV bulk import                                                                                           | E2-T14                                       | L          | `POST /v1/organizations` requires platform `ADMIN`; bulk import creates `User`+`OrganizationMembership` atomically via `app_service_role`; last-`ENTERPRISE_ADMIN` removal blocked                                                                                                                                                                               | `organizations.module.ts`, `organizations.controller.ts`, `organizations.service.ts`                                              | Last-admin-removal test, bulk-import atomicity test                                                                                                                                           |
| E2-T16 | `role-lifecycle.service.ts`: role-change-request create/approve, calling `approve_role_change()`/`set_org_role()`                                                                        | E2-T5, E2-T14, E2-T15                        | L          | Two-person approval enforced for `ADMIN`-involving changes; single-party for `TEACHER`/`ENTERPRISE_ADMIN`; a fresh environment can produce its first working `ADMIN` via the bootstrap CLI (E2-T5), exercised end-to-end here                                                                                                                                    | `role-lifecycle.service.ts`, endpoints in `users.controller.ts`/`organizations.controller.ts`                                     | Role-lifecycle test class **and** the governance-function concurrency/authorization test class (Part 16, both)                                                                                |
| E2-T17 | `audit.module.ts`: `audit.service.ts`, `/v1/audit-log`, `/v1/organizations/:id/audit-log`                                                                                                | E2-T7, E2-T14                                | M          | Every action in Part 9B's required-events list produces exactly one `AuditLog` row; read endpoints correctly scoped (platform vs. org)                                                                                                                                                                                                                           | `audit/*`                                                                                                                         | Audit-immutability test class                                                                                                                                                                 |
| E2-T18 | `UsersModule`: profile CRUD, GDPR deletion-request                                                                                                                                       | E2-T8                                        | M          | `PATCH /v1/users/me` only touches the four allowed columns (E2-T6 proves the rest are blocked even if attempted); deletion-request → `account.deletion.requested` → cascade per DATABASE.md §10                                                                                                                                                                  | `users.controller.ts`/`users.service.ts` (complete)                                                                               | Deletion-cascade integration test                                                                                                                                                             |
| E2-T19 | Password reset flow (`app_service_role` path)                                                                                                                                            | E2-T5, E2-T8                                 | M          | Identical-shape responses regardless of account existence; OAuth-only accounts redirected, never dead-ended; session revoked on successful reset                                                                                                                                                                                                                 | `auth.controller.ts`/`auth.service.ts` (complete)                                                                                 | Enumeration-resistance test, session-revocation-on-reset test                                                                                                                                 |
| E2-T20 | Domain events: emit every event in Part 10 at its trigger point                                                                                                                          | E2-T8–T19 (as each producing flow lands)     | M          | Each event fires with the schema-correct payload                                                                                                                                                                                                                                                                                                                 | Event-emission calls throughout the Identity modules                                                                              | Test-consumer assertion per event                                                                                                                                                             |
| E2-T21 | Rate limiting: Redis-backed limiter, auth-endpoint class (login/reset/MFA)                                                                                                               | E2-T8, E2-T13                                | S          | A scripted brute-force attempt is throttled per the configured policy; fails closed on Redis outage (Part 11)                                                                                                                                                                                                                                                    | Rate-limit middleware/interceptor                                                                                                 | Scripted brute-force test, Redis-outage fail-closed test                                                                                                                                      |
| E2-T22 | Minimal `apps/web`/`apps/admin` auth UI                                                                                                                                                  | E2-T8–T13                                    | L          | Register → login → view-profile E2E journey passes; access tokens held in memory, never `localStorage`                                                                                                                                                                                                                                                           | UI components per Part 12                                                                                                         | E2E journey test (`tests/e2e`)                                                                                                                                                                |
| E2-T23 | Cross-tenant leak test suite: `User`/`Organization`/`OrganizationMembership`                                                                                                             | E2-T4, E2-T14                                | M          | Every negative example in Part 9 reproduced with the application-layer filter deliberately bypassed                                                                                                                                                                                                                                                              | Test files                                                                                                                        | — (this task _is_ the tests)                                                                                                                                                                  |
| E2-T24 | Governance-function concurrency/authorization test suite                                                                                                                                 | E2-T16                                       | L          | Every scenario in the [fourth targeted review](E2-fourth-targeted-review.md) (last-admin, org-admin race, caller-identity, approver-authorization) reproduced                                                                                                                                                                                                    | Test files                                                                                                                        | —                                                                                                                                                                                             |
| E2-T25 | Audit immutability test suite                                                                                                                                                            | E2-T7, E2-T17                                | S          | Privilege-level rejection of `UPDATE`/`DELETE` on `AuditLog` confirmed                                                                                                                                                                                                                                                                                           | Test files                                                                                                                        | —                                                                                                                                                                                             |
| E2-T26 | MFA/OAuth security test suite                                                                                                                                                            | E2-T11–T13                                   | M          | State-param, account-linking, and MFA rate-limit/lockout scenarios all confirmed                                                                                                                                                                                                                                                                                 | Test files                                                                                                                        | —                                                                                                                                                                                             |
| E2-T27 | Performance/load testing against PERFORMANCE.md §3 budgets                                                                                                                               | E2-T8–T21 complete                           | M          | See §15 below for the specific, honest budget question this task must resolve (Argon2id vs. the Standard CRUD class)                                                                                                                                                                                                                                             | Load-test scripts/report                                                                                                          | k6 (or equivalent) results archived as the artifact                                                                                                                                           |
| E2-T28 | Security review artifact (SECURITY_REVIEW_TEMPLATE.md instance)                                                                                                                          | E2-T1–T27                                    | M          | Completed template, zero open P0/P1 findings, feeds the Security Gate                                                                                                                                                                                                                                                                                            | Completed template                                                                                                                | —                                                                                                                                                                                             |
| E2-T29 | Documentation: DATABASE.md §2.1 marked implemented, EVENT_ARCHITECTURE.md catalog additions, API_GUIDELINES.md Bearer-token clarification, DECISIONS.md ADR-018–023 appended             | E2-T1–T28                                    | M          | Every canonical doc this Epic touches is updated in the same PR (CLAUDE.md's standing rule)                                                                                                                                                                                                                                                                      | Doc diffs                                                                                                                         | —                                                                                                                                                                                             |

---

## 3. Task dependency graph (phase level)

```
Phase 0 (T1→T2→T3→T4→T5→T6, T7 parallel with T4-T6)
        │
        ├──► Phase 1 (T8→T9→T10)
        │        │
        │        ├──► Phase 2 (T11→T12)
        │        ├──► Phase 3 (T13, needs T5 too)
        │        └──► Phase 6 (T18, T19 need T8; T21 needs T8+T13)
        │
        ├──► Phase 4 (T14 needs T2+T4; T15 needs T14)
        │        │
        │        └──► Phase 5 (T16 needs T5+T14+T15; T17 needs T7+T14)
        │
        ├──► Phase 7 (T22 needs T8–T13)
        │
        └──► Phase 8 (T23–T26 need their respective feature tasks; T27 needs the whole feature set; T28 needs everything)
                 │
                 └──► Phase 9 (T29, last)
```

Phases 1–4 can run with real team-level parallelism once Phase 0 is done (e.g., one engineer on Core Auth, another on RBAC/Organizations) — Phase 0 and Phase 5 cannot be parallelized internally, for the reasons in §6/§7.

---

## 4. Database migration sequence

**This ordering is a safety requirement, not a preference.** Getting it wrong creates a real deploy-time outage window:

1. **E2-T2/T3 — create every table first.** No RLS, no privilege changes yet. `app_role` has Prisma's normal default access at this point (whatever the baseline grant already is — E1's schema had no privileged tables, so this is the first time that baseline matters at all).
2. **E2-T4 — enable RLS and add every policy**, on tables that have zero rows (these are brand-new tables — E2 is the first Epic to give `packages/database` a real schema, so unlike a typical "retrofit RLS onto a live table" migration, there is no existing data to worry about hiding from in-flight queries). This is a materially easier and lower-risk RLS rollout than the general case for exactly this reason — worth stating explicitly so nobody over-engineers a zero-downtime RLS-retrofit procedure this Epic doesn't need.
3. **E2-T5 — create the `SECURITY DEFINER` functions and grant `EXECUTE` to `app_role`, _before_ touching `app_role`'s direct column access.** At the end of this step, `app_role` can _still_ `UPDATE` privileged columns directly (E2-T6 hasn't run yet) _and_ the functions are now available and testable — a working fallback exists at every point in this sequence.
4. **Verify E2-T5 in staging** against every scenario the fourth targeted review specified, using real concurrent load, before proceeding.
5. **E2-T6 — only now, `REVOKE` direct column access.** By this point the functions are the proven, working alternative — there is no window where `app_role` can write a privileged column via neither path (which would be a broken deploy) nor both (which would be the exact vulnerability class Part 9C exists to close).
6. **E2-T7** (audit immutability grants) has no ordering dependency on T4–T6 and can run any time after T3.

---

## 5. Prisma schema implementation order

Respects FK dependency direction — a table is defined only after everything it references:

```
User, Session, RefreshToken, ConsentRecord, DeviceToken, PasswordResetToken   (E2-T2 — all reference only User or nothing)
        │
UserProfile, OAuthAccount                                                     (E2-T2 — 1:1/1:N on User)
        │
Organization                                                                  (E2-T3 — no FK dependency, but grouped with T3 since it's governance-scoped)
        │
OrganizationMembership, RoleChangeRequest                                     (E2-T3 — reference User + Organization)
        │
AuditLog, EntitlementChangeLog                                                (E2-T3 — reference User; logically last since they're the record of everything above)
```

---

## 6. API implementation order

Matches the phase sequence in §1 exactly — endpoints are never built before the table/RLS/function foundation they depend on exists:

1. `/v1/auth/register`, `/v1/auth/login` (E2-T8)
2. `/v1/auth/refresh`, `/v1/auth/logout`, `/v1/users/me/sessions*` (E2-T9–T10)
3. `/v1/auth/oauth/*` (E2-T11–T12)
4. `/v1/auth/mfa/*` (E2-T13)
5. `/v1/organizations*` (E2-T15, needs T14's middleware first)
6. `/v1/users/:id/role-change-requests*`, `/v1/organizations/:id/members/:userId/role` (E2-T16)
7. `/v1/audit-log`, `/v1/organizations/:id/audit-log` (E2-T17)
8. `/v1/users/me`, `/v1/users/me/deletion-request` (E2-T18)
9. `/v1/auth/password-reset/*` (E2-T19)

---

## 7. Authentication flow implementation

1. `local.strategy.ts` validates email/password against `app_service_role`-inserted `User` rows (registration itself also runs through `app_service_role`, Part 9).
2. On success, `auth.service.ts` issues an access token (claims per Part 8, minted by `jwt.strategy.ts`'s signing logic) and a refresh token (hashed, stored in `RefreshToken`, cookie for web / secure storage for mobile per ADR-018).
3. Every subsequent authenticated request: `jwt-auth.guard.ts` verifies the JWT signature/expiry, then checks `jwt.iat >= user.tokensValidAfter` (a cached/indexed lookup, not a full `User` fetch) before trusting the embedded `role`/`organizationId` claims.
4. Refresh: the atomic conditional-update rotation from Part 8, unchanged by this plan — implement and test the race case (E2-T9) before considering this task done, not after.

---

## 8. OAuth implementation

1. `GET /v1/auth/oauth/:provider` issues a signed, short-lived, single-use `state` value (E2-T11).
2. Callback validates `state` first, before any provider-token exchange.
3. Account matching is **exclusively** `(provider, providerAccountId)` — implement this lookup before implementing the "create new user" branch, so the linking rule can never accidentally be tested only against the create-path.
4. `POST /v1/users/me/oauth-accounts` (E2-T12) is the only authenticated-linking path — build and test it before considering OAuth "done," since a callback-only implementation without this endpoint leaves users with an existing password account no way to add Google/Apple sign-in later.

---

## 9. MFA implementation

1. `mfa.service.ts`'s enroll step generates a TOTP secret and QR payload — does **not** write `mfaEnrolled`/`mfaSecret` yet.
2. Verify step checks the submitted code against the pending secret; only on success does it call `complete_mfa_enrollment()` (E2-T5's function) — write access to those two columns exists nowhere else (E2-T6 already closed the direct path).
3. `mfa.guard.ts` is wired into every route requiring `ADMIN`/`ENTERPRISE_ADMIN` at the same time `RolesGuard` is (E2-T14) — implement both guards together, not `RolesGuard` first with MFA bolted on later, to avoid a real window where role-gated routes exist without MFA enforcement.
4. Rate limiting/lockout (E2-T13's second half) ships in the same task as verification itself — a verify endpoint with no rate limit, even briefly, recreates the exact gap the third review found.

---

## 10. Authorization middleware

1. `tenant.middleware.ts` runs globally, before any route handler, setting all four session variables (E2-T14) — `app.current_user_id` always; the other three conditionally, based on the authenticated user's actual `role`/org membership, never from a client-supplied value.
2. `RolesGuard` reads the `@Roles(...)` decorator and checks the JWT's `role` claim (already staleness-checked by this point in the request pipeline).
3. Ownership checks (a `USER` may only read their own data) are per-service-method, not centralized — matches Part 9's existing statement that RLS and RBAC are independent, resource-ownership is a third, separate layer.

---

## 11. RLS deployment process

1. **Local:** `prisma migrate dev` against the local Docker Postgres — E1's existing local stack, no new infrastructure.
2. **CI:** the migration runs in `ci.yml`'s test-database step (already exists per E1); E2-T23's cross-tenant test suite is the actual proof, not a manual check.
3. **Staging:** migration applies via `deploy-staging.yml` (E1/T23), same as any other migration — no special-cased RLS deployment step exists or is needed, precisely because these are new tables (§4).
4. **Staging verification gate (mandatory, blocks promotion to production):** the full E2-T23 suite re-run against staging's real Postgres instance, plus a manual spot-check of at least one negative example from Part 9 by a second engineer — RLS policy bugs are exactly the class of defect that a green CI suite can miss if the suite itself has a subtle scoping bug, so a second pair of eyes on the actual `psql` output is a deliberate, cheap check before this touches real Enterprise data.
5. **Production:** same migration, same gate, via `deploy-production.yml`'s existing manual-approval requirement (E1/T23) — nothing E2-specific added to that workflow.

---

## 12. `SECURITY DEFINER` migration process

1. **One-time, infra-level, outside the normal Prisma migration flow** (same category as E1's `state-backend`/`github-oidc` bootstrap): create the narrowly-privileged owner role for the three functions. This is a deliberate, manual step — Postgres role creation is not something a routine app migration should do, matching how `app_service_role` itself is already treated in Part 9.
2. Grant that owner role exactly the privileges the function bodies need (`UPDATE` on the specific privileged columns, `INSERT` on `AuditLog`) — narrower than `app_role` even gets after E2-T6, since the owner role needs _more_ write access than `app_role` but nothing beyond what these three functions actually touch.
3. Migration creates the functions, then `ALTER FUNCTION ... OWNER TO <that role>` — an explicit statement, not left to default to whichever role ran the migration.
4. `GRANT EXECUTE ... TO app_role` — the only privilege `app_role` receives with respect to these functions.
5. **Before E2-T6 revokes direct column access**, every negative scenario from all four E2 architecture reviews is re-run against staging with real concurrent load (not just single-threaded test-suite execution) — the advisory-lock races in particular need genuine concurrency to exercise meaningfully.

---

## 13. Testing strategy

Follows TESTING.md §1's existing pyramid — unit-heavy, a focused integration layer, a small E2E layer:

| Layer                                       | E2 scope                                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Unit                                        | `auth.service.ts`, `mfa.service.ts`, `role-lifecycle.service.ts`, guard logic, token rotation logic — Jest (ADR-014)                |
| Integration                                 | Every endpoint in the design's Part 6 API table: happy path, 400/401/403/409 (TESTING.md §2)                                        |
| Security (mandatory classes, TESTING.md §5) | Cross-tenant leak (E2-T23), governance-function concurrency/authorization (E2-T24), audit immutability (E2-T25), MFA/OAuth (E2-T26) |
| E2E                                         | Register → login → view-profile journey (E2-T22), `tests/e2e`                                                                       |

Coverage floor: `packages/config`/`packages/observability`'s existing 80% (E1/Part 11) extends to every new Identity module — the first real product-logic packages to be held to it.

---

## 14. Security testing

Beyond the four mandatory test classes above (E2-T23–T26), the Security Gate (E2-T28) additionally requires, per SECURITY_REVIEW_TEMPLATE.md:

- A dependency/secret/SAST scan pass (already CI-enforced since E1, `security-scan.yml` — nothing new for E2 to configure, just to pass).
- Manual review of every `RAISE EXCEPTION` path in the three `SECURITY DEFINER` functions against the negative-test scenarios in all four architecture reviews — a checklist derived directly from [E2-fourth-targeted-review.md](E2-fourth-targeted-review.md)'s seven check categories, reused here as the Security Gate's own acceptance checklist rather than reinvented.
- Confirmation that `CODE_REVIEW_CHECKLIST.md`'s elevated-review requirement (extended to any `SECURITY DEFINER` function, per ADR-023) was actually applied to E2-T5's PR — a process check, not a technical one.

## 15. Performance testing

Auth endpoints fall under PERFORMANCE.md §3's **Standard CRUD** class (p50 < 80ms, p95 < 300ms, p99 < 800ms) — with one honest caveat E2-T27 must resolve, not assume: **Argon2id hashing is deliberately slow by design** (that's what makes it resistant to offline brute force), and a correctly-configured Argon2id call can itself consume a meaningful fraction of the p50 budget before any other work happens. E2-T27's job is to measure this for real against the chosen Argon2id cost parameters and either confirm the Standard CRUD budget is still met, or — if it genuinely isn't, because the hashing cost is doing its job — get an explicit, documented exception for `/v1/auth/login`/`/v1/auth/register` specifically, rather than silently accepting a red performance check or silently weakening the hash cost to make a budget line green. This is exactly PERFORMANCE.md §6's existing rule ("any query regularly exceeding budget is a required review, not a revisit-later note") applied to CPU-bound hashing instead of a DB query.

RLS's own overhead is also measured here, not assumed zero: E2-T27 includes a before/after comparison isn't possible (there's no "before" — these are new tables), so instead it confirms the RLS-protected query paths (`GET /v1/organizations/:id`, membership list/reads) meet the Database performance budget (PERFORMANCE.md §4: hot-path query p95 < 50ms) with policies active, using realistic multi-tenant data volumes, not an empty database.

## 16. Rollback strategy

| Scenario                                                                                                                                     | Rollback approach                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bug found in E2-T2/T3 (table/schema) before E2-T6 ships                                                                                      | Standard migration rollback — drop the new tables. No existing data to preserve since they're brand-new.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Bug found in E2-T4 (RLS policies)                                                                                                            | Same — these are new tables with RLS from creation, not a retrofit; rolling back means dropping the migration, not carefully unwinding a live policy change.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Bug found in a `SECURITY DEFINER` function **after** E2-T6 has shipped                                                                       | **Fix-forward is the default and strongly preferred path**: `CREATE OR REPLACE FUNCTION` ships a patched version without touching the column-privilege grants at all — this is a genuine advantage of the function-based pattern (ADR-023) over an application-only fix, since the fix is a single, atomically-deployable object.                                                                                                                                                                                                                                     |
| A `SECURITY DEFINER` function is broken badly enough that fix-forward isn't fast enough (e.g., it's blocking all role changes in production) | **Break-glass, time-boxed exception, not a casual default**: temporarily re-`GRANT` direct `UPDATE` on the specific affected column to `app_role`, restoring pre-E2-T6 behavior _only_ for that column, _only_ until the function fix ships — this re-opens the exact vulnerability class Part 9C exists to close, so it requires the same sign-off tier as any other production security exception (SECURITY.md §9's incident process), is time-boxed explicitly, and is reverted (re-`REVOKE`'d) the moment the function fix lands, not left in place "to be safe." |
| Bug found post-launch in application code (any Phase 1–7 task)                                                                               | Standard rollback per DEPLOYMENT.md's existing deployment-gate process (E1) — nothing E2-specific, this Epic doesn't change how `apps/api` itself is rolled back.                                                                                                                                                                                                                                                                                                                                                                                                     |

---

## 17. Definition of Done

Per DEFINITION_OF_DONE.md's checklist, made concrete for E2 — every box requires the linked evidence, not a verbal assurance:

- [ ] **Architecture approved** — [fourth targeted review](E2-fourth-targeted-review.md) GO; still needs the real, independent human review IMPLEMENTATION_GUIDE.md §4 requires, unresolved through every review pass so far.
- [ ] **Documentation updated** — E2-T29.
- [ ] **Database migration reviewed** — E2-T2–T7, each independently reviewable per CODE_REVIEW_CHECKLIST.md's sizing guidance; RLS policy present in the same migration as every tenant-scoped table (MULTITENANCY.md §6 — already true by construction, E2-T4).
- [ ] **APIs documented** — Part 6's table is the spec; OpenAPI generation (existing NestJS/Swagger wiring from E1) confirmed to match it.
- [ ] **Unit tests meet the bar** — §13.
- [ ] **Integration tests passing** — §13; happy/validation/auth-failure/conflict per TESTING.md §2.
- [ ] **No critical security issues** — E2-T28, zero open P0/P1.
- [ ] **Accessibility validated** — applies to E2-T22's UI; WCAG 2.1 AA per UI_UX_REVIEW_TEMPLATE.md §7, tested not assumed.
- [ ] **Performance budget met** — E2-T27, including the Argon2id honesty check (§15).
- [ ] **Logging implemented** — inherited from E1's `packages/observability`, already required of every module; no new logging infrastructure needed, just correct usage.
- [ ] **Metrics implemented** — same inheritance.
- [ ] **Error handling complete** — every error path in Part 6's table mapped to API_GUIDELINES.md §3's envelope.
- [ ] **Monitoring added** — audit-log volume and governance-function error rates (`caller_identity_mismatch`, `cannot_demote_last_platform_admin`, etc.) are exactly the kind of new signal OBSERVABILITY.md §2/§6 says is "worth tracking" — added as dashboard/alert additions in E2-T28/T29, not silently left as raw log lines.
- [ ] **QA approved** — independent of the implementer, Testing Gate.
- [ ] **AI Gate** — N/A, E2 has no AI surface.
- [ ] **Release readiness confirmed** — RELEASE_CHECKLIST.md, including this Epic's specific rollback strategy (§16) reviewed by DevOps, not just written down.
- [ ] **Risk register current** — Part 18's risks (all four remediation passes' worth) reflected in RISK_REGISTER.md.
- [ ] **Code review complete** — per task, plus the elevated-review requirement for E2-T5/T6 specifically (ADR-022/023).

---

## 18. Quality gate mapping

Every task's primary gate(s) — a task can feed more than one gate; this is not a 1:1 mapping:

| Task   | Architecture | Security | Database | API | Frontend | Testing | Documentation | Deployment |
| ------ | :----------: | :------: | :------: | :-: | :------: | :-----: | :-----------: | :--------: |
| E2-T1  |              |          |          |     |          |    ●    |               |            |
| E2-T2  |              |          |    ●     |     |          |    ●    |               |            |
| E2-T3  |              |          |    ●     |     |          |    ●    |               |            |
| E2-T4  |      ●       |    ●     |    ●     |     |          |    ●    |               |            |
| E2-T5  |      ●       |    ●     |    ●     |     |          |    ●    |               |            |
| E2-T6  |              |    ●     |    ●     |     |          |    ●    |               |            |
| E2-T7  |              |    ●     |    ●     |     |          |    ●    |               |            |
| E2-T8  |              |    ●     |          |  ●  |          |    ●    |               |            |
| E2-T9  |      ●       |    ●     |          |  ●  |          |    ●    |               |            |
| E2-T10 |              |    ●     |          |  ●  |          |    ●    |               |            |
| E2-T11 |              |    ●     |          |  ●  |          |    ●    |               |            |
| E2-T12 |              |    ●     |          |  ●  |          |    ●    |               |            |
| E2-T13 |              |    ●     |          |  ●  |          |    ●    |               |            |
| E2-T14 |      ●       |    ●     |          |     |          |    ●    |               |            |
| E2-T15 |              |    ●     |          |  ●  |          |    ●    |               |            |
| E2-T16 |      ●       |    ●     |    ●     |  ●  |          |    ●    |               |            |
| E2-T17 |              |    ●     |    ●     |  ●  |          |    ●    |               |            |
| E2-T18 |              |    ●     |          |  ●  |          |    ●    |               |            |
| E2-T19 |              |    ●     |          |  ●  |          |    ●    |               |            |
| E2-T20 |      ●       |          |          |     |          |    ●    |               |            |
| E2-T21 |              |    ●     |          |     |          |    ●    |               |            |
| E2-T22 |              |          |          |     |    ●     |    ●    |               |            |
| E2-T23 |              |    ●     |    ●     |     |          |    ●    |               |            |
| E2-T24 |              |    ●     |    ●     |     |          |    ●    |               |            |
| E2-T25 |              |    ●     |    ●     |     |          |    ●    |               |            |
| E2-T26 |              |    ●     |          |     |          |    ●    |               |            |
| E2-T27 |              |          |          |     |          |    ●    |               |            |
| E2-T28 |              |    ●     |          |     |          |    ●    |               |            |
| E2-T29 |              |          |          |     |          |         |       ●       |            |

**Deployment Gate** is deliberately unmarked per-task — it's satisfied once, at Epic completion, by §11/§12/§16's procedures being followed for the actual staging/production rollout (E1's existing `deploy-staging.yml`/`deploy-production.yml`), not by any single task in isolation. **AI Gate** has no column — N/A for this Epic (Part 4's gate log already records this).

---

## Note on scope discipline

This plan sequences and operationalizes the already-approved design; it does not reopen or reinterpret it. Every task above traces to a specific Part of [E2-identity-access-platform.md](E2-identity-access-platform.md) — no new architecture decision is introduced here. Where this plan adds detail the design didn't spell out (the migration-safety ordering in §4, the fix-forward-vs-break-glass distinction in §16, the Argon2id performance-budget honesty check in §15), that detail is _operational_ — how to build and deploy what was already approved — not a new design choice requiring its own Architecture Gate pass.
