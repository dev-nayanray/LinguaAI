# Epic E2 — Fourth Targeted Architecture Review

**Scope:** the `SECURITY DEFINER` function remediation described in [E2-remediation-report-v3.md](E2-remediation-report-v3.md) only — `approve_role_change()`, `set_org_role()`, `complete_mfa_enrollment()` in [E2-identity-access-platform.md](E2-identity-access-platform.md) Part 9C. Not a full E2 review. Previously accepted sections (the column-level allowlist, RLS in Part 9, everything outside Part 9C) are treated as accepted unless a regression is found.
**Review date:** 2026-07-30
**Reviewers:** PostgreSQL Security Architect, Identity Security Engineer, Backend Transaction Specialist, Database Reliability Engineer

> **Independence disclosure** (unchanged, still true): same agent as the design and all four prior reviews/remediations. This is a fresh re-read of Part 9C's actual current SQL, traced through by hand against concrete scenarios, not a re-confirmation of the remediation report's own narrative.

**Decision: GO** — for the scope this review covers. All four mandatory findings from [E2-third-targeted-review.md](E2-third-targeted-review.md) are genuinely, verifiably resolved, with no regressions in previously-accepted material. One notable, explicitly out-of-scope observation is disclosed below (§Additional finding) — it does not belong to this review's charter and is not counted against this GO, but it should not be allowed to quietly disappear either.

---

## Check 1 — Platform `ADMIN` invariant

**Traced the exact scenario in the brief.** Two admins, A and B. A requests demoting B; B approves.

- Caller-identity check passes (B is authenticated as B).
- Approver check: B is looked up fresh from `User`, found `ACTIVE` and `role = 'ADMIN'` — still true at this point, since nothing has changed yet. Passes.
- Atomic claim succeeds (`requestedBy` = A ≠ approver B).
- `fromRole = 'ADMIN'` → the lock-and-count block runs: `count(*) FROM "User" WHERE role = 'ADMIN' AND id <> B` = 1 (just A). Not zero. Passes.
- B is demoted; A remains sole `ADMIN`. **Final state has exactly one admin — the invariant holds**, and this specific scenario doesn't attempt to reach zero, so this is the expected non-blocking case.

**Traced the actual zero-admin exploit the third review demonstrated** (sequential: A demotes B, then a second request demotes A too): after B is demoted, B's `role` is no longer `'ADMIN'`. A second request approving "demote A," approved by B, now fails at the **approver check** (`approver_not_authorized`, since B is no longer `ADMIN`) before even reaching the count logic — a second, independent line of defense beyond the count check itself. If instead the second approver were A (self-approving, which `p_require_different_approver` would need to permit — it doesn't for the two-person path), the count check would independently catch it: counting admins excluding A after B is already demoted yields zero, raising `cannot_demote_last_platform_admin`. **Both paths to the original exploit are now closed, redundantly.**

**Concurrent case** (two pre-existing `PENDING` requests — one demoting A approved by B, one demoting B approved by A — approved at nearly the same instant): whichever call reaches `pg_advisory_xact_lock(43, 0)` first proceeds to completion and commits, releasing the lock. The second call was already past its own approver-check and claim step (using data current as of those individual statements, correct under `READ COMMITTED`), but blocks at the lock before it can count admins — once unblocked, it counts against the _already-committed_ result of the first call, correctly finds zero remaining, and raises. **Confirmed: the final state cannot reach zero admins in either the sequential or the concurrent version of this scenario.**

**Non-admin changes:** the entire lock-and-count block is gated by `IF fromRole = 'ADMIN' OR toRole = 'ADMIN'` — confirmed by inspection that a plain `USER`↔`TEACHER` change never evaluates this block or acquires the lock. **No unnecessary cost confirmed.**

## Check 2 — Organization admin concurrency

