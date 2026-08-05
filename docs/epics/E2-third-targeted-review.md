# Epic E2 — Third Targeted Architecture Gate Review

**Scope:** Part 9C and ADR-023 only, [E2-identity-access-platform.md](E2-identity-access-platform.md). Not a complete E2 review — Parts 1–8, 9A (prose), 9B, 10–19 are treated as previously accepted and are not re-litigated here except where Part 9C's actual SQL fails to deliver something they already promised.
**Review date:** 2026-07-30
**Reviewers:** Database Security Architect, PostgreSQL Expert, Identity Security Reviewer, Backend Architecture Reviewer

> **Independence disclosure** (unchanged, repeated because it's still true): same agent as the design and all prior reviews/remediations. This is a genuinely line-by-line re-check of the actual SQL in Part 9C, not a re-confirmation of the remediation report's own claims about it.

**Decision: NO GO.** The column-allowlisting half of Part 9C is sound and correctly closes what it set out to close. The `SECURITY DEFINER` function bodies, checked line by line against the specific guarantees Part 9A/9C claim, have one Critical and three High gaps — including a straightforward, non-racing path to zero platform `ADMIN`s that the design's own prose explicitly promises is blocked.

---

## Section 1 — Column-level privilege review

Checked every field named in the review brief against Part 9C's actual `REVOKE`/`GRANT` statements and against the full Part 5 entity list (not just the named fields, per the brief's "no forgotten privileged columns" instruction):

| Field                                 | Excluded from `app_role` write?         |
| ------------------------------------- | --------------------------------------- |
| `User.role`                           | ✅ (not in the allowlist)               |
| `User.organizationId`                 | ✅ (not in the allowlist)               |
| `User.status`                         | ✅                                      |
| `User.passwordHash`                   | ✅                                      |
| `User.tokensValidAfter`               | ✅                                      |
| `User.mfaEnrolled`                    | ✅                                      |
| `User.mfaSecret`                      | ✅                                      |
| `OrganizationMembership.orgRole`      | ✅ (whole table has no allowlist grant) |
| `RoleChangeRequest` resolution fields | ✅ (whole table has no allowlist grant) |

All nine named fields are correctly locked down. Two additional observations from surveying the rest of Part 5 for forgotten columns:

- **`User.email` was silently removed from what a user can self-update.** Before Part 9C, `user_update`'s row-level policy allowed a self-update of any column, including `email`. Part 9C's allowlist (`displayName`, `avatarUrl`, `locale`, `timezone`) does not include `email` — meaning self-service email changes, previously implicitly possible, now silently stop working, with no dedicated replacement flow (unlike `passwordHash`, which explicitly routes through `app_service_role` via password-reset-confirm). This may well be the _right_ call — email is recovery-adjacent and arguably deserves the same verified-flow treatment as a password — but it's an undocumented behavior change, not a stated decision. **Medium finding.**
- **The baseline grant this `REVOKE` is narrowing isn't documented anywhere.** Part 9C's `REVOKE UPDATE ON "User" FROM app_role` presupposes `app_role` had table-wide `UPDATE` in the first place. Nowhere in Part 5, Part 9, or Part 9C is that initial grant shown. This doesn't create a vulnerability (worst case, the `REVOKE` is a harmless no-op), but it means "REVOKE rules are complete" — the brief's own explicit question — can't be fully confirmed without knowing the full grant history, which the design doesn't state. **Medium finding, documentation-completeness.**

## Section 2 — `SECURITY DEFINER` function review

- **Correct privileges / ownership:** the functions correctly use `SECURITY DEFINER` so they can write columns `app_role` cannot. **Not specified:** who owns them. By default that's whoever runs the migration — if that's a broad migration/superuser role, these three functions inherit far more privilege than they need for their three narrow jobs. Best practice is a purpose-specific owner role holding exactly the privileges the functions use. **Medium finding.**
- **Caller authorization — not fully checked, and this is the most consequential finding in this section:** `approve_role_change(p_request_id, p_approver_id, ...)` and `set_org_role(p_membership_id, p_new_org_role, p_actor_id)` both **trust their identity parameters** rather than cross-checking them against the session's actual authenticated identity. `tenant.middleware.ts` (Part 9) already sets `current_setting('app.current_user_id', true)` on every request — neither function verifies `p_approver_id`/`p_actor_id` equals that value. If the calling TypeScript ever passes the wrong ID (a bug, or a future endpoint that lets a caller supply an `approverId` instead of deriving it from their own session), the database provides no backstop — reintroducing, for this one check, exactly the "trust the application layer" pattern Part 9C exists to eliminate. **High finding.**
- **`approve_role_change()` never verifies the approver actually holds `ADMIN`.** It checks `requestedBy <> p_approver_id` (a different person) but never checks that person's actual role. That check lives entirely in `RolesGuard` at the application layer (Part 6's endpoint auth column) — meaning if that guard has a bug or is missing on this one route, the database raises no objection to a non-`ADMIN` approving an `ADMIN`-tier role change. **High finding**, same root cause as the previous one.
- **Search path:** `SET search_path = public` is real, correct pinning (prevents hijacking via _other_ schemas) — its safety depends on `app_role` lacking `CREATE` on `public`, which is Postgres's post-15 default but is never explicitly stated or verified in this design. **Low/informational finding.**
- **SQL injection:** none of the three functions use dynamic SQL, string concatenation, or `EXECUTE` — every statement is parameterized PL/pgSQL with typed arguments. **Confirmed clean, no finding.**
- **Transaction boundaries:** no `EXCEPTION` blocks swallow errors anywhere in the three functions — a `RAISE EXCEPTION` correctly propagates and rolls back everything the function did. **Confirmed correct.**

