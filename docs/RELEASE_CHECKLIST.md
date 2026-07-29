# Release Checklist

Status: **v1.0 — Mandatory process** · Last updated: 2026-07-29

Standing checklist for lifecycle phase 19 ([IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §2) and the **Deployment Gate**. Run before any feature/Epic goes to production, referencing [DEPLOYMENT.md](DEPLOYMENT.md). This is a checklist to *apply* per release, not a per-feature template.

## Pre-deploy

- [ ] All gates in the Epic/feature's tracking artifact are green (EPIC_TEMPLATE.md §5).
- [ ] CI green on `main`: lint, typecheck, unit, integration (DEPLOYMENT.md §4 `ci.yml`).
- [ ] Database migration is zero-downtime (expand/contract) or has an explicit, signed-off exception (DATABASE_CHANGE_TEMPLATE.md §6).
- [ ] Any new tenant-scoped table has its RLS policy in the same migration (MULTITENANCY.md §6) — CI-enforced, but verify manually too.
- [ ] Feature flag configured if this is a risky or gradual rollout (ARCHITECTURE.md §8).
- [ ] Container images scanned and passing (DEPLOYMENT.md §2).

## AI-specific (if this release touches `services/ai-engine`)

- [ ] Golden-set, factual-accuracy, safety, and cost regression suites passed (AI_GOVERNANCE.md §1, §3).
- [ ] Prompt/model version bumped if templates changed (AI_SYSTEM.md §6) — no silent in-place edits.
- [ ] Canary rollout plan confirmed, not a direct full-traffic deploy (DEPLOYMENT.md §4).

## Observability

- [ ] Logging emits required fields (OBSERVABILITY.md §1).
- [ ] New metrics/dashboards wired if this introduces a new cost/latency/quality signal worth tracking (OBSERVABILITY.md §2, §6).
- [ ] Alerting thresholds updated if this changes expected traffic/latency/cost patterns (OBSERVABILITY.md §5).
- [ ] Synthetic monitoring covers this flow if it's a critical journey (OBSERVABILITY.md §7).

## Rollback

- [ ] Rollback is "redeploy the prior task definition revision," confirmed to actually work for this change (DEPLOYMENT.md §4) — not assumed.
- [ ] If the migration is not trivially reversible, the rollback plan for the *migration* specifically is documented (DATABASE_CHANGE_TEMPLATE.md §6), separate from the app rollback.

## Compliance & risk

- [ ] No open item from SECURITY_REVIEW_TEMPLATE.md §8 (compliance impact) unresolved.
- [ ] Any new risk introduced by this release is added to RISK_REGISTER.md, not left untracked.

## Post-deploy

- [ ] Staging smoke tests passed before production promotion (DEPLOYMENT.md §4).
- [ ] Production smoke tests passed after deploy.
- [ ] Dashboards checked for the first 30–60 minutes post-deploy (first 48h minimum for `ai-engine` changes, AI_GOVERNANCE.md §1).
- [ ] `CHANGELOG.md` updated if this release represents a baseline-level change (new ADR, new module going live) — not every routine deploy, but anything that changes the architecture's shape.

**Deployment Gate:** ☐ Passed — [DevOps Lead, date]