- **Lock key deterministic:** `pg_advisory_xact_lock(44, hashtext(v_org_id::text))` — `hashtext()` is a deterministic Postgres builtin; same org ID always produces the same key. Confirmed.
- **Same organization serializes / different organizations don't block:** confirmed by tracing two concurrent calls against the same `v_org_id` (identical key, second blocks) versus two different `v_org_id`s (different keys, no contention) — reasoning holds.
- **Transaction lifetime correct:** `pg_advisory_xact_lock` (the `_xact_` variant, not the session variant) is auto-released at transaction end — commit or rollback — with no manual unlock required. This is the correct choice specifically because it can't leak: a crashed connection or an error mid-function still releases the lock, unlike a session-level advisory lock which requires an explicit, easy-to-forget unlock call.
- **Lock release behavior correct:** confirmed via the same reasoning — no code path in either function holds the lock past its own transaction.
- **Concurrent demotion test** (two `ENTERPRISE_ADMIN`s in the same org demoted simultaneously): traced identically to Check 1's platform case — the second caller can only read the org's admin count _after_ the first caller's change is already committed, so it correctly sees the reduced count and blocks. **Confirmed: only one demotion succeeds if the invariant would otherwise break.**

One informational note, not a finding against correctness: `hashtext()` is a 32-bit hash, so a cross-organization key collision is theoretically possible at very large scale (birthday-bound around tens of thousands of distinct organizations). The consequence of a collision is unrelated organizations' operations spuriously serializing against each other — a performance/liveness cost, never a correctness or security violation, since the lock only ever _adds_ serialization, it never removes protection. Not blocking at this Epic's scale.

## Check 3 — Caller identity validation

Confirmed present, and behaving correctly, in all three functions: `current_setting('app.current_user_id', true)` is read, compared by equality against the supplied ID parameter, and a mismatch (or `NULL`) raises `caller_identity_mismatch` before any other work happens — required, validated, compared correctly, and using the identical session variable RLS itself already depends on (Part 9), not a parallel mechanism.

**Test: malicious caller supplies another user's ID.** Confirmed rejected — traced directly against the `IF v_caller_id IS NULL OR v_caller_id <> p_approver_id THEN RAISE EXCEPTION` guard present at the top of each function.

## Check 4 — Approver authorization

`approve_role_change()`: approver existence, `status = 'ACTIVE'`, and `role = 'ADMIN'` are all independently re-verified from the database inside the function, not assumed from the caller or from `RolesGuard` having already run. "Belongs to correct security context" is satisfied structurally for this function — platform `ADMIN` has no tenant dimension (ARCHITECTURE.md §2.1), a point the function's own comment states explicitly rather than silently assuming. `set_org_role()`'s equivalent correctly _is_ tenant-aware: the actor must be a platform `ADMIN`, or specifically hold `ENTERPRISE_ADMIN` within the target membership's own organization, verified via a direct lookup, not inferred.

**Confirmed: an application-middleware failure (a missing or buggy `RolesGuard`) cannot be bypassed** — both functions independently re-derive and check authorization from the database, which is the objective this whole remediation chain was aimed at.

## Check 5 — `SECURITY DEFINER` safety

- **`EXECUTE` grants:** correctly scoped to `app_role` specifically on all three functions, no broader grant found.
- **`search_path` hardening:** `SET search_path = pg_catalog, public` present on all three — the documented best practice, correctly applied.
- **No unsafe dynamic SQL:** reconfirmed — every statement remains parameterized PL/pgSQL; zero `EXECUTE`, zero string concatenation.
- **Function owner permissions:** still not concretely specified anywhere in the design (no `ALTER FUNCTION ... OWNER TO ...` shown) — this is unchanged from the third review's own Medium finding, which pass #3's report explicitly and correctly deferred to Part 17/T12 as an implementation-time requirement rather than resolving it here. Reconfirmed still-open, **not a new gap, not blocking**, consistent with its already-disclosed status.
- **No accidental broad ownership:** cannot be fully confirmed from the design document alone (see above) — this is the same open item, not a second one.

## Check 6 — Transaction integrity

Role change, `tokensValidAfter` bump, and `AuditLog` insert are confirmed to remain inside the same function call in both `approve_role_change()` and `set_org_role()` — no `EXCEPTION` block anywhere swallows an error, so every new `RAISE` path this pass added (caller mismatch, approver/actor checks, last-admin-blocked) still triggers a full rollback of everything attempted, exactly as pass #3's own additional-security-review section concluded and as re-verified here by re-reading the current SQL directly.

