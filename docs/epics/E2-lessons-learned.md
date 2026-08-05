# Epic E2 — Lessons Learned

**Author:** Independent acceptance reviewer (no involvement in E2's design, remediation, or implementation).
**Date:** 2026-08-01
**Companion document:** [E2-final-acceptance-review.md](E2-final-acceptance-review.md) — the acceptance verdict and findings. This document is about _how E2 went_, so E3 goes better.

Every entry below cites a specific, named incident from E2's actual history — a numbered finding from one of the four architecture-gate reviews, a specific migration, a specific file, or something I verified myself during the acceptance review. Nothing here is generic project-retrospective filler; if a point could have been written before E2 started, it isn't in this document.

E2's review history in one line, because most lessons below trace back to it:

> **Design → [gate review #1](E2-architecture-gate-review.md): NO GO** (3 Critical + 4 High) → [remediation](E2-remediation-report.md) → **[review #2](E2-second-independent-review.md): NO GO** (1 primary + 2 integrity findings) → [remediation v2](E2-remediation-report-v2.md) → **[review #3](E2-third-targeted-review.md): NO GO** (1 Critical + 3 High, _all inside the `SECURITY DEFINER` function bodies_) → [remediation v3](E2-remediation-report-v3.md) → **[review #4](E2-fourth-targeted-review.md): GO** → implementation T1–T29 → [security review](E2-security-review.md) (1 self-found P1, closed) → this acceptance review (1 High, 1 High, plus process gaps).

Readiness scored 61 → 78 → 65 → 90 across the four gates. **The dip from 78 to 65 is the single most instructive number in this epic** and several lessons below are about it.

---

## 1. What worked — and why, specifically

### 1.1 Repeated independent review found real defects every single time, including in work already declared complete

This is the headline. It would be easy to read four NO GOs as a failure. It is the opposite: **each pass found defects the previous pass structurally could not have found**, and every one of them was a genuine security defect that would have shipped.

- Review #1 found **Critical-1**: the design had _no mechanism anywhere_ for changing a `User.role` — including no way the first `ADMIN` account could ever come to exist. An entire epic about identity and access had no path to create an administrator. That is not a subtle omission, and it survived the original design pass.
- Review #2 found the **column-level gap**, and explicitly noted _why_ review #1 couldn't have: the finding is only visible when Critical-1's remediation (role governance, Part 9A) is read _together with_ Critical-2's remediation (the RLS matrix) — and Part 9A didn't exist during review #1. Row-level RLS permitted an `ENTERPRISE_ADMIN` to run `UPDATE "User" SET role = 'ADMIN'` directly, bypassing the entire two-person-approval mechanism that had just been designed.
- Review #3 went a level deeper still — into the _function bodies_ — and found that `approve_role_change()` **had no platform-wide last-`ADMIN` check at all**, and that `set_org_role()`'s equivalent check had a cross-row TOCTOU race (it took `FOR UPDATE` on the single row being changed, which protects the row being written, not the multi-row invariant being read).
- Review #4 confirmed the fixes and _still_ surfaced the GUC trust-boundary observation (R-45) as a disclosed additional finding.

**Lesson for E3+:** budget for multiple review passes as the default, not as a sign something went wrong. And note the pattern in what each pass found: **remediation creates new attack surface, and the new surface is where the next review should look first.** Review #2 said this explicitly — _"the new findings are all in the newly-added Part 9A/9B material, which is exactly where a second pass should be most skeptical, since it's the least battle-tested part of the document."_ That heuristic paid off in review #3 too. Make it a standing instruction in the review brief.

### 1.2 Progressively narrowing review scope was the right shape

Review #1 was broad (19 areas). Reviews #3 and #4 were deliberately narrow — #3 scoped to column privileges and function bodies, #4 to seven specific checks. The narrow passes found _more severe_ defects per page than the broad one, because a reviewer asked to check 19 areas cannot read PL/pgSQL line by line, and a reviewer asked to check exactly one function body will.

**Lesson:** after the first broad gate review, subsequent passes should be scoped to the specific mechanism the remediation introduced, with the reviewer explicitly told not to re-review the parts already confirmed sound. E2 did this by accident-then-intent; E3 should do it by design.

### 1.3 Implementation caught real design defects, and said so instead of quietly patching

Three concrete cases, all preserved in migration comments:

- **`20260730111547_fix_rls_read_policy_scope`** — the design's Part 9 SQL was transcribed _verbatim_ into the migration, and the implementer then discovered the `_read` policies had no `FOR SELECT` clause. Postgres applies a clause-less policy to every command and OR's all permissive policies for that command, so each `_read` policy's broader "same org" condition was silently widening `UPDATE`/`DELETE` access. **Confirmed empirically before the fix: a plain org `MEMBER` could `UPDATE` a fellow same-org `User` row**, directly contradicting `user_update`'s explicit `ENTERPRISE_ADMIN` requirement. Four architecture reviews read that SQL and none caught it.
- **`20260731100000_fix_enterprise_admin_trigger_update_return`** — the last-`ENTERPRISE_ADMIN` trigger unconditionally did `RETURN OLD`, correct for `BEFORE DELETE` but catastrophic for `BEFORE UPDATE`: Postgres writes whatever the trigger returns, so `set_org_role()`'s demotion ran, raised no error, and **silently did nothing**. The migration comment names exactly why the earlier test suite missed it: _"its tests only exercised the DELETE path (member removal), never an `orgRole` UPDATE."_
- **`20260730113512` / `20260730114213`** — `AuditLog.id` and `.correlationId` both failed at runtime because Prisma's `@default(uuid())` generates client-side and never becomes a SQL-level `DEFAULT`, so the raw-SQL governance functions violated NOT NULL. The comment is candid: _"a real bug, not present in prior text-only reviews since none executed the functions against a real schema."_

**Lesson:** SQL in a design document is a _proposal_, not a verified artifact. No amount of careful reading substitutes for executing it. See §5.1.

### 1.4 The T27 performance report and T28 security review both went looking for the uncomfortable answer

These two artifacts are the quality bar for future epics and should be cited as templates.

- **T27** could have written "Argon2id is slow by design, exception granted" and stopped. Instead it traced the cost to source (`packages/utils/src/password/hash-password.ts` passes only `{ algorithm: 2 }`, so `@node-rs/argon2`'s defaults apply) and then reported the genuinely awkward finding: **the cost parameters were never chosen by anyone**, and `memoryCost=4096` is _below_ OWASP's current 19456 minimum — meaning the platform is paying real latency without buying full memory-hardness. It then refused to change them, correctly, on the grounds that it is a security-architecture decision needing its own ADR. I diffed the report against `tests/load/results/2026-07-31T18-41-26-541Z.json`: **every number matches exactly**, including both FAIL verdicts.
- **T28** audited rather than restated. It found its own P1 — Part 8 and Part 13 both describe a JWT-`jti` Redis denylist for immediate single-session revocation, and **no code anywhere had ever implemented it**, so `logout` left the access token live for its full 15 minutes. It also extended audit immutability to `app_service_role`, which T7 had missed entirely even though `bootstrap-admin.ts` actively writes `AuditLog` through that role.

**Lesson:** the value of these documents came entirely from their willingness to report against their own author's interest. Make "what did you find that you'd rather not have found?" an explicit required section in future performance and security review artifacts.

### 1.5 Tests were written to fail, not to pass

I checked this specifically because a test suite can be large and prove nothing. E2's does not have that problem:

- `users.e2e-spec.ts:135–157` revokes a session and then **re-uses the same still-cryptographically-valid access token**, asserting 401 — not merely that the DELETE returned 204. A companion test proves a _different_ session for the same user is **not** invalidated, verifying the per-session property rather than just the happy path.
- `tenant-rls.e2e-spec.ts` mounts a test-only probe controller (in `apps/api/test/`, never in `src/`) that issues raw queries with the application-layer filter **absent by construction**, then asserts RLS alone denies — across read, insert, update _and_ delete, for all three tenant tables.
- `role-lifecycle.e2e-spec.ts` runs genuinely concurrent governance calls against real Postgres, **including a control case proving two different organizations do not block each other** — testing the absence of over-serialization, which almost nobody remembers to do.
- The MFA lockout test asserts rejection **with the correct code supplied**, which is the only version of that test that means anything.

**Lesson:** the distinguishing habit here is testing the _negative_ of the property, not just the property. Codify it in CODE_REVIEW_CHECKLIST.md: for any revocation, expiry, or single-use mechanism, the test must re-attempt the operation with the same artifact afterward.

### 1.6 The database was made the actual boundary, and it holds

I verified this myself rather than trusting the suite: connected as `app_role` and attempted eight raw privileged writes (`role`, `organizationId`, `passwordHash`, `tokensValidAfter`, `mfaEnrolled`, `status`, `orgRole`, and `AuditLog` UPDATE/DELETE). **All eight were rejected by Postgres with `permission denied for table ...`** — privilege-level rejections, not application-level ones. `pg_proc` confirms all four governance functions are owned by a dedicated `governance_role` (`NOLOGIN NOSUPERUSER NOBYPASSRLS`), closing an item carried unresolved since review #3.

ADR-023's central claim is not aspirational. It is true, and it is the single most valuable artifact E2 produced.

---

## 2. What failed during the review cycles — root causes, not symptoms

### 2.1 The first design reviewed its parts, not its interactions

Review #1's three Criticals share one root cause: **the design was checked against each canonical doc individually, and never against itself as a whole.** Part 5 defined nine entities; SECURITY.md §3 requires `AuditLog`/`EntitlementChangeLog`; nobody composed the two. The tell is damning and the reviewer caught it — `ConsentRecord`'s own Part 5 note read _"distinct from `AuditLog`, since consent is a compliance record, not an admin-action record"_, **referencing an entity that appeared nowhere in the design**. The document cited a thing it had not defined.

Similarly, Critical-1 (no role-change mechanism) is invisible if you review "the RBAC section" and "the entity model" separately, and obvious the moment you ask "walk me through creating the first `ADMIN` in a fresh environment."

**Process improvement for E3+:** add a mandatory **end-to-end narrative walkthrough** to the design phase, before the Architecture Gate. Not a diagram — prose, tracing 3–5 complete lifecycles from empty database to steady state ("first admin exists", "an enterprise customer is onboarded and their last admin leaves", "a user exercises erasure"). Critical-1 and Critical-3 both die instantly under that exercise. It costs an hour.

### 2.2 Remediation of a Critical created the next Critical, twice in a row

The 78 → 65 score dip is the lesson.

- Remediation #1 added Part 9A (role governance) — **application-layer only**. Review #2's primary finding: the entire two-person-approval mechanism had no database backstop, _"exactly the single-layer-of-defense pattern the original Critical-2 finding existed to eliminate for tenant isolation, now reappearing, unaddressed, for role governance specifically."_ The team had just been told single-layer defense was unacceptable for tenancy, and immediately built a single-layer defense for role governance.
- Remediation #2 added the `SECURITY DEFINER` functions — and review #3 found the _bodies_ didn't deliver what the surrounding ADR promised: no platform-wide last-`ADMIN` check existed at all, and the org-level one had a TOCTOU race.

**Root cause:** each remediation was scoped to "close the stated finding" rather than "apply the principle behind the finding." Critical-2's principle was _defense in depth for privileged state_; it was applied to tenancy and not generalized.

**Process improvement:** every remediation report should carry a required section — **"What is the general principle behind this finding, and where else in this design does it apply?"** Remediation-v2 would then have had to answer "row-level ≠ column-level protection" and would likely have caught the function-body gaps itself.

### 2.3 "Recommended, not mandatory" findings evaporated entirely

This is a concrete process failure I verified, not a hypothetical.

Review #2 raised two non-mandatory recommendations: **PKCE applicability** for E21's eventual mobile OAuth flow, and a **single-user MFA-reset path** (one admin loses their authenticator while other admins remain functional — the common case, versus Part 9A's full emergency recovery, which covers only "every admin inaccessible"). Review #3 added three more: function ownership, documenting `app_role`'s baseline `GRANT` history, and stating whether self-service email change is intentionally removed.

[E2-remediation-report-v2.md](E2-remediation-report-v2.md) line 59 says these _"remain open, tracked in Part 19's 'Missing information' list."_ **They were never added to Part 19.** I checked: Part 19 lists six items, and neither PKCE nor MFA recovery is among them. They are also absent from RISK_REGISTER.md's R-33–R-45. Function ownership _was_ eventually closed (T5), but by a different route.

The result, verified against the shipped code: **no PKCE anywhere; no single-user MFA reset path anywhere** (the only place `mfaEnrolled` is set false is GDPR erasure); **and `User.email` is not in `app_role`'s UPDATE allowlist, so there is no email-change path at all** — the third review asked whether that removal was intentional and never got an answer. An `ADMIN` who loses their phone today has exactly one remedy: re-run the infrastructure-tier bootstrap CLI, which the design itself classifies as _"a security incident by definition."_

**Process improvement:** a non-mandatory finding must be discharged by a _tracked artifact_ — a RISK_REGISTER row with an ID and an owner — before the review that raised it can be marked resolved. "Noted in a prose list" is not tracking, and in this case the prose list didn't even get updated. Make the remediation report's finding table have a "tracked as" column that must contain a risk ID or an ADR number.

### 2.4 The design's own SQL was never corrected after implementation proved it wrong

`20260730111547`'s comment says plainly: _"The design doc (Part 9) has the same omission in its own SQL and needs the identical correction — flagged separately, not silently fixed only here."_ It was never made. Part 9's `CREATE POLICY` statements still lack `FOR SELECT`. The next engineer who copies that pattern for a new tenant-scoped table in E4 will reintroduce the exact privilege-widening bug.

**Process improvement:** when implementation corrects a defect in an approved design, correcting the design document is part of the same task's Definition of Done, not a follow-up. A design doc that is known-wrong and left wrong is worse than no design doc.

---

## 3. Architecture mistakes caught before production

Recording these plainly, because their value is in being nameable:

| Mistake                                                                                   | Caught by                             | Would have shipped as                                              |
| ----------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| No way to create the first `ADMIN`; no role-change path at all                            | Review #1, Critical-1                 | An identity platform with no administrators                        |
| `User` table entirely absent from the RLS matrix                                          | Review #1, Critical-2                 | Cross-tenant user data leak (R-06 realized)                        |
| No `AuditLog`/`EntitlementChangeLog` despite SECURITY.md §3                               | Review #1, Critical-3                 | Direct, citable compliance non-compliance                          |
| No OAuth `state` CSRF protection                                                          | Review #1, High-2                     | Authorization-code injection                                       |
| OAuth linking by email match                                                              | Review #1, High-3                     | Pre-registration account takeover                                  |
| No MFA verify rate limiting                                                               | Review #1, High-4                     | Unlimited guessing against a 6-digit code                          |
| Row-level RLS doesn't restrict _columns_ — `UPDATE "User" SET role='ADMIN'` was permitted | Review #2                             | Privilege escalation bypassing two-person approval entirely        |
| `approve_role_change()` had **no** last-platform-`ADMIN` check                            | Review #3, Critical                   | Total platform lockout with no recovery except the break-glass CLI |
| `set_org_role()` cross-row TOCTOU race                                                    | Review #3, High                       | Two concurrent demotions both succeeding → orphaned organization   |
| Functions trusted caller-supplied identity and `RolesGuard` alone                         | Review #3, High ×2                    | Governance enforceable only as long as no app-layer bug exists     |
| `_read` RLS policies lacked `FOR SELECT`, widening write access                           | **Implementation** (`20260730111547`) | A plain org `MEMBER` able to `UPDATE` a fellow member's `User` row |
| `BEFORE UPDATE` trigger returning `OLD`, silently discarding demotions                    | **Implementation** (`20260731100000`) | `set_org_role()` reporting success while changing nothing          |
| `jti` denylist documented in detail, never built                                          | **T28 security review**               | `logout` not actually logging anyone out for 15 minutes            |
| `app_service_role` could still `UPDATE`/`DELETE` audit rows                               | **T25**                               | Audit trail tamperable by the role that writes it                  |

Two of these — the last-`ADMIN` check and the `jti` denylist — were **documented in detail as existing** before anyone checked whether they did. That is the most repeatable failure mode in this epic (see §6.1).

---

## 4. Security patterns worth standardizing across future epics

1. **Column-privilege allowlisting + `SECURITY DEFINER` governance functions (ADR-023).** Verified working at the `psql` level. Any future epic introducing a field whose direct write would bypass a business rule must run Part 9C's survey and use this pattern. **E4 will introduce many such fields** (billing entitlements, subscription state) and should adopt it from day one rather than retrofitting after a review finds the gap, as E2 did.
2. **A dedicated, `NOLOGIN NOSUPERUSER NOBYPASSRLS` owner role for every `SECURITY DEFINER` function.** Never the migration role. E2 took three review passes to land this; E3 should treat it as the only acceptable default.
3. **Advisory locks keyed per-invariant, acquired before the reads the decision depends on.** `pg_advisory_xact_lock(43, 0)` for the platform-wide floor; `pg_advisory_xact_lock(44, hashtext(org))` for per-org. The key insight from review #3 is worth stating as a rule: **lock the invariant, not the row.** A `FOR UPDATE` on the row being written does not protect a count across rows.
4. **Atomic-claim conditional updates for every single-use artifact.** `UPDATE ... WHERE status='PENDING'`, `updateMany({ where: { revokedAt: null } })`, `updateMany({ where: { usedAt: null } })`. E2 applies this uniformly to refresh tokens, password-reset tokens, MFA challenge tokens, OAuth state, and role-change approval. Read-then-write is never acceptable for these.
5. **Never trust the application layer for a privileged decision, even when the application layer is correct.** The governance functions re-derive caller identity from `current_setting('app.current_user_id')` and re-read the actor's role from the database. This is what made `PATCH .../members/:userId/role` the _only_ org endpoint not exposed by the acceptance review's F1 finding — every claim-based check fell through, and the in-database check held. That is the pattern working exactly as intended, and it is the strongest argument for generalizing it.
6. **Hash every token at rest, uniformly.** `RefreshToken`, `PasswordResetToken`, `OAuthState`, `MfaChallengeToken` all follow one shape. New token types should not invent a second.
7. **Decide fail-open vs. fail-closed per mechanism, and write down why.** E2 does this well: the rate limiter fails **closed** (`rate-limiter.ts` deliberately does not catch Redis errors); the `jti` denylist fails **open** (`jti-denylist.service.ts`), with an explicit blast-radius argument for the inconsistency. Both are documented in API_GUIDELINES.md §12. Copy the _practice of justifying the direction_, not just the directions.

---

## 5. Database patterns worth standardizing

### 5.1 Execute the design's SQL before approving it

The strongest single lesson in this epic. Four architecture reviews read the Part 9/9C SQL closely and approved it. Then implementation ran it and found: missing `FOR SELECT` (a real privilege widening), a missing `id` default, a NOT NULL `correlationId` with no source, a missing text→enum cast, and a trigger returning the wrong tuple. **Five defects, zero of them findable by reading.**

**Process improvement:** the Architecture Gate for any epic containing DDL/PL-pgSQL must include a throwaway execution against a scratch Postgres — apply the policies, call the functions, assert one success and one rejection per branch. This is perhaps two hours of work and would have collapsed three of E2's remediation migrations into the original.

### 5.2 Migration ordering as an explicit safety requirement

E2-implementation-plan.md §4 spells out: tables → RLS → functions + grants → _then_ `REVOKE` direct column access, with the stated rule that there must never be a window where a privileged column has **neither** a working write path **nor** protection. Implementation followed it exactly. Reuse this ordering verbatim for any future privilege-narrowing migration.

### 5.3 Grants only cover tables that exist at grant time

Bitten twice: `20260731140000` (`app_service_role` had zero privileges on `MfaChallengeToken` because that table postdated the blanket `GRANT ... ON ALL TABLES`) and `20260731120000` (`updatedAt` missing from the column allowlist, so Prisma's `@updatedAt` — which unconditionally includes the column in _every_ generated `UPDATE` — made `PATCH /v1/users/me` fail with `permission denied` for a request touching only allowlisted columns).

**Two standing rules:** (a) `GRANT ... ON ALL TABLES` is a point-in-time snapshot — either use `ALTER DEFAULT PRIVILEGES` or grant explicitly per new table; (b) **a Prisma column allowlist must include `updatedAt`** on any model with `@updatedAt`.

### 5.4 Write the immutability test against _every_ role, not the obvious one

T7 revoked `UPDATE`/`DELETE` on the audit tables from `app_role` and stopped. `app_service_role` — which _actively writes audit rows_ from `bootstrap-admin.ts` — retained full `UPDATE`/`DELETE` for the entire epic until T25 caught it (`20260731150000`). The threat model said "a compromised credential cannot alter an audit record"; the implementation protected one of the two credentials that could.

**Rule:** enumerate every role with access to a protected table and assert the negative for each, not just for the primary one.

### 5.5 Apply RLS consistently, or document the exception

`AuditLog` has `ENABLE ROW LEVEL SECURITY` but not `FORCE`, unlike the three tenant tables. No practical consequence today, but the inconsistency is undocumented. Separately, `app_role` retains table-level `DELETE` on `"User"` (neutralized only by `user_delete USING (false)` — by RLS, not by privilege) and on `"RoleChangeRequest"` (neutralized by nothing — that table has no RLS), meaning a pending two-person approval request can be _deleted_ by the app role even though it cannot be _updated_. **Rule: when narrowing privileges, narrow the whole verb set, and state explicitly which protection is doing the work for each.**

---

## 6. Documentation problems encountered

### 6.1 Documentation described capabilities that did not exist — repeatedly, in both directions

This is E2's most persistent failure mode, and it appeared at every layer:

- Part 8 and Part 13 described the **`jti` revocation denylist** in detail. It had never been built (found by T28).
- **MULTITENANCY.md §6** states _"CI treats a tenant-scoped table without an accompanying RLS policy as a failing check (enforced via a schema-lint script introduced in Epic E1/E22)."_ E2's own Part 5 repeats it: _"CI already rejects one without the other."_ **I verified: no such script exists** in `scripts/`, and no workflow references RLS. E2's design _relied_ on a control that is fictional.
- **SECURITY.md §7/§7.1** claims GDPR/CCPA _"erasure/export tooling"_. Only erasure exists. T28 found this and tracked it as R-44 rather than silently rewording it — the right call — but a canonical compliance doc is currently overstating built capability.
- **DATABASE.md §2.1**, rewritten by T29, explicitly claims to reflect _"the schema as built"_ — and omits `OAuthState` and `MfaVerificationAttempt`, two real migrated tables, while still describing `ConsentRecord` as covering _"parental-consent"_, which contradicts both the built enum and ADR-013.

**Process improvement:** any documentation claim of the form "X is enforced / X is built / CI checks X" must carry a pointer to the enforcing artifact (file path, workflow step, test name). A claim with no pointer is a hypothesis. This one rule would have caught all four.

### 6.2 The epic's own status contradicts the canonical docs

`E2-identity-access-platform.md` still opens with _"Status: **Design phase — Remediated three times** … pending a fourth/final targeted review"_ (last updated 2026-07-30), and its EPIC_TEMPLATE.md §5 gate log is **eleven rows of "☐ Not started"** with every owner `[TBD]` and Epic Approval reading _"☐ No — design phase only."_ ROADMAP.md and CHANGELOG.md meanwhile declare E2 implementation-complete.

**Process improvement:** the gate sign-off log should be updated as each gate is passed, during the epic, not as a closure-day formality — otherwise it stops being a control and becomes paperwork. Make "gate log current" a precondition for starting the _next_ task, not the next epic.

### 6.3 Excellent in-code documentation, but it goes stale

E2's code comments are unusually valuable — they record empirical findings ("confirmed empirically that…"), explain rejected alternatives, and flag known gaps honestly. That is a genuine asset and should be preserved as a norm.

But because they are load-bearing, staleness costs more here than in an ordinary codebase: `mfa.guard.ts:16` still says _"no route in this codebase is gated that way yet"_ when it now gates three controllers; `jwt.strategy.ts:32` says _"No route in this Epic uses it yet."_ Both are T13-era comments later tasks never refreshed.

**Rule:** if a comment describes the _current_ wiring of the system rather than a decision, the task that changes the wiring updates the comment.

### 6.4 Deviations were flagged in code but never surfaced to the docs

The implementation deviated from Part 6's API table in several defensible ways — `POST /v1/users/me/oauth-accounts` shipped as `GET .../link/:provider`; Apple's callback is `POST` (correct, Apple uses `form_post`); CSV bulk import ships as a JSON array; registration writes `status: 'ACTIVE'` because no email-verification flow exists. **Every one is explained in a code comment. None reached a document.** Part 6 remains the nominal API spec, and it is now wrong in four places.

**Rule:** a code comment is the right place to explain _why_ a deviation was made; it is never sufficient as the _record_ that one exists.

---

## 7. Testing gaps

### 7.1 The most important gap: a superb security suite that no CI job runs

`apps/api` has 13 e2e suites / 182 tests containing every mandatory Part 16 security class — cross-tenant RLS negatives (T23), governance concurrency/authorization (T24), audit immutability (T25), MFA/OAuth security (T26), rate limiting (T21), privileged-column protection (T6). `test:e2e:api` exists in `apps/api/package.json`, in `turbo.json`, and in the root `package.json`.

**No workflow invokes it.** `ci.yml` runs `pnpm test`, which resolves to `jest --coverage` with `rootDir: 'src'` and `testRegex: '.*\.spec\.ts$'` — unit tests only — and `ci.yml` declares no Postgres or Redis service, so it could not run them regardless. `e2e.yml` runs only the Playwright package.

This directly contradicts the approved plan. E2-implementation-plan.md §11 step 2: _"**CI**: … E2-T23's cross-tenant test suite **is the actual proof, not a manual check**."_ It is currently exactly a manual check, and R-06 — a Critical risk — is marked verified on its strength.

**Lesson, and it generalizes past E2:** _writing_ the test is roughly 80% of the effort and 0% of the durable value. A security test that isn't in a gate is a one-time observation, not a control. **For E3+, "wired into CI and observed to fail when the control is removed" should be part of the test task's acceptance criteria, not an afterthought.**

### 7.2 Test suites inherit the blind spots of the code they test

`20260731100000`'s comment names this precisely: the last-`ENTERPRISE_ADMIN` trigger's `UPDATE` branch _"was only added for Part 9's 'DELETE/UPDATE' defense-in-depth wording and never actually tested until now"_ — so a bug that made every demotion silently no-op survived T15's own suite.

The same pattern recurs in the acceptance review's findings. `audit.e2e-spec.ts` has a block titled _"Every required action produces exactly one AuditLog row (Part 9B)"_ — and it omits password-reset completion, which Part 9B's list includes and the code doesn't emit. **The test mirrored the implementation's gap instead of catching it**, because it was written from the code rather than from Part 9B's list.

**Rule:** a test claiming to cover a specification's enumerated list must be written _from that list_, item by item, with each item named in a test case — not from the implementation.

### 7.3 Tests asserted the state change but not its security consequence

`organizations.e2e-spec.ts:325` ("removes a non-last member, clearing their `User.organizationId`") asserts the membership row is gone and the column is null — and stops. It never asks whether the removed member's live access token still works. That is exactly the gap the acceptance review's F1 finding occupies: removal doesn't bump `tokensValidAfter`, so a removed `ENTERPRISE_ADMIN` retains org access for up to 15 minutes.

**Rule:** for any operation that revokes access, the test must attempt the revoked access afterward. E2 already does this brilliantly for session revocation (§1.5) — the discipline just wasn't generalized from sessions to memberships.

### 7.4 Whole test classes were never created

- **No accessibility testing at all** — no `axe`, no a11y assertions, no `UI_UX_REVIEW_TEMPLATE.md` instance for E2. The DoD line _"Accessibility validated — WCAG 2.1 AA … tested not assumed"_ is unmet and untracked.
- **No E2 instance** of `FEATURE_SPEC_TEMPLATE.md`, `API_SPEC_TEMPLATE.md`, `DATABASE_CHANGE_TEMPLATE.md`, or `TEST_PLAN_TEMPLATE.md`, though IMPLEMENTATION_GUIDE.md's lifecycle calls for them. The design doc was thorough enough that little information is actually missing — which is itself the lesson: **if the templates are genuinely redundant for an epic like this, say so and narrow the requirement; don't leave a checklist everyone quietly skips.**

---

## 8. Process improvements for E3+

Ordered by expected value.

1. **Wire security tests into CI as part of writing them.** (§7.1) The single highest-leverage change. An unrun test is documentation.
2. **Execute the design's SQL before the Architecture Gate approves it.** (§5.1) Two hours of scratch-database work would have prevented three of E2's remediation migrations.
3. **Add an end-to-end narrative walkthrough to the design phase.** (§2.1) Trace 3–5 complete lifecycles from empty database to steady state. Critical-1 and Critical-3 both die under this immediately.
4. **Require remediation reports to answer "where else does this principle apply?"** (§2.2) This is the fix for the 78 → 65 dip — the review cycle's most expensive event.
5. **Discharge every non-mandatory finding into a tracked artifact with an ID and an owner.** (§2.3) PKCE, single-user MFA recovery, and self-service email change all evaporated despite a remediation report claiming they were tracked.
6. **Require an enforcing-artifact pointer for every "X is enforced/built/checked" documentation claim.** (§6.1) Would have caught the fictional schema-lint check, the unbuilt `jti` denylist, the overstated export tooling, and the incomplete entity list.
7. **Correct the design document in the same task that finds it wrong.** (§2.4) Part 9's SQL is still defective and will be copied by E4.
8. **Update the gate sign-off log as each gate passes, not at closure.** (§6.2)
9. **Scope review passes 2+ narrowly to the mechanism the previous remediation introduced,** with an explicit instruction not to re-review confirmed-sound areas. (§1.2)
10. **Plan observability into the epic, not after it.** E2 has correlation IDs threaded properly into `AuditLog` and the governance functions — genuinely good work — but **zero E2-specific metrics, zero security-event logs, and zero alerts.** A `grep` for `logger` across `apps/api/src/modules/**` returns nothing. `caller_identity_mismatch` and `cannot_demote_last_platform_admin` are the highest-signal "someone is attacking the governance layer" events the system can produce, and nothing counts them; emergency admin recovery — which the design itself calls _"a security incident by definition"_ — pages nobody. The DoD line requiring this was written and then not done. **For E3, treat "which new events must be observable, and how?" as a design-phase question with a section in the technical design, not a closure-phase checkbox.**
11. **Keep the no-self-certification rule, and finish it.** It found real Critical defects five times. But E2 currently sits with **both** its Architecture Gate and Security Gate explicitly unsigned by their own artifacts' admission, while ROADMAP.md calls the epic complete. The rule only works if the sign-off actually happens.
12. **Reuse E2's honesty norms explicitly.** The T27 and T28 artifacts are the standard: report against your own interest, cite raw data that can be diffed against your claims, and refuse to make security decisions outside your remit. Name them as templates in IMPLEMENTATION_GUIDE.md.

---

## 9. The one-sentence version

E2's four-review chain worked — it caught nine defects that would have shipped as real vulnerabilities, and the resulting database-enforced privilege model is genuinely sound, which I confirmed by attacking it directly; **what E2 got wrong was almost entirely about the gap between "built and verified once" and "protected against regression forever"** — an unrun security suite, an unenforced schema-lint check, uninstrumented security events, evaporated non-mandatory findings, and documentation asserting controls that were never built.
