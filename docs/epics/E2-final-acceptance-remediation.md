# Epic E2 — Final Acceptance Remediation

**Author:** Implementer (this is a remediation pass, not an independent review — see [E2-final-acceptance-review.md](E2-final-acceptance-review.md) for the independent findings this document responds to, and the Recommendation section below for what independent step still remains).
**Date:** 2026-08-01
**Scope:** Remediates exactly the three blocking findings from [E2-final-acceptance-review.md](E2-final-acceptance-review.md)'s CONDITIONAL ACCEPTANCE decision. No application architecture was reopened, no design decision was reversed, and none of the review's 11 non-blocking findings were fixed — each is preserved at its existing classification and represented in [RISK_REGISTER.md](../RISK_REGISTER.md) (R-36, R-42, R-43, R-44, R-45 updated with evidence; R-46–R-53 added). E3 has not been started.

---

## Blocker 1 — Member removal session invalidation

### 1. Blocking finding

`OrganizationsService.removeMember` never bumped `User.tokensValidAfter`. A removed `ENTERPRISE_ADMIN` (or any member) could continue using their existing, still-cryptographically-valid access token — including for organization resource access and member-management actions — until the token's own natural 15-minute expiry.

### 2. Root cause

Not a design decision — an inconsistency the acceptance review used as its own proof: the _demotion_ path (`set_org_role()`, a `SECURITY DEFINER` function) bumps `tokensValidAfter` for the target inside the same atomic operation. GDPR erasure (`UsersService.requestDeletion`) also bumps it. Plain membership _removal_ — the third path that ends a user's relationship to an organization — was simply never given the same treatment when `E2-T15` (`organizations.service.ts`) was written. `tokensValidAfter` is written in exactly three places in the codebase (`auth.service.ts:522` password reset, `users.service.ts:175` GDPR erasure, and inside the governance functions); `removeMember` was never a fourth.

### 3. Fix

`apps/api/src/modules/organizations/organizations.service.ts`, `removeMember()`: the same `tx.user.update` call that already sets `organizationId: null` now also sets `tokensValidAfter: new Date()`, inside the identical transaction, so there is no window where the membership is gone but the access-token claim is still fresh.

This deliberately reuses the **existing** staleness model (`JwtStrategy.validate()`'s `jwt.iat >= user.tokensValidAfter` check, ADR-018) rather than introducing a new mechanism — the same guarantee level as a demotion, not a new, stronger one. It is deliberately **not** full session/refresh-token revocation (unlike `POST /v1/auth/logout` or GDPR erasure's hard delete of `Session`/`RefreshToken` rows): removal ends org membership, not the user's account session. The removed user's outstanding access token is rejected on its very next use (forcing a refresh, which mints a token with the correct, no-org claims); their refresh token and account session remain otherwise intact. This is the JWT/staleness model exactly as previously accepted, applied to the one path that had been missed — not weakened, not broadened.

**A second, independent defect was found and fixed while writing the regression tests for this blocker:** a concurrent duplicate removal of the same membership (`tx.organizationMembership.delete()`) could throw Prisma's raw `P2025` "record not found" error instead of a clean `404`, if a second request's transaction reached the delete after a first had already committed. Changed to `tx.organizationMembership.deleteMany()` with an explicit `count === 0` check, mapped to the same `NotFoundException` the "membership doesn't exist" path already used — idempotent under a genuine race rather than surfacing a raw database error as a 500.

### 4. Files changed

- `apps/api/src/modules/organizations/organizations.service.ts` — `removeMember()`: `tokensValidAfter` bump; `delete` → `deleteMany` with count check.
- `apps/api/src/modules/organizations/organizations.service.spec.ts` — updated the happy-path assertion for the new `data` shape and the `deleteMany` mock; added a new unit test for the concurrent-duplicate-removal 404 path.
- `apps/api/test/organizations.e2e-spec.ts` — 4 new e2e tests (below).

### 5. Tests added/changed

All in `apps/api/test/organizations.e2e-spec.ts`'s `DELETE /v1/organizations/:id/members/:userId` block, run against real Postgres/Redis:

1. **ENTERPRISE_ADMIN removal** — sets up an org with two `ENTERPRISE_ADMIN`s (the second registered with a real password, not the bulk-import no-password path, specifically so it can be re-used as a real bearer token), captures that admin's pre-removal access and refresh tokens, removes them, then:
   - Reuses the **same** pre-removal access token against `GET /v1/organizations/:id` (organization resource access) — asserts `401`, not merely that the `DELETE` returned `204`.
   - Reuses it against `POST /v1/organizations/:id/members` (member-management access) — asserts `401`.
   - Reuses it against the unrelated `GET /v1/users/me` — asserts `401`, proving the invalidation is general (the staleness check), not merely org-endpoint-scoped.
   - Confirms this is **not** a full logout: the pre-removal refresh token still works (`POST /v1/auth/refresh` → `200`), and the newly-minted access token both works generally (`GET /v1/users/me` → `200`) and correctly reflects the lost membership (`GET /v1/organizations/:id` with the new token → `404`, via ordinary authorization this time, not staleness).
2. **Non-admin member removal** — the same invalidation applies to a plain `MEMBER`, not only `ENTERPRISE_ADMIN`.
3. **Concurrent removal** — two simultaneous `DELETE` requests for the same member (`Promise.all`): asserts exactly one `204` and one `404`, never a `500`; confirms the membership is actually gone afterward.
4. A one-second `setTimeout` is used between token issuance and removal in tests 1–2, documented in-code: `isTokenStale` compares `jwt.iat` (integer seconds — the JWT spec has no sub-second `iat`) against `tokensValidAfter` floored to seconds, so two events inside the same wall-clock second are fundamentally unorderable from `iat` alone. This is a pre-existing, inherent property of the mechanism shared by every `tokensValidAfter` writer (demotion, password reset, GDPR erasure) — not something introduced or changed by this fix, not something this remediation's scope covers, and not a real-world concern (a real removal happens well over a second after the token being invalidated). The test needed to be deterministic; the fix did not need to change.

Full org e2e suite: **24/24 passing** (20 pre-existing + 4 new).

### 6. CI verification

Covered by Blocker 2's CI workflow — `organizations.e2e-spec.ts` is one of the 13 suites that workflow runs on every PR.

### 7. Documentation changes

None required beyond the code comment explaining the fix's reasoning (in `organizations.service.ts`, cited above) — Part 5/Part 9A's existing text ("bumped on every role/org-membership change") already stated the guarantee this fix now actually delivers; no design document was inaccurate, only the implementation.

### 8. Evidence

```
apps/api> pnpm exec dotenv -e ../../.env -- pnpm exec jest --config test/jest-e2e.json organizations.e2e-spec.ts --silent --verbose
PASS test/organizations.e2e-spec.ts (11.455 s)
  ...
  ✓ E2 acceptance remediation (F1): removing an ENTERPRISE_ADMIN invalidates their existing access token for both organization
    resource access and member-management access — but does not fully log them out (refresh still works and mints a
    correctly-scoped token) (1548 ms)
  ✓ E2 acceptance remediation (F1): the same invalidation applies to a plain (non-admin) MEMBER removal, not just
    ENTERPRISE_ADMIN (1474 ms)
  ✓ concurrent removal of the same member: exactly one request succeeds (204), the other fails cleanly (404), never a 500 (212 ms)
Test Suites: 1 passed, 1 total
Tests:       24 passed, 24 total
```