**Domain event:** unchanged conclusion from the third review — event publication is a post-commit application-layer step for every event in this Epic (Part 10, ADR-010), not something Part 9C ever claimed to make transactionally atomic with the database write. Re-confirmed as the correct, already-settled position, not re-opened.

## Check 7 — Future privileged field pattern

ADR-023's amendment (Part 15) correctly states that the fixes in this pass — advisory locking per invariant, caller-identity cross-checks — are part of completing the same approved model, not a new one. One minor gap: the amendment describes _what was done_ for these three functions more than it restates _what any future privileged-field function must also do_. A future engineer implementing a new `SECURITY DEFINER` governance function by copying only "column allowlist + function" from the earlier description, without also reading Part 9C's worked examples closely, could plausibly miss that caller-identity verification and correctly-scoped locking are supposed to be mandatory parts of the pattern too, not optional refinements. **Recommended** (not mandatory): tighten ADR-023's Decision section itself to state these as required template elements, not just as narrative of this pass's fixes.

---

## Additional finding (disclosed, explicitly out of this review's scope)

While verifying Check 3's "consistent with RLS context" requirement, a broader observation surfaced: `app.current_user_id`, `app.current_org_id`, `app.caller_org_role`, and `app.is_platform_admin` are custom Postgres session parameters, and nothing in this design restricts _which role_ may `SET`/`SET LOCAL` them — by default, Postgres does not gate custom, extension-undefined GUC parameters by role. `app_role` — the same role that executes the application's own ordinary queries — is not structurally prevented from setting these values itself. This means the caller-identity checks Part 9C adds (Finding 3) and the RLS policies in Part 9 (accepted in earlier reviews) share an inherited, never-previously-examined trust assumption: both rely on nothing but `tenant.middleware.ts` ever setting these variables, with no independent database-level enforcement that it's the only thing that can.

**Why this is not counted against this review's GO:** it is not a regression introduced by this pass — Part 9's RLS design has relied on the identical assumption since it was first accepted, and Part 9C's Finding-3 fix inherits it rather than introduces it. Exploiting it requires an attacker to already have `app_role`-level raw SQL execution (e.g., via a SQL-injection vulnerability elsewhere in `apps/api`, or a compromised service credential) — a materially larger compromise than "a bug in the calling TypeScript" or "a missing `RolesGuard`," which is what Part 9C's fixes were actually built to guard against. It also sits squarely in Part 9's territory (session-variable trust model), which this review's own brief says stays accepted absent a regression.

**Recommended, not mandatory:** a dedicated follow-up pass — scoped to Part 9's session-variable trust model as a whole, not just Part 9C — before this design is treated as fully production-hardened. Options worth evaluating there (not decided here, consistent with "verify only, do not redesign"): restricting `app_role`'s ability to `SET` custom GUCs via a wrapper/extension, or having `tenant.middleware.ts` use a mechanism Postgres does natively restrict by role.

---

## Scores

| Dimension                | Third review | After pass #3 (self-assessed) | This review (verified)                                                                                                                               |
| ------------------------ | ------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture Score       | 83/100       | 93/100                        | **94/100**                                                                                                                                           |
| Security Score           | 58/100       | 90/100                        | **87/100** — four real findings verifiably closed; score reflects the disclosed GUC-trust-boundary observation rather than ignoring it               |
| Identity Security Score  | 55/100       | 91/100                        | **90/100**                                                                                                                                           |
| Database Security Score  | 62/100       | 92/100                        | **88/100** — locking/transaction/search_path/grants all verified correct; function ownership and the GUC observation remain open, non-blocking items |
| **Overall E2 Readiness** | **65/100**   | **91/100**                    | **90/100**                                                                                                                                           |

## Decision

## GO

**"Epic E2 is approved for implementation."**

This approval is scoped exactly as this review's own brief defined it: the `SECURITY DEFINER` function remediation in Part 9C, verified against all four mandatory findings from the third targeted review, with no regressions found in previously-accepted material. It is not a substitute for the real, independent human review IMPLEMENTATION_GUIDE.md §4 requires — that remains outstanding regardless of how many targeted passes this chain has been through. The GUC session-variable trust-boundary observation above is real and disclosed, not swept aside, and is recommended as a follow-up before treating this design as fully production-hardened — but it does not block the narrow scope this review was asked to verify.
