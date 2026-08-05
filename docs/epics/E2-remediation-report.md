# Epic E2 — Remediation Report

Status: **Remediation complete — recommended for second Architecture Gate review.** Prepared: 2026-07-30
Source finding document: [E2-architecture-gate-review.md](E2-architecture-gate-review.md) (NO GO, 2026-07-30)
Remediated document: [E2-identity-access-platform.md](E2-identity-access-platform.md)

> Same independence caveat as the review it remediates: this report and the design it documents were produced by the same agent. It records what changed and why, mapped to each finding — it is not itself the second, independent Architecture Gate review IMPLEMENTATION_GUIDE.md §4 requires before implementation may begin.

---

## 1–3. Findings, resolutions, and updated sections

### Critical-1 — No privileged role assignment mechanism (including no way the first `ADMIN` could ever exist)

**Resolution:** New **Part 9A — Privileged Role Lifecycle & Governance**. Defines the complete lifecycle the finding asked for:

- **Bootstrap administrator creation** — a one-time, out-of-band CLI procedure (infrastructure-level access, never the public API), running through the new `app_service_role` since no session context exists yet to authorize an insert through the standard role.
- **First administrator provisioning** — the bootstrap account is created with `mfaEnrolled = false`; `MfaGuard` (already existing in the pre-remediation design) blocks every privileged action until MFA enrollment completes on first login — closing the loop with an already-built control rather than inventing a new one.
- **Role promotion / demotion workflow** — new endpoints (`POST /v1/users/:id/role-change-requests`, `.../approve`, `PATCH /v1/organizations/:id/members/:userId/role`), each with explicit authorization rules.
- **Super Admin governance / system administrators / enterprise organization administrators** — resolved as a **process control** (two-person approval for `ADMIN`, single-party for `TEACHER`/`ENTERPRISE_ADMIN`) applied to the _existing_ `ADMIN`/`ENTERPRISE_ADMIN` roles, explicitly **not** a new schema-level role tier — a scoped decision recorded in Part 14 (Alternatives) and ADR-021, chosen specifically to avoid the scope expansion a new role value would represent.
- **Audit requirements** — every lifecycle action writes to the new `AuditLog` (Critical-3).
- **Approval requirements** — two-person approval for `ADMIN`-involving changes; a requester cannot approve their own request; last-`ADMIN`/last-`ENTERPRISE_ADMIN` demotion is blocked outright.
- **Emergency recovery procedure** — the same bootstrap CLI, re-invoked, gated at the infrastructure level, logged at maximum audit severity via a distinct `identity.role.emergency_recovery` event, with a mandatory post-incident review expected operationally (SECURITY.md §9).

**Updated sections:** Part 2 (Scope), Part 5 (new `RoleChangeRequest` entity, `User.tokensValidAfter`), Part 6 (3 new endpoints), Part 7 (`role-lifecycle.service.ts`), **Part 9A (new)**, Part 10 (3 new events), Part 13, Part 14, Part 15 (ADR-021, new), Part 16, Part 17 (T12, new), Part 18, Part 3 (Deliverable 12).

### Critical-2 — Incomplete RLS coverage (only `OrganizationMembership` had a concrete policy; `User` — the table itself called "the tenant-scoping column" — had none)

**Resolution:** Part 9 rewritten as a **complete policy matrix**: `Organization`, `OrganizationMembership`, and `User` each now have explicit `READ`/`INSERT`/`UPDATE`/`DELETE` policies, a negative example demonstrating cross-tenant denial for each, and an explicit accounting of the two access patterns the original draft left implicit:

- **Service-account exceptions** — a narrow, `BYPASSRLS`-granted `app_service_role`, used only by four named code paths (registration, OAuth account creation, bootstrap, GDPR erasure) — never the default per-request role, so RLS's defense-in-depth isn't weakened for every query, only bypassed for the few that must legitimately operate before/across tenant context. Recorded as ADR-022, with the rejected broader-`BYPASSRLS` alternative documented in Part 14.
- **Background job access** — same `app_service_role`, same review-discipline requirement (CODE_REVIEW_CHECKLIST.md flag on any new use).
- **Administrative access** — a platform `ADMIN` goes through the _standard_ role with an explicit `app.is_platform_admin` flag (verified server-side, never client-supplied) so admin cross-tenant access stays inside RLS's visible, auditable `OR is_platform_admin` branches rather than bypassing RLS the way the service role does.

