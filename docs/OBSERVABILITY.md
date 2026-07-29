# LinguaAI — Observability Standards

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-07-29

Canonical reference for logging, metrics, tracing, SLOs, and alerting across every `apps/*` and `services/*`. [DEPLOYMENT.md](DEPLOYMENT.md) §5 summarizes the tooling choices; this document is the detailed standard engineers implement against. Resolves the Architecture Review finding that alerting thresholds were described as "reviewed as scale" with no concrete starting SLOs.

## 1. Logging standard

- Structured JSON logs from every service, shipped to CloudWatch Logs.
- Required fields on every log line: `timestamp`, `level`, `service`, `requestId`, `userId` (if authenticated), `tenantId` (if applicable), `message`.
- PII redaction is applied at the logging middleware layer, not left to call-site discipline — raw conversation transcripts, emails, and names are never written to general application logs (SECURITY.md §4); they exist only in the database records designed to hold them.
- Log levels: `error` (needs investigation), `warn` (unexpected but handled), `info` (significant state change — user registered, subscription changed), `debug` (verbose, disabled in production by default).

## 2. Metrics catalog

| Category | Metrics |
|---|---|
| Infrastructure | CPU/memory per service, request rate, error rate, p50/p95/p99 latency per endpoint class |
| Database | Connection pool utilization, query latency, replication lag (once read replicas exist) |
| Queue | BullMQ queue depth per queue, job failure rate, DLQ depth (EVENT_ARCHITECTURE.md §5) |
| AI/product | Cost per request (by agent/model), latency per pipeline stage (AI_SYSTEM.md §7 / PERFORMANCE.md §2), entitlement-rejection rate, golden-set pass rate trend (AI_GOVERNANCE.md §3), circuit-breaker trip count |
| Business | Activation rate, D1/D7/D30 retention, Free→Premium conversion, CEFR-progression rate (PRD.md §7–§8) — sourced from `analytics-service`, surfaced on shared dashboards so engineering and product see the same numbers |

## 3. Tracing

- OpenTelemetry instrumentation across `apps/api` and all `services/*`; a single `requestId`/trace ID propagates through every hop, including the multi-service speaking-practice pipeline (`apps/api` → `speech-service` → `ai-engine` → `speech-service`) — this is the only practical way to diagnose the latency budget in PERFORMANCE.md.
- Span naming: `<service>.<operation>` (e.g., `ai-engine.generate-response`, `speech-service.stt-transcribe`).

## 4. SLOs & error budgets

Initial SLO targets (reviewed quarterly against real production data, not treated as permanent):

| Service/path | SLO |
|---|---|
| Core API (`apps/api`) availability | 99.9% monthly |
| Core API p95 latency (non-AI endpoints) | < 300ms |
| AI conversation round-trip | p95 ≤ 2.5s (PERFORMANCE.md §2 is the canonical owner of this number) |
| Webhook processing (Stripe) | < 5s from receipt to entitlement update |
| Background job success rate | ≥ 99% (excluding jobs that fail due to legitimately invalid input) |

An SLO breach that exhausts the associated error budget triggers a policy response (feature-freeze on the affected service until root-caused) — the specific policy is finalized alongside the first quarterly SLO review, not left permanently undefined.

## 5. Alerting

| Severity | Examples | Response |
|---|---|---|
| P0 (page immediately) | API availability SLO breach, AI cost circuit breaker tripped, DLQ depth crosses critical threshold, security incident indicator | On-call paged, incident process (SECURITY.md §9) begins |
| P1 (page during business hours / urgent Slack) | Elevated error rate below full SLO breach, provider degraded-but-not-down | Investigated same business day |
| P2 (ticket, no page) | Slow-burn trends (cost creeping up, golden-set pass rate slowly declining) | Reviewed in regular engineering/AI-governance cadence |

## 6. Dashboards & ownership

| Dashboard | Owner |
|---|---|
| Infra health (CPU/latency/errors) | DevOps |
| AI cost & quality | AI Engineering |
| Business/product metrics | Product/Analytics |
| Security/audit events | Security |

## 7. Synthetic monitoring

External synthetic checks (independent of internal metrics — DEPLOYMENT.md §5) against: login, assessment start, conversation-session start, checkout. A synthetic-check failure is treated as a P0/P1 signal even if internal metrics look healthy, since it's the closest proxy to real user experience.
