# Epic E2 — Identity & Access Platform

Status: **Implementation complete (T1–T29) — pending final independent gate sign-off.** Design history: first Architecture Gate review [NO GO](E2-architecture-gate-review.md) → [remediated](E2-remediation-report.md) → second review [NO GO](E2-second-independent-review.md) → [remediated](E2-remediation-report-v2.md) → third, function-body-level targeted review [NO GO](E2-third-targeted-review.md) (1 Critical + 3 High, all inside the `SECURITY DEFINER` function bodies) → [remediated again](E2-remediation-report-v3.md) → fourth targeted review: [**GO**](E2-fourth-targeted-review.md). Implementation (T1–T29) then proceeded against the approved design; see [E2-security-review.md](E2-security-review.md) (T28, one self-found P1 closed) and [E2-final-acceptance-review.md](E2-final-acceptance-review.md) (independent post-implementation acceptance review: **CONDITIONAL ACCEPTANCE**, 3 blocking findings). The 3 blocking findings were remediated — see [E2-final-acceptance-remediation.md](E2-final-acceptance-remediation.md) — whose own recommendation is **READY FOR TARGETED FINAL RE-VERIFICATION**, not self-declared closure; the Gate sign-off log below reflects that this Epic is not yet formally closed. Tech lead: [TBD] · Last updated: 2026-08-01

> **Scope note.** [ROADMAP.md](../ROADMAP.md)'s epic table names this Epic "Identity & Access Platform" (dependency: E1; complexity: L). An earlier working title for this design phase ("Shared Platform & Data Foundation") was superseded before drafting began — confirmed with the epic owner that E2 is scoped exactly as ROADMAP.md defines it: identity, auth, roles, organizations, and consent (module 1). Database Schema & Core Data Layer for the rest of the product domain remains a separate, later epic (E4), unaffected by this document. This design produces the `User`/`OAuthAccount`/`UserProfile`/`Organization`/`OrganizationMembership`/`Session`/`RefreshToken`/`ConsentRecord`/`DeviceToken` entities specifically because DATABASE.md §2.1 already assigns them to Identity — not because E2 is annexing E4's scope.

This is the technical design package for Epic E2, produced under [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md)'s lifecycle (phases 1–10: Epic Definition through Security Review). Unlike E1 (a platform-skeleton epic with no product schema or public API), E2 delivers E1's first real domain surface — a Postgres schema, a public REST API, and the multi-tenancy enforcement mechanism every later Enterprise-facing epic depends on — so **every** phase-1–10 gate applies in full, none narrowed. It satisfies [EPIC_TEMPLATE.md](../EPIC_TEMPLATE.md) §1–4 and [TECHNICAL_DESIGN_TEMPLATE.md](../TECHNICAL_DESIGN_TEMPLATE.md) in full. **This document is design only** — per the brief this phase was commissioned under: no application code is written, no Prisma schema is scaffolded, no migration is created, no package is installed, no production infrastructure is touched, and Epic E3 is not started as part of producing this document.

---

## PART 1 — Business Objective

### Why Epic E2 exists

[PRD.md](../PRD.md) §6 module 1 ("User Identity Platform") is marked **MVP** and, per ROADMAP.md's feature classification table, explicitly **"Blocks everything."** No other product epic can ship a single learner-facing feature without an account to attach it to. E2 turns the identity bounded context (ARCHITECTURE.md §2.1: "Users, auth, roles, organizations, consent") from a documented ownership assignment into working software, and — because DATABASE.md §1/ADR-005 already commit to Postgres RLS as the tenant-isolation mechanism — E2 is also where that mechanism gets built and proven for the first time, not deferred to whichever epic first needs Enterprise data.

### Business value

- Unblocks every downstream MVP epic (E3–E20) that needs an authenticated user to attach data to.
- Directly enables the two nearest-term monetizable paths: Premium subscriptions (E15, depends on E2) need an account to bill, and the `TEACHER` role — scoped narrowly in E2 per PRD.md §5.1 ("a public profile and the ability to be assigned learners in an Enterprise context") — is the foundation E27 (Teacher Marketplace) builds its self-serve publishing on later, per ROADMAP.md's explicit dependency note.
- Delivers the RLS tenant-isolation mechanism (ADR-005) that R-06 ("Cross-tenant data leak in Enterprise data," Critical severity, RISK_REGISTER.md) is mitigated-by-design against, but not yet built.

### Technical value

- The first real Prisma schema and migration in the repository — proves `packages/database` (E1, currently an empty scaffold with a placeholder model) works end-to-end with real domain content, real relations, and a real RLS policy.
- The first real, versioned public API surface — proves API_GUIDELINES.md's conventions (error envelope, idempotency, rate limiting, versioning) against real endpoints instead of the health-check-only surface E1 shipped.
- The first real domain events beyond the three already-catalogued identity rows — proves EVENT_ARCHITECTURE.md's envelope and cross-service consumption pattern (`notification-service`, `analytics-service` already listed as consumers of `identity.user.registered`) with real producers.

### Risks if skipped or under-built

- **R-06** (cross-tenant leak) stays "Mitigated (design)" indefinitely — RISK_REGISTER.md's own status note reads "verify at E22," but E22 cannot verify a mechanism E2 never built.
- **R-09** (privileged account takeover) stays unmitigated in practice — ADR-011 mandates admin MFA, but mandates nothing about _how_ MFA works, which is exactly the gap this design closes (Part 15).
- Every epic depending on E2 (E15, E18, E21, E22, and transitively E27/E28/E29 per ROADMAP.md) stalls or builds against an unstable/assumed identity contract if E2 ships an under-specified API.

### Dependencies

E1 only (ROADMAP.md) — `apps/api`'s NestJS skeleton, `packages/database`'s initialized-but-empty Prisma project, `packages/config`, `packages/observability`, `packages/validation`/`packages/types`' empty subpath scaffolds, and the CI/CD pipeline all already exist and are consumed as-is, not rebuilt.

### Success metrics

- A new user can register (email or Google/Apple OAuth — Part 15), receive a working session, and call an authenticated endpoint, exercised end-to-end in an integration test.
- An `ADMIN`/`ENTERPRISE_ADMIN` account cannot become active without completing MFA enrollment (ADR-011) — enforced server-side, proven by a test per TESTING.md §5.
- A cross-tenant-leak integration test exists for every RLS-protected table this Epic adds, per MULTITENANCY.md §6/TESTING.md §5, and fails loudly (not silently passes) if the RLS policy is ever removed.
- `GET /v1/users/me` and equivalent authenticated calls follow API_GUIDELINES.md's error envelope, error code registry, idempotency, and rate-limiting conventions exactly — no ad hoc auth-specific deviation.
- Account deletion (GDPR erasure) cascades per DATABASE.md §10's design and is exercised by an integration test, not just documented.

---

## PART 2 — Scope

### In scope

- `User`, `OAuthAccount`, `UserProfile`, `Organization`, `OrganizationMembership`, `Session`, `RefreshToken`, `ConsentRecord`, `DeviceToken` — the full Identity entity set already assigned in DATABASE.md §2.1, as a real Prisma schema + migration.
- Email/password registration and login; Google and Apple OAuth (Part 15 resolves the Google/Apple/Facebook discrepancy found between PRD.md and SECURITY.md — see Part 15).
- JWT access tokens + rotating, revocable refresh tokens (SECURITY.md §2); the concrete token-transport and lifetime decisions SECURITY.md leaves unspecified (Part 15, new ADR).
- Mandatory MFA enrollment/verification for `ADMIN`/`ENTERPRISE_ADMIN` before activation (ADR-011); the concrete mechanism SECURITY.md/ADR-011 leave unspecified (Part 15, new ADR).
- RBAC (`USER | TEACHER | ADMIN | ENTERPRISE_ADMIN`) enforced server-side on every request (SECURITY.md §3).
- Multi-tenancy: the full three-layer enforcement design from MULTITENANCY.md (application filter + Postgres RLS + integration test class), built and proven against this Epic's own tables — the first tables in the repository to carry an RLS policy.
- Organization provisioning (admin-initiated, per MULTITENANCY.md §4) and bulk member import (CSV).
- Password reset / account-recovery flow, including the OAuth-only-account redirect behavior PRD.md §5.1 requires.
- Consent recording (`ConsentRecord`) for ToS/privacy-policy/marketing consent, and the GDPR/CCPA erasure flow (DATABASE.md §10) for account deletion.
- Rate limiting and progressive backoff on auth endpoints (SECURITY.md §2, API_GUIDELINES.md §7).
- New domain events this Epic's flows require but the catalog doesn't yet have (Part 10).
- Minimal `apps/web`/`apps/admin` auth UI (login, register, reset, MFA enrollment) — enough to exercise the API end-to-end, not the final polished design (DESIGN_SYSTEM.md compliance still required for whatever ships).
- New ADRs this design requires (Part 15) — drafted here, not deferred, per TECHNICAL_DESIGN_TEMPLATE.md §8.
- **Privileged role lifecycle** _(added in remediation — Critical-1)_: bootstrap administrator creation, promotion/demotion workflows, two-person approval for `ADMIN` grants, emergency recovery — Part 9A.
- **Complete RLS policy matrix** for every table carrying `organizationId` (`User`, `Organization`, `OrganizationMembership`), including a scoped service-role bypass for the narrow set of operations that must legitimately cross tenant boundaries — Part 9, revised.
- **Immutable audit subsystem** (`AuditLog`, `EntitlementChangeLog`) _(added in remediation — Critical-3)_ — Part 9B.
- OAuth CSRF (`state` parameter), an explicit non-email OAuth-linking rule, MFA-verify rate limiting, and an explicit JWT claim/staleness design _(added in remediation — High-1–4)_ — Parts 6/8.

### Out of scope (this Epic)