`POST /v1/organizations` was also tightened to platform-`ADMIN`-only (it previously allowed any authenticated user to create an org and become its `ENTERPRISE_ADMIN`, which didn't actually match MULTITENANCY.md §4's own "admin-initiated" framing the original draft cited — a related consistency bug the RLS completion work surfaced and fixed alongside the finding).

**Updated sections:** Part 5 (`Migration & RLS requirement` note), Part 6 (`POST /v1/organizations` auth tightened), **Part 9 (rewritten)**, Part 13, Part 14, Part 15 (ADR-022, new), Part 16, Part 17 (T2, T7 updated), Part 18.

### Critical-3 — No `AuditLog`/`EntitlementChangeLog` (direct SECURITY.md §3 non-compliance)

**Resolution:** New **Part 9B — Immutable Audit Subsystem**, plus the two entities in Part 5:

- **Immutable storage** — `UPDATE`/`DELETE` are not granted to the standard application role at the Postgres privilege level (`REVOKE UPDATE, DELETE ... ; GRANT INSERT, SELECT ...`) — immutability holds even against an application bug or a compromised app-role credential, not merely code-review discipline.
- **Required audit events** — every Part 9A role-lifecycle action, every platform-admin cross-tenant RLS branch, org membership changes, MFA enrollment, deletion requests, password-reset completion, admin-initiated revocation, OAuth linking.
- **Record shape** — actor, target, tenant, correlation ID (reusing `packages/observability`'s existing per-request ID from E1, not a parallel scheme), before/after values, timestamp.
- **Retention** — 7 years, explicitly flagged as a placeholder pending real legal/compliance review (same "don't overbuild, don't under-specify" discipline E1 applied to its own budget-alert threshold).
- **Access policy** — `GET /v1/audit-log` (platform admin) / `GET /v1/organizations/:id/audit-log` (org-scoped `ENTERPRISE_ADMIN`), reusing Part 9's RLS pattern rather than inventing a new one.
- `EntitlementChangeLog`'s entity shape is defined now (so E15/Billing doesn't invent a competing pattern later) without being populated — E2 owns Identity, not Billing (Part 2's existing scope boundary), so the write path stays E15's.

**Updated sections:** Part 5 (`AuditLog`, `EntitlementChangeLog` entities), Part 6 (2 new endpoints), Part 7 (`audit/` module), **Part 9B (new)**, Part 13, Part 14, Part 16, Part 17 (T13, new), Part 18.

### High-1 — Undefined JWT claim shape and staleness behavior

**Resolution:** Part 8 now states the exact claim set (`sub`, `role`, `organizationId`, `orgRole`, `jti`, `iat`, `exp`) and closes the staleness gap with a new `User.tokensValidAfter` field: every authenticated request checks `jwt.iat >= tokensValidAfter`, and any role/org-membership change bumps it — so a change takes effect on the affected user's _next_ request, not at the token's natural 15-minute expiry. Recorded in the revised ADR-018.

**Updated sections:** Part 5 (`User.tokensValidAfter`), Part 8, Part 13, Part 15 (ADR-018 revised), Part 17 (T6).

### High-2 — No OAuth CSRF `state` parameter

**Resolution:** `GET /v1/auth/oauth/:provider` now issues a signed, short-lived (10 min), single-use `state` value; the callback rejects the exchange on missing/invalid/expired/reused `state`.

**Updated sections:** Part 6, Part 8, Part 13, Part 16, Part 17 (T4).

### High-3 — Unstated, risky OAuth-to-existing-account email-linking rule

**Resolution:** Linking is now explicitly matched **only** by `(provider, providerAccountId)`, never by email. A new authenticated endpoint (`POST /v1/users/me/oauth-accounts`) is the only path that attaches an OAuth identity to an existing account, requiring proof of ownership (an active session) first — closing the pre-registration account-takeover pattern the review named.

**Updated sections:** Part 6 (new endpoint), Part 8, Part 13, Part 16, Part 17 (T4).

### High-4 — No rate limiting on `POST /v1/auth/mfa/verify`

**Resolution:** `mfa/verify` and `mfa/challenge` now join the same Redis-backed rate-limit class as login/password-reset, plus an explicit lockout (5 failed attempts / 10 minutes → 15-minute lockout).

**Updated sections:** Part 6, Part 8, Part 13, Part 16, Part 17 (T5).

### Medium findings (not independently blocking, folded into the same pass since each was small)

- **Medium-1** (refresh-token rotation race) — resolved: a single atomic conditional `UPDATE ... RETURNING`, race loser treated as reuse (Part 8).
- **Medium-2** (password-reset token expiry/storage unstated) — resolved: new `PasswordResetToken` entity, hashed storage, 1h expiry, single-use (Part 5, Part 6).
- **Medium-3** (registration's `CONFLICT` as an enumeration signal) — **explicitly accepted, not remediated**: inherited from API_GUIDELINES.md's own existing example; reopening that baseline convention was judged out of this design's scope (Part 13, Part 18).
- **`identity.login.failed`'s email hash** — resolved: specified as a keyed HMAC, not a bare hash (Part 10).

---

## 4. Remaining accepted risks

Carried forward in Part 18 of the remediated design, none silently dropped:

| Risk                                                                                              | Why accepted                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two-person `ADMIN` approval (ADR-021) is an operational bottleneck for a single-admin environment | Security value of two-person integrity outweighs friction; emergency recovery is the deliberate, heavily-audited escape hatch                                       |
| `app_service_role`'s `BYPASSRLS` grant (ADR-022) is a single-layer-of-defense code path           | Scoped to four named operations; any new use requires elevated code review — an ongoing discipline requirement, not a one-time fix                                  |
| Registration's `CONFLICT` (409) remains a narrower enumeration signal than login/reset (Medium-3) | Inherited from an existing, already-accepted API_GUIDELINES.md convention; flagged for a possible future hardening pass, not reopened here                          |
| `AuditLog`/`EntitlementChangeLog` 7-year retention is a placeholder                               | Pending real legal/compliance review — same discipline E1 applied to its own budget-alert placeholder                                                               |
| SECURITY.md §2's OAuth provider list (includes Facebook) still contradicts ADR-020                | A documentation-only follow-up correction to SECURITY.md itself, tracked, not fixed by silently editing a separately-reviewed canonical doc from within this design |
| Argon2id performance under real load                                                              | Flagged for a load test, not solved speculatively (unchanged from the original design)                                                                              |

None of these are Critical or High findings from the review — all were already present in the original design's own risk register or are explicit, reasoned trade-offs made during remediation (not oversights).

---

## 5. Updated readiness scores

| Dimension                | First review | After remediation | Change                                                                                                                                                                                                                                       |
| ------------------------ | ------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture Score       | 80/100       | **92/100**        | The two architectural omissions (unspecified role-change path, missing audit trail) are now fully specified subsystems (Part 9A, 9B), each with its own ADR                                                                                  |
| Security Score           | 54/100       | **88/100**        | All 3 Critical and 4 High findings closed with concrete mechanisms; remaining gap to 100 reflects the accepted Medium items and the fact that none of this has been built or tested yet — a design score, not an implementation-verified one |
| Identity Readiness       | 58/100       | **89/100**        | The design can now actually produce a working `ADMIN` account (bootstrap procedure) and govern every subsequent role change — the fundamental gap is closed                                                                                  |
| Multi-tenancy Readiness  | 62/100       | **91/100**        | Complete RLS matrix for all three tables, negative examples, and an explicit, narrowly-scoped exception path for the few operations that must cross tenant boundaries                                                                        |
| **Overall E2 Readiness** | **61/100**   | **90/100**        | Weighted the same way as the first review; the remaining 10 points reflect that this is still an unimplemented, un-independently-reviewed design — score reflects design completeness, not production readiness                              |

---

## 6. Recommendation

## READY FOR SECOND ARCHITECTURE REVIEW

Every Critical and High finding from [E2-architecture-gate-review.md](E2-architecture-gate-review.md) has a traceable resolution in the revised [E2-identity-access-platform.md](E2-identity-access-platform.md), summarized in §1–3 above. Scope was held to what the findings required — no new role tier, no redesign of the accepted RLS/RBAC/JWT/OAuth architecture, no scope expansion into E4/E15/E18/E22's territory (billing's `EntitlementChangeLog` write path, SSO, admin UI beyond the minimum, and cross-region data residency all remain explicitly out of scope, unchanged from the original design). Two genuinely new architecture decisions (ADR-021, ADR-022) were required and are drafted, not deferred, consistent with TECHNICAL_DESIGN_TEMPLATE.md §8.

This report and the revised design are **not** self-approved. Per IMPLEMENTATION_GUIDE.md §4's no-self-approval rule — the same rule E1's own remediation cycle operated under — a second, independent Architecture Gate review is required before Epic E2 may begin implementation (T1).
