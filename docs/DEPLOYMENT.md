# LinguaAI — Deployment & Infrastructure

Status: **v1.2 — Consolidated baseline** · Owner: DevOps Lead · Last updated: 2026-07-29 (updated during the Epic E1 remediation)

Supersedes Draft v1.0. See [BASELINE.md](BASELINE.md) for the current authoritative summary. SLO targets and alerting policy are owned canonically by [OBSERVABILITY.md](OBSERVABILITY.md); performance budgets by [PERFORMANCE.md](PERFORMANCE.md) — referenced below, not restated.

## 1. Cloud provider & topology

**AWS** is the primary cloud provider. All infrastructure is defined as code via **Terraform** (`infrastructure/terraform`), never provisioned manually through the console for anything beyond throwaway experimentation.

```
Route 53 (DNS)
   │
CloudFront (CDN + edge caching: static assets, marketing pages, course media)
   │
AWS WAF ── ALB (Application Load Balancer, TLS termination)
   │
   ├── ECS Fargate: apps/web (Next.js SSR)
   ├── ECS Fargate: apps/api (NestJS)
   ├── ECS Fargate: apps/admin
   ├── ECS Fargate: services/ai-engine
   ├── ECS Fargate: services/speech-service
   ├── ECS Fargate: services/recommendation-engine
   ├── ECS Fargate: services/notification-service
   └── ECS Fargate: services/analytics-service
        │
        ├── RDS (Aurora PostgreSQL, Multi-AZ) — primary datastore + pgvector
        ├── ElastiCache (Redis) — cache, sessions, BullMQ
        ├── S3 — media, audio, generated content, backups
        └── SQS (dead-letter handling alongside BullMQ where cross-service durability is needed)
```

- **Compute**: ECS Fargate chosen over self-managed Kubernetes at this stage — gives container orchestration, autoscaling, and rolling deploys without the operational overhead of running EKS control-plane/node lifecycle with a small platform team. Revisited if workload characteristics (e.g., GPU inference hosting) later require it.
- **Networking**: all compute in private subnets; only the ALB/CloudFront/NAT gateways are internet-facing. Service-to-service traffic stays within the VPC.
- **Environments**: `development` (local Docker Compose, see root `docker-compose.yml`), **ephemeral per-PR preview environments** *(added)* — for a UI-heavy, 30-module product, preview deploys materially speed up design/QA review cycles, a gap the Architecture Review flagged — `staging` (full AWS topology, production-like data volume via synthetic/anonymized data), `production`. Terraform workspaces/state are isolated per environment — no shared state file across environments.

## 2. Containerization