- SSO (SAML/OIDC) — explicitly an Enterprise-phase requirement (SECURITY.md §2, ROADMAP.md's Business-plan/SSO row); the schema is not required to preclude it, but no SSO code ships in E2.
- Family plan / parental consent — descoped from MVP entirely by ADR-013; E2 does not build a parental-consent flow.
- Teacher Marketplace self-serve publishing, content governance, or payouts — the `TEACHER` role exists with the narrow MVP capability set PRD.md §5.1 defines (public profile, assignable learners); marketplace features are E27.
- SCIM bulk provisioning — PRD.md/MULTITENANCY.md §4 name it as "a later phase"; CSV import only at E2.
- Any non-Identity product schema (courses, progress, gamification, billing, community, AI memory) — E4's scope, untouched here.
- Admin platform UI beyond the minimum needed to exercise MFA enrollment/org management — E18's scope.

### Deferred

- Data-residency enforcement for `Organization.dataRegion` — schema field reserved (MULTITENANCY.md §5), no enforcement logic; explicitly deferred per ARCHITECTURE.md §9, tracked in RISK_REGISTER.md.
- Step-up verification on anomalous login (new device/geo) — SECURITY.md §2 names it as a requirement; E2 ships the audit signal (Part 10's new login events) that a later hardening pass consumes, not the full anomaly-detection system itself (tracked as a new risk, Part 18).

### Future

- SSO, SCIM, data-residency enforcement, Family plan/parental consent — all named above, all tracked, none silently dropped.

---

## PART 3 — Deliverables

| #   | Deliverable                                        | Summary                                                                                                                                     |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Prisma schema + migration                          | Identity entity set (Part 5), with RLS policies in the same migration (MULTITENANCY.md §6)                                                  |
| 2   | `packages/types`/`validation`                      | `identity` subpath populated with real DTOs/Zod schemas (Part 5/6)                                                                          |
| 3   | `apps/api` Identity module(s)                      | Auth, Users, Organizations sub-modules (Part 7)                                                                                             |
| 4   | Public API surface                                 | Versioned REST endpoints under `/v1/...` (Part 6)                                                                                           |
| 5   | Multi-tenancy enforcement                          | Prisma middleware + RLS policies + cross-tenant integration test suite (Part 9)                                                             |
| 6   | New domain events                                  | Catalog additions to EVENT_ARCHITECTURE.md (Part 10)                                                                                        |
| 7   | New ADRs                                           | Token strategy/claims, MFA mechanism, OAuth provider set, role governance, RLS service-role pattern — ADR-018–022 (Part 15)                 |
| 8   | Minimal auth UI                                    | `apps/web`/`apps/admin` login/register/reset/MFA pages (Part 12)                                                                            |
| 9   | Security review                                    | SECURITY_REVIEW_TEMPLATE.md instance (Part 13)                                                                                              |
| 10  | Test suite                                         | Unit + integration, including the mandatory cross-tenant-leak, MFA-enforcement, role-lifecycle, and audit-immutability classes (Part 16)    |
| 11  | Documentation                                      | DATABASE.md §2.1 promoted from design to "implemented," EVENT_ARCHITECTURE.md, API_GUIDELINES.md's Bearer-token clarification, DECISIONS.md |
| 12  | _(added in remediation)_ Privileged role lifecycle | Bootstrap-admin procedure, promotion/demotion endpoints, two-person `ADMIN` approval, emergency recovery (Part 9A)                          |
| 13  | _(added in remediation)_ Immutable audit subsystem | `AuditLog`/`EntitlementChangeLog`, `INSERT`-only grants, audit-log read endpoints (Part 9B)                                                 |

---

## PART 4 — Bounded Context & Ownership

Per ARCHITECTURE.md §2.1, Identity is one of six bounded contexts ("Users, auth, roles, organizations, consent — module 1"), hosted in `apps/api`. There is **no separate auth microservice** — ARCHITECTURE.md §4's services table lists only `ai-engine`, `speech-service`, `recommendation-engine`, `notification-service`, `analytics-service`; identity logic is a modular-monolith module inside `apps/api`, consistent with ADR-002. Part 14 records why a separate auth service was considered and rejected for MVP.

Within `apps/api`, Identity is split into three NestJS modules — `AuthModule`, `UsersModule`, `OrganizationsModule` — each depending on the others only through an exported service (CODING_STANDARDS.md §2), enforced by the same `dependency-cruiser` intra-app boundary rule E1/T4 already built and proved firing in this session's fresh verification. Cross-bounded-context calls (e.g., `notification-service` reacting to a new registration) go through the domain-event catalog (EVENT_ARCHITECTURE.md), never a synchronous cross-service call — this is already the enforced rule (ARCHITECTURE.md §2.1), not a new one E2 introduces.

---

## PART 5 — Data Model Design

The schema below is DATABASE.md §2.1's already-documented entity list, made concrete with field-level types and constraints. This section is the source E4 and DATABASE.md's own "implemented" status will eventually cite back to.

### `User`

| Field                   | Type                                                           | Notes                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | `uuid` (PK)                                                    |                                                                                                                                                                         |
| `email`                 | `citext`, unique                                               | Case-insensitive per Postgres `citext` extension — prevents `User@x.com`/`user@x.com` duplicate-account bugs                                                            |
| `passwordHash`          | `text`, nullable                                               | Argon2id (SECURITY.md §2); **null for OAuth-only accounts** — never a placeholder/empty-string hash                                                                     |
| `displayName`           | `text`                                                         |                                                                                                                                                                         |
| `avatarUrl`             | `text`, nullable                                               |                                                                                                                                                                         |
| `locale`                | `text`                                                         | UI language — distinct from `UserProfile.targetLanguage` per PRD.md §5.1                                                                                                |
| `timezone`              | `text`                                                         | IANA tz name                                                                                                                                                            |
| `role`                  | `enum(USER, TEACHER, ADMIN, ENTERPRISE_ADMIN)`, default `USER` | Server-assigned only; never client-settable at registration (SECURITY.md §3)                                                                                            |
| `status`                | `enum(PENDING_VERIFICATION, ACTIVE, SUSPENDED, DELETED)`       | `DELETED` is a terminal state reached via the erasure flow (Part 8), not a literal row delete for `ACTIVE`/`SUSPENDED` history                                          |
| `mfaEnrolled`           | `boolean`, default `false`                                     | Must be `true` before `ADMIN`/`ENTERPRISE_ADMIN` activation (ADR-011); checked server-side on every privileged-role login, not just at creation                         |
| `mfaSecret`             | `text`, nullable, **field-level encrypted**                    | TOTP secret (Part 15); encrypted at rest per SECURITY.md §4's field-level-encryption requirement for high-sensitivity data                                              |
| `organizationId`        | `uuid`, nullable, FK → `Organization`                          | `null` for individual consumer accounts (MULTITENANCY.md §1) — the tenant-scoping column                                                                                |
| `tokensValidAfter`      | `timestamptz`, default `now()`                                 | _(added in remediation — High-4)_ Bumped on every role/org-membership change; a token with `iat < tokensValidAfter` is rejected — closes the JWT staleness gap (Part 8) |
| `createdAt`/`updatedAt` | `timestamptz`                                                  |                                                                                                                                                                         |

### `OAuthAccount`

| Field               | Type                  | Notes                                                                          |
| ------------------- | --------------------- | ------------------------------------------------------------------------------ |
| `id`                | `uuid` (PK)           |                                                                                |
| `userId`            | `uuid`, FK → `User`   | One-to-many with `User` (DATABASE.md §3)                                       |
| `provider`          | `enum(GOOGLE, APPLE)` | Facebook excluded at MVP — Part 15 resolves the PRD.md/SECURITY.md discrepancy |
| `providerAccountId` | `text`                | The provider's own subject/user ID                                             |
| `linkedAt`          | `timestamptz`         |                                                                                |

Unique constraint on `(provider, providerAccountId)` — the same external identity can never link to two `User` rows.

### `UserProfile`

| Field                        | Type                                          | Notes                                                    |
| ---------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| `userId`                     | `uuid` (PK, FK → `User`)                      | 1:1                                                      |
| `nativeLanguage`             | `text`                                        |                                                          |
| `targetLanguages`            | `text[]`                                      |                                                          |
| `goalType`                   | `enum(TRAVEL, CAREER, EXAM, GENERAL_FLUENCY)` | Matches PRD.md §5 Journey A's onboarding options exactly |
| `dailyTimeCommitmentMinutes` | `int`, nullable                               |                                                          |

### `Organization`

| Field        | Type                             | Notes                                                                                                                                            |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`         | `uuid` (PK)                      |                                                                                                                                                  |
| `name`       | `text`                           |                                                                                                                                                  |
| `dataRegion` | `text`, nullable, default `null` | Reserved, unenforced (MULTITENANCY.md §5) — **out of scope this Epic**, field exists so a later migration doesn't have to backfill an assumption |
| `seatCount`  | `int`                            |                                                                                                                                                  |
| `createdAt`  | `timestamptz`                    |                                                                                                                                                  |

**This is the tenant root.** Every table with an `organizationId` FK is RLS-protected (Part 9).

### `OrganizationMembership`

| Field            | Type                             | Notes                                                                                                                                              |
| ---------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | `uuid` (PK)                      |                                                                                                                                                    |
| `userId`         | `uuid`, FK → `User`              |                                                                                                                                                    |
| `organizationId` | `uuid`, FK → `Organization`      |                                                                                                                                                    |
| `orgRole`        | `enum(MEMBER, ENTERPRISE_ADMIN)` | Role _within_ the org — distinct from `User.role`, per MULTITENANCY.md §3's explicit statement that RBAC and tenant scoping are independent checks |

Unique constraint on `(userId, organizationId)`.

### `Session` / `RefreshToken`

Server-side records pairing with stateless JWT access tokens (DATABASE.md §2.1), enabling immediate, server-enforced revocation (SECURITY.md §2 — "not just client-token expiry").

| Field (`RefreshToken`) | Type                      | Notes                                                                                      |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| `id`                   | `uuid` (PK)               |                                                                                            |
| `userId`               | `uuid`, FK → `User`       |                                                                                            |
| `tokenHash`            | `text`, unique            | The raw token is never stored — only its hash, so a DB read alone can't mint a valid token |
| `sessionId`            | `uuid`, FK → `Session`    |                                                                                            |
| `expiresAt`            | `timestamptz`             |                                                                                            |
| `rotatedFromId`        | `uuid`, nullable, self-FK | Rotation chain — Part 8 details the rotation-on-use policy                                 |
| `revokedAt`            | `timestamptz`, nullable   |                                                                                            |

| Field (`Session`)        | Type                    | Notes                                                                 |
| ------------------------ | ----------------------- | --------------------------------------------------------------------- |
| `id`                     | `uuid` (PK)             |                                                                       |
| `userId`                 | `uuid`, FK → `User`     |                                                                       |
| `deviceLabel`            | `text`, nullable        | For the account's "active sessions" view (session revocation UX)      |
| `createdAt`/`lastSeenAt` | `timestamptz`           |                                                                       |
| `revokedAt`              | `timestamptz`, nullable | Revoking a `Session` cascades to revoke every `RefreshToken` under it |

### `ConsentRecord`

| Field           | Type                                   | Notes                                                  |
| --------------- | -------------------------------------- | ------------------------------------------------------ |
| `id`            | `uuid` (PK)                            |                                                        |
| `userId`        | `uuid`, FK → `User`                    |                                                        |
| `consentType`   | `enum(TOS, PRIVACY_POLICY, MARKETING)` | Parental-consent type intentionally excluded — ADR-013 |
| `policyVersion` | `text`                                 |                                                        |
| `grantedAt`     | `timestamptz`                          |                                                        |
| `withdrawnAt`   | `timestamptz`, nullable                |                                                        |

Retained through the life of the account **and** the compliance-required window after erasure (DATABASE.md §7) — survives account anonymization by design, not by oversight.

### `DeviceToken`

| Field      | Type                      | Notes |
| ---------- | ------------------------- | ----- |
| `id`       | `uuid` (PK)               |       |
| `userId`   | `uuid`, FK → `User`       |       |
| `platform` | `enum(IOS, ANDROID, WEB)` |       |
| `token`    | `text`                    |       |
| `active`   | `boolean`, default `true` |       |

Owned by Identity per DATABASE.md §2.1, but consumed by `notification-service` (module 25) — a cross-bounded-context read handled the same way as any other: `notification-service` never queries `apps/api`'s database directly; it receives `DeviceToken` state via domain events (Part 10), consistent with ADR-010 (domain events over point-to-point calls).

### `PasswordResetToken` _(added in remediation — Medium-2, folded in during the Critical/High remediation pass)_

| Field       | Type                    | Notes                                                                                       |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `id`        | `uuid` (PK)             |                                                                                             |
| `userId`    | `uuid`, FK → `User`     |                                                                                             |
| `tokenHash` | `text`, unique          | Same pattern as `RefreshToken.tokenHash` — the raw token is never stored                    |
| `expiresAt` | `timestamptz`           | 1 hour from issuance                                                                        |
| `usedAt`    | `timestamptz`, nullable | Single-use — a second confirmation attempt with the same token is rejected once this is set |

### `RoleChangeRequest` _(added in remediation — Critical-1)_

The two-person-approval workflow for `ADMIN` grants/revocations (Part 9A) needs somewhere to hold pending state — this is that entity, not a general-purpose workflow engine.

| Field                    | Type                                           | Notes                                                                                                    |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                     | `uuid` (PK)                                    |                                                                                                          |
| `targetUserId`           | `uuid`, FK → `User`                            | Whose role is changing                                                                                   |
| `fromRole`               | `enum(USER, TEACHER, ADMIN, ENTERPRISE_ADMIN)` |                                                                                                          |
| `toRole`                 | `enum(USER, TEACHER, ADMIN, ENTERPRISE_ADMIN)` |                                                                                                          |
| `requestedBy`            | `uuid`, FK → `User`                            |                                                                                                          |
| `approvedBy`             | `uuid`, FK → `User`, nullable                  | Must differ from `requestedBy` — enforced at the application layer (Part 9A)                             |
| `status`                 | `enum(PENDING, APPROVED, REJECTED, EXPIRED)`   | Only `ADMIN`-involving changes ever sit in `PENDING`; all other role changes are auto-approved (Part 9A) |
| `expiresAt`              | `timestamptz`                                  | 72 hours — an unapproved request doesn't linger indefinitely                                             |
| `createdAt`/`resolvedAt` | `timestamptz`                                  |                                                                                                          |

### `AuditLog` _(added in remediation — Critical-3, full design in Part 9B)_

| Field           | Type                          | Notes                                                                                          |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `id`            | `uuid` (PK)                   |                                                                                                |
| `actorUserId`   | `uuid`, FK → `User`, nullable | Nullable for system/bootstrap-initiated actions (Part 9A)                                      |
| `actorType`     | `enum(USER, SYSTEM, SERVICE)` |                                                                                                |
| `action`        | `text`                        | e.g. `"user.role.changed"`, `"organization.member.removed"`                                    |
| `targetType`    | `text`                        | e.g. `"User"`, `"Organization"`                                                                |
| `targetId`      | `uuid`                        |                                                                                                |
| `tenantId`      | `uuid`, nullable              | `organizationId` context; `null` for platform-level actions                                    |
| `correlationId` | `uuid`                        | Reuses `packages/observability`'s existing request correlation ID (E1) — no parallel ID scheme |
| `beforeValue`   | `jsonb`, nullable             |                                                                                                |
| `afterValue`    | `jsonb`, nullable             |                                                                                                |
| `occurredAt`    | `timestamptz`                 |                                                                                                |

**Immutable by construction, not just convention:** the standard application database role has `INSERT`/`SELECT` only on this table — `UPDATE`/`DELETE` are not granted, at the Postgres privilege level (Part 9B).

### `EntitlementChangeLog` _(added in remediation — Critical-3; entity defined now, write path owned by Epic E15)_

SECURITY.md §3 names `AuditLog`/`EntitlementChangeLog` together as the two required immutable logs. E2 owns Identity, not Billing (Part 2) — E15 (Subscription & Billing Platform) is where entitlement changes actually happen, so this Epic defines the entity's shape (so E15 doesn't invent a competing pattern) without populating it, avoiding scope expansion into billing logic.

| Field             | Type                              | Notes                                       |
| ----------------- | --------------------------------- | ------------------------------------------- |
| `id`              | `uuid` (PK)                       |                                             |
| `userId`          | `uuid`, FK → `User`               |                                             |
| `entitlementType` | `text`                            | e.g. `"premium_subscription"`               |
| `action`          | `enum(GRANTED, REVOKED, CHANGED)` |                                             |
| `source`          | `text`                            | e.g. `"stripe_webhook"`, `"admin_override"` |
| `occurredAt`      | `timestamptz`                     |                                             |

Same immutability rule as `AuditLog` — `INSERT`/`SELECT` only.

### Entity relationships (DATABASE.md §3, reproduced for this Epic's tables)

```
User ──1:1── UserProfile
User ──1:N── OAuthAccount
User ──1:N── ConsentRecord
User ──1:N── Session ──1:N── RefreshToken
User ──1:N── DeviceToken
User ──1:N── PasswordResetToken
User ──N:1── Organization (nullable, via OrganizationMembership)
Organization ──1:N── OrganizationMembership ──N:1── User
User ──1:N── RoleChangeRequest (as targetUserId/requestedBy/approvedBy)
User ──1:N── AuditLog (as actorUserId, nullable)
```

### Migration & RLS requirement

Per DATABASE.md §1/MULTITENANCY.md §6: the migration adding `Organization`, `OrganizationMembership`, and any table carrying `organizationId` **must** include its RLS policy in the same migration — CI already rejects one without the other (E1/T4's schema-lint script, extended here for the first real tenant-scoped tables). **Explicitly including `User`** _(added in remediation — Critical-2, the first review's own finding that this table was left out)_ — Part 9 gives the complete policy matrix for all three tables.

---

## PART 6 — API Design

All endpoints follow API_GUIDELINES.md's existing conventions exactly — no auth-specific deviation invented here. Versioned under `/v1/` (matches `apps/api`'s existing `setGlobalPrefix('v1', { exclude: ['health'] })` from E1/T13).

| Method   | Path                                                    | Purpose                                         | Auth                                                              | Notes                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/v1/auth/register`                                     | Email/password registration                     | None                                                              | Emits `identity.user.registered`, `identity.consent.recorded`                                                                                                                                                           |
| `POST`   | `/v1/auth/login`                                        | Email/password login                            | None                                                              | Rate-limited class (Part 8)                                                                                                                                                                                             |
| `GET`    | `/v1/auth/oauth/:provider`                              | Start OAuth flow (Google/Apple)                 | None                                                              | _(remediated — High-2)_ Issues a signed, short-lived `state` value, echoed back on the callback                                                                                                                         |
| `GET`    | `/v1/auth/oauth/:provider/callback`                     | OAuth callback                                  | None                                                              | Rejects on missing/invalid `state` (High-2). Creates `User`+`OAuthAccount` only on a genuinely new `(provider, providerAccountId)` — **never auto-links by email** (High-3, Part 8)                                     |
| `POST`   | `/v1/users/me/oauth-accounts`                           | Link an OAuth provider to the current account   | Access token                                                      | _(added — High-3)_ The only path that attaches an OAuth identity to an _existing_ account — requires proof of ownership (an active session) first, closing the email-auto-link takeover path                            |
| `POST`   | `/v1/auth/refresh`                                      | Rotate refresh token → new access token         | Refresh token (cookie)                                            | Part 8's rotation policy                                                                                                                                                                                                |
| `POST`   | `/v1/auth/logout`                                       | Revoke current session                          | Access token                                                      |                                                                                                                                                                                                                         |
| `POST`   | `/v1/auth/password-reset/request`                       | Start password reset                            | None                                                              | No-op (200, no email sent) for OAuth-only accounts, redirect messaging per PRD.md §5.1 — never a dead end, never a user-enumeration leak (SECURITY.md §6)                                                               |
| `POST`   | `/v1/auth/password-reset/confirm`                       | Complete password reset                         | Reset token                                                       | Single-use `PasswordResetToken`, 1h expiry (Part 5); revokes all existing sessions on success                                                                                                                           |
| `POST`   | `/v1/auth/mfa/enroll`                                   | Begin TOTP enrollment                           | Access token                                                      | Returns QR/secret; does not set `mfaEnrolled=true` until verified                                                                                                                                                       |
| `POST`   | `/v1/auth/mfa/verify`                                   | Confirm TOTP code, complete enrollment          | Access token                                                      | Sets `mfaEnrolled=true`; **rate-limited class** _(remediated — High-4, Part 8)_                                                                                                                                         |
| `POST`   | `/v1/auth/mfa/challenge`                                | Verify TOTP at login step-up                    | Partial session (post-password, pre-MFA)                          | **Rate-limited + lockout class** _(remediated — High-4, Part 8)_                                                                                                                                                        |
| `GET`    | `/v1/users/me`                                          | Current user + profile                          | Access token                                                      |                                                                                                                                                                                                                         |
| `PATCH`  | `/v1/users/me`                                          | Update profile                                  | Access token                                                      |                                                                                                                                                                                                                         |
| `GET`    | `/v1/users/me/sessions`                                 | List active sessions                            | Access token                                                      |                                                                                                                                                                                                                         |
| `DELETE` | `/v1/users/me/sessions/:id`                             | Revoke a specific session                       | Access token                                                      |                                                                                                                                                                                                                         |
| `POST`   | `/v1/users/me/deletion-request`                         | GDPR erasure request                            | Access token                                                      | Emits `account.deletion.requested`; async cascade per DATABASE.md §10                                                                                                                                                   |
| `POST`   | `/v1/users/:id/role-change-requests`                    | Initiate a role change                          | Access token, `ADMIN`                                             | _(added — Critical-1, Part 9A)_ Auto-approved immediately unless `fromRole`/`toRole` involves `ADMIN`, in which case it stays `PENDING`                                                                                 |
| `POST`   | `/v1/users/:id/role-change-requests/:requestId/approve` | Approve a pending `ADMIN`-involving role change | Access token, `ADMIN`, **must differ from the requester**         | _(added — Critical-1, Part 9A)_ Two-person approval; role only actually changes on approval                                                                                                                             |
| `PATCH`  | `/v1/organizations/:id/members/:userId/role`            | Promote/demote `orgRole` within an org          | Access token, `ENTERPRISE_ADMIN` of that org, or platform `ADMIN` | _(added — Critical-1, Part 9A)_ Single-party (org-scoped risk, ADR-011's own proportionality logic); blocked if it would leave the org with zero `ENTERPRISE_ADMIN`                                                     |
| `POST`   | `/v1/organizations`                                     | Create org, designate first `ENTERPRISE_ADMIN`  | Access token, platform `ADMIN`                                    | _(tightened to platform-`ADMIN`-only — Critical-2 RLS design, Part 9; the original draft's "self as first `ENTERPRISE_ADMIN`" wording didn't match MULTITENANCY.md §4's own "admin-initiated" framing, corrected here)_ |
| `GET`    | `/v1/organizations/:id`                                 | Org detail                                      | Access token, `ENTERPRISE_ADMIN` of that org                      | Tenant-scoped 404 (not 403) if not visible, per API_GUIDELINES.md §3                                                                                                                                                    |
| `POST`   | `/v1/organizations/:id/members`                         | Add member(s)                                   | Access token, `ENTERPRISE_ADMIN`                                  | Also accepts CSV bulk import                                                                                                                                                                                            |
| `DELETE` | `/v1/organizations/:id/members/:userId`                 | Remove member                                   | Access token, `ENTERPRISE_ADMIN`                                  | Blocked if target is the org's last `ENTERPRISE_ADMIN` (Part 9A)                                                                                                                                                        |
| `GET`    | `/v1/audit-log`                                         | Platform-wide audit log, filterable             | Access token, platform `ADMIN`                                    | _(added — Critical-3, Part 9B)_                                                                                                                                                                                         |
| `GET`    | `/v1/organizations/:id/audit-log`                       | Org-scoped audit log                            | Access token, `ENTERPRISE_ADMIN` of that org                      | _(added — Critical-3, Part 9B)_ RLS-scoped the same way as other org data (Part 9)                                                                                                                                      |

**Error codes** — reuses API_GUIDELINES.md §3's existing registry with no new codes needed: `AUTH_REQUIRED` (401, missing/invalid/expired token), `FORBIDDEN` (403, role/ownership check failed), `NOT_FOUND` (404, tenant-scoped resource invisible to caller — explicitly not 403, per the existing rule against leaking existence), `CONFLICT` (409, duplicate email on registration — API_GUIDELINES.md's own example for this exact code).

**Idempotency** — `POST /v1/auth/register` accepts an `Idempotency-Key` header per API_GUIDELINES.md §6's existing policy for retry-prone `POST`s on flaky connections; registration wasn't named in API_GUIDELINES.md's own examples (research confirmed this), so this design explicitly extends that list rather than leaving registration idempotency undefined — a duplicate registration attempt with the same key replays the original response instead of returning a spurious `CONFLICT`.

---

## PART 7 — Component Design

```
apps/api/src/identity/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts        # /v1/auth/*
│   ├── auth.service.ts           # registration, login, token issuance/rotation
│   ├── strategies/                # Passport strategies: local, jwt, google, apple
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts        # @Roles(...) decorator support
│   │   └── mfa.guard.ts          # blocks ADMIN/ENTERPRISE_ADMIN routes pre-MFA-verify
│   └── mfa/
│       ├── mfa.service.ts        # TOTP enrollment/verification (Part 15)
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts       # /v1/users/*
│   ├── users.service.ts          # profile, sessions, deletion-request
│   └── role-lifecycle.service.ts # role-change-request create/approve, last-admin-standing guard (Part 9A)
├── organizations/
│   ├── organizations.module.ts
│   ├── organizations.controller.ts
│   ├── organizations.service.ts
│   └── tenant.middleware.ts       # sets app.current_org_id / app.current_user_id / app.is_platform_admin (Part 9)
└── audit/
    ├── audit.module.ts
    ├── audit.service.ts          # writes to AuditLog via the app role's INSERT-only grant (Part 9B)
    └── audit.controller.ts       # /v1/audit-log, /v1/organizations/:id/audit-log
```

_(`role-lifecycle.service.ts` and the `audit/` module added in remediation — Critical-1/Critical-3.)_

Controller → service → repository layering (CODING_STANDARDS.md): controllers hold no business logic beyond DTO validation (delegated to `packages/validation`'s Zod schemas via a shared NestJS pipe) and HTTP-shape concerns; services hold all auth/tenancy/RBAC logic; the Prisma client (`packages/database`) is the repository layer — no service issues raw SQL outside `packages/database`'s generated client.

`RolesGuard` reads a `@Roles(Role.ADMIN, Role.ENTERPRISE_ADMIN)` decorator (standard NestJS pattern) — this is an implementation detail of an already-accepted requirement (SECURITY.md §3: "enforced server-side on every request"), not a new architecture decision requiring its own ADR (Part 15 restricts new ADRs to genuinely undecided questions).

---

## PART 8 — Authentication & Session Design

- **Password hashing:** Argon2id (SECURITY.md §2, no alternative considered — already decided).
- **Access tokens:** short-lived JWT (15 min), `Authorization: Bearer` header — chosen over a cookie for the access token specifically because `apps/web`/`apps/admin` are not the only consumers; the Flutter mobile app (E21) has no browser cookie jar, and a single, platform-agnostic transport avoids a web-only/mobile-only auth code fork. This resolves a gap the research explicitly found unspecified in API_GUIDELINES.md (Part 15, new ADR).
- **JWT claim shape** _(added in remediation — High-1)_: `sub` (userId), `role`, `organizationId` (nullable), `orgRole` (nullable), `jti`, `iat`, `exp` — embedding `role`/`organizationId` avoids a `User` DB read on every authorized request (the stateless-JWT rationale ADR-018 already relies on), but a server-issued claim can go stale relative to a change made _after_ issuance. **Staleness policy:** every request additionally checks `jwt.iat >= user.tokensValidAfter` (Part 5's new field) — a cheap, indexed/cache-backed lookup, not a full `User` fetch. A role or org-membership change bumps `tokensValidAfter`, which invalidates every access token issued before that instant on the caller's _next_ request, regardless of the token's own 15-minute expiry. This closes the "old token still carries the old role for up to 15 minutes" gap identified in review.
- **Refresh tokens:** long-lived (30 days), rotating on every use (one-time-use — a reused/stolen refresh token is detected because its `rotatedFromId` chain breaks, triggering full-session revocation), stored **httpOnly/secure/SameSite=strict cookie for web** (SECURITY.md §2, already decided) and in platform-appropriate secure storage for mobile (Keychain/Keystore) — not a new decision, an application of the existing cookie requirement to the one platform it wasn't written for. **Rotation atomicity** _(added in remediation — Medium-1)_: the "mark old token used, issue new one" step is a single conditional `UPDATE ... WHERE revokedAt IS NULL AND used = false RETURNING *` — if two requests race on the same token, exactly one succeeds and the other observes zero rows updated, which is treated identically to reuse detection (full-session revocation), not silently ignored.
- **Session revocation:** immediate, server-enforced via the `Session`/`RefreshToken` tables (Part 5) — a revoked session's access tokens are also checked against a short-TTL Redis denylist (keyed by JWT `jti`) so revocation doesn't have to wait out a 15-minute access-token TTL, closing the gap between "stateless JWT" and "immediate revocation" SECURITY.md §2 requires. The `tokensValidAfter` check above is the _general_ mechanism for any claim-affecting change; the `jti` denylist remains for single-session revocation (e.g., "log out this one device") where bumping `tokensValidAfter` would over-invalidate every other active session too.
- **MFA:** TOTP (RFC 6238) — Part 15's new ADR states the mechanism and alternatives considered. **Verification rate limiting** _(added in remediation — High-4)_: `/v1/auth/mfa/verify` and `/v1/auth/mfa/challenge` join the same stricter Redis-backed rate-limit class as login (below), plus an explicit lockout: 5 failed attempts within a 10-minute window locks the MFA-challenge step for that session for 15 minutes, forcing the caller back to a fresh password/OAuth login rather than allowing unlimited TOTP guesses within its ~30-second code-validity window.
- **OAuth:** Google and Apple only at MVP — Part 15's new ADR resolves the PRD.md/SECURITY.md provider-list discrepancy. **CSRF protection** _(added in remediation — High-2)_: `GET /v1/auth/oauth/:provider` issues a signed, short-lived (10 minute), single-use `state` value; the callback rejects the exchange outright if `state` is missing, expired, already-used, or doesn't match — the standard defense against OAuth authorization-code-injection CSRF. **Account-linking rule** _(added in remediation — High-3)_: an `OAuthAccount` is matched **only** by `(provider, providerAccountId)` — never by email. A callback whose provider-email matches an existing password-based `User.email` but whose `(provider, providerAccountId)` doesn't yet exist as an `OAuthAccount` does **not** auto-link; it returns a distinct response directing the caller to log in with their existing password first, then link explicitly via the new authenticated `POST /v1/users/me/oauth-accounts` (Part 6) — closing the pre-registration account-takeover pattern named in review.
- **Rate limiting:** Redis-backed distributed limiter (API_GUIDELINES.md §7, already decided), auth endpoints in a stricter class than standard CRUD (SECURITY.md §2's "rate limiting + progressive backoff on auth endpoints"), keyed by `(email or IP, endpoint)` for `/v1/auth/login`, `/v1/auth/password-reset/*`, and — closing the gap identified in review — `/v1/auth/mfa/verify`/`/v1/auth/mfa/challenge`, to blunt both credential-stuffing (many emails, one IP) and single-account brute force (one email, many IPs).
- **Anomaly detection (new-device/new-geo step-up):** explicitly deferred (Part 2) — E2 ships the `identity.session.created` event (Part 10) carrying enough signal (IP, user-agent) for a later epic to build step-up verification on top of, but does not build the detection logic itself.

---

## PART 9 — Authorization & Multi-tenancy Design

Implements MULTITENANCY.md's three-layer design exactly. **Revised in remediation (Critical-2)** — the original draft gave a complete RLS example only for `OrganizationMembership`; this revision gives the full policy matrix for **every** table carrying `organizationId`: `User`, `Organization`, `OrganizationMembership`.

1. **Application query layer** — every Prisma query touching a tenant-scoped table includes an explicit `organizationId` (or, for `User`, `id`-or-`organizationId`) filter, code-reviewed per CONTRIBUTING.md.
2. **Postgres RLS (authoritative layer)** — `tenant.middleware.ts` runs after auth resolves the caller's identity, setting three session variables via Prisma middleware once per request, before any query runs: `app.current_user_id` (always), `app.current_org_id` (nullable), `app.caller_org_role` (the caller's `OrganizationMembership.orgRole` in their current org, nullable), `app.is_platform_admin` (`true` only if the caller's `User.role = 'ADMIN'`, verified server-side from the JWT claim, never client-supplied).
3. **Integration test suite** — for every table below, a required test class (TESTING.md §5, MULTITENANCY.md §6) asserting cross-tenant access is denied even with the application-layer filter deliberately bypassed in the test harness (negative examples given below for each table).

RBAC and RLS remain independent per MULTITENANCY.md §3 — `RolesGuard` (role check) and `tenant.middleware.ts` (tenant scope) are two separate, composable NestJS request-pipeline stages, never conflated into one check.

### Policy matrix

#### `Organization` (the tenant root)

```sql
-- READ: visible to members of that org, or a platform admin
CREATE POLICY org_read ON "Organization"
  USING (
    id = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

-- INSERT: platform admin only (MULTITENANCY.md §4 — admin-initiated provisioning, not self-serve at MVP)
CREATE POLICY org_insert ON "Organization"
  FOR INSERT WITH CHECK (current_setting('app.is_platform_admin', true)::boolean = true);

-- UPDATE: that org's ENTERPRISE_ADMIN, or a platform admin
CREATE POLICY org_update ON "Organization"
  FOR UPDATE USING (
    (id = current_setting('app.current_org_id', true)::uuid
      AND current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN')
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

-- DELETE: platform admin only. No endpoint exposes this in Part 6 (org deletion is
-- high-consequence and out of MVP scope) — the policy exists defensively so a future
-- endpoint can't accidentally inherit a permissive default.
CREATE POLICY org_delete ON "Organization"
  FOR DELETE USING (current_setting('app.is_platform_admin', true)::boolean = true);
```

**Negative example:** an `ENTERPRISE_ADMIN` of Org A calls `GET /v1/organizations/<Org B's id>`. `app.current_org_id` is Org A's id; `org_read`'s `USING` clause evaluates false for Org B's row; the application layer receives zero rows and returns `NOT_FOUND` (404, not 403 — API_GUIDELINES.md §3's existing no-existence-leak rule, Part 6).

#### `OrganizationMembership`

```sql
CREATE POLICY membership_read ON "OrganizationMembership"
  USING (
    "organizationId" = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

CREATE POLICY membership_insert ON "OrganizationMembership"
  FOR INSERT WITH CHECK (
    ("organizationId" = current_setting('app.current_org_id', true)::uuid
      AND current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN')
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

CREATE POLICY membership_update ON "OrganizationMembership"
  FOR UPDATE USING (
    ("organizationId" = current_setting('app.current_org_id', true)::uuid
      AND current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN')
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

CREATE POLICY membership_delete ON "OrganizationMembership"
  FOR DELETE USING (
    ("organizationId" = current_setting('app.current_org_id', true)::uuid
      AND current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN')
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );
```

The RLS policy alone cannot express "but not if this would leave the org with zero `ENTERPRISE_ADMIN`s" (a row-count invariant, not a row-visibility one) — that check stays at the application layer (`organizations.service.ts`, Part 9A), backed by a `CHECK`-style database trigger as defense-in-depth (raises if a `DELETE`/`UPDATE` on this table would leave an org with zero `ENTERPRISE_ADMIN` rows).

**Negative example:** simulating MULTITENANCY.md §6's required test methodology — with the application-layer `organizationId` filter deliberately removed in a test harness, `SELECT * FROM "OrganizationMembership" WHERE "organizationId" = '<Org B>'` executed with `app.current_org_id` set to Org A returns zero rows. `INSERT INTO "OrganizationMembership" ("organizationId", ...) VALUES ('<Org B>', ...)` while `app.current_org_id` is Org A is rejected at the database layer by `membership_insert`'s `WITH CHECK`, even if a hypothetical application bug had let the request through.

#### `User` — the table the first review found missing entirely

`User.organizationId` is nullable (individual consumer accounts have no org) and a user must always be able to read/update their own row regardless of org context — so this policy has three conditions, not two:

```sql
CREATE POLICY user_read ON "User"
  USING (
    id = current_setting('app.current_user_id', true)::uuid
    OR "organizationId" = current_setting('app.current_org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

-- INSERT: denied to the standard per-request role entirely (registration and OAuth
-- account creation happen pre-authentication, before any app.current_user_id exists
-- to check against) — see "Service-role exception" below for how these paths work.
CREATE POLICY user_insert ON "User"
  FOR INSERT WITH CHECK (false);

CREATE POLICY user_update ON "User"
  FOR UPDATE USING (
    id = current_setting('app.current_user_id', true)::uuid
    OR (current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN'
        AND "organizationId" = current_setting('app.current_org_id', true)::uuid)
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );

-- DELETE: denied to the standard role. GDPR erasure (DATABASE.md §10) anonymizes
-- User rows in place rather than deleting them, and runs through the service role.
CREATE POLICY user_delete ON "User"
  FOR DELETE USING (false);
```

**Negative example:** an `ENTERPRISE_ADMIN` of Org A, with the application-layer filter deliberately bypassed in a test harness, runs `SELECT * FROM "User" WHERE "organizationId" = '<Org B>'`. Neither `id = current_user_id` (it's not their own row) nor `"organizationId" = current_org_id` (Org A ≠ Org B) is true for any Org B row, and they are not a platform admin — zero rows returned. This is the exact gap the first review found: `User` is now provably tenant-isolated, not merely assumed to be by virtue of being reached "through" `OrganizationMembership`.

### Service-role exception (registration, OAuth creation, bootstrap, GDPR erasure)

Two operations must legitimately write to `User` before any `app.current_user_id`/`app.current_org_id` context exists (registration, first-touch OAuth account creation) or must cross tenant boundaries by design (the GDPR erasure background job, Part 9A's bootstrap-admin procedure). Rather than weakening the policies above with a broader `INSERT`/`DELETE` allowance, these specific, narrow, code-reviewed code paths run through a **separate Postgres role** (`app_service_role`) granted `BYPASSRLS` — a native Postgres privilege, grantable only by a superuser, never assignable to the default per-request connection pool. `app_service_role` is used **only** by: `auth.service.ts`'s registration/OAuth-creation methods, the bootstrap CLI (Part 9A), and the GDPR-erasure BullMQ job. Every one of these is a named, small, individually-reviewable code path, not a general escape hatch — any new use of `app_service_role` is called out explicitly in CODE_REVIEW_CHECKLIST.md as requiring extra review, since it is the one place in the system where RLS's defense-in-depth layer is deliberately absent and the application layer alone is authoritative.

**Background job access:** the same `app_service_role` is used by any BullMQ job that must legitimately operate across tenant boundaries (e.g., a platform-wide report). Each such job is required to implement and test its own explicit scoping logic in place of RLS, per the same review-discipline rule above.

**Administrative access:** a platform `ADMIN`'s cross-tenant reads/writes go through the _standard_ per-request role with `app.is_platform_admin = true` (set from their verified `User.role`, never client-supplied) — not through `app_service_role` — so admin actions remain subject to RLS's `OR is_platform_admin` clauses (visible, intentional, and logged — Part 9B) rather than bypassing RLS entirely the way the narrow service-role paths do.

**Provisioning:** `POST /v1/organizations` (Part 6, now platform-`ADMIN`-only per this revision) is the admin-initiated flow MULTITENANCY.md §4 describes. Bulk CSV import creates `User` + `OrganizationMembership` in the same transaction (via `app_service_role`, since it may create `User` rows with no prior session context) so no bulk-imported user is ever tenant-unscoped, per §4's explicit requirement.

---

## PART 9A — Privileged Role Lifecycle & Governance _(added in remediation — Critical-1)_

The first review found no mechanism anywhere in the design for changing a `User.role` or `OrganizationMembership.orgRole` — including, concretely, no way the very first `ADMIN` account could ever come to exist. This part closes that gap end-to-end.

### Design decision: no new role tier

"Super Admin" and "System administrator" governance is delivered as a **process control** (two-person approval, below) applied to the existing `ADMIN` role, not as a new schema-level role value. `DATABASE.md §2.1`'s already-accepted `role` enum (`USER | TEACHER | ADMIN | ENTERPRISE_ADMIN`) is preserved unchanged — adding a fifth tier would be a larger, riskier schema change than this finding requires, and would contradict "preserve the approved architecture wherever possible." `ADMIN` **is** the system-administrator role (platform-wide); `ENTERPRISE_ADMIN` **is** the enterprise-organization-administrator role (org-scoped) — both already exist; what was missing was the lifecycle around granting/revoking them, not the roles themselves. This decision is recorded as ADR-021 (Part 15).

### Bootstrap administrator creation

The first `ADMIN` account in any environment cannot be created by "an existing `ADMIN` approves it" — none exists yet. It is created by a **one-time, out-of-band operational procedure**, never exposed over the public API:

- A CLI script (`packages/database`'s tooling, run via infrastructure-level access — the same operational tier as `modules/state-backend`'s one-time bootstrap, E1's `infrastructure/terraform/README.md`), gated by an environment variable/secret available only to whoever has deploy access to that environment (not the application's own runtime secrets).
- Runs through `app_service_role` (the `BYPASSRLS` service role above), since no `app.current_user_id` exists to authorize the insert through the standard role.
- Creates the `User` row directly with `role = 'ADMIN'`, `mfaEnrolled = false` — the account **cannot perform any privileged action** until it completes MFA enrollment on first login (`MfaGuard`, Part 7, already blocks every privileged route pre-enrollment — this rule already existed and now has a real first-use case).
- Writes an `AuditLog` entry with `actorType = 'SYSTEM'`, `action = 'user.bootstrap_admin_created'` (Part 9B).
- Emits `identity.role.changed` with `changedBy: 'system-bootstrap'` (Part 10).

### Role promotion / demotion workflow

| Change                                                     | Endpoint (Part 6)                                                  | Authorization                                                             | Approval                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `USER` → `TEACHER` (or reverse)                            | `POST /v1/users/:id/role-change-requests`                          | Any `ADMIN`                                                               | Single-party — auto-approved immediately (PRD.md §5.1's narrow `TEACHER` scope is low-risk, matching ADR-011's own risk-proportionate reasoning)                                                                                          |
| Any role → `ADMIN`, or `ADMIN` → any role                  | `POST /v1/users/:id/role-change-requests`, then `POST .../approve` | Any `ADMIN` may request                                                   | **Two-person**: a second, different `ADMIN` must call `.../approve`, which invokes `approve_role_change()` (Part 9C) before the change takes effect (`RoleChangeRequest.status` stays `PENDING` until then, expires unapproved after 72h) |
| `MEMBER` → `ENTERPRISE_ADMIN` (or reverse), within one org | `PATCH /v1/organizations/:id/members/:userId/role`                 | That org's `ENTERPRISE_ADMIN`, or a platform `ADMIN` (cross-org override) | Single-party (org-scoped blast radius, same proportionality logic)                                                                                                                                                                        |

**Guardrails, both enforced at the application layer (RLS can't express row-count invariants):**

- An `ADMIN` cannot approve their own promotion/demotion request (`RoleChangeRequest.approvedBy` must differ from `requestedBy` — checked in `role-lifecycle.service.ts`, Part 7).
- Demoting the **last remaining `ADMIN`** in the system is blocked outright (prevents a total-lockout scenario).
- Demoting the **last remaining `ENTERPRISE_ADMIN`** of an org is blocked outright (same protection, org-scoped) — this is also `DELETE /v1/organizations/:id/members/:userId`'s existing "cannot remove last `ENTERPRISE_ADMIN`" rule (Part 6), applied consistently to demotion as well as removal.
- On any successful role/org-role change, the target's `User.tokensValidAfter` is bumped (Part 8) — the change takes effect on the target's very next request, not at their current token's natural expiry.
- _(added in remediation pass #2)_ All of the above — the atomic claim, the role write, the `tokensValidAfter` bump, and the `AuditLog` write — happen inside `approve_role_change()`/`set_org_role()` (Part 9C), not as separate application-layer steps. `User.role`/`organizationId`/`OrganizationMembership.orgRole` are not reachable by any other write path from the standard application role — Part 9C's column-level grants make this a database-enforced guarantee, not an application-discipline assumption.

### Emergency recovery procedure

If every `ADMIN` account becomes inaccessible (e.g., all MFA devices lost), the same bootstrap CLI (above) is re-run to designate a new `ADMIN` — gated the same way (infrastructure-level access, not application-level), since by definition no application-level `ADMIN` session is available to authorize it. This path:

- Writes an `AuditLog` entry with maximum severity (`action = 'user.emergency_admin_recovery'`) and emits a distinct `identity.role.emergency_recovery` event (Part 10) rather than reusing the ordinary bootstrap event — recovery is a security incident by definition and should be visible as one, not blended into routine audit volume.
- Is expected (operationally, not enforced in code — this is a process requirement, not a technical one, consistent with how E1 treated equivalent operational prerequisites) to trigger a mandatory post-incident security review, per SECURITY.md §9's incident-response process.

### Audit & approval requirements (summary — full subsystem in Part 9B)

Every event in this section — bootstrap creation, promotion/demotion request, approval, rejection, emergency recovery — writes an `AuditLog` row with actor, target, before/after role, and correlation ID. This is the primary consumer of the audit subsystem Critical-3 requires.

---

## PART 9B — Immutable Audit Subsystem _(added in remediation — Critical-3)_

SECURITY.md §3 requires admin actions and entitlement changes to be logged to an immutable, append-only `AuditLog`/`EntitlementChangeLog` — neither existed anywhere in the original design (one sentence even referenced `AuditLog` as if it already existed, which the first review caught). Entities are defined in Part 5; this part specifies the subsystem around them.

### Immutable storage rules

The standard application database role (used by `packages/database`'s normal Prisma client) is granted `INSERT`, `SELECT` on `AuditLog` and `EntitlementChangeLog` — **`UPDATE`/`DELETE` are not granted, at the Postgres privilege level**:

```sql
REVOKE UPDATE, DELETE ON "AuditLog", "EntitlementChangeLog" FROM app_role;
GRANT INSERT, SELECT ON "AuditLog", "EntitlementChangeLog" TO app_role;
```

This means immutability holds even against an application-layer bug or a compromised app-role credential — it is not merely a code-review convention. Only a superuser-level migration role (never the running application) could alter these tables, and doing so is itself the kind of change that would need its own audited migration.

### Required audit events (Part 2's "in scope" list, made concrete)

Every action in Part 9A (role bootstrap/promotion/demotion/approval/emergency-recovery), every platform-`ADMIN` cross-tenant read/write (the `is_platform_admin` RLS branch in Part 9 — audited specifically because it's the one path that legitimately crosses the tenant boundary through the standard role), organization membership changes, MFA enrollment, account-deletion requests, password-reset completion, admin-initiated session revocation, and OAuth account linking.

### Record shape (repeated from Part 5 for context)

Actor (`actorUserId`, nullable for system actions; `actorType`), target (`targetType`, `targetId`), tenant (`tenantId`, nullable for platform-level actions), correlation ID (reuses `packages/observability`'s existing per-request correlation ID from E1 — no parallel ID scheme, consistent with ADR-016's own stated principle), before/after values (`jsonb`), and timestamp.

### Retention

**7 years for `AuditLog`/`EntitlementChangeLog`** — a common compliance-baseline figure (SOC 2 / financial-audit norms), stated here as a considered placeholder pending real legal/compliance review, not a final commitment — the same "don't overbuild, don't under-specify" discipline E1 applied to its own budget-alert threshold (`infrastructure/terraform` module, $500/month placeholder). Survives account anonymization (DATABASE.md §10) — an audit record about a now-anonymized account is exactly the kind of append-only historical record §6's soft-delete policy already describes as surviving erasure.

### Access policy

`AuditLog` is readable via `GET /v1/audit-log` (platform `ADMIN`, unscoped) and `GET /v1/organizations/:id/audit-log` (that org's `ENTERPRISE_ADMIN`, scoped to `tenantId`) — both endpoints (Part 6) sit behind the exact same RLS pattern already established in Part 9 (`tenantId` plays the same role `organizationId` does elsewhere), rather than inventing a new access-control shape for this one table.

---

## PART 9C — Privileged Column Protection & Atomic Governance Functions _(added in remediation pass #2 — mandatory findings #1/#2, second Architecture Gate review)_

The second review found that Part 9's row-level RLS policies do not restrict which _columns_ a permitted row-level write can touch — an `ENTERPRISE_ADMIN`'s standard `user_update` access, granted for legitimate org-member management, could in principle also be used to write `User.role` directly, bypassing Part 9A's two-person-approval workflow entirely with no database-level objection. This part is the **approved enforcement mechanism** closing that gap, plus the atomicity guarantee the same review asked for.

### The pattern: column allowlisting + `SECURITY DEFINER` governance functions

Two complementary controls, applied together:

1. **Column-level privilege allowlisting** — the standard application role (`app_role`) has its blanket `UPDATE` privilege on governance-relevant tables revoked and replaced with an explicit allowlist of the columns it may still write directly. Every column _not_ on the allowlist can only be changed by a `SECURITY DEFINER` function (below) or `app_service_role` (Part 9) — never by a direct `UPDATE` from the application's normal connection.
2. **`SECURITY DEFINER` governance functions** — small, single-purpose PL/pgSQL functions, each wrapping one privileged mutation and everything that must happen atomically alongside it (the state transition, the `tokensValidAfter` bump, the `AuditLog` write) in the function's own implicit transaction. `app_role` is granted `EXECUTE` on these functions specifically, not broad table access.

This is a different mechanism from `app_service_role`/`BYPASSRLS` (Part 9), solving a different problem: `app_service_role` exists for operations that must run _before_ or _across_ normal RLS session context (registration, bootstrap, GDPR erasure); the functions below exist for operations that run _within_ a normal, RLS-scoped session but touch a small number of fields that must never be reachable by a generic `UPDATE`, however that `UPDATE` was authorized at the row level.

### Privileged fields identified (the "review every privileged workflow" pass)

Surveying every entity in Part 5 for fields where a direct write — even one otherwise permitted by row-level RLS — would bypass a business rule this Epic depends on:

| Table                    | Field(s)                             | Why it's privileged                                                                                                                                                 | Mutation path                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User`                   | `role`                               | Bypasses Part 9A's two-person approval                                                                                                                              | `approve_role_change()` below                                                                                                                                                                                                                                                  |
| `User`                   | `organizationId`                     | Bypasses tenant assignment entirely — arguably worse than a role escalation, since it moves a row between tenants                                                   | `set_org_role()`/membership functions only ever change `OrganizationMembership`; a `User`'s own `organizationId` denormalization (if the schema keeps one — Part 5) updates only inside the same function, never directly                                                      |
| `User`                   | `mfaEnrolled`, `mfaSecret`           | Self-attesting MFA completion without a real TOTP verification would defeat ADR-011/ADR-019 entirely                                                                | `complete_mfa_enrollment()` below                                                                                                                                                                                                                                              |
| `User`                   | `tokensValidAfter`                   | Setting this _backward_ would un-revoke tokens that were meant to be invalidated — a direct security-bypass vector, not just a data-integrity one                   | Only ever bumped to `now()` inside the governance functions below, never set to an arbitrary value                                                                                                                                                                             |
| `User`                   | `status`                             | Self-reinstatement after suspension, or an unauthorized path to mark another account `DELETED`                                                                      | Suspension: an admin-facing function (not yet endpoint-exposed in this Epic's MVP scope — noted as a Part 18 follow-up, not built here to avoid scope expansion); `DELETED` is set only by the GDPR-erasure job via `app_service_role` (Part 9, unchanged)                     |
| `User`                   | `passwordHash`                       | A direct write is a credential-overwrite account-takeover vector — notably reachable today by any `ENTERPRISE_ADMIN` with `user_update` row access to an org member | Password set/reset only via `app_service_role` (the same pre-full-session path registration already uses — password-reset-confirm authenticates via a reset token, not a full session, so it fits the existing `app_service_role` category rather than needing a new function) |
| `OrganizationMembership` | `orgRole`                            | Bypasses the single-party org-role-change authorization rule (Part 9A)                                                                                              | `set_org_role()` below                                                                                                                                                                                                                                                         |
| `RoleChangeRequest`      | `status`, `approvedBy`, `resolvedAt` | These fields **are** the approval gate — a direct write is the approval gate                                                                                        | `approve_role_change()` below (the only writer)                                                                                                                                                                                                                                |

**Conclusion of the survey:** yes, the same pattern is required beyond the two fields the review named. `mfaEnrolled`/`mfaSecret` and `tokensValidAfter` were not previously called out as at-risk but are logically identical cases — a column reachable by a generically-scoped `UPDATE` that, if written directly, defeats a security control this Epic already built. `status`/`passwordHash` are included for completeness though their write paths were already implicitly separate (admin action / `app_service_role`) — the allowlist below makes that implicit separation an enforced one.

### Column privilege grants

```sql
-- User: explicit allowlist. Everything else (role, organizationId, mfaEnrolled,
-- mfaSecret, tokensValidAfter, status, passwordHash) is reachable only via
-- app_service_role or the SECURITY DEFINER functions below.
REVOKE UPDATE ON "User" FROM app_role;
GRANT UPDATE ("displayName", "avatarUrl", "locale", "timezone") ON "User" TO app_role;

-- OrganizationMembership: no freely-updatable columns at this Epic's scope —
-- membership rows are insert/delete-oriented; orgRole changes go through
-- set_org_role() only.
REVOKE UPDATE ON "OrganizationMembership" FROM app_role;

-- RoleChangeRequest: app_role may INSERT the initiate step (Part 6); the
-- resolution fields are written only by approve_role_change() below.
REVOKE UPDATE ON "RoleChangeRequest" FROM app_role;
```

### Caller-identity verification (applies to all three functions — remediation pass #4, Finding 3)

Every function below starts by re-deriving the caller's identity from the database session itself and refusing to proceed if the caller-supplied ID parameter doesn't match it — the parameter is never trusted on its own.

**How request identity enters the Postgres session:** unchanged from Part 9's existing mechanism — `tenant.middleware.ts` runs once per request, after the JWT is verified (server-side, never client-supplied), and issues `SET LOCAL app.current_user_id = '<uuid>'` on the same database transaction/connection the request's Prisma queries — and now, these function calls — execute on. This is the identical session variable RLS itself already depends on (Part 9); nothing new is introduced to get identity into Postgres, only a new place that reads it. **Implementation requirement, not a design change:** the function call must execute on the same transaction as the `SET LOCAL` — if connection pooling ever routed the function call to a different pooled connection than the one `tenant.middleware.ts` configured, `current_setting` would see nothing. This is already a requirement RLS itself has (Part 9) — Part 9C's functions inherit it, not introduce it.

**Failure behavior:** if `current_setting('app.current_user_id', true)` is `NULL` or doesn't equal the supplied actor-ID parameter, every function raises `caller_identity_mismatch` immediately — fails closed, no partial work, consistent with Part 11's existing fail-closed philosophy.

### `approve_role_change()` — now the complete authorization boundary, not just the atomicity boundary

Replaces the pass #2 version. Beyond the atomic "claim" (unchanged — the same race-free `WHERE status = 'PENDING'` pattern Part 8 uses for refresh-token rotation), this version adds: caller-identity verification (Finding 3), approver existence/role/status verification instead of trusting `RolesGuard` alone (Finding 4), and a concurrency-safe last-platform-`ADMIN` check evaluated against the **target** user, not the requester (Finding 1).

**Locking strategy (Finding 1):** a Postgres advisory transaction lock, `pg_advisory_xact_lock(43, 0)` — a fixed, reserved key pair meaning "platform admin-count governance," held only when the claimed request's `fromRole` or `toRole` is `ADMIN` (a routine `TEACHER` grant never touches this lock, so it doesn't pay a serialization cost it doesn't need). Advisory locks were chosen over locking the `User` rows directly because the invariant being protected ("platform `ADMIN` count ≥ 1") spans however many `ADMIN` rows currently exist, not a fixed, nameable set of rows — a single, well-known lock key is simpler to reason about and verify correct than a `SELECT ... WHERE role = 'ADMIN' FOR UPDATE` over a set whose membership is exactly what's being contested.

```sql
CREATE OR REPLACE FUNCTION approve_role_change(
  p_request_id uuid,
  p_approver_id uuid,
  p_require_different_approver boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller_id uuid;
  v_approver "User"%ROWTYPE;
  v_request "RoleChangeRequest"%ROWTYPE;
  v_remaining_admins int;
BEGIN
  -- Finding 3: never trust the caller-supplied approver ID.
  v_caller_id := current_setting('app.current_user_id', true)::uuid;
  IF v_caller_id IS NULL OR v_caller_id <> p_approver_id THEN
    RAISE EXCEPTION 'caller_identity_mismatch';
  END IF;

  -- Finding 4: the approver must exist, be active, and actually hold ADMIN —
  -- not merely have passed RolesGuard at the application layer.
  SELECT * INTO v_approver FROM "User" WHERE id = p_approver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approver_not_found';
  END IF;
  IF v_approver.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'approver_not_active';
  END IF;
  IF v_approver.role <> 'ADMIN' THEN
    RAISE EXCEPTION 'approver_not_authorized';
  END IF;
  -- ADMIN is platform-wide, not tenant-scoped (ARCHITECTURE.md §2.1) — there
  -- is no separate "correct tenant/context" check for this function; that
  -- requirement is satisfied by "must hold platform ADMIN" having no
  -- tenant dimension to begin with.

  -- Atomic claim (unchanged from pass #2) — also enforces "not the
  -- prohibited actor" (requester) where applicable.
  UPDATE "RoleChangeRequest"
     SET status = 'APPROVED', "approvedBy" = p_approver_id, "resolvedAt" = now()
   WHERE id = p_request_id
     AND status = 'PENDING'
     AND (p_require_different_approver = false OR "requestedBy" <> p_approver_id)
  RETURNING * INTO v_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'role_change_request_not_approvable';
  END IF;

  -- Finding 1: evaluate the TARGET user, under a global advisory lock, only
  -- when this change actually touches the ADMIN tier in either direction.
  IF v_request."fromRole" = 'ADMIN' OR v_request."toRole" = 'ADMIN' THEN
    PERFORM pg_advisory_xact_lock(43, 0);

    IF v_request."fromRole" = 'ADMIN' AND v_request."toRole" <> 'ADMIN' THEN
      SELECT count(*) INTO v_remaining_admins
        FROM "User" WHERE role = 'ADMIN' AND id <> v_request."targetUserId";
      IF v_remaining_admins = 0 THEN
        RAISE EXCEPTION 'cannot_demote_last_platform_admin';
      END IF;
    END IF;
  END IF;

  UPDATE "User"
     SET role = v_request."toRole", "tokensValidAfter" = now()
   WHERE id = v_request."targetUserId";

  INSERT INTO "AuditLog"
    ("actorUserId", "actorType", action, "targetType", "targetId", "beforeValue", "afterValue", "occurredAt")
  VALUES
    (p_approver_id, 'USER', 'user.role.changed', 'User', v_request."targetUserId",
     jsonb_build_object('role', v_request."fromRole"), jsonb_build_object('role', v_request."toRole"), now());
END;
$$;

GRANT EXECUTE ON FUNCTION approve_role_change(uuid, uuid, boolean) TO app_role;
```

**Why this closes Finding 1 without a race:** a concurrent second call that would also touch `ADMIN` blocks on `pg_advisory_xact_lock(43, 0)` until the first call's transaction fully commits or rolls back — advisory locks are held for the duration of the transaction and released atomically at its end. The second call then re-runs its `count(*)` against the now-committed state, correctly seeing the first call's already-applied demotion. Two sequential-but-concurrent `ADMIN`-demoting requests can no longer both succeed — the second one to reach the lock always evaluates against current, not stale, data. `role-lifecycle.service.ts` (Part 7) still calls this once for the two-person path and once for the single-party `TEACHER` auto-approval path, as in pass #2 — the lock is conditional on `fromRole`/`toRole`, so the `TEACHER` path never pays for it.

### `set_org_role()` — the `OrganizationMembership.orgRole` equivalent

**Locking strategy (Finding 2):** a per-organization advisory lock, `pg_advisory_xact_lock(44, hashtext(v_org_id::text))` — a deterministic, org-scoped key (namespace `44`, distinct from the platform-admin namespace `43`, combined with a hash of the org's own ID) so two concurrent calls touching the _same_ organization fully serialize, while calls touching _different_ organizations never contend with each other. This directly replaces pass #2's row-level `FOR UPDATE` on the single membership row being changed, which the third review correctly identified as insufficient — that lock protected the row being written, not the multi-row invariant ("at least one `ENTERPRISE_ADMIN` remains in this org") being read.

```sql
CREATE OR REPLACE FUNCTION set_org_role(
  p_membership_id uuid,
  p_new_org_role text,
  p_actor_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_caller_id uuid;
  v_actor "User"%ROWTYPE;
  v_actor_membership "OrganizationMembership"%ROWTYPE;
  v_before text;
  v_org_id uuid;
  v_user_id uuid;
  v_remaining_admins int;
BEGIN
  -- Finding 3
  v_caller_id := current_setting('app.current_user_id', true)::uuid;
  IF v_caller_id IS NULL OR v_caller_id <> p_actor_id THEN
    RAISE EXCEPTION 'caller_identity_mismatch';
  END IF;

  SELECT "organizationId", "userId" INTO v_org_id, v_user_id
    FROM "OrganizationMembership" WHERE id = p_membership_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found';
  END IF;

  -- Finding 2: deterministic, org-scoped serialization BEFORE any read of
  -- membership state this function's decision depends on.
  PERFORM pg_advisory_xact_lock(44, hashtext(v_org_id::text));

  -- Actor must exist, be active, and be authorized for *this* org
  -- specifically (Finding 4's spirit, applied to the org-scoped case):
  -- either a platform ADMIN, or an ENTERPRISE_ADMIN of v_org_id.
  SELECT * INTO v_actor FROM "User" WHERE id = p_actor_id;
  IF NOT FOUND OR v_actor.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'actor_not_found_or_inactive';
  END IF;
  IF v_actor.role <> 'ADMIN' THEN
    SELECT * INTO v_actor_membership FROM "OrganizationMembership"
      WHERE "userId" = p_actor_id AND "organizationId" = v_org_id;
    IF NOT FOUND OR v_actor_membership."orgRole" <> 'ENTERPRISE_ADMIN' THEN
      RAISE EXCEPTION 'actor_not_authorized_for_organization';
    END IF;
  END IF;

  -- Re-read orgRole now that the lock is held — the value read before
  -- acquiring the lock (if any) cannot be trusted.
  SELECT "orgRole" INTO v_before FROM "OrganizationMembership" WHERE id = p_membership_id;

  IF v_before = 'ENTERPRISE_ADMIN' AND p_new_org_role <> 'ENTERPRISE_ADMIN' THEN
    SELECT count(*) INTO v_remaining_admins FROM "OrganizationMembership"
      WHERE "organizationId" = v_org_id AND "orgRole" = 'ENTERPRISE_ADMIN' AND id <> p_membership_id;
    IF v_remaining_admins = 0 THEN
      RAISE EXCEPTION 'cannot_demote_last_enterprise_admin';
    END IF;
  END IF;

  UPDATE "OrganizationMembership" SET "orgRole" = p_new_org_role WHERE id = p_membership_id;
  UPDATE "User" SET "tokensValidAfter" = now() WHERE id = v_user_id;

  INSERT INTO "AuditLog"
    ("actorUserId", "actorType", action, "targetType", "targetId", "tenantId", "beforeValue", "afterValue", "occurredAt")
  VALUES
    (p_actor_id, 'USER', 'organization.member.role_changed', 'OrganizationMembership', p_membership_id, v_org_id,
     jsonb_build_object('orgRole', v_before), jsonb_build_object('orgRole', p_new_org_role), now());
END;
$$;

GRANT EXECUTE ON FUNCTION set_org_role(uuid, text, uuid) TO app_role;
```

**Proof that two concurrent demotions in the same org cannot both pass (the third review's explicit ask):** call T1 (demoting membership A) and call T2 (demoting membership B), same organization, arriving concurrently. Both compute the same lock key (`hashtext(v_org_id::text)` is deterministic — same org, same key). Whichever call reaches `pg_advisory_xact_lock` first proceeds; the other blocks _before_ it reads anything the decision depends on. Say T1 proceeds: it reads the current `ENTERPRISE_ADMIN` count excluding A, decides, writes, and its transaction commits — releasing the lock. T2 then unblocks and re-reads `OrganizationMembership` state _after_ T1's write is visible, so its own count correctly reflects T1's already-applied change. T2 cannot decide against stale data, because it was never allowed to read the contested state until T1 was completely finished with it. Different organizations use different hash-derived keys and never block each other.

### `complete_mfa_enrollment()` — caller-identity check applied for consistency (Finding 3)

No admin-count invariant applies here, so no advisory lock is needed — only the caller-identity check, applied for the same reason it's applied to the other two functions.

```sql
CREATE OR REPLACE FUNCTION complete_mfa_enrollment(p_user_id uuid, p_verified_secret text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_caller_id uuid;
BEGIN
  v_caller_id := current_setting('app.current_user_id', true)::uuid;
  IF v_caller_id IS NULL OR v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'caller_identity_mismatch';
  END IF;

  -- Caller (mfa.service.ts) has already verified a real TOTP code against
  -- p_verified_secret before calling this — this function's job is to make
  -- the resulting write to two otherwise-locked-down columns atomic and
  -- auditable, and to confirm the caller is who they claim, not to
  -- re-verify the code itself.
  UPDATE "User" SET "mfaEnrolled" = true, "mfaSecret" = p_verified_secret WHERE id = p_user_id;
  INSERT INTO "AuditLog" ("actorUserId", "actorType", action, "targetType", "targetId", "occurredAt")
  VALUES (p_user_id, 'USER', 'user.mfa.enrolled', 'User', p_user_id, now());
END;
$$;

GRANT EXECUTE ON FUNCTION complete_mfa_enrollment(uuid, text) TO app_role;
```

### Additional hardening applied while these functions were already open (not separately-mandated findings)

- **`search_path` tightened** from `SET search_path = public` to `SET search_path = pg_catalog, public` in all three functions — the documented Postgres best practice for `SECURITY DEFINER` functions, closing the third review's Low/informational note at negligible cost since the functions were being rewritten regardless.
- **Function ownership** (the third review's Medium finding on this) is recorded as an implementation-level requirement, not resolved in this design pass: these three functions must be owned by a narrowly-privileged, purpose-specific role — never the migration/superuser role — carried forward to Part 17's task acceptance criteria (below) rather than silently dropped.

### What this does not change

`app_service_role`/`BYPASSRLS` (Part 9) is unchanged — registration, OAuth account creation, the bootstrap CLI, password-reset-confirm, and GDPR erasure still use it. The column-level `REVOKE`/`GRANT` allowlist (earlier in this Part) is unchanged — ADR-023 remains the approved security model; this pass completes its function-body implementation, it does not replace the model. Nothing in Part 9A's endpoint list or authorization rules changes — only _how_ those already-approved rules are enforced inside the functions that were already the mechanism for enforcing them.

---

## PART 10 — Domain Events

Three identity events already exist in EVENT_ARCHITECTURE.md §3: `identity.user.registered`, `identity.consent.recorded`, `account.deletion.requested`. This Epic's flows need several more that the catalog doesn't yet have — added here per EVENT_ARCHITECTURE.md's own rule ("add a new row to that catalog if none fits — required, not optional"):

| Event                                      | Producer                                | Consumers                                                     | Payload                                                                                       |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `identity.session.created`                 | `apps/api` (Auth module)                | `analytics-service`                                           | userId, ip, userAgent, sessionId                                                              |
| `identity.session.revoked`                 | `apps/api` (Auth module)                | `analytics-service`, `notification-service` (security alert)  | userId, sessionId, reason                                                                     |
| `identity.login.failed`                    | `apps/api` (Auth module)                | `analytics-service`                                           | keyed-HMAC email hash (never raw email, never a bare hash — Part 15 note below), ip, reason   |
| `identity.password.reset_requested`        | `apps/api` (Auth module)                | `notification-service`                                        | userId, resetToken-reference (never the raw token)                                            |
| `identity.mfa.enrolled`                    | `apps/api` (Auth module)                | `analytics-service`                                           | userId                                                                                        |
| `identity.oauth.linked`                    | `apps/api` (Auth module)                | `analytics-service`                                           | userId, provider                                                                              |
| `identity.role.change_requested`           | `apps/api` (Users module)               | `analytics-service`                                           | targetUserId, fromRole, toRole, requestedBy, requiresApproval                                 |
| `identity.role.change_approved`            | `apps/api` (Users module)               | `notification-service`, `analytics-service`                   | targetUserId, fromRole, toRole, approvedBy                                                    |
| `identity.role.changed`                    | `apps/api` (Users/Organizations module) | `notification-service`, `analytics-service`                   | targetUserId, fromRole, toRole, changedBy (`'system-bootstrap'` for Part 9A's bootstrap path) |
| `identity.role.emergency_recovery`         | `apps/api` (Users module)               | `notification-service`, `analytics-service`, security on-call | targetUserId, triggeredBy (infra-level identity, not a `User`)                                |
| `identity.organization.membership_changed` | `apps/api` (Organizations module)       | `notification-service`, `analytics-service`                   | organizationId, userId, action (`added`/`removed`/`role_changed`)                             |

_(`identity.role.change_requested`, `identity.role.change_approved`, and `identity.role.emergency_recovery` added in remediation — Critical-1/Part 9A.)_

All follow the existing envelope (EVENT_ARCHITECTURE.md §2: `eventId`, `type`, `version`, `occurredAt`, `producedBy`, `tenantId`, `userId`, `payload`) — no new envelope shape introduced.

**`identity.login.failed`'s email hash** _(added in remediation, folded into the Critical/High pass)_: an unkeyed hash (e.g. bare SHA-256) of a bounded, guessable input space like an email address is only marginally better than storing it raw — this design specifies an **HMAC keyed with a server-held secret** (rotatable, held in the same secrets-management path as other application secrets, DEPLOYMENT.md §7), not a bare hash.

---

## PART 11 — Failure Modes

| Failure                                                           | Behavior                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google/Apple OAuth provider unreachable/errors                    | `GET /v1/auth/oauth/:provider/callback` returns a user-facing error redirect (not a raw 5xx); email/password remains available; no partial `User` row is created on a failed callback (single transaction)                                                                                                                                                  |
| Redis (rate limiter / revocation denylist) unavailable            | Rate limiting fails closed on auth endpoints specifically (reject rather than silently allow unlimited attempts — SECURITY.md's brute-force protection must not silently degrade); revocation-denylist check fails open only for already-issued, still-valid-by-expiry tokens (a 15-minute worst-case exposure window, accepted and documented, not silent) |
| Postgres RLS session variable fails to set (middleware bug/crash) | Request fails closed — `current_setting` is set to `null` by default on any unset/error path, which the policy above treats as "visible to nobody," never "visible to everybody"; this is a deliberate property of the policy shape (Part 9), not an assumption                                                                                             |
| Email delivery (password reset, verification) unavailable         | Request is durably queued (BullMQ, ADR-002's existing pattern) and retried — the API call itself still returns success immediately, since the user shouldn't be blocked waiting on SMTP                                                                                                                                                                     |
| Argon2id hashing under load (CPU-bound)                           | Hashing runs off the request's synchronous path is not required at MVP login volume; flagged as a future load-test check (Part 16) rather than solved speculatively now                                                                                                                                                                                     |

---

## PART 12 — Frontend Design

Minimal, functional auth surface in `apps/web` and `apps/admin` (both already Next.js skeletons from E1/T14-T15, `packages/ui` wired via `transpilePackages`): login, register, password-reset request/confirm, and MFA enrollment/challenge pages, using `packages/ui`'s existing token set and `error-boundary.tsx` (no new design-system components invented here — DESIGN_SYSTEM.md compliance is a Frontend Gate concern for whoever implements this, not re-litigated in this design doc). Access tokens held in memory (not `localStorage`, to avoid XSS-exfiltration of a bearer token per SECURITY.md §6's OWASP discipline); refresh token lives only in the httpOnly cookie the browser can't read via JS. `apps/admin`'s login additionally routes through the MFA challenge step unconditionally for `ADMIN`/`ENTERPRISE_ADMIN`, consistent with ADR-011.

---

## PART 13 — Security Review (feeds SECURITY_REVIEW_TEMPLATE.md)

| Concern                                | Design                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential stuffing / brute force      | Redis-backed rate limiting + progressive backoff (Part 8), fails closed on limiter outage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Session fixation / token theft         | Rotating one-time-use refresh tokens with reuse detection and atomic rotation (Part 8); access tokens short-lived; revocation denylist + `tokensValidAfter` for immediate effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| OAuth token/authorization-code leakage | Standard OAuth2 authorization-code flow (server-side exchange, never a client-side implicit flow); provider tokens never stored beyond the linking transaction; **`state`-parameter CSRF protection** (Part 8, remediated — High-2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| OAuth account takeover via email       | _(added in remediation — High-3)_ Linking matched only by `(provider, providerAccountId)`, never by email; explicit authenticated linking endpoint (`POST /v1/users/me/oauth-accounts`, Part 6) for a user attaching a new provider to an existing account                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| MFA bypass                             | `MfaGuard` blocks every `ADMIN`/`ENTERPRISE_ADMIN` route (not just login) until `mfaEnrolled=true` — an account cannot "grandfather" past enrollment by any request path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| MFA brute force                        | _(added in remediation — High-4)_ `/v1/auth/mfa/verify`/`/challenge` in the same rate-limited class as login, plus a 5-attempt/10-minute lockout (Part 8) — closes the "6-digit code, no throttle" gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Privileged account takeover (R-09)     | Mandatory MFA (ADR-011) + this design's TOTP mechanism (Part 15) + MFA rate limiting (above) directly close the gap RISK_REGISTER.md flagged as "Mitigated (design)" but not yet built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Privilege escalation                   | No role change happens without an explicit, authorized endpoint; `ADMIN`-involving changes require two-person approval (Part 9A); last-admin/last-org-admin demotion is blocked; a role change invalidates the target's existing tokens immediately (`tokensValidAfter`, Part 8). **Database-enforced, not just application-enforced** _(added in remediation pass #2)_: `User.role`/`organizationId` and `OrganizationMembership.orgRole` are excluded from the standard role's `UPDATE` grant entirely (Part 9C) — the second review's finding that RLS's row-level policies didn't stop a permitted row-level `UPDATE` from also touching these columns is closed at the privilege-grant level, not by adding another application-layer check that the same class of bug could route around again |
| Audit-write atomicity                  | _(added in remediation pass #2)_ `approve_role_change()`/`set_org_role()` (Part 9C) perform the state transition, `tokensValidAfter` bump, and `AuditLog` write inside one `SECURITY DEFINER` function call — one transaction, no partial-failure window where a role change could commit without its audit record                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Cross-tenant leak (R-06)               | _(completed in remediation — Critical-2)_ Full RLS policy matrix for `User`, `Organization`, `OrganizationMembership` — every table carrying `organizationId`, not only `OrganizationMembership` (Part 9) — the first real, now-complete implementation of ADR-005                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Unaudited privileged/admin actions     | _(added in remediation — Critical-3)_ Immutable, `INSERT`-only `AuditLog`/`EntitlementChangeLog` (Part 9B) — closes a direct SECURITY.md §3 non-compliance the first review found                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| PII at rest                            | `mfaSecret` field-level encrypted (SECURITY.md §4); `passwordHash` never reversible by design (Argon2id); `identity.login.failed`'s email signal is a keyed HMAC, not a bare hash (Part 10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| GDPR/CCPA erasure                      | `POST /v1/users/me/deletion-request` → `account.deletion.requested` event → cascading hard-delete/anonymization exactly per DATABASE.md §10, `ConsentRecord` surviving per its independent retention (§7); runs through the narrowly-scoped `app_service_role` (Part 9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| User enumeration                       | Password-reset-request and login-failure responses are identical in shape/timing whether or not the email exists (SECURITY.md §6). **Registration's `CONFLICT` (409)** on duplicate email remains a narrower enumeration signal, inherited from API_GUIDELINES.md's own existing example — recorded as an accepted, pre-existing baseline trade-off (Part 18), not remediated in this pass since it isn't a Critical/High finding                                                                                                                                                                                                                                                                                                                                                                    |
| Role/ownership boundary                | `RolesGuard` (role) + resource-ownership checks in each service method (MULTITENANCY.md §3) — tested per TESTING.md §5's explicit requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## PART 14 — Alternatives Considered

| Alternative                                                                                                                                                                                       | Why rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate `auth-service` (own deployable) instead of an `apps/api` module                                                                                                                          | ARCHITECTURE.md §4 justifies a `services/*` split only for scaling/runtime/blast-radius isolation needs (ARCHITECTURE.md §4's stated bar) — identity has none of those at MVP traffic levels, and a network hop for every authenticated request on every other module would add latency and operational surface for no proven benefit. Revisit only if identity traffic specifically becomes a scaling bottleneck (ARCHITECTURE.md §2.1's own extraction-readiness pattern, already used for the AI services). |
| Opaque server-side session tokens instead of JWT                                                                                                                                                  | SECURITY.md §2 already specifies JWT access tokens — not re-litigated here; the design in Part 8 fills the gap SECURITY.md left open (transport, lifetimes, revocation mechanics), it doesn't reopen the JWT-vs-session choice itself.                                                                                                                                                                                                                                                                         |
| Schema-per-tenant or database-per-tenant instead of row-level (RLS) multi-tenancy                                                                                                                 | Already decided in MULTITENANCY.md §1 as "the right MVP-to-Growth trade-off given Enterprise volume expectations" — not re-litigated; Part 9 is the first real implementation of that existing decision.                                                                                                                                                                                                                                                                                                       |
| SMS-based MFA instead of TOTP                                                                                                                                                                     | Rejected in Part 15's new ADR: SIM-swap vulnerability, per-message cost at scale, and international SMS deliverability variance make TOTP the stronger default; SMS can be added later as an additional _option_, not a replacement.                                                                                                                                                                                                                                                                           |
| Email-based MFA (magic-link-style second factor) instead of TOTP                                                                                                                                  | Rejected: the same channel used for account-recovery communication becomes a single point of failure if an attacker also controls the inbox (e.g., a compromised email account); TOTP is a genuinely separate factor.                                                                                                                                                                                                                                                                                          |
| Including Facebook OAuth at MVP (matching SECURITY.md's provider list)                                                                                                                            | Rejected in Part 15: PRD.md §6's actual MVP feature-scope row ("Email + Google + Apple auth") is the more authoritative product-scope statement; Apple Sign-In is close to a hard requirement for an iOS app offering any other social login (App Store review guideline 4.8), giving Google+Apple a concrete reason to ship first that Facebook doesn't share. SECURITY.md's broader provider list is flagged as needing a follow-up correction (Part 15), not silently followed as the real scope.           |
| _(added in remediation)_ A new `SUPER_ADMIN` role tier instead of governing `ADMIN` grants via two-person approval                                                                                | Rejected (Critical-1, Part 9A): DATABASE.md §2.1's `role` enum is an already-accepted design; adding a fifth tier is a larger schema change than "no role-change endpoint exists" requires, and the review's own instruction to "preserve the approved architecture wherever possible" argues directly against it. A process control (two-person approval) closes the same governance gap without touching the enum.                                                                                           |
| _(added in remediation)_ Deferring the audit subsystem to E15 (Billing) or E22 (Security Hardening) instead of building it in E2                                                                  | Rejected (Critical-3): SECURITY.md §3 already requires `AuditLog`/`EntitlementChangeLog` as a general platform capability, not a billing-specific or E22-specific one, and E2 is the epic introducing the first privileged actions (role grants, org admin) that need auditing — deferring would mean shipping ungoverned privileged actions in the interim. `EntitlementChangeLog`'s entity shape is defined now specifically so E15 doesn't invent a second, competing pattern later.                        |
| _(added in remediation)_ A broader `BYPASSRLS` grant on the standard application role, instead of a separate, narrowly-used service role                                                          | Rejected (Critical-2/Part 9): granting `BYPASSRLS` to the role every request already runs as would silently remove RLS's defense-in-depth for every query, not just the few that legitimately need it (registration, bootstrap, GDPR erasure) — the entire point of the three-layer design (Part 9) is that a single-layer failure doesn't cause a leak; a broadly-bypassing role defeats that for every table, every request.                                                                                 |
| _(added in remediation pass #2)_ A database trigger rejecting privileged-column writes, instead of column-level `GRANT`/`REVOKE`                                                                  | Rejected (Part 9C): a trigger fires after Postgres has already decided the statement is permitted, adding a second enforcement surface to review; a column-level `REVOKE` uses Postgres's own privilege system as the single source of truth.                                                                                                                                                                                                                                                                  |
| _(added in remediation pass #2)_ Keeping role-change logic entirely in `role-lifecycle.service.ts` with just an added `WHERE status = 'PENDING'` clause, instead of a `SECURITY DEFINER` function | Rejected (Part 9C): closes the atomicity finding alone, not the column-protection finding — the underlying `UPDATE "User" SET role = ...` would still be reachable by any other code path using the standard role. One function closes both findings.                                                                                                                                                                                                                                                          |

---

## PART 15 — New Architecture Decisions

TECHNICAL_DESIGN_TEMPLATE.md §8 requires new ADRs to be drafted alongside this design, not deferred. Six genuinely undecided questions surfaced across this design's two review/remediation cycles: token transport/lifetime/claim mechanics, the MFA mechanism ADR-011 never specified, the OAuth provider-list discrepancy between PRD.md and SECURITY.md, privileged-role governance, the RLS service-role-bypass pattern, and — surfaced by the second review — privileged-column protection. Drafted below in DECISIONS.md's exact existing format, ready to append as ADR-018–023 pending Architecture Gate approval of this design:

### ADR-018 — JWT access token (Bearer, 15 min) + rotating refresh token (httpOnly cookie for web, secure device storage for mobile, 30 days)

**Context:** SECURITY.md §2 already commits to "short-lived JWT access tokens + rotating, revocable refresh tokens," and to refresh tokens being "stored httpOnly/secure/SameSite=strict for web" — but specifies neither the access-token transport mechanism (needed for the Flutter mobile app, E21, which has no cookie jar) nor concrete lifetimes, and API_GUIDELINES.md does not state the access-token transport either (confirmed absent by direct research of both documents).
**Decision:** Access tokens are short-lived (15 minute) JWTs sent via `Authorization: Bearer` header — a single, platform-agnostic transport for web, mobile, and any future first-party client, rather than a web-only cookie that would force a second, different mechanism for mobile. Claims: `sub`, `role`, `organizationId`, `orgRole`, `jti`, `iat`, `exp` _(claim shape added in remediation — High-1)_. Refresh tokens are long-lived (30 day), one-time-use with atomic rotation-on-use (reuse of an already-rotated token revokes the entire session chain; a race between two near-simultaneous uses resolves to exactly one winner via a conditional update, the other treated as reuse — Part 8), stored per SECURITY.md §2's existing cookie requirement for web and platform-secure storage (Keychain/Keystore) for mobile. Immediate revocation for a single session is backed by a short-TTL Redis denylist keyed on JWT `jti`; immediate propagation of a **role or org-membership change** (a distinct problem — the denylist alone doesn't handle "this still-valid token now claims a stale role") is handled via `User.tokensValidAfter` (Part 5/8): every request additionally checks `jwt.iat >= user.tokensValidAfter`, so a role change invalidates the affected user's outstanding tokens on their next request, not at natural expiry.
**Consequences:** One access-token transport across every client, no web/mobile auth code fork; Redis becomes a hard dependency for immediate single-session revocation guarantees (Part 11 defines the fail-closed behavior on Redis outage) — an acceptable new dependency since Redis is already required elsewhere (API_GUIDELINES.md §7's rate limiter, E1's `docker-compose.yml`); `tokensValidAfter` adds one indexed/cacheable column read per authenticated request, a small, deliberate cost traded for closing a real privilege-staleness window.
**Status:** Proposed — pending this design's Architecture Gate review.

### ADR-019 — TOTP (RFC 6238) as the mandatory MFA mechanism for `ADMIN`/`ENTERPRISE_ADMIN`

**Context:** ADR-011 mandates MFA enrollment for `ADMIN`/`ENTERPRISE_ADMIN` before activation but does not specify a mechanism — confirmed absent from SECURITY.md and DECISIONS.md by direct research. A concrete choice is required to build Part 7/8's `MfaGuard`/`mfa.service.ts`.
**Decision:** Time-based One-Time Password (TOTP, RFC 6238), compatible with standard authenticator apps (Google Authenticator, Authy, 1Password, etc.) — no SMS, no email-based second factor at MVP (Part 14's alternatives).
**Consequences:** No SMS-provider integration or per-message cost; works offline once enrolled; slightly higher enrollment friction than SMS (a user must install an authenticator app) — accepted as proportionate for `ADMIN`/`ENTERPRISE_ADMIN` accounts specifically (ADR-011's own reasoning: these are the highest-value account-takeover targets). Standard/`TEACHER` accounts remain unaffected (MFA optional, not required, for those roles).
**Status:** Proposed — pending this design's Architecture Gate review.

### ADR-020 — OAuth provider set at MVP: Google and Apple only (Facebook deferred)

**Context:** PRD.md §6's module 1 feature row states MVP scope as "Email + Google + Apple auth"; SECURITY.md §2 separately lists "OAuth (Google, Apple, Facebook)" as preferred over password auth — a real discrepancy confirmed by direct research of both documents, with no ADR resolving which is authoritative.
**Decision:** Google and Apple only at MVP, matching PRD.md's explicit feature-scope statement. Apple Sign-In carries a near-mandatory requirement for iOS apps offering other social login (App Store Review Guideline 4.8), giving Google+Apple a concrete, dated reason to ship together; Facebook has no equivalent forcing function and is deferred, not rejected outright.
**Consequences:** SECURITY.md §2's provider list needs a follow-up documentation correction to match (tracked as an open item, Part 18) — this ADR is the authoritative resolution going forward. `OAuthAccount.provider` enum (Part 5) is `GOOGLE | APPLE` only; adding Facebook later is an additive enum value, not a breaking schema change.
**Status:** Proposed — pending this design's Architecture Gate review.

### ADR-021 — Two-person approval for `ADMIN` role grants/revocations; single-party for `TEACHER`/`ENTERPRISE_ADMIN` _(added in remediation — Critical-1)_

**Context:** The first Architecture Gate review found no mechanism anywhere in the design for changing a `User.role`, including no way the first `ADMIN` account could ever be created — and the remediation brief specifically asked for "Super Admin governance" to be addressed. A new schema-level role tier was considered (Part 14) and rejected as scope expansion beyond what the finding required.
**Decision:** Role changes involving `ADMIN` (promotion to, or demotion from) require two-person approval: a requesting `ADMIN` initiates via `POST /v1/users/:id/role-change-requests`, and a second, different `ADMIN` must approve via `POST .../approve` before the change takes effect (`RoleChangeRequest`, Part 5, expires unapproved after 72h). `TEACHER` and `ENTERPRISE_ADMIN` changes remain single-party, matching ADR-011's existing risk-proportionate reasoning (lower blast radius than platform-wide `ADMIN`). The very first `ADMIN` in a fresh environment is created by a one-time, out-of-band bootstrap procedure outside the API surface entirely (Part 9A), since no existing `ADMIN` can approve a request when none yet exists. Demoting the last remaining `ADMIN` (platform-wide) or the last remaining `ENTERPRISE_ADMIN` (per org) is blocked outright.
**Consequences:** Privilege escalation to the platform's highest-trust role now requires collusion between two named individuals, not a single compromised or malicious account; adds latency to legitimate `ADMIN` grants (accepted, matching ADR-011's own "adds friction, proportionate to privilege level" reasoning) and a genuine operational risk if an organization only ever has one real `ADMIN` (tracked as a new risk, Part 18, not silently ignored).
**Status:** Proposed — pending this design's Architecture Gate review.

### ADR-022 — Narrow, `BYPASSRLS`-granted service role for the handful of operations that must legitimately cross tenant boundaries _(added in remediation — Critical-2)_

**Context:** Completing the RLS policy matrix (Part 9) for `User` surfaced a real problem the original design didn't address: registration and first-touch OAuth account creation must write a `User` row before any `app.current_user_id`/`app.current_org_id` session context exists to satisfy a per-request RLS policy against, and the GDPR-erasure background job and the Part 9A bootstrap procedure must legitimately act across tenant boundaries by design.
**Decision:** A separate Postgres role (`app_service_role`), granted `BYPASSRLS` (a native, superuser-only-grantable Postgres privilege), used **only** by a small, explicitly named set of code paths: registration, OAuth account creation, the bootstrap-admin CLI, and the GDPR-erasure job. The default, per-request application connection role never has this privilege. Any new use of `app_service_role` is called out in CODE_REVIEW_CHECKLIST.md as requiring elevated review, since it is the one place RLS's defense-in-depth layer is deliberately absent.
**Consequences:** A small, auditable set of code paths carries full responsibility for their own tenant-scoping correctness with no RLS backstop — a real, accepted trade-off (Part 18), scoped as narrowly as the actual requirement allows, rather than the rejected alternative (Part 14) of broadening `BYPASSRLS` to the standard role and losing RLS's protection everywhere.
**Status:** Proposed — pending this design's Architecture Gate review.

### ADR-023 — Privileged-column protection via `REVOKE`/`GRANT` column allowlisting + `SECURITY DEFINER` governance functions _(added in remediation pass #2 — second Architecture Gate review's mandatory findings #1/#2)_

**Context:** The second Architecture Gate review found that Part 9's row-level RLS policies (ADR-005's mechanism, extended in ADR-022) do not restrict which columns a permitted row-level write can touch — an `ENTERPRISE_ADMIN`'s legitimate `user_update` access could also be used to write `User.role` directly, bypassing ADR-021's two-person-approval workflow with no database-level objection. The same review separately found that `RoleChangeRequest` approval lacked the atomic conditional-update pattern already established elsewhere in this design (ADR-018's refresh-token rotation), and that a role change and its `AuditLog` write weren't guaranteed to be transactionally atomic.
**Decision:** Two complementary controls: (1) `REVOKE`/`GRANT` column-level privilege allowlisting on `User`, `OrganizationMembership`, and `RoleChangeRequest`, removing standard-role write access to every field identified as privileged in the Part 9C survey (`role`, `organizationId`, `mfaEnrolled`, `mfaSecret`, `tokensValidAfter`, `status`, `passwordHash`, `orgRole`, and `RoleChangeRequest`'s resolution fields); (2) a small set of `SECURITY DEFINER` PL/pgSQL functions (`approve_role_change`, `set_org_role`, `complete_mfa_enrollment`) that are the _only_ writers of those columns, each performing its entire state transition — including the `tokensValidAfter` bump and the `AuditLog` write — inside one atomic function call. `app_role` receives `EXECUTE` on these functions, never direct column access.
**Consequences:** Privilege escalation via a direct `UPDATE` is now prevented by Postgres's own privilege system, not by application-code discipline — closing the exact class of gap RLS itself was introduced to close for tenant isolation, now applied to role governance. Every future privileged field this Epic or a later one introduces must be evaluated against the same survey criteria (Part 9C) before deciding whether it needs the same treatment — this ADR establishes the pattern, not just the two fields the review named. `SECURITY DEFINER` functions are a genuine, small new security-critical surface (they run with the privileges of their owner, not the caller) — CODE_REVIEW_CHECKLIST.md's elevated-review requirement for `app_service_role` (ADR-022) is extended to cover any new `SECURITY DEFINER` function too (Part 18).
**Amendment (remediation pass #4 — third Architecture Gate review's findings):** the third review found the function _bodies_, as first drafted, didn't fully deliver this ADR's own stated guarantee — no platform-wide "last `ADMIN`" check existed at all in `approve_role_change()`, `set_org_role()`'s equivalent check had a cross-row TOCTOU race, and neither function verified its caller-supplied identity/authorization independently of the application layer. This is not a change to the decision above — column allowlisting plus `SECURITY DEFINER` functions as the only writers remains the approved model — it is the model's concurrency and authorization guarantees being fully specified rather than partially specified. Closed via: `pg_advisory_xact_lock` keyed per-invariant (a fixed key for the platform-wide `ADMIN` floor, an org-hash-derived key for the per-org `ENTERPRISE_ADMIN` floor — Part 9C), so a concurrent second caller can only ever evaluate the invariant against state committed by the first, never stale data; and explicit `current_setting('app.current_user_id')` cross-checks plus a fresh in-function lookup of the approver's/actor's own role, rather than trusting either the caller-supplied ID or the application layer's own authorization check alone.
**Status:** Proposed — pending this design's fourth targeted Architecture Gate review.

---

## PART 16 — Quality Engineering

| Concern                                                                                            | Approach                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                                                                                         | `auth.service.ts`, `mfa.service.ts`, token rotation logic, RBAC guard logic — Jest (`apps/api`, ADR-014)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Integration tests                                                                                  | Every endpoint in Part 6: happy path, validation failure (400), `AUTH_REQUIRED` (401), `FORBIDDEN` (403), `CONFLICT` (409) — per TESTING.md §2's existing per-endpoint requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Cross-tenant leak tests**                                                                        | Required test class (TESTING.md §5, MULTITENANCY.md §6), **now for all three RLS-protected tables** — `User`, `Organization`, `OrganizationMembership` _(expanded in remediation — Critical-2)_ — including the negative examples in Part 9, run with the application-layer filter deliberately bypassed                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **MFA enforcement tests**                                                                          | Required (TESTING.md §5): an `ADMIN`/`ENTERPRISE_ADMIN` account cannot activate or remain active without `mfaEnrolled=true`; **MFA rate-limit/lockout test** _(added — High-4)_: the 6th failed `mfa/verify` attempt within 10 minutes is rejected regardless of code correctness                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Role-lifecycle tests** _(added in remediation — Critical-1)_                                     | Last-`ADMIN`-standing demotion is blocked; last-`ENTERPRISE_ADMIN`-of-an-org demotion/removal is blocked; an `ADMIN` cannot approve their own `RoleChangeRequest`; a role change bumps `tokensValidAfter` and the target's pre-change token is rejected on the next request                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **RLS service-role tests** _(added in remediation — Critical-2)_                                   | `app_service_role`'s `BYPASSRLS` path is exercised only by registration/OAuth-creation/bootstrap/erasure — a test asserting the _standard_ per-request role cannot `INSERT`/`DELETE` on `User` at all (policies `WITH CHECK (false)`, Part 9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Privileged-column protection tests** _(added in remediation pass #2 — Part 9C)_                  | A raw `UPDATE "User" SET role = 'ADMIN' ...` (or `organizationId`/`mfaEnrolled`/`mfaSecret`/`tokensValidAfter`/`status`/`passwordHash`, or `OrganizationMembership.orgRole`) executed as `app_role` fails with a Postgres privilege error, not merely an application-level rejection — proving the column grant, not application code, is what's stopping it                                                                                                                                                                                                                                                                                                                                                                              |
| **Atomic governance function tests** _(added in remediation pass #2 — Part 9C)_                    | Two concurrent `approve_role_change()` calls for the same `RoleChangeRequest` — exactly one succeeds, the other raises `role_change_request_not_approvable`; a forced failure after the `User.role` update but before the `AuditLog` insert (e.g., a `RAISE` injected in a test transaction) rolls back the entire function, leaving neither the role change nor a partial audit row                                                                                                                                                                                                                                                                                                                                                      |
| **Governance-function concurrency/authorization tests** _(added in remediation pass #4 — Part 9C)_ | With exactly 2 platform `ADMIN`s, two concurrently-issued demotions that would together leave zero — the second call raises `cannot_demote_last_platform_admin`, evaluated against the first call's committed state, not stale data; the analogous concurrent test for `set_org_role()` with 2 `ENTERPRISE_ADMIN`s in one org; a control case proving two different orgs' concurrent calls do **not** block each other; each function called with a `p_approver_id`/`p_actor_id` that doesn't match `current_setting('app.current_user_id')` raises `caller_identity_mismatch`; `approve_role_change()` called with a non-`ADMIN` approver raises `approver_not_authorized` even with the application-layer guard hypothetically bypassed |
| **Audit immutability tests** _(added in remediation — Critical-3)_                                 | Attempting `UPDATE`/`DELETE` on `AuditLog` as the standard application role fails at the database-privilege level, not just the application layer; every role-lifecycle/cross-tenant-admin action in this Epic produces exactly one `AuditLog` row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **OAuth security tests** _(added in remediation — High-2/High-3)_                                  | A callback with a missing/invalid/reused `state` is rejected; a Google login whose email matches an existing password account does **not** auto-link (returns the distinct "log in first" response instead)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Authorization boundary tests                                                                       | `USER` A cannot read `USER` B's profile; `ENTERPRISE_ADMIN` of Org A cannot read Org B (TESTING.md §5's existing example, now with a real implementation to test)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Coverage                                                                                           | `packages/config`/`packages/observability`'s existing 80% floor (E1/Part 11) extends to the new Identity modules — no lower bar for the first real product logic in the repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| E2E                                                                                                | `apps/web` register → login → view profile journey added to `tests/e2e` (TESTING.md §1's "onboarding/assessment" critical journey)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## PART 17 — Implementation Plan

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Dependencies | Complexity | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `packages/types`/`validation` `identity` subpath: DTOs + Zod schemas for every entity in Part 5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | E1           | M          | Types/schemas resolve from `apps/api`; schema mirrors DB field list exactly                                                                                                                                                                                                                                                                                                                  |
| T2  | Prisma schema + migration: full Identity entity set + **complete RLS policy matrix for `User`/`Organization`/`OrganizationMembership`** (Part 9, remediated — Critical-2) + **column-level `GRANT`/`REVOKE` and the `approve_role_change`/`set_org_role`/`complete_mfa_enrollment` functions** (Part 9C, remediation pass #2) in the same migration                                                                                                                                                                                                                                                                                        | T1           | L          | `prisma migrate dev` succeeds; migration diff includes RLS policy SQL for all three tables, the column privilege statements, and all three governance functions                                                                                                                                                                                                                              |
| T3  | `AuthModule`: registration, email/password login, JWT issuance (Part 8's claim shape), refresh rotation (atomic), logout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | T2           | L          | Integration tests for every `/v1/auth/*` endpoint in Part 6 (except OAuth/MFA) pass                                                                                                                                                                                                                                                                                                          |
| T4  | OAuth: Google + Apple Passport strategies, **CSRF `state` validation, non-email account-linking rule** (Part 8, remediated — High-2/High-3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | T3           | M          | OAuth callback creates/links `OAuthAccount` by `(provider, providerAccountId)` only; missing/invalid `state` rejected; no partial `User` row on a failed callback                                                                                                                                                                                                                            |
| T5  | MFA: TOTP enrollment/verification, `MfaGuard` blocking unenrolled privileged roles, **rate limit + lockout on verify/challenge** (Part 8, remediated — High-4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | T3           | M          | MFA-enforcement test class (Part 16) passes; ADR-019 implemented as designed; 6th failed attempt in 10 min is rejected                                                                                                                                                                                                                                                                       |
| T6  | RBAC: `RolesGuard`, `@Roles()` decorator, resource-ownership checks per endpoint, **`tokensValidAfter` staleness check on every authenticated request** (Part 8, remediated — High-1)                                                                                                                                                                                                                                                                                                                                                                                                                                                      | T3           | M          | Authorization boundary tests (Part 16) pass; a token issued before a role change is rejected on the caller's next request                                                                                                                                                                                                                                                                    |
| T7  | Multi-tenancy: `tenant.middleware.ts` (now setting `app.current_user_id`/`app.caller_org_role`/`app.is_platform_admin` in addition to `app.current_org_id` — Part 9, remediated), `OrganizationsModule`, **`app_service_role` (`BYPASSRLS`) wiring for registration/bootstrap/erasure** (Part 9, remediated — Critical-2, ADR-022)                                                                                                                                                                                                                                                                                                         | T2, T3       | L          | Cross-tenant-leak test class (Part 16) passes for all three RLS tables; the standard role cannot `INSERT`/`DELETE` on `User`                                                                                                                                                                                                                                                                 |
| T8  | `UsersModule`: profile CRUD, session list/revoke, GDPR deletion-request endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | T3           | M          | Deletion-request → `account.deletion.requested` → cascade per DATABASE.md §10, integration-tested                                                                                                                                                                                                                                                                                            |
| T9  | Domain events: emit all events in Part 10 (including the remediation additions) at their respective trigger points                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | T3–T8        | M          | Each event fires with the correct payload shape, verified via a test consumer                                                                                                                                                                                                                                                                                                                |
| T10 | Rate limiting: Redis-backed limiter on auth endpoints, stricter class per SECURITY.md §2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | T3           | S          | A scripted brute-force attempt is throttled per the configured policy                                                                                                                                                                                                                                                                                                                        |
| T11 | Minimal `apps/web`/`apps/admin` auth UI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | T3–T5        | L          | Register → login → view-profile E2E journey (Part 16) passes                                                                                                                                                                                                                                                                                                                                 |
| T12 | **Privileged role lifecycle** _(new — remediates Critical-1)_: bootstrap-admin CLI, `RoleChangeRequest` create/approve endpoints, last-admin/last-org-admin guards, `role-lifecycle.service.ts` calling `approve_role_change()`/`set_org_role()`/`complete_mfa_enrollment()` — **now concurrency-safe via advisory locks and independently caller-verified (Part 9C, remediation pass #4)** — instead of direct `UPDATE`s. **Function ownership** (a narrowly-privileged, purpose-specific role — never the migration/superuser role, per the third review's carried-forward note) is an explicit acceptance criterion, not left implicit. | T2, T6, T7   | L          | Role-lifecycle test class **and privileged-column-protection/atomic-governance-function/concurrency-authorization test classes** (Part 16) pass; a fresh environment can produce its first working `ADMIN` account via the documented bootstrap procedure, exercised in a test/staging run; migration diff shows the three functions owned by a role distinct from the migration-runner role |
| T13 | **Immutable audit subsystem** _(new — remediates Critical-3)_: `AuditLog`/`EntitlementChangeLog` migration with `INSERT`-only grants, `audit.service.ts`, `/v1/audit-log` endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                        | T2, T7       | M          | Audit-immutability test class (Part 16) passes; every action in Part 9B's required-events list produces exactly one `AuditLog` row                                                                                                                                                                                                                                                           |
| T14 | Minimal `apps/web`/`apps/admin` auth UI **updated** for the new endpoints (role-change requests, OAuth linking, MFA lockout messaging)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | T11, T12     | S          | UI exercises the remediated flows end-to-end, not just the pre-remediation ones                                                                                                                                                                                                                                                                                                              |
| T15 | Security review artifact (SECURITY_REVIEW_TEMPLATE.md instance for this Epic)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | T1–T14       | M          | Completed template, zero open P0/P1 findings, feeds the Security Gate                                                                                                                                                                                                                                                                                                                        |
| T16 | Documentation: DATABASE.md §2.1 marked implemented, EVENT_ARCHITECTURE.md catalog additions (including remediation events), API_GUIDELINES.md Bearer-token clarification, DECISIONS.md ADR-018–022 appended                                                                                                                                                                                                                                                                                                                                                                                                                                | T1–T15       | M          | Every canonical doc this Epic touches is updated in the same PR (CLAUDE.md's standing rule)                                                                                                                                                                                                                                                                                                  |

_(T12–T14 added in remediation; original T12/T13 renumbered to T15/T16 accordingly — dependencies above reflect the renumbering.)_

---

## PART 18 — Risks

| Risk                                                                                                                                                                                                       | Category         | Mitigation                                                                                                                                                                                                                                                                           | Owner                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Cross-tenant leak (**R-06**, existing)                                                                                                                                                                     | Security         | Now fully closed by design (Part 9's complete matrix, remediated — Critical-2) — E22 can genuinely verify something that exists                                                                                                                                                      | Security + Backend          |
| Privileged account takeover (**R-09**, existing)                                                                                                                                                           | Security         | Now fully closed by design: ADR-011's mechanism specified and built (Part 15/8), plus MFA rate limiting (High-4) and role-lifecycle governance (Critical-1/ADR-021)                                                                                                                  | Security                    |
| SECURITY.md §2's OAuth provider list (Google/Apple/**Facebook**) now contradicts ADR-020 (Google/Apple only)                                                                                               | Documentation    | Tracked as an open item — SECURITY.md needs a follow-up correction PR; not fixed silently as part of this design doc, since SECURITY.md is itself a reviewed canonical doc                                                                                                           | Documentation Gate reviewer |
| Redis becomes a hard dependency for auth (rate limiting + revocation denylist), where it wasn't load-bearing for auth before                                                                               | Technical        | Part 11's fail-closed/fail-open behavior is explicit per failure type, not assumed; Redis already exists in the E1 stack, not a new operational dependency                                                                                                                           | Backend                     |
| TOTP enrollment friction may affect `ADMIN`/`ENTERPRISE_ADMIN` onboarding conversion                                                                                                                       | Product          | Accepted per ADR-011's own stated trade-off; revisit only if onboarding data shows material drop-off                                                                                                                                                                                 | Product                     |
| Anomaly/step-up verification deferred (Part 2)                                                                                                                                                             | Security         | `identity.session.created` event ships with enough signal for a later epic to build on; tracked, not silently dropped                                                                                                                                                                | Security (future epic)      |
| **_(added in remediation)_ Two-person `ADMIN`-approval (ADR-021) creates an operational bottleneck if an environment only ever has one real `ADMIN`**                                                      | Operational      | Accepted, explicit trade-off (Part 9A/14): security value of two-person integrity for the highest-privilege role outweighs friction for a small team; the emergency-recovery procedure (Part 9A) is the deliberate escape hatch, itself heavily audited                              | DevOps + Security           |
| **_(added in remediation)_ `app_service_role`'s `BYPASSRLS` grant (ADR-022) is a single-layer-of-defense code path**                                                                                       | Security         | Scoped to four named, small, individually-reviewable operations only (Part 9); any new use requires elevated review (CODE_REVIEW_CHECKLIST.md) — tracked as an ongoing discipline requirement, not a one-time fix                                                                    | Security + Backend          |
| **_(added in remediation)_ Registration's `CONFLICT` (409) remains a narrower user-enumeration signal than login/reset** (Medium-3, not independently blocking)                                            | Security         | Accepted as inherited from API_GUIDELINES.md's existing convention; flagged for a future, non-blocking hardening pass rather than reopening API_GUIDELINES.md's own accepted pattern in this design                                                                                  | Security (future)           |
| **_(added in remediation)_ `AuditLog`/`EntitlementChangeLog` 7-year retention is a placeholder, not legally reviewed**                                                                                     | Compliance       | Explicit placeholder, same discipline as E1's budget-alert threshold; tracked for real legal/compliance input before production data accumulates                                                                                                                                     | Legal + Security            |
| **_(added in remediation pass #2)_ `SECURITY DEFINER` functions (ADR-023) are a new, small, privileged code surface — they execute with their owner's privileges, not the caller's**                       | Security         | Scoped to exactly three functions, each single-purpose and reviewed in full in Part 9C; CODE_REVIEW_CHECKLIST.md's `app_service_role` elevated-review requirement (ADR-022) is explicitly extended to cover any new `SECURITY DEFINER` function, not treated as a one-time exception | Security + Backend          |
| **_(added in remediation pass #2)_ `User.status` transitions (suspend/reinstate) have no endpoint in this Epic** — noted during the Part 9C privileged-field survey, not previously tracked                | Product/Security | Explicitly out of this Epic's MVP scope (Part 2) rather than built speculatively; the column is already locked down (Part 9C) so a later epic adding this endpoint inherits the protection by default rather than having to remember to add it                                       | Product (future epic)       |
| **_(added in remediation pass #4)_ `pg_advisory_xact_lock` contention on the fixed platform-admin key (43, 0) serializes ALL concurrent `ADMIN`-tier role changes system-wide, not just conflicting ones** | Technical        | Accepted: `ADMIN`-tier changes are expected to be rare (two-person-approved, ADR-021), so the serialization cost is negligible; the lock is only acquired when a change actually touches `ADMIN` (Part 9C), so routine `TEACHER`/`ENTERPRISE_ADMIN` activity is unaffected           | Backend                     |
| **_(added in remediation pass #4)_ `SECURITY DEFINER` function ownership is specified as a requirement (Part 17/T12) but not yet enforced by anything in this design**                                     | Security         | Carried as an explicit implementation-time acceptance criterion rather than left implicit, per the third review's finding; verifying it is a T12/code-review responsibility, not something a design document can enforce on its own                                                  | Security + Backend          |

---

## PART 19 — Final Review

### Missing information / open decisions

1. Named tech lead for E2 — still `[TBD]`.
2. SECURITY.md §2's OAuth provider list needs a follow-up correction PR to match ADR-020 (Part 18).
3. Exact TOTP library/implementation choice (e.g., `otplib`) — a package selection, not an architecture decision; left to the implementer within ADR-019's constraints.
4. Argon2id hashing performance under real login load — flagged for a load test (Part 16), not solved speculatively here.
5. _(added in remediation)_ `AuditLog`/`EntitlementChangeLog` retention (7 years, Part 9B) is a placeholder pending real legal/compliance review (Part 18).
6. _(added in remediation)_ Registration's `CONFLICT`-response enumeration signal (Medium-3) remains an accepted, non-blocking gap — a candidate for a future hardening pass, not resolved in this remediation.

### Remediation summary (this revision)

This document has now been revised three times. Pass #1 followed [E2-architecture-gate-review.md](E2-architecture-gate-review.md)'s NO GO (3 Critical, 4 High) — recorded in [E2-remediation-report.md](E2-remediation-report.md). A second review ([E2-second-independent-review.md](E2-second-independent-review.md)) found the first remediation's Part 9A/9B material had a real interaction gap and returned NO GO again; pass #2 closed it with Part 9C/ADR-023 — recorded in [E2-remediation-report-v2.md](E2-remediation-report-v2.md). A third, function-body-level targeted review ([E2-third-targeted-review.md](E2-third-targeted-review.md)) then found Part 9C's `SECURITY DEFINER` function _bodies_ didn't fully deliver the guarantees their surrounding design promised (1 Critical, 3 High, all inside `approve_role_change()`/`set_org_role()`); pass #3 closed all four with per-invariant advisory locking and independent caller/authorization verification inside the functions themselves — recorded in [E2-remediation-report-v3.md](E2-remediation-report-v3.md), the authoritative record for this pass.

### Completed since this revision

- **Fourth** (targeted) Architecture Gate review completed: [E2-fourth-targeted-review.md](E2-fourth-targeted-review.md) — **GO** (2026-07-30), scoped to Part 9C's rewritten function bodies specifically, same no-self-approval requirement as every prior review.
- ADR-018–023 formally appended to DECISIONS.md as **Accepted** (E2-T29, 2026-08-01) — previously "Proposed" in Part 15.
- Implementation (T1–T29) complete; independent post-implementation acceptance review returned CONDITIONAL ACCEPTANCE (3 blocking findings, now remediated — see [E2-final-acceptance-remediation.md](E2-final-acceptance-remediation.md)).

### Still open

- A named tech lead for E2 — still `[TBD]`, never assigned during implementation.
- Independent sign-off on the Security/Database/API/Testing/Documentation/Performance/Deployment gates (see the Gate sign-off log below) — this remediation's own recommendation is a targeted re-verification, not a self-certified pass.

### Architecture Gate checklist (TECHNICAL_DESIGN_TEMPLATE.md §9)

- [x] Respects bounded-context ownership (Part 4) — Identity stays in `apps/api`, no new service
- [x] Does not contradict an existing ADR — extends ADR-005/ADR-011 rather than reopening them; ADR-018–023 fill genuine gaps, confirmed absent by direct research, not overlapping decisions
- [x] Service-boundary rules honored — cross-context communication via domain events only (Part 10)
- [x] Failure modes defined for every external dependency (Part 11)
- [x] Every Critical/High finding from the first Architecture Gate review has a traceable resolution (Part 9/9A/9B, Part 8) — see [E2-remediation-report.md](E2-remediation-report.md)
- [x] Every mandatory finding from the second Architecture Gate review has a traceable resolution (Part 9C, ADR-023) — see [E2-remediation-report-v2.md](E2-remediation-report-v2.md)
- [x] Every mandatory finding from the third, function-body-level review has a traceable resolution (Part 9C's rewritten functions, ADR-023's amendment) — see [E2-remediation-report-v3.md](E2-remediation-report-v3.md)
- [x] Reviewed by someone other than the author — done: [E2-fourth-targeted-review.md](E2-fourth-targeted-review.md), **GO** (2026-07-30), same no-self-approval rule as every prior review of this document

### Approval recommendation

**Design approved** by the fourth targeted Architecture Gate review (above) — not self-approved, consistent with IMPLEMENTATION_GUIDE.md §4's no-self-approval rule on Architecture/Security/Database gates, and with the precedent this Epic's own predecessor (E1) set. Implementation (T1–T29) proceeded against this approved design. The remaining open item is not this Architecture Gate — it's the separate, post-implementation Security/Database/API/Testing/Documentation gates in the sign-off log below, which review the _implementation_, not the design, and which this design's own approval does not substitute for.

---

## Gate sign-off log (EPIC_TEMPLATE.md §5)

Updated 2026-08-01 to reflect the state after implementation (T1–T29), the T28 security review, the independent post-implementation acceptance review, and this remediation pass — not self-certified into "Passed" by this document's own author where a genuinely independent decision hasn't yet been made. Per this project's standing no-self-approval discipline (every prior review in this Epic's history was performed by someone other than the implementer), rows below marked **Pending** require a reviewer who did not do the remediation work — that identity is intentionally left blank here for the authorized reviewer to fill in, not fabricated.

| Gate          | Owner                                                                                                                    | Status                                                            | Evidence link                                                                                                                                        | Date       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Architecture  | PostgreSQL Security Architect, Identity Security Engineer, Backend Transaction Specialist, Database Reliability Engineer | ☑ Passed (design; implementation followed it without deviation)   | [E2-fourth-targeted-review.md](E2-fourth-targeted-review.md) — GO                                                                                    | 2026-07-30 |
| Security      | [pending — independent reviewer]                                                                                         | ☐ Pending — cannot self-certify                                   | [E2-security-review.md](E2-security-review.md) §9                                                                                                    |            |
| Database      | [pending — independent reviewer]                                                                                         | ☐ Pending — targeted re-verification                              | [E2-final-acceptance-review.md](E2-final-acceptance-review.md) §5 (88/100); [E2-final-acceptance-remediation.md](E2-final-acceptance-remediation.md) |            |
| API           | [pending — independent reviewer]                                                                                         | ☐ Pending — targeted re-verification                              | [E2-final-acceptance-review.md](E2-final-acceptance-review.md) §6 (84/100)                                                                           |            |
| Frontend      | [pending — independent reviewer]                                                                                         | ☐ Not started                                                     | Part 12                                                                                                                                              |            |
| AI            | —                                                                                                                        | ☐ N/A                                                             | E2 has no AI surface                                                                                                                                 |            |
| Performance   | [pending — independent reviewer]                                                                                         | ☐ Pending — R-42 (Argon2id parameters) open                       | [E2-T27-performance-report.md](E2-T27-performance-report.md); [E2-final-acceptance-review.md](E2-final-acceptance-review.md) §9                      |            |
| Accessibility | [pending — independent reviewer]                                                                                         | ☐ Not started — F9, untracked prior to this pass                  | [E2-final-acceptance-review.md](E2-final-acceptance-review.md) §8 (no WCAG validation performed)                                                     |            |
| Testing       | [pending — independent reviewer]                                                                                         | ☐ Pending — targeted re-verification of F2's CI fix               | [E2-final-acceptance-review.md](E2-final-acceptance-review.md) §8; [E2-final-acceptance-remediation.md](E2-final-acceptance-remediation.md)          |            |
| Documentation | [pending — independent reviewer]                                                                                         | ☐ Pending — targeted re-verification                              | [E2-final-acceptance-review.md](E2-final-acceptance-review.md) §10 (74/100)                                                                          |            |
| Deployment    | [pending — independent reviewer]                                                                                         | ☐ Pending — F2's CI workflow is new, unexercised in a real PR yet | [.github/workflows/api-security-e2e.yml](../../.github/workflows/api-security-e2e.yml)                                                               |            |

## Epic Approval

**All gates passed:** ☐ No — Architecture is the only gate with an independent pass on record; Security/Database/API/Testing/Documentation/Performance/Deployment await targeted re-verification of this remediation pass; Frontend/Accessibility were never separately gated
**DEFINITION_OF_DONE.md satisfied:** ☐ No — see Accessibility row above
**Approved by:** [pending — requires an independent reviewer per IMPLEMENTATION_GUIDE.md §4; not self-approved]
**Date:** [pending]
**Recommendation on record:** READY FOR TARGETED FINAL RE-VERIFICATION ([E2-final-acceptance-remediation.md](E2-final-acceptance-remediation.md)) — not a substitute for the sign-offs above.
