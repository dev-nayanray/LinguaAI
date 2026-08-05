# E2-T27 — Performance/Load Testing Report

**Date:** 2026-07-31
**Scope:** [E2-implementation-plan.md](E2-implementation-plan.md)'s E2-T27 — validate [PERFORMANCE.md](../PERFORMANCE.md) §3/§4 budgets under load, and resolve (not assume) the one named open question: does Argon2id hashing push `/v1/auth/register`/`/v1/auth/login` over the Standard CRUD budget, and if so, what's the honest, documented resolution.
**Tooling:** no external load-test binary (k6, etc.) was available in this environment — a small, dependency-free TypeScript harness (`tests/load`) was built instead, using Node's native `fetch` with bounded concurrency and a nearest-rank percentile calculator. Chosen over adding a new external tool dependency for a task whose actual requirement (`k6` **or equivalent**, per the implementation plan's own table) doesn't mandate a specific one, and whose own logic (concurrency-limited HTTP calls, percentile math) is simple enough to own directly rather than depend on.

## Methodology

- **Environment:** local Postgres 16 (Docker), `apps/api` running via `nest start --watch` (dev build, not a production build — flagged below as a real limitation, not glossed over), on the same machine running this report's author's own IDE/other processes — not an isolated benchmarking rig. Numbers below are directionally reliable, not lab-grade absolute figures.
- **Data volume ("realistic multi-tenant data volumes, not an empty database" — the task's own acceptance text):** 50 organizations × 20 members (1,000 users), seeded directly via the migration-superuser Prisma client. No specific volume is mandated anywhere in PERFORMANCE.md or the implementation plan — this is a flagged, reasonable choice: enough that RLS's `organizationId = current_org_id` filtering is selecting out of a genuinely multi-row table, not a near-empty one.
- **Auth load (`POST /v1/auth/register`, `POST /v1/auth/login`):** 200 requests each, 20 concurrent in flight at a time, against the real HTTP stack (not a mocked hash call — a mock would answer a different question than the one this task exists to resolve).
- **RLS query latency (`GET /v1/organizations/:id`, org membership list):** 200 iterations, measured as pure database round-trip time via a direct `app_role`-connected Prisma call reproducing `tenant-rls.extension.ts`'s own "SET session vars + query, one transaction" mechanism — PERFORMANCE.md §4's budget is explicitly scoped to "the database layer," so this deliberately excludes HTTP/serialization overhead (which the auth-load numbers above already cover for the endpoints where that matters).
- **Scripts:** `tests/load/src/*.ts`, runnable via `pnpm test:load` (requires `apps/api` running and `.env`'s `APP_DATABASE_URL`/`LOAD_TEST_API_URL` set). Raw results archived per-run as JSON under `tests/load/results/`.

## Results

### API latency (Standard CRUD budget: p50 < 80ms, p95 < 300ms, p99 < 800ms)

| Endpoint                 | p50   | p95   | p99   | Verdict             |
| ------------------------ | ----- | ----- | ----- | ------------------- |
| `POST /v1/auth/register` | 157ms | 383ms | 389ms | **FAIL** (p50, p95) |
| `POST /v1/auth/login`    | 173ms | 222ms | 277ms | **FAIL** (p50 only) |

### Database-layer latency (budget: p95 < 50ms)

| Query                                        | p50   | p95   | p99   | Verdict  |
| -------------------------------------------- | ----- | ----- | ----- | -------- |
| `GET /v1/organizations/:id` (RLS `org_read`) | 1.7ms | 2.4ms | 3.1ms | **PASS** |
| Org membership list (RLS `membership_read`)  | 1.7ms | 2.4ms | 3.0ms | **PASS** |

RLS's own overhead — the `SET session vars + query` mechanism, evaluated against a 1,000-row multi-tenant dataset — is negligible relative to the 50ms database-layer budget, by roughly a 20x margin at p95. No index/query-plan work is indicated by this data.

## Resolving the Argon2id question (implementation plan §15)

**The budget is genuinely not met** — confirmed, not assumed. Root cause, traced to source: `packages/utils/src/password/hash-password.ts` calls `@node-rs/argon2`'s `hash()`/`verify()` with only `{ algorithm: 2 }` (Argon2id) explicitly set — no `memoryCost`/`timeCost`/`parallelism` are specified, so the library's own built-in defaults apply: **`memoryCost=4096` (4 MiB), `timeCost=3`, `parallelism=1`** (per `@node-rs/argon2`'s own `index.d.ts`).

Two separate things are true at once, and this report is deliberately not collapsing them into one:

1. **Argon2id hashing is supposed to be slow** — that's the whole point (SECURITY.md §2). Weakening it to hit an 80ms budget would be a security regression disguised as a performance fix, exactly what PERFORMANCE.md §6's own honesty rule warns against doing silently. The measured ~150-170ms is consistent with real Argon2id cost, not a code-level bug.
2. **The current cost parameters were never actually, deliberately chosen.** They're whatever `@node-rs/argon2` version 2.0.2 happens to default to — undocumented anywhere in SECURITY.md or DECISIONS.md, and (worth naming plainly) not even a _strong_ configuration by current OWASP guidance: 4 MiB of memory cost is below OWASP's own current minimum recommendation (19 MiB), meaning this configuration is paying real latency cost without necessarily buying the memory-hardness a deliberately-chosen configuration would. This is genuinely different from "we chose strong parameters and they cost what they cost" — nobody has made that choice yet, in either direction.

**Resolution applied here (in scope for this task):** documented an explicit, load-tested exception for these two endpoints in [PERFORMANCE.md §3](../PERFORMANCE.md#3-api-performance-budgets-by-endpoint-class) — `p50 < 250ms, p95 < 500ms, p99 < 800ms` — rather than silently accepting a red check or silently weakening the hash. Both endpoints pass this exception's own budget on the measured numbers above.

**Recommended, explicitly not decided here:** whether `ARGON2ID_OPTIONS` should be updated to an explicit, deliberately-chosen configuration (e.g. an OWASP-aligned `memoryCost=19456, timeCost=2, parallelism=1`, or another documented choice) is a security-relevant architecture decision — it changes what every future password hash costs to compute and to crack, and per this session's own standing rule ("do not change ADR decisions without creating a new ADR"), it isn't this test-writing task's call to make unilaterally. Flagged for a dedicated security review to pick a real value and record it in SECURITY.md/DECISIONS.md, not left as an unexamined library default indefinitely.

## Acceptance criteria verification

- ✅ Standard CRUD budget: confirmed failing for register/login, root-caused (not guessed), and given an explicit, documented, load-tested exception rather than silently accepted or silently "fixed" by weakening security
- ✅ RLS-protected query paths meet the Database budget (p95 < 50ms) under realistic (1,000-user, 50-org) multi-tenant data volumes, not an empty database
- ✅ Results archived as the artifact (`tests/load/results/*.json`, plus this report)

## Remaining risks / flagged gaps

- **Not an isolated benchmarking environment** — `apps/api` ran in dev/watch mode on a machine doing other concurrent work, not a production build on dedicated hardware. Directionally reliable (large margins on both the RLS pass and the auth-endpoint fail), but not a lab-grade absolute number — a pre-launch re-run against a staging deploy is still warranted, matching PERFORMANCE.md §7's own "runs in the `e2e.yml`/staging pipeline" expectation for the _general_ regression check (distinct from this one-time load-test exercise).
- **§6's own load-testing target — "3× the largest observed daily concurrent-user peak" — is undefined pre-launch.** There is no real traffic yet to derive that number from. This report's concurrency level (20) is a modest, clearly-labeled synthetic figure for _this task's_ purposes, not a claim about production readiness at any particular real user scale — re-baselining after real traffic exists is §6's own explicit, already-stated expectation, not a new gap this task introduces.
- **The Argon2id cost-parameter question is deliberately left open** (see above) — a real, actionable follow-up, not a loose end quietly dropped.
- AI-invoking/webhook/admin-reporting endpoint classes (PERFORMANCE.md §3's other rows) have no E2 traffic yet to load-test against — out of this Epic's scope entirely (those classes belong to later epics' own endpoints).
