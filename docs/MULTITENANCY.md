# LinguaAI — Multi-Tenancy & Isolation Strategy

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-07-29

Implements ADR-005. Resolves the Architecture Review's highest-ranked architecture/security finding: app-layer-only tenant filtering is a realistic cross-tenant data-leak vector once Enterprise (module 20) data exists.

## 1. Tenant model

- **Individual consumer accounts** (`User.organizationId = null`) are not tenant-scoped beyond standard per-user ownership checks.
- **Enterprise accounts** belong to an `Organization` (DATABASE.md §2.1) via `OrganizationMembership`. All org-owned data — members, assignments, reports, seats — is tenant-scoped to that `Organization`.
- Single database, shared schema, row-level tenancy (not schema-per-tenant or database-per-tenant) — the right MVP-to-Growth trade-off given Enterprise volume expectations; revisited only if a specific compliance requirement (e.g., a customer-mandated dedicated database) demands stronger isolation.

## 2. Enforcement layers (defense in depth)

Tenant isolation is enforced at **three independent layers** — a bug in any one layer does not by itself cause a leak:

1. **Application query layer** — every Prisma query touching a tenant-scoped table includes an explicit `organizationId` (or equivalent) filter, code-reviewed per CONTRIBUTING.md.
2. **Postgres Row-Level Security (RLS)** — the authoritative enforcement layer. Every tenant-scoped table has an RLS policy restricting visible rows to `current_setting('app.current_org_id')::uuid`, set by Prisma middleware at the start of each request from the authenticated caller's organization membership. A query missing an application-layer filter still cannot return another tenant's rows.
3. **Integration test suite** — a required test class (not optional coverage) asserting that `ENTERPRISE_ADMIN` A cannot read/write `Organization` B's data, run for every tenant-scoped table (TESTING.md §5).

```
Request → auth middleware resolves org → Prisma middleware SETs app.current_org_id
        → application query (with explicit org filter) → Postgres (RLS re-enforces filter)
```

## 3. What RLS does not replace

RLS protects row visibility within tenant-scoped tables. It does not replace:

- **RBAC** (`USER | TEACHER | ADMIN | ENTERPRISE_ADMIN`) — role checks still gate _which actions_ a caller may perform, independent of tenant scoping.
- **Resource ownership checks** within a tenant (an `ENTERPRISE_ADMIN` for Org A can see all of Org A's members, but a `USER` within Org A still only sees their own progress) — implemented at the application layer, since RLS operates at the tenant grain, not the individual-resource grain.

## 4. Tenant provisioning

- An `Organization` is created via a defined admin-initiated flow (sales-assisted at Enterprise-phase launch, self-serve is a later consideration); the creating `ENTERPRISE_ADMIN` is the first member.
- Bulk member provisioning (CSV import, and SCIM in a later phase — PRD.md Enterprise readiness notes) creates `User` + `OrganizationMembership` records with the org's `organizationId` already set — no window where a bulk-imported user is tenant-unscoped.

## 5. Data residency (forward-looking, not built at MVP)

Schema reserves an `Organization.dataRegion` field (nullable, defaulting to the platform's single region at MVP) so that a future data-residency requirement (relevant if Enterprise customers require EU-only data storage) is additive to the schema rather than a migration that has to backfill an assumption. No enforcement logic exists yet — this is explicitly deferred per ARCHITECTURE.md §9 and tracked in RISK_REGISTER.md.

## 6. Testing requirement

Per TESTING.md §5, every PR that adds a tenant-scoped table must add: (a) the RLS policy in the same migration, (b) an application-layer filter, and (c) a cross-tenant-leak integration test — CI treats a tenant-scoped table without an accompanying RLS policy as a failing check. An **interim** version of this check now exists (`packages/database/scripts/lint-rls-policies.ts`, wired into CI, Epic E4 T11 — docs/epics/E4-database-schema-core-data-layer.md §10 resolved item 1): static analysis over migration SQL text, not a full SQL parser. E1 never built the originally-planned schema-lint script; E22 (Security Hardening & Compliance Gate) is still the owner of the permanent, fully-general replacement.