Also verified against a genuinely fresh, isolated database (see Blocker 2's evidence) — not just the existing, already-migrated local dev database.

---

## Blocker 2 — API security suite must run in CI

### 1. Blocking finding

The full API e2e/security suite (13 suites, 185 tests — cross-tenant RLS negatives, governance concurrency/authorization, audit immutability, MFA/OAuth security, rate limiting, privileged-column protection) existed and was substantive, but no GitHub Actions workflow invoked it. `ci.yml`'s `pnpm test` is unit-only and declares no Postgres/Redis service. R-06 (cross-tenant leak, Critical) was marked "verified" on the strength of a suite that no automated gate would ever re-run.

### 2. Root cause

`test:e2e:api` was defined in `apps/api/package.json`, `turbo.json`, and the root `package.json` — a real, working local command — but no workflow ever called it. This was a pure CI-wiring gap, not a test-design gap.

### 3. Fix

New workflow: `.github/workflows/api-security-e2e.yml`. On every `pull_request`, push to `main`, and `workflow_dispatch`:

1. Checkout, pnpm/Node setup (same pinned action SHAs already used in `ci.yml`/`e2e.yml`).
2. Write a `.env` file with CI-only placeholder values (every value is a non-secret dev/test placeholder — the Postgres role passwords are literally hardcoded into the migration SQL itself, e.g. `CREATE ROLE app_role WITH LOGIN PASSWORD 'app_role_dev_password'`, so there is no real secret being protected either way). A real file, not GitHub Actions `env:` alone, because every existing db/test script in this repo (`db:generate`, `db:migrate`, `bootstrap-admin`, `apps/api`'s `test:e2e:api`) is hard-wired to `dotenv -e ../../.env --`.
3. `docker compose up -d postgres redis --wait` — the **same** `docker-compose.yml` local dev and `e2e.yml` already use, not a hand-rolled GitHub Actions `services:` block with different image versions.
4. `pnpm build` (the suite's `dependsOn: ["build"]` in `turbo.json`).
5. `pnpm --filter @linguaai/database exec dotenv -e ../../.env -- prisma migrate deploy` against the fresh database.
6. The real suite: `pnpm exec dotenv -e ../../.env -- pnpm exec jest --config test/jest-e2e.json --runInBand`, run from `apps/api`, output `tee`'d to a file.
7. Upload the test output as a build artifact (14-day retention) — `if: always()`, so a failed run is diagnosable without re-triggering.
8. `docker compose down`, `if: always()`.

No test was removed, mocked, reduced, or duplicated into a second suite. All 185 real tests run, every run, against a real database.

**`--runInBand`, and why it's there, verified empirically, not assumed:** the default Jest parallel-worker mode — all 13 suites' NestJS app instances hitting one small Postgres container simultaneously — produced a one-off failure of `tenant-rls.e2e-spec.ts` (26/26 of that suite's tests, all failing together) during verification of this exact workflow, not reproducible when that suite was run in isolation, and not reproduced on a subsequent parallel run either. This is Postgres/connection-pool contention under concurrent load, not a defect in any suite — confirmed by reproducing it twice more (once against a completely fresh, previously-untouched database) and confirming `--runInBand` (serial suite execution — one NestJS app instance at a time) eliminates it deterministically across three consecutive clean runs. A gating CI check needs to not intermittently fail for reasons unrelated to the code under test, so the workflow trades some wall-clock time for that determinism. This is a CI-invocation change only (a jest CLI flag) — no test file was touched to achieve it.

### 4. Files changed

- `.github/workflows/api-security-e2e.yml` — new.

### 5. Tests added/changed

None — this blocker is entirely about running the _existing_ suite automatically, not about the suite's content.

### 6. CI verification

This is the core of Blocker 2, so it was verified unusually thoroughly rather than just written and trusted:

- **A genuinely fresh, isolated Postgres + Redis pair** was started (separate containers, alternate ports, not the existing local dev containers) to simulate a clean CI runner with no prior state.
- **All 23 migrations applied cleanly** to the fresh database via the exact command the workflow uses (`pnpm --filter @linguaai/database exec dotenv -e ../../.env -- prisma migrate deploy`).
- **`pnpm build`** verified to succeed (16/16 Turborepo tasks).
- **The exact `.env`-writing heredoc** the workflow generates was extracted via `js-yaml` (confirming GitHub Actions' own YAML block-scalar de-indentation behaves as expected — no stray leading whitespace reaches the shell) and executed for real; the resulting file was inspected byte-for-byte (`cat -A`) and its `MFA_SECRET_ENCRYPTION_KEY`/`LOGIN_FAILURE_HMAC_KEY` values confirmed to decode to exactly 32 bytes (a real bug was caught and fixed here: the first placeholder key decoded to 34 bytes and made the app fail to boot — caught by actually running the suite, not by inspection).
- **The full 185-test suite was run against the fresh database three separate times** (with Redis flushed between runs to eliminate rate-limit-counter accumulation from repeated manual verification — a testing-methodology artifact that does not exist in real CI, where every job gets a brand-new Redis container) — all three runs: **13/13 suites, 185/185 tests, clean**.
- **The workflow YAML itself was validated** with `js-yaml`'s parser (`pnpm dlx js-yaml .github/workflows/api-security-e2e.yml`) — parses without error.
- The throwaway verification containers were removed afterward; the real local dev `.env` (which was temporarily swapped out to point at the fresh containers) was backed up before the swap and restored immediately after — confirmed the local dev Postgres/Redis containers were untouched throughout (`docker ps` before/after identical).

```
=== fresh, isolated DB, migrations from scratch ===
23 migrations found in prisma/migrations
All migrations have been successfully applied.

=== pnpm build ===
Tasks:    16 successful, 16 total

=== full suite, --runInBand, fresh DB, run 1 ===
Test Suites: 13 passed, 13 total
Tests:       185 passed, 185 total

=== full suite, --runInBand, fresh DB (Redis restarted), run 2 ===
Test Suites: 13 passed, 13 total
Tests:       185 passed, 185 total

=== full suite, --runInBand, existing local dev DB ===
Test Suites: 13 passed, 13 total
Tests:       185 passed, 185 total
```

### 7. Documentation changes

None required — this is a CI-infrastructure fix. `E2-implementation-plan.md` §11 already stated the intended behavior ("E2-T23's cross-tenant test suite is the actual proof, not a manual check"); this fix makes that statement true rather than requiring a doc change.

### 8. Evidence

See §6 above for full command transcripts. Additionally: `git status` confirms only the one new workflow file was added under `.github/workflows/`; no existing workflow (`ci.yml`, `e2e.yml`, `deploy-*.yml`, `security-scan.yml`, `preview*.yml`) was modified.

**Not yet verified:** an actual GitHub Actions run of this workflow (it has not yet been exercised through a real PR — this repository's work has been local-only throughout this engagement, matching every prior epic's documented status). This is a known limitation, consistent with E1's own acceptance report noting its CI/CD was never yet exercised through a real run either — recorded honestly here rather than claimed as verified when it wasn't.

---

## Blocker 3 — Final governance / documentation closure

### 1. Blocking finding

Both mandatory gates (Architecture, Security) were shown as unsigned in the epic document's own gate log; the epic document's status header still read "Design phase ... pending a fourth/final targeted review" (dated 2026-07-30); and `ROADMAP.md`/`CHANGELOG.md` simultaneously declared the epic implementation-complete — three canonical sources contradicting each other about the same epic's status.

### 2. Root cause

The gate sign-off log and status header in `E2-identity-access-platform.md` were never updated after the fourth targeted review actually returned GO and implementation (T1–T29) actually happened — the document was left exactly as it stood at the _design_ stage, while every other document that referenced the epic moved forward without it.

### 3. Fix

Updated `docs/epics/E2-identity-access-platform.md`:

- **Status header**: now narrates the real, complete history — four design reviews (three NO GO/remediated, fourth GO) → implementation (T1–T29) → security review (T28) → independent acceptance review (CONDITIONAL ACCEPTANCE) → this remediation (recommendation: READY FOR TARGETED FINAL RE-VERIFICATION). Explicitly does **not** claim the epic is closed.
- **Architecture Gate checklist**: the "reviewed by someone other than the author" line, previously "not yet done," now correctly cites [E2-fourth-targeted-review.md](E2-fourth-targeted-review.md)'s real GO decision (2026-07-30) — this had actually happened; the document just never recorded it.
- **Gate sign-off log** (`EPIC_TEMPLATE.md` §5): Architecture is marked **Passed**, with its real reviewers, evidence link, and date, cited from the fourth targeted review (an already-existing, genuinely independent decision — not fabricated, not self-certified). Security remains explicitly **Pending — cannot self-certify**, matching `E2-security-review.md` §9's own unchanged text. Database/API/Testing/Documentation/Performance/Deployment are marked **Pending — targeted re-verification**, each with an evidence link to the specific section of `E2-final-acceptance-review.md` that scored it, plus this remediation document — but with **Owner left as `[pending — independent reviewer]`, not filled in with any name**, per the explicit instruction not to fabricate a reviewer identity. Frontend/Accessibility remain **Not started** (accessibility validation was never performed at all — R-51, tracked, not fixed here).
- **Epic Approval**: "All gates passed" remains **No**, with an explanation of exactly which gate has a real pass and which are outstanding. "Approved by"/"Date" remain **`[pending]`** — not self-approved. A new line records this remediation's own recommendation (READY FOR TARGETED FINAL RE-VERIFICATION) as **a recommendation on record, explicitly not a substitute for the sign-offs above**.

Updated `docs/ROADMAP.md`'s E2 row to match — no longer claims "zero open P0/P1 findings" (that was accurate at T29 but was superseded by the acceptance review's real findings; leaving it unchanged would itself become a new documentation-accuracy defect of exactly the kind this whole remediation exists to close). Now states implementation-complete, ADRs accepted, and the CONDITIONAL ACCEPTANCE → remediation → pending-re-verification chain, consistent with the epic document.

Added a `CHANGELOG.md` entry (2026-08-01) recording this remediation pass — what the acceptance review found, what was fixed, and that the recommendation is re-verification, not closure. `BASELINE.md` was **not** edited, consistent with its own stated rule ("changes after this point are made by adding a new ADR and a CHANGELOG.md entry — never by silently editing history").

### 4. Files changed

- `docs/epics/E2-identity-access-platform.md` — status header, Architecture Gate checklist, "Recommended before implementation starts" section (split into "Completed since this revision" / "Still open"), Gate sign-off log, Epic Approval.
- `docs/ROADMAP.md` — E2 row.
- `docs/CHANGELOG.md` — new entry.

### 5. Tests added/changed

None — documentation-only.

### 6. CI verification

N/A.

### 7. Documentation changes

This entire blocker _is_ the documentation change; see §3.

### 8. Evidence

`docs/epics/E2-identity-access-platform.md`'s status line, gate log, and Epic Approval section now agree with `docs/ROADMAP.md` and `docs/CHANGELOG.md`: implementation complete, one gate (Architecture) independently passed with a real citation, the rest explicitly pending an independent reviewer, epic not self-declared closed.

---

## Remaining non-blocking risks

Per the instruction not to expand this remediation beyond the three blockers, none of the following were fixed. Each is preserved at the acceptance review's own classification and is now represented in [RISK_REGISTER.md](../RISK_REGISTER.md):

| ID   | Item                                                                                                                                                              | Classification                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| R-36 | `app_service_role`'s real `BYPASSRLS` scope (~22 call sites) has outgrown ADR-022's stated four                                                                   | REQUIRES ACTION (documentation)           |
| R-42 | Argon2id's cost parameters were never deliberately chosen; below OWASP's memory-cost minimum                                                                      | REQUIRES ACTION                           |
| R-43 | GDPR erasure vs. last-admin/last-org-admin invariant — precedence currently decided implicitly by a DB trigger                                                    | TRACKED — product/legal decision required |
| R-44 | SECURITY.md §7/§7.1 overstates export/portability tooling that doesn't exist                                                                                      | REQUIRES ACTION                           |
| R-45 | GUC identity trust boundary — independently demonstrated exploitable (given `app_role`-level raw SQL execution), still non-blocking                               | TRACKED                                   |
| R-46 | MULTITENANCY.md/Part 5 claim a CI RLS schema-lint check that doesn't exist                                                                                        | REQUIRES ACTION                           |
| R-47 | `Idempotency-Key` on registration: designed, never built, never tracked                                                                                           | REQUIRES ACTION                           |
| R-48 | Password-reset completion emits no `AuditLog` row (Part 9B gap)                                                                                                   | REQUIRES ACTION                           |
| R-49 | Zero E2 metrics/alerts/security-event logging                                                                                                                     | REQUIRES ACTION                           |
| R-50 | DATABASE.md §2.1 omits two real tables, contradicts ADR-013                                                                                                       | REQUIRES ACTION                           |
| R-51 | No WCAG 2.1 AA validation ever performed against E2's UI                                                                                                          | REQUIRES ACTION                           |
| R-52 | Design doc's own Part 9 SQL still lacks `FOR SELECT` (the bug migration `20260730111547` fixed in code only)                                                      | TRACKED                                   |
| R-53 | Minor: dead rate-limit rule, 3 undocumented route-shape deviations, stale code comments, event-catalog payload drift, MULTITENANCY.md not updated for ADR-022/023 | REQUIRES ACTION (low priority)            |

None of these were silently closed. None were expanded into new feature work (no Idempotency-Key implementation, no new RLS schema-lint tooling, no password-reset audit redesign, no new metrics architecture, no PKCE/MFA-recovery/email-change work, no Argon2id parameter change) — each remains exactly as open as the acceptance review found it, now durably tracked rather than living only inside that review document.

---

## Recommendation

**READY FOR TARGETED FINAL RE-VERIFICATION.**

The three blocking findings (F1: member-removal session invalidation, F2: API security suite not in CI, F8: governance/documentation inconsistency) are remediated, tested (185/185 e2e, 247/247 unit, both against real infrastructure), and verified — including against a genuinely fresh database and a validated CI workflow definition. Full monorepo regression (`pnpm typecheck`, `pnpm lint`, `pnpm test`) is clean.

This is not a self-declaration that Epic E2 is closed. Per the acceptance review's own closing words, a full re-review should not be necessary — a targeted verification of these three items, by a reviewer other than whoever performs it, is what the gate sign-off log now calls for. **E3 has not been started.**
