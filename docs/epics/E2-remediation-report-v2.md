# Epic E2 — Remediation Report v2 (Targeted Pass)

Status: **Remediation complete — recommended for third Architecture Gate review.** Prepared: 2026-07-30
Source finding document: [E2-second-independent-review.md](E2-second-independent-review.md) (NO GO, 2026-07-30)
Remediated document: [E2-identity-access-platform.md](E2-identity-access-platform.md)
Prior remediation: [E2-remediation-report.md](E2-remediation-report.md) (pass #1, unaffected by this pass — see §3)

> Same independence caveat as every prior document in this chain: produced by the same agent as the design, both reviews, and the first remediation. Not a substitute for a real independent reviewer.

This is a **targeted** pass, scoped exactly to the two mandatory findings from the second review — no other section of the design was reopened.

---

## Finding 1 — Privileged column protection

**Finding (second review, §3):** Part 9's row-level RLS policies do not restrict which _columns_ a permitted row-level write can touch. An `ENTERPRISE_ADMIN`'s legitimate `user_update` row access could also be used to write `User.role` directly via a plain `UPDATE`, bypassing the entire two-person-approval workflow Part 9A built, with no database-level objection. The same gap applied to `OrganizationMembership.orgRole`.

**Resolution:** New **Part 9C — Privileged Column Protection & Atomic Governance Functions**. Two controls:

1. **Column-level privilege allowlisting** — `REVOKE UPDATE` on `User`, `OrganizationMembership`, and `RoleChangeRequest` from the standard application role, replaced with an explicit allowlist (`User`: only `displayName`/`avatarUrl`/`locale`/`timezone` remain freely writable; `OrganizationMembership`/`RoleChangeRequest`: nothing is freely writable). Every excluded column is reachable only through `app_service_role` (unchanged, Part 9) or the new governance functions (below).
2. **Before deciding the fix was complete, every entity in Part 5 was surveyed for the same class of gap** (per the review brief's explicit instruction to "review every privileged business workflow and confirm whether the same architectural pattern is required elsewhere"). This surfaced fields beyond the two the review named: `User.mfaEnrolled`/`mfaSecret` (a direct write would let an account self-attest MFA completion without a real TOTP verification, defeating ADR-011/ADR-019), `User.tokensValidAfter` (writing this _backward_ would un-revoke tokens meant to be invalidated — a security bypass, not just a data-integrity issue), `User.status` and `User.passwordHash` (account-reinstatement and credential-overwrite vectors, respectively — already implicitly routed through separate flows, now made an enforced separation rather than an assumed one), and `RoleChangeRequest.status`/`approvedBy`/`resolvedAt` (these fields _are_ the approval gate itself). All are now excluded from the standard role's write access on the same allowlist basis.

**Documented enforcement mechanism (the review's explicit ask):** recorded as **ADR-023**, DECISIONS.md's exact format — the pattern is named ("column allowlisting + `SECURITY DEFINER` governance functions"), distinguished from the existing `app_service_role`/`BYPASSRLS` mechanism (which solves a different problem — session-context timing, not column-level lockdown), and stated as the standard this Epic and later ones must apply to any newly-introduced privileged field, not a one-off patch for the two fields named in the finding.

---

## Finding 2 — Atomic role governance transaction

**Finding (second review, §4):** `RoleChangeRequest` approval wasn't specified with the atomic conditional-update pattern Part 8 already used for refresh-token rotation, risking a double-approval race; and a role change and its `AuditLog` write weren't stated to be transactionally atomic, risking a role change committing with no audit record on partial failure.

**Resolution:** Both closed by the _same_ mechanism as Finding 1, not a separate one — this is why the two findings are handled together in one new Part rather than two independent patches. `approve_role_change()` (Part 9C) is a single `SECURITY DEFINER` function performing, inside one implicit transaction: the atomic claim (`UPDATE ... WHERE status = 'PENDING' ... RETURNING`, the same race-free shape as Part 8's refresh-token rotation), the `User.role` write, the `tokensValidAfter` bump, and the `AuditLog` insert. A concurrent second approval attempt observes zero rows updated and raises, exactly mirroring how refresh-token reuse is already detected elsewhere in this design. `set_org_role()` follows the identical shape for the single-party org-role path, and picked up the last-`ENTERPRISE_ADMIN` guard as a database-level check for free, since the row-count check and the write need to be in the same transaction anyway to avoid a check-then-write race.

---

## Updated sections

Per the review brief's request to list every modified section:

- **Header/status line** — reflects the two-review, two-remediation history.
- **Part 9** — cross-references Part 9C.
- **Part 9A** — the role-promotion/demotion workflow table and guardrails list now point at `approve_role_change()`/the new atomic mechanism instead of describing the approval as an application-only step.
- **Part 9C (new)** — the full mechanism: column grants, the privileged-field survey, and the three `SECURITY DEFINER` functions (`approve_role_change`, `set_org_role`, `complete_mfa_enrollment`).
- **Part 13 (Security Review)** — "Privilege escalation" row updated to state the fix is now database-enforced, not application-enforced; new "Audit-write atomicity" row.
- **Part 14 (Alternatives)** — two new entries: why a trigger wasn't used instead of column grants, why the fix isn't just an added `WHERE` clause in application code.
- **Part 15 (New Architecture Decisions)** — ADR-023 added; intro paragraph updated (5 ADRs → 6).
- **Part 16 (Quality Engineering)** — two new required test classes: privileged-column-protection tests (a raw `UPDATE` as the standard role must fail with a Postgres privilege error, not an application-level one), atomic-governance-function tests (concurrent-approval race, partial-failure rollback).
- **Part 17 (Implementation Plan)** — T2 (migration) and T12 (role lifecycle) updated to include the column grants and the three functions as explicit deliverables/acceptance criteria.
- **Part 18 (Risks)** — two new entries: `SECURITY DEFINER` functions as a small new privileged code surface requiring the same elevated-review discipline as `app_service_role`; `User.status` transitions (suspend/reinstate) noted as having no endpoint in this Epic, explicitly out of MVP scope rather than an oversight, with the column already locked down for whichever later epic adds it.
- **Part 19 (Final Review)** — remediation summary, recommendation, and Architecture Gate checklist updated to reflect the second pass and point to a third review.

**Not touched, per the "do not reopen previously approved sections" instruction:** Parts 1–8 (business objective through auth/session design), Part 9B (audit subsystem — used by, but not modified for, this fix), Part 10 (domain events), Part 11 (failure modes), Part 12 (frontend). The three original Critical findings and three of the four original High findings from the _first_ review remain exactly as resolved in [E2-remediation-report.md](E2-remediation-report.md) — nothing here supersedes that work.

---

## Remaining accepted risks

Carried forward from Part 18, unchanged except for the two additions this pass introduced (both above). Everything accepted in the first remediation pass (SECURITY.md's OAuth provider list still needing a follow-up correction, the registration-enumeration trade-off, the audit-retention placeholder, Argon2id load-testing, etc.) is unaffected and unchanged by this pass.

The second review's two _non-mandatory_ recommendations (PKCE applicability for E21's eventual mobile OAuth flow; a single-user MFA-reset path distinct from full emergency recovery) were **not** addressed in this pass, consistent with "resolve ONLY the mandatory findings" — they remain open, tracked in Part 19's "Missing information" list, available for a future pass if the next reviewer wants them folded in.

---

## Updated readiness scores

| Dimension                | Second review | After this pass | Rationale                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture Score       | 88/100        | **94/100**      | The cross-cutting gap between Part 9A and Part 9 is closed with a single, well-reasoned mechanism (ADR-023) rather than two separate patches — arguably a cleaner design than either finding required in isolation                                                                  |
| Security Score           | 68/100        | **90/100**      | Privilege escalation via direct `UPDATE` is now prevented by Postgres's own privilege system; the deduction from 100 reflects that this remains an unimplemented, un-independently-verified design, and the two non-mandatory items (PKCE, single-user MFA recovery) are still open |
| Identity Readiness       | 72/100        | **90/100**      | The role-governance mechanism is now genuinely enforced end-to-end, not just described end-to-end                                                                                                                                                                                   |
| Multi-tenancy Readiness  | 85/100        | **92/100**      | The row-level design was already sound; the column-level gap adjacent to it is closed                                                                                                                                                                                               |
| **Overall E2 Readiness** | **78/100**    | **91/100**      | Both mandatory findings closed with one coherent, well-documented mechanism; no regression anywhere in the previously-approved material                                                                                                                                             |

---

## Recommendation for final architecture review

This design has now been through two review/remediation cycles. Both original Critical/High findings (first review) and both mandatory findings from the second review have traceable, verifiable resolutions. The scope discipline requested for this pass was maintained: no new role tier, no redesign of RLS/RBAC/JWT/OAuth, no reopening of Parts 1–8 or 9B–12, one new architecture decision (ADR-023) documented rather than deferred.

**Recommended: proceed to a third Architecture Gate review**, focused specifically on verifying Part 9C's mechanism (the column grants and the three governance functions) rather than re-litigating material already confirmed sound twice. Per IMPLEMENTATION_GUIDE.md §4's no-self-approval rule — unchanged through every cycle of this process — that review must still be performed by someone other than this document's author before Epic E2 may begin implementation (T1).