## Section 3 — Atomicity review

**Role approval** (claim → change role → invalidate sessions → write audit → publish event): the first four steps are genuinely atomic inside `approve_role_change()` — the claim, the `role`/`tokensValidAfter` write (one `UPDATE`, satisfying "invalidate sessions" via the access-token staleness check Part 8 already defines — this isn't a `Session`-row revocation, but it is the mechanism this design uses, and it's inside the same transaction), and the `AuditLog` insert. **The fifth step, domain-event publication, is not and was never claimed to be part of this transaction** — Part 9C's own text scopes its atomicity guarantee to "the state transition, the `tokensValidAfter` bump, and the `AuditLog` write," not event emission. Every domain event in this Epic (Part 10) is published by the application layer after its triggering database work commits — this is a pre-existing characteristic of the whole design (ADR-010's domain-event architecture has no transactional-outbox guarantee anywhere in E2), not something Part 9C regressed, and closing it properly (an outbox pattern) is a larger architectural change outside this review's stated scope. **Not a Part 9C finding — noted for completeness, not counted as blocking.**

**MFA completion:** same shape, same conclusion — `complete_mfa_enrollment()` atomically updates `mfaEnrolled`/`mfaSecret` and writes `AuditLog`; the "security event" step is the same standard post-commit publish as everywhere else in this design.

**Organization role changes — a real gap found here:** `set_org_role()` uses `SELECT ... FOR UPDATE` to lock the _one_ membership row being changed, then separately counts _other_ `ENTERPRISE_ADMIN` rows in the same org without locking them. Two concurrent calls demoting two _different_ `ENTERPRISE_ADMIN`s of the same org can each observe the other as "still admin" and both proceed — a genuine TOCTOU race that can leave an org with zero `ENTERPRISE_ADMIN`s despite each individual call's check passing. See Section 5, item 4, for the worked example. **High finding.**

## Section 4 — Audit integrity

