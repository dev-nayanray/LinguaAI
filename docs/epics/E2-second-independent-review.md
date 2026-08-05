# Epic E2 — Second Independent Architecture Gate Review

**Epic:** Identity & Access Platform
**Design under review:** [E2-identity-access-platform.md](E2-identity-access-platform.md) (remediated, 2026-07-30)
**Also reviewed:** [E2-architecture-gate-review.md](E2-architecture-gate-review.md) (first review, NO GO), [E2-remediation-report.md](E2-remediation-report.md) (remediation)
**Review date:** 2026-07-30
**Reviewers:** Architecture Review Board (CTO Reviewer, Principal Security Architect, Principal Identity Architect, Principal Backend Architect, Principal Database Architect, Principal Platform Architect, Principal QA Architect)

> **Independence disclosure** (unchanged from the first review, repeated because it's still true): the design, the first review, the remediation, and this second review were all produced in the same working session by the same agent. This is not the independent, differently-accountable review IMPLEMENTATION_GUIDE.md §4 requires. What follows is a genuinely skeptical re-check of the remediated document's literal text — including a deliberate search for gaps the remediation itself might have introduced, not just re-confirmation that the original three findings are gone — but it is not a substitute for a real second reviewer.

**Decision: NO GO.** All 3 original Critical findings and 3 of 4 original High findings are fully and correctly resolved — that work is sound and does not need to be redone. But this pass found a new, concrete privilege-escalation-adjacent gap in how the Critical-1 (role governance) and Critical-2 (RLS) remediations interact with each other, plus two smaller integrity gaps in the same subsystem. None of the three original Criticals have regressed; the new findings are all in the newly-added Part 9A/9B material, which is exactly where a second pass should be most skeptical, since it's the least battle-tested part of the document.

---

## 1. Verification of the three original Critical findings

### Critical-1 (privileged role lifecycle) — **Confirmed resolved**, with one new integrity gap found nearby (§3)

Checked against the actual text of Part 9A: bootstrap administrator creation (out-of-band CLI, `app_service_role`, MFA-gated before any privileged action), role promotion, role demotion, two-person approval for `ADMIN`-involving changes, last-admin/last-org-admin protection, and emergency recovery are all genuinely present and specific, not hand-waved. Part 6 has real endpoints with real authorization columns. Part 5 has a real `RoleChangeRequest` entity with the fields the workflow needs. This is a complete, well-reasoned closure of the original finding.

### Critical-2 (RLS completion) — **Confirmed resolved for row-level access**, with one new gap found at the column level (§3, the primary finding of this review)

Checked the actual SQL in Part 9: `User`, `Organization`, and `OrganizationMembership` all have real `READ`/`INSERT`/`UPDATE`/`DELETE` policies with negative examples. This closes the original finding exactly as described — `User` is no longer the unprotected table it was in the first draft. However, verifying this alongside Critical-1's new role-governance material (which didn't exist during the first review, so couldn't have been cross-checked then) surfaced a real interaction gap — detailed in §3.

### Critical-3 (audit subsystem) — **Confirmed resolved**, with one new atomicity gap found nearby (§3)

Checked Part 9B and the `AuditLog`/`EntitlementChangeLog` entities in Part 5: the `REVOKE UPDATE, DELETE` / `GRANT INSERT, SELECT` privilege split is real and correctly closes the original "no immutable audit trail" finding — this is genuine database-level enforcement, not a policy statement. One smaller gap found in how reliably an audit row is guaranteed to exist for every governed action — §3.

## 2. Verification of the four original High findings

- **High-1 (JWT claims/staleness):** Confirmed resolved. `sub`/`role`/`organizationId`/`orgRole`/`jti`/`iat`/`exp` are explicit; `tokensValidAfter` is a real field with a stated check on every request. Sound.
- **High-2 (OAuth CSRF):** Confirmed resolved for the `state`-parameter mechanism. **Not fully closed**: the review brief that commissioned this remediation explicitly asked for "PKCE (where applicable)" and the design never addresses it — see §4.
- **High-3 (OAuth account linking):** Confirmed resolved. `(provider, providerAccountId)`-only matching, explicit authenticated linking endpoint. Sound.
- **High-4 (MFA rate limiting):** Confirmed resolved for brute-force resistance (rate limit + lockout). **Not fully closed**: the original review's own checklist item "MFA design... Recovery" is still not addressed for the ordinary case of a single user losing their device while other admins remain functional — see §5.

## 3. New finding: role governance has no database-level backstop (the primary finding of this review)

This is the most significant thing this pass found, and it only becomes visible once Critical-1 and Critical-2's remediations are read _together_ — a check the first review couldn't have performed, since Part 9A didn't exist yet.

**Finding:** Part 9's `user_update` policy —

```sql
CREATE POLICY user_update ON "User"
  FOR UPDATE USING (
    id = current_setting('app.current_user_id', true)::uuid
    OR (current_setting('app.caller_org_role', true) = 'ENTERPRISE_ADMIN'
        AND "organizationId" = current_setting('app.current_org_id', true)::uuid)
    OR current_setting('app.is_platform_admin', true)::boolean = true
  );
```

— is a **row-level** policy. Postgres RLS controls which _rows_ a statement can touch, not which _columns_ it can write. This policy permits an `ENTERPRISE_ADMIN` (via the standard, non-`BYPASSRLS` role) to `UPDATE` any column on any `User` row in their org — including `role` — through a plain `UPDATE "User" SET role = 'ADMIN' WHERE id = ...`. Nothing in the schema or privilege grants stops this. The entire two-person-approval mechanism Part 9A builds (`RoleChangeRequest`, the `.../approve` endpoint, `role-lifecycle.service.ts`) is **application-layer only** — exactly the single-layer-of-defense pattern the _original_ Critical-2 finding existed to eliminate for tenant isolation, now reappearing, unaddressed, for role governance specifically. A bug in `role-lifecycle.service.ts`, a future endpoint that does a generic `PATCH /v1/users/:id` without routing through it, or a direct database access path all bypass the two-person approval entirely, with RLS actively permitting it. The same gap applies to `OrganizationMembership.orgRole` via `membership_update`.

**Why this matters enough to block:** ADR-021's entire stated purpose — "privilege escalation to the platform's highest-trust role now requires collusion between two named individuals" — is not actually true as designed. It requires collusion _only if every code path correctly routes through `role-lifecycle.service.ts`_, which is an application-discipline assumption, not an enforced guarantee. This is precisely the class of gap the review brief's negative-test checklist asks to hunt for ("Privilege escalation," "Role assignment vulnerabilities," "Missing authorization checks") and precisely the class of gap RLS was introduced in this Epic specifically to stop relying on application discipline alone for.

**A concrete, scoped fix exists** (noted for whoever remediates, not implemented here): Postgres supports column-level privileges (`GRANT UPDATE (column1, column2) ON "User" TO app_role`) — granting the standard role `UPDATE` on `User` _excluding_ `role` and `organizationId` (and on `OrganizationMembership` excluding `orgRole`) would force any write to those specific columns through `app_service_role` or a dedicated `SECURITY DEFINER` function that only `role-lifecycle.service.ts` calls — giving the two-person-approval guarantee an actual database-level backstop, consistent with how this Epic already treats `AuditLog`'s immutability (a privilege grant, not a convention).

## 4. New finding (smaller): role-governance workflow integrity gaps

Two related, smaller gaps in the same newly-added Part 9A/9B material, grouped here since both concern whether the governance mechanism is as airtight as it's described:

- **Approval race condition:** `POST /v1/users/:id/role-change-requests/:requestId/approve` is not specified with the atomic conditional-update pattern Part 8 already established for refresh-token rotation ("a single conditional `UPDATE ... WHERE ... RETURNING`"). Without it, two near-simultaneous approval attempts (or a retry) could both observe `status = PENDING` and both apply side effects, rather than the second cleanly no-op'ing. Not a privilege-escalation vector on its own (both approvers would still need to be legitimate, different `ADMIN`s), but an inconsistency against a pattern this same document already knows to apply.
- **Audit-write atomicity:** Nothing in Part 9A/9B states that a governed action (role change, org-membership change) and its corresponding `AuditLog` write happen in the same database transaction. A crash or error between the two steps could leave a real role change with no audit record — quietly defeating Part 16's own test goal ("every action... produces exactly one `AuditLog` row").

Neither of these is as severe as §3, but both sit in the same trust boundary (role-governance integrity) that this Epic's own remediation was built to establish, so they're grouped with §3 as mandatory rather than filed as low-priority polish.

## 5. Other findings (recommended, not mandatory)

- **PKCE for OAuth (High-2, partially open):** the design never mentions PKCE, and the mobile app (E21) is named elsewhere in this same document (ADR-018's access-token-transport reasoning) as a consumer of this identity system. If E21's OAuth flow is ever a native/public client rather than a web view delegating to the same server-side flow, PKCE becomes necessary, not optional. Recommended: an explicit statement of whether E21's OAuth flow reuses the web server-side exchange (in which case PKCE genuinely isn't needed) or will be a separate public-client flow (in which case it is) — currently unstated either way.
- **Single-user MFA recovery (High-4, partially open):** Part 9A's emergency recovery covers "every `ADMIN` account inaccessible." The far more common case — one user loses their authenticator device while other admins remain functional — has no documented flow (e.g., "an `ADMIN` can reset another user's `mfaEnrolled` flag, forcing re-enrollment on next login," itself an audited, privileged action). Recommended, not blocking, since a workaround (use Part 9A's heavier machinery) technically exists.
- **Bootstrap-to-second-admin path:** the two-person approval workflow requires two existing `ADMIN`s to promote a third; getting from the bootstrap-created _first_ `ADMIN` to a _second_ isn't explicitly described as "run the bootstrap procedure again," even though nothing in the design forbids it. A one-line clarification would remove the ambiguity. Recommended, not blocking.

## 6. Areas re-confirmed sound (no new findings)

Domain events (field naming now consistent across the role-lifecycle events), API contract shape and error-code usage, multi-tenancy row-level design apart from §3's column-level gap, GDPR/audit-record interaction on erasure (`AuditLog`/`RoleChangeRequest`/`PasswordResetToken` FKs remain valid against an anonymized `User` row, no dangling-reference issue), and the `EntitlementChangeLog` scope boundary against E15 all check out against a fresh read.

---

## 7. Scores

| Dimension                | First review | After first remediation (report's claim) | This review (verified) | Rationale for this review's number                                                                                                                                                                                    |
| ------------------------ | ------------ | ---------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture Score       | 80/100       | 92/100                                   | **88/100**             | The Part 9A/9B additions are well-structured, but §3's cross-cutting gap between them wasn't caught by the design's own internal consistency pass — a real miss, though a smaller one than the original omissions     |
| Security Score           | 54/100       | 88/100                                   | **68/100**             | §3 is a genuine, concrete privilege-escalation-adjacent gap directly in the review's own named negative-test categories; §4's two smaller integrity gaps compound it                                                  |
| Identity Readiness       | 58/100       | 89/100                                   | **72/100**             | The role lifecycle is well-designed on paper but not yet actually enforced end-to-end (application-layer only) — the same "looks complete, isn't fully backstopped" pattern the original Critical-2 finding was about |
| Multi-tenancy Readiness  | 62/100       | 91/100                                   | **85/100**             | Row-level tenant isolation itself is genuinely complete and correct (§1); the deduction is narrowly for the column-level gap on privileged fields, not a regression of the tenant-isolation work itself               |
| **Overall E2 Readiness** | **61/100**   | 90/100                                   | **78/100**             | Real, substantial progress since the first review — do not read this as "back to square one" — but not yet ready to build on                                                                                          |

## 8. Decision

## NO GO

Two mandatory remediation items, both scoped to the Part 9/9A/9B material added in the first remediation — none of the three original Critical findings or the OAuth-linking/MFA-rate-limit High findings need to be touched again.

### Mandatory remediation items

1. **(§3)** Close the column-level gap: restrict the standard application role's `UPDATE` privilege on `User` to exclude `role`/`organizationId`, and on `OrganizationMembership` to exclude `orgRole` (Postgres column-level `GRANT`), forcing those specific writes through `app_service_role` or a dedicated `SECURITY DEFINER` function that only `role-lifecycle.service.ts` calls — giving ADR-021's two-person-approval guarantee an actual database-level backstop, not an application-discipline assumption.
2. **(§4)** Specify the same atomic conditional-update pattern Part 8 already uses for refresh-token rotation for `RoleChangeRequest` approval, and state explicitly that a governed role/org-role change and its `AuditLog` write occur in the same database transaction.

Recommended, non-blocking: clarify PKCE applicability for E21's eventual OAuth flow, add a single-user MFA-reset path distinct from full emergency recovery, and state the bootstrap-to-second-admin path explicitly (§5).
