# LinguaAI — Performance Budgets

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-07-29

This document is the **single canonical owner** of every performance number in the platform — other documents (AI_SYSTEM.md, DEPLOYMENT.md, TESTING.md, OBSERVABILITY.md) reference these budgets rather than restating them, to avoid the two-sources-of-truth drift the Architecture Review flagged as a general documentation risk.

## 1. Web performance budgets (`apps/web`, `apps/admin`)

| Metric                          | Budget                             |
| ------------------------------- | ---------------------------------- |
| Largest Contentful Paint (LCP)  | < 2.5s on 4G/mid-tier device       |
| Interaction to Next Paint (INP) | < 200ms                            |
| Cumulative Layout Shift (CLS)   | < 0.1                              |
| JS bundle (initial route)       | < 200KB gzipped                    |
| Lighthouse Performance score    | ≥ 90 on marketing/onboarding pages |

## 2. AI conversation latency budget (speaking practice — PRD.md Journey C)

End-to-end round-trip (user stops speaking → AI audio response starts playing), **p95 ≤ 2.5s at launch**:

| Stage                                             | Budget  |
| ------------------------------------------------- | ------- |
| Audio capture → STT partial/final transcript      | ≤ 600ms |
| Transcript → LLM response (streamed, first-token) | ≤ 900ms |
| Response text → TTS first-audio-chunk             | ≤ 700ms |
| Network/transport overhead                        | ≤ 300ms |

Streaming is used at every stage so perceived responsiveness precedes full response completion. This is a design constraint on provider selection (AI_SYSTEM.md §2, §7), not a post-hoc optimization target — it is enforced by the latency test suite (TESTING.md §4) and monitored continuously (OBSERVABILITY.md §4).

## 3. API performance budgets (by endpoint class)

| Class                                               | p50     | p95     | p99     |
| --------------------------------------------------- | ------- | ------- | ------- |
| Standard CRUD (`apps/api`)                          | < 80ms  | < 300ms | < 800ms |
| AI-invoking (non-streaming, e.g., writing feedback) | < 1.5s  | < 4s    | < 8s    |
| Webhook processing                                  | < 1s    | < 5s    | < 10s   |
| Admin/reporting (aggregation, BFF endpoints)        | < 200ms | < 800ms | < 2s    |

**Explicit exception — `POST /v1/auth/register` / `POST /v1/auth/login`** _(E2-T27, measured 2026-07-31)_: both are Standard CRUD by shape but do not meet its budget — real load-test measurement (`tests/load`, n=200, concurrency=20) against local Postgres: register p50=157ms/p95=383ms/p99=389ms, login p50=173ms/p95=222ms/p99=277ms. This is Argon2id hashing/verification cost, not a code-level regression (PERFORMANCE.md §6's own honesty requirement, `docs/epics/E2-implementation-plan.md` §15) — Argon2id is deliberately slow by design (SECURITY.md §2), and weakening it to hit this budget would be a security regression, not a fix. These two endpoints are carved out of the Standard CRUD budget with their own explicit, load-tested ceiling instead of silently failing the general check or silently weakening the hash: **p50 < 250ms, p95 < 500ms, p99 < 800ms** (p99 unchanged — Standard CRUD's own p99 already had headroom). Full methodology and raw results: [docs/epics/E2-T27-performance-report.md](epics/E2-T27-performance-report.md).

## 4. Database performance budgets

- Hot-path query (dashboard load, progress read) p95 < 50ms at the database layer.
- Connection pool (PgBouncer, ARCHITECTURE.md §7) sized to keep queue wait time near zero under expected concurrent load; pool saturation is itself an alerting signal (OBSERVABILITY.md §5).
- Any query regularly exceeding 500ms is treated as a required index/query-plan review before merge, not a "revisit later" note.

## 5. Mobile performance budgets (`apps/mobile`)

| Metric                                    | Budget                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| Cold start to interactive                 | < 2.5s on a representative mid-tier device                   |
| Frame rate during gamification animations | 60fps sustained, no dropped frames on milestone celebrations |
| Offline-mode content sync                 | Background, never blocking the learning UI                   |

## 6. Load testing thresholds

Load testing (TESTING.md §6) validates the budgets above under concurrent load ahead of major launches and campaigns. Specific target: the platform sustains its stated SLOs (OBSERVABILITY.md §4) at **3× the largest observed daily concurrent-user peak**, reviewed and re-baselined after each major growth milestone.

## 7. CI performance regression gates

- Bundle-size check on every `apps/web`/`apps/admin` PR (fails if the initial-route budget in §1 is exceeded without an explicit, reviewed override).
- API latency regression check against the §3 budgets runs in the `e2e.yml`/staging pipeline (DEPLOYMENT.md §4), not only in ad hoc manual load tests.
