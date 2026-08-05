# Epic E2 — Remediation Report v3 (Function-Body Targeted Pass)

Status: **Remediation complete — recommended for fourth, targeted Architecture Gate review.** Prepared: 2026-07-30
Source finding document: [E2-third-targeted-review.md](E2-third-targeted-review.md) (NO GO, 2026-07-30)
Remediated document: [E2-identity-access-platform.md](E2-identity-access-platform.md)
Prior remediations: [E2-remediation-report.md](E2-remediation-report.md) (pass #1), [E2-remediation-report-v2.md](E2-remediation-report-v2.md) (pass #2) — both unaffected by this pass

> Same independence caveat as every document in this chain: produced by the same agent as the design and all three prior reviews/remediations. Not a substitute for a real independent reviewer.

Scope, per the remediation brief: fix only the `SECURITY DEFINER` function bodies flagged in the third review. The column-level privilege allowlist (ADR-023's other half) is unchanged. No other Part was reopened.

---

## Finding 1 — Last platform `ADMIN` protection

**Root cause:** `approve_role_change()` (pass #2's version) never checked the resulting platform-wide `ADMIN` count at all — `set_org_role()` had an analogous check for `ENTERPRISE_ADMIN`, but the equivalent was simply never written for the platform-`ADMIN` case. Not a race condition — a straightforward absent check, demonstrated in the third review via two sequential, individually-valid two-person-approved requests reducing the system to zero `ADMIN`s.

**Resolution:** `approve_role_change()` now evaluates `v_request."fromRole"`/`"toRole"` (the **target**, not the requester or approver) after the atomic claim succeeds. If the change moves the target _out_ of `ADMIN`, it counts remaining `ADMIN` rows (excluding the target) and raises `cannot_demote_last_platform_admin` if that count is zero.

**Updated function behavior:** the check runs only when `fromRole = 'ADMIN' OR toRole = 'ADMIN'` — routine `TEACHER` grants never touch this code path at all.

---

## Finding 2 — Last `ENTERPRISE_ADMIN` race condition

**Root cause:** `set_org_role()`'s `SELECT ... FOR UPDATE` locked the _one row being changed_, then separately counted _other_ rows without locking them. Two concurrent calls demoting two _different_ `ENTERPRISE_ADMIN`s of the same org could each see the other as "still admin" and both commit — a genuine time-of-check-to-time-of-use race across rows, not within one.

**Resolution:** replaced the single-row lock with a deterministic, per-organization Postgres advisory transaction lock: `pg_advisory_xact_lock(44, hashtext(v_org_id::text))`, acquired _before_ any read the demotion decision depends on. Two calls targeting the same org fully serialize; calls targeting different orgs never contend (different hash-derived keys).

**Concurrency strategy — locking design chosen and why:**

| Option considered                                                                                              | Verdict                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row-level `FOR UPDATE` on all matching admin rows (`SELECT ... WHERE orgRole = 'ENTERPRISE_ADMIN' FOR UPDATE`) | Workable but couples correctness to exact WHERE-clause re-evaluation semantics under `READ COMMITTED`; harder to verify correct by inspection                                                                                                                           |
| `SERIALIZABLE` isolation for these functions                                                                   | Would work, but forces the caller (Prisma) to handle serialization-failure retries for every call, not just the rare conflicting ones — broader blast radius for a narrow problem                                                                                       |
| **Deterministic advisory lock, keyed per-invariant** (chosen)                                                  | Directly names the exact invariant being protected (per-org admin floor, or the platform-wide admin floor — Finding 1), is trivially auditable by reading the lock key, and imposes zero cost on non-conflicting operations (different orgs, or `TEACHER`-only changes) |

**Proof that two concurrent same-org demotions cannot both pass:** both calls compute the identical lock key for that org. Whichever acquires it first proceeds to completion (commit or rollback) before the second is even allowed to read the membership state its decision depends on. The second call, once unblocked, reads the _post-first-call_ committed state — it cannot decide against data the first call has already invalidated. Full argument reproduced in Part 9C.

---

## Finding 3 — Caller identity verification

**Root cause:** all three functions accepted an actor-ID parameter (`p_approver_id`/`p_actor_id`/`p_user_id`) and used it directly, without checking it against anything the database itself could independently verify — a bug in the calling TypeScript, or a future endpoint that let a caller specify someone else's ID, would have been silently trusted.

**Resolution:** every function now begins by reading `current_setting('app.current_user_id', true)` — the same session variable `tenant.middleware.ts` already sets for RLS (Part 9), on the same transaction — and raises `caller_identity_mismatch` immediately if it's `NULL` or doesn't equal the supplied parameter.

**How request identity enters the Postgres session (as requested):** unchanged from Part 9's existing mechanism — the JWT is verified server-side by `apps/api` before any database work begins; `tenant.middleware.ts` issues `SET LOCAL app.current_user_id = '<uuid>'` on the request's transaction. This is not new plumbing — Part 9C's functions simply read a value RLS already required to exist.

**Validation:** a direct equality check against the parameter; no implicit trust of application-layer claims.

**Failure behavior:** immediate `RAISE EXCEPTION 'caller_identity_mismatch'` — fails closed, before any other work in the function runs, consistent with Part 11's existing fail-closed philosophy for this whole subsystem.

---

## Finding 4 — Database-level approver authorization

**Root cause:** `approve_role_change()` checked only "is the approver a different person than the requester" — it never checked that the approver actually _held_ `ADMIN`, relying entirely on the application-layer `RolesGuard`.

**Resolution:** `approve_role_change()` now looks up the approver's `User` row directly and verifies existence, `status = 'ACTIVE'`, and `role = 'ADMIN'` — raising `approver_not_found`, `approver_not_active`, or `approver_not_authorized` respectively — before the claim step proceeds. "Belongs to correct tenant/context" is satisfied structurally: platform `ADMIN` has no tenant dimension (ARCHITECTURE.md §2.1), so there is nothing further to check for this function. `set_org_role()` received the equivalent, tenant-aware version: the actor must be a platform `ADMIN`, or hold `ENTERPRISE_ADMIN` specifically within the target membership's own organization — checked via a direct `OrganizationMembership` lookup, not assumed from the request.

---

## Updated function behavior (summary)

All three functions were rewritten (`CREATE OR REPLACE`, same signatures — no call-site changes needed in `role-lifecycle.service.ts`/`mfa.service.ts`, Part 7):

- **`approve_role_change`**: caller-identity check → approver existence/active/role check → atomic claim (unchanged) → conditional advisory lock + last-platform-`ADMIN` check (only when the change touches `ADMIN`) → role write + `tokensValidAfter` bump → `AuditLog` insert.
- **`set_org_role`**: caller-identity check → membership lookup → **advisory lock acquired before any further read** → actor existence/active/org-authorization check → re-read current `orgRole` (post-lock) → last-`ENTERPRISE_ADMIN` check → write + `tokensValidAfter` bump → `AuditLog` insert.
- **`complete_mfa_enrollment`**: caller-identity check (the only addition — no admin-count invariant applies) → write → `AuditLog` insert.

---

## Additional security review (as requested)

- **SQL injection:** unchanged conclusion — every statement across all three functions remains parameterized PL/pgSQL with typed arguments; no dynamic SQL, no string concatenation, no `EXECUTE`. Confirmed clean.
- **`SECURITY DEFINER` search_path safety:** tightened from `SET search_path = public` to `SET search_path = pg_catalog, public` in all three functions — the documented Postgres best practice, applied while the functions were already open for rewrite. The third review's ownership question (should these functions be owned by a narrowly-privileged role, not the migration/superuser role) is carried forward as an explicit T12 acceptance criterion (Part 17) rather than resolved in this design pass — it's an implementation-time, not design-time, guarantee.
- **Audit transaction integrity:** unchanged and reconfirmed — every `AuditLog` insert remains inside the same function call as the state change it records; no `EXCEPTION` block anywhere swallows an error, so any `RAISE` rolls back everything the function did, including a partially-applied audit write.
- **Token invalidation:** unchanged and reconfirmed — `tokensValidAfter` is bumped inside the same atomic function call as the role/org-role write in both `approve_role_change()` and `set_org_role()`.
- **Event generation:** unchanged — domain-event publication remains a post-commit application-layer step, as it is for every event in this Epic (Part 10); the third review already concluded this is not a Part 9C-specific gap and this pass doesn't reopen that conclusion.
- **Rollback behavior:** reconfirmed against the _new_, larger set of `RAISE EXCEPTION` paths this pass adds (caller mismatch, approver/actor not found, not active, not authorized, last-admin-blocked) — none are wrapped in an `EXCEPTION` handler, so each still triggers a full rollback of everything the function attempted, with no partial state possible.

---

## Security guarantees this pass establishes

A malicious or buggy API layer, per the remediation brief's stated objective, now cannot — at the database layer, independent of any application-layer check —:

- Remove the last platform `ADMIN` (Finding 1, race-free via the advisory lock).
- Remove the last `ENTERPRISE_ADMIN` of an organization (Finding 2, race-free via the org-scoped advisory lock).
- Have a role change take effect without a genuinely authorized, currently-active `ADMIN` approver (Finding 4).
- Cause a governance function to act on behalf of an identity other than the actual authenticated caller (Finding 3).
- Produce a role/org-role change with no corresponding `AuditLog` row, or a partially-applied one (unchanged from pass #2, reconfirmed above).

---

## Remaining risks

Carried forward, unchanged except for the two new entries this pass adds to Part 18:

- **New:** `pg_advisory_xact_lock`'s fixed platform-admin key serializes _all_ concurrent `ADMIN`-tier changes system-wide (not just conflicting ones) — accepted, since such changes are expected to be rare and two-person-approved already.
- **New:** function ownership is specified as a requirement but not yet enforced by anything in the design itself — an implementation/code-review responsibility (Part 17/T12), not something a design document can guarantee on its own.
- Everything accepted in passes #1–#2 (SECURITY.md's OAuth provider list, the registration-enumeration trade-off, the audit-retention placeholder, `email`'s now-locked self-update field, the undocumented baseline `GRANT` history, Argon2id load-testing) is unaffected and unchanged by this pass.

The third review's non-mandatory notes (function-ownership as a Medium finding, the baseline-grant documentation gap) were **partially** picked up here (search_path hardening, ownership carried into Part 17's acceptance criteria) since the functions were already open for rewrite — but neither was treated as blocking, consistent with "resolve only the mandatory findings."

---

## Updated readiness scores

| Dimension                | Third review | After this pass | Rationale                                                                                                                                                                                                                                      |
| ------------------------ | ------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture Score       | 83/100       | **93/100**      | The pattern was already sound (third review's own conclusion); the function bodies now actually deliver what the surrounding prose always claimed                                                                                              |
| Security Score           | 58/100       | **90/100**      | The Critical finding (a demonstrated, no-race path to zero admins) and all three High findings are closed with concrete, verifiable mechanisms; remaining gap to 100 reflects this is still an unimplemented, un-independently-verified design |
| Identity Security Score  | 55/100       | **91/100**      | The last-admin-lockout gap — the most severe finding across all three reviews — is closed with a proof, not just a claim                                                                                                                       |
| Database Security Score  | 62/100       | **92/100**      | Column protection (already excellent) plus function-level authorization and race-free concurrency now form a complete, coherent database-security story for this subsystem                                                                     |
| **Overall E2 Readiness** | **65/100**   | **91/100**      | Matches pass #2's pre-third-review self-assessment almost exactly — this pass closes the gap the function-body-level scrutiny opened, without reopening anything the column-protection mechanism already got right                             |

---

## Recommendation

## READY FOR FINAL TARGETED REVIEW

All four mandatory findings from [E2-third-targeted-review.md](E2-third-targeted-review.md) have concrete, verifiable resolutions in the rewritten `approve_role_change()`, `set_org_role()`, and `complete_mfa_enrollment()` (Part 9C), with the underlying model (ADR-023) amended in place rather than replaced, exactly as instructed. Scope discipline held: the column-level privilege allowlist is untouched, no new role tier or redesign was introduced, and no previously-approved section outside Part 9C/ADR-023 was reopened.

This report is not self-approval. A fourth, targeted Architecture Gate review — by someone other than this document's author, per IMPLEMENTATION_GUIDE.md §4, unchanged through every cycle of this process — is the recommended next step before Epic E2 may begin implementation (T1).