Every field the brief asks about — actor, target, tenant, timestamp, correlation ID — is present in the `AuditLog` schema (Part 5) and populated by all three functions (correlation ID is inherited from `packages/observability`'s existing per-request context, per Part 9B, unchanged by this pass). `UPDATE`/`DELETE` are not granted on `AuditLog` to `app_role` (Part 9B, unchanged) — an attacker with only `app_role`-level access cannot modify or delete audit history; this remains sound and is not affected by anything reviewed in this pass. **No new finding** — Part 9B's audit-immutability guarantee is orthogonal to, and unaffected by, the gaps found in Sections 2–3 above (those gaps are about whether the _state change itself_ can happen without proper authorization, not about whether the resulting audit record can be tampered with — it can't).

## Section 5 — Bypass attempts

1. **"Application endpoint has a missing permission check. Can database protections still prevent abuse?"** — Partially. The column-level `REVOKE`/`GRANT` (Section 1) _does_ still block a direct `UPDATE "User" SET role = ...` regardless of what the application layer does — that specific protection holds. But if the missing check is on the `.../approve` endpoint specifically, **the database does not independently prevent it**, because (Section 2) neither function verifies the caller's actual role or identity against session state. This is the core of the High findings above: the column protection is real, but the _function-level_ authorization backstop is not as complete as Part 9C's stated intent implies.
2. **"Developer writes a direct `UPDATE` query. Can privileged columns still be modified?"** — No, correctly blocked. This is Section 1's finding and it holds cleanly: `app_role` cannot `UPDATE` `role`, `organizationId`, `mfaEnrolled`, `mfaSecret`, `tokensValidAfter`, `status`, `passwordHash`, `orgRole`, or `RoleChangeRequest`'s resolution fields, full stop, at the Postgres privilege level. **This is exactly what Part 9C set out to fix, and it works.**
3. **"Malicious tenant administrator attempts escalation. Can they promote themselves?"** — Not to platform `ADMIN` (two-person approval still requires a second, different `ADMIN` to exist and act — an `ENTERPRISE_ADMIN` alone cannot manufacture that). Within their own org, an `ENTERPRISE_ADMIN` _can_ call `set_org_role()` to change another member's `orgRole` (that's the intended, authorized capability) — no escalation beyond what Part 9A already authorizes was found here.
4. **"Concurrent approval requests. Can two approvals create inconsistent state?"** — **Yes, demonstrated concretely, and this is the most severe finding in this review.** Two scenarios:
   - **`set_org_role()` race** (Section 3): two concurrent demotions of _different_ `ENTERPRISE_ADMIN`s in the same org can both pass the "at least one other admin remains" check and both commit, leaving zero. **High.**
   - **`approve_role_change()` missing check entirely — no concurrency even required.** With exactly two platform `ADMIN`s, A and B: A requests demoting B, approved by B (allowed — the check is only `requestedBy <> approver`, not `targetUserId <> approver`, so B can approve their own demotion). This succeeds; A is now the sole `ADMIN`. Separately, B (now a `USER`, but this doesn't matter — the request was already created) — or more simply, a second, independently-initiated request demoting A, approved by A themselves before their own demotion completes — **there is no check anywhere in `approve_role_change()` for "would this leave zero `ADMIN`s platform-wide."** `set_org_role()` has an analogous (if racy) check for `ENTERPRISE_ADMIN`; `approve_role_change()` has none at all, despite Part 9A's own prose explicitly stating "Demoting the last remaining `ADMIN` (platform-wide)... is blocked outright." **This is a direct contradiction between what the design document promises and what its SQL actually does — Critical.**

## Section 6 — Future pattern review

The _pattern_ — column allowlisting plus narrow `SECURITY DEFINER` functions as the only writers of privileged fields — is sound and reusable; ADR-023 correctly generalizes it rather than describing a one-off fix, and the Section 1 survey confirms it scales cleanly to fields beyond the two the second review originally named. Two limitations worth recording for future use of this pattern, neither blocking ADR-023's adoption as a pattern, both relevant to _this Epic's_ two functions specifically:

- Every future function following this pattern must independently verify caller identity against session state (Section 2) and the specific role/permission the operation requires — this should be stated as part of the pattern itself in ADR-023, not left to be independently rediscovered per function.
- Any future function enforcing an "at least N of this role must remain" invariant across multiple rows must lock the _entire relevant set_, not just the row being changed (Section 3/5) — `set_org_role()` is the cautionary example, not the model, for this specific case.

---

## Scores

| Dimension                | Second remediation's self-assessment | This review (verified) | Rationale                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture Score       | 94/100                               | **83/100**             | The pattern itself (column allowlist + `SECURITY DEFINER`) is well-conceived and correctly documented (ADR-023); the deduction is for the function bodies not fully delivering the guarantees the surrounding prose (Part 9A) and the pattern's own stated intent promise |
| Security Score           | 90/100                               | **58/100**             | One Critical (a demonstrated, non-racing path to zero platform `ADMIN`s) and three High findings (org-admin-count race, unverified caller identity, unverified approver role) directly in the mechanism this whole review chain has been built around                     |
| Identity Security Score  | 90/100                               | **55/100**             | The last-admin-lockout gap is an identity-governance failure at the core of what Critical-1 (first review) and this entire remediation chain exist to guarantee                                                                                                           |
| Database Security Score  | 92/100                               | **62/100**             | Column-level protection (the primary database-security ask) is genuinely excellent and confirmed working; function-level authorization gaps and the row-locking race are real database-security-relevant defects in the same subsystem                                    |
| **Overall E2 Readiness** | **91/100**                           | **65/100**             | The column-protection half of this pass is real, working, and should not be redone; the function-body half needs a further, narrowly-scoped pass before this is safe to build                                                                                             |

## Decision

## NO GO

### Mandatory remediation items

1. **(Critical)** Add a "would this leave zero platform `ADMIN`s" check to `approve_role_change()`, equivalent in spirit to `set_org_role()`'s existing (if racy) check — and make sure it's race-free (see item 2).
2. **(High)** Fix `set_org_role()`'s TOCTOU race: lock the full set of an org's `ENTERPRISE_ADMIN` rows (or use an advisory lock keyed on `organizationId`, or `SERIALIZABLE` isolation for this function) before counting, not just the single row being changed. Apply the same fix to the new platform-wide `ADMIN` check in item 1.
3. **(High)** Have both functions verify their identity parameters against `current_setting('app.current_user_id', true)` rather than trusting the caller-supplied value outright.
4. **(High)** Have `approve_role_change()` verify the approver's actual `User.role = 'ADMIN'` inside the function, not only via the application-layer `RolesGuard`.

Recommended, non-blocking: specify function ownership as a narrowly-privileged role rather than the implicit migration owner; document the baseline `GRANT` history for `app_role` so "REVOKE rules are complete" is fully verifiable; state explicitly whether self-service email change is intentionally removed and, if so, what (if any) verified-flow replacement exists.