- Every app/service in `apps/` and `services/` ships a multi-stage `Dockerfile` (build stage with full toolchain, slim runtime stage) under `infrastructure/docker/`, producing minimal, non-root, `node:22-alpine`-based production images (decided during Epic E1's remediation — DECISIONS.md ADR references in epics/E1-foundation-platform-bootstrap.md Part 8) with a read-only root filesystem, dropped Linux capabilities, and explicit ECS CPU/memory resource limits.
- Images are built and pushed to Amazon ECR by CI (see §4), tagged with the Git SHA — deployments reference immutable image tags, never `:latest` in production.
- **Container supply-chain pipeline (ADR-017):** every image is built → SBOM-generated (Syft) → vulnerability-scanned (Trivy, blocking on Critical/High CVEs with an available fix) → signed keylessly (cosign via GitHub Actions OIDC) → provenance-attested (GitHub native `actions/attest-build-provenance`, SLSA-aligned) → verified at deploy time before an ECS task definition update proceeds. This is a build-gate step, distinct from and in addition to the source-dependency scan in `security-scan.yml` (§4). Full pipeline diagram: [epics/E1-foundation-platform-bootstrap.md](epics/E1-foundation-platform-bootstrap.md) Part 10.
- Local development uses the root `docker-compose.yml` for stateful dependencies (Postgres, Redis, MinIO, Mailhog, plus a local Jaeger/OTel Collector for observability — OBSERVABILITY.md §3) while apps run natively via `pnpm dev` for fast iteration; `infrastructure/docker/docker-compose.prod.yml` mirrors the production container topology for staging parity testing.

## 3. Infrastructure as code (`infrastructure/terraform`)

- Modular Terraform: separate modules for networking (VPC/subnets), data (RDS/ElastiCache/S3), compute (ECS services/task definitions, including an ADOT Collector sidecar per task for observability export — OBSERVABILITY.md §3), and edge (CloudFront/WAF/Route53) — composed per environment, not duplicated per environment.
- State stored remotely (S3 backend + DynamoDB lock table), **with versioning and cross-region replication enabled on the state bucket from Epic E1 onward** — the Terraform state itself is real, valuable content from the first `apply`, unlike product data (which has no cross-region replication story until Epic E4, when real data exists — tracked in RISK_REGISTER.md R-26). Never local state committed to the repo.
- The RDS data module enables point-in-time recovery and a default 7-day backup retention period from its first creation, regardless of whether the epic creating it populates real data yet — this is the minimum DR foundation Epic E1 established (§6 below), so no later epic has to remember to turn it on.
- All infrastructure changes go through plan review (`terraform plan` output attached to the PR) before `apply` — no direct production infra changes outside this flow.

## 4. CI/CD (`.github/workflows`)

GitHub Actions pipelines, triggered per PR and per merge to `main`:

| Workflow | Trigger | Steps |
|---|---|---|
| `ci.yml` | Every PR | Install → lint → typecheck → unit tests → build (Turborepo-cached) |
| `e2e.yml` | Every PR (or on-demand label for slower suites) | Spin up ephemeral environment (Docker Compose) → run Playwright e2e suite |
| `security-scan.yml` | Every PR + nightly | Dependency vulnerability scan, secret scanning, SAST |
| `deploy-staging.yml` | Merge to `main` | Build & push images → Terraform plan/apply for staging → deploy ECS services → smoke tests |
| `deploy-production.yml` | Manual approval gate after staging verification | Build & push (or promote staging images) → Terraform plan/apply for production → blue/green or rolling ECS deploy → smoke tests → automatic rollback on failed health checks. **`services/ai-engine` specifically deploys via canary** (small traffic percentage first) gated on AI_GOVERNANCE.md §1's golden-set-equivalent production signals, not just generic health checks — a prompt/model change has product-quality blast radius that a standard health check can't detect. |

- **Branch protection**: `main` requires passing CI, at least one review, and no direct pushes (see CONTRIBUTING.md).
- **Rollback**: every production deploy is a distinct, tagged, previously-tested image; rollback is redeploying the prior task definition revision, not a manual hotfix scramble.
- **Database migrations**: run as a distinct, gated CI step before the new application version receives traffic, using expand/contract migration patterns for zero-downtime schema changes (never a breaking migration deployed simultaneously with the code that depends on it). A migration adding a tenant-scoped table is rejected by CI unless its RLS policy ships in the same migration (MULTITENANCY.md §6).
- **Prompt/model changes ship through this same pipeline** — never deployed out-of-band of code (AI_GOVERNANCE.md §1).

## 5. Observability

Full standard — logging, tracing, metrics catalog, SLO targets, alerting severity tiers, dashboard ownership, synthetic monitoring — is defined canonically in **[OBSERVABILITY.md](OBSERVABILITY.md)**. This section states only the infrastructure-level tooling choice: CloudWatch Logs for log aggregation, OpenTelemetry for tracing, Sentry for error tracking, PagerDuty (or equivalent) for on-call paging — wired into `apps/api` and every `services/*` from first deploy, not retrofitted.

## 6. Backup & disaster recovery

- Automated RDS snapshots (point-in-time recovery enabled) with a defined retention window; snapshot restore tested periodically (an untested backup is not a backup).
- **Cross-region snapshot replication** *(added)* — Multi-AZ protects against an availability-zone failure but not a full regional AWS outage; cross-region backup replication is the minimum DR posture for that scenario, independent of and ahead of any future multi-region *active* expansion (ARCHITECTURE.md §9).
- S3 versioning enabled on buckets holding user-generated/critical content, with lifecycle policies for cost-managed long-term retention.
- A documented RTO/RPO target is defined and reviewed before general-availability launch, informing the Multi-AZ/backup/cross-region configuration choices above — verified in Epic E23 (ROADMAP.md). **Draft placeholder targets set in Epic E1** (RPO ≤ 24h, RTO ≤ 4h for a full regional failure), explicitly labeled draft and revisited with real production data at E23, not treated as final here.
- **DR foundation established in Epic E1, before any product data exists** (remediating a gap the E1 Independent Production Readiness Review found): Terraform state bucket versioning + cross-region replication (§3), and RDS point-in-time-recovery + 7-day backup retention enabled by default in the data module from its first creation. Cross-region replication of actual *product* data is intentionally deferred to Epic E4 (when the schema and real data first exist) — tracked in RISK_REGISTER.md R-26, not silently skipped.

## 6.1 Cost optimization (added)

The original draft did not address infrastructure cost beyond implicit choices. Now explicit:
- **Fargate Spot** for non-critical/batch workloads (e.g., `recommendation-engine`'s nightly curriculum-generation job) where interruption is tolerable.
- **S3 lifecycle policies** (already used for backups, §6) extended to archived database partitions (DATABASE.md §9).
- **AI provider cost is tracked on the same cost dashboards as infrastructure spend** (OBSERVABILITY.md §2, §6), not as a separate, disconnected line — AI cost is very likely the largest single variable cost (PRD.md §7, AI_GOVERNANCE.md §5), and DevOps and AI Engineering review it jointly, not in isolation.
- Reserved/Savings Plans considered once baseline production usage patterns are established — not purchased speculatively ahead of real traffic data.

## 7. Environments & configuration

- Configuration is environment-variable driven (see root `.env.example`), loaded via `packages/config` with runtime validation (fail fast on missing/malformed required config at boot, not on first use).
- Secrets are never environment-variable-committed to source; production/staging secrets are injected from AWS Secrets Manager at deploy time.
- Feature flags (see ARCHITECTURE.md §8) allow environment- and cohort-specific rollout without separate deploys.

## 8. Mobile release pipeline

- Flutter app builds (iOS/Android) run through a dedicated CI pipeline (Fastlane-driven) producing TestFlight/Play Store internal-track builds per merge to `main`, with manual promotion to public release tracks — kept architecturally separate from the web/API deploy cadence since app-store review timelines don't match continuous deployment.

## 9. Explicitly deferred

- Multi-region active-active deployment — infrastructure is written to not preclude it (region-agnostic Terraform modules, UTC-first data model per ARCHITECTURE.md) but not provisioned until latency data or compliance (data residency) requirements justify it.
- Kubernetes/EKS migration — revisited only if Fargate's constraints (e.g., GPU workloads for future self-hosted models) require it.
