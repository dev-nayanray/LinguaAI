# LinguaAI — Terraform Infrastructure

Status: **E1 skeleton (T18, extended T23/T24)** — plan-only from this repository. No `terraform apply` has been run against a real AWS account here; `deploy-staging.yml`/`deploy-production.yml` (T23) are the first place `apply` actually runs, in CI, against real AWS credentials. See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) §3 and [docs/epics/E1-foundation-platform-bootstrap.md](../../docs/epics/E1-foundation-platform-bootstrap.md) Part 8/13 (T18, T23, T24) for the design and acceptance criteria this structure implements.

## Structure

```
infrastructure/terraform/
├── modules/
│   ├── state-backend/   S3 state bucket (versioning + cross-region replication) + DynamoDB lock table
│   ├── networking/       VPC, public/private subnets, NAT gateways, ALB security group
│   ├── data/             Aurora PostgreSQL (Multi-AZ, PITR + 7-day backups), ElastiCache Redis, S3 (media/backups)
│   ├── compute/          ECS Fargate cluster, ECR repo + task definition per app/service (ADOT sidecar, deployment circuit breaker)
│   ├── edge/              CloudFront, WAF, ALB listeners/routing, Route53
│   ├── budget/            AWS Budgets monthly cost alert + SNS
│   ├── github-oidc/       GitHub Actions OIDC trust + deploy IAM role (T23) — account-level, applied once, see below
│   └── preview/           App Runner ECR-access IAM role for per-PR previews (T24) — account-level, applied once
└── environments/
    ├── staging/           Composes state-backend/networking/data/compute/edge/budget, S3 remote backend
    └── production/        Same composition, production-sized variables
```

Each module is a pure, provider-agnostic child module (no `provider`/`backend` blocks of its own) so it composes cleanly into `environments/*`. Every module also ships an `example/` directory — its own `provider.tf`-equivalent and a **local** backend — so it can be planned completely standalone, which is what the T18 acceptance criteria test:

```bash
cd modules/data/example
terraform init
terraform plan
```

## Why `example/` uses `skip_credentials_validation`

`modules/*/example` configures the AWS provider with `skip_credentials_validation = true`, `skip_requesting_account_id = true`, and `skip_metadata_api_check = true`, plus dummy `access_key`/`secret_key`. This lets `terraform plan` succeed with no real AWS account reachable — exactly what "plan succeeds against each module in isolation" (T18) requires, without needing real credentials checked into or exported for this repository. `environments/*` do **not** use these flags — they're real deploy configurations meant to run against actual AWS credentials in CI (`deploy-staging.yml`/`deploy-production.yml`, T23).

## Why `environments/*` can't be `terraform init`'d here

`environments/staging` and `environments/production` use the real S3 + DynamoDB remote backend (`backend.tf`), which requires a reachable, already-provisioned state bucket — the one `modules/state-backend` creates. That's a standard Terraform bootstrapping order-of-operations, not a gap in this skeleton:

1. Apply `modules/state-backend` once, with local state, against a real AWS account (outside this repo's CI, run manually by the DevOps lead — a one-time bootstrap).
2. Point `environments/staging/backend.tf` / `environments/production/backend.tf` at the resulting bucket/table (already done here, using the naming convention the module produces).
3. From then on, `environments/*` read/write remote state normally.

Because step 1 hasn't happened against a real account yet (E1 has no live AWS environment), `environments/*` are verified in this repository with `terraform validate` (HCL correctness, module wiring, variable types) rather than `terraform plan` — `validate` doesn't require a reachable backend or real credentials the way `plan`/`apply` do. `terraform plan` against `environments/*` is exercised for real in `deploy-staging.yml` (T23) once real AWS access exists.

## Module dependency shape

```
networking ─┬─→ data
            ├─→ compute (+ data's outputs, for DB/Redis security-group ingress)
            └─→ edge (+ compute's target_group_arns)

state-backend and budget are standalone — no dependency on the other four.
```

The ALB security group is created in `networking`, not `edge` or `compute` — both of the latter need it, and creating it in either would make `edge` and `compute` depend on each other in a cycle (`edge` needs `compute`'s target group ARNs; `compute` needs `edge`'s ALB security group). `networking` sits below both, so the dependency stays one-directional.

## Disaster recovery defaults (E1 Part 8, High 3 / DEPLOYMENT.md §6)

- `modules/state-backend`: S3 versioning + cross-region replication (state bucket → replica bucket in a second region), enabled unconditionally — this is the DR posture for Terraform's own state, live from the first `apply`.
- `modules/data`: `backup_retention_period = 7` (validated `>= 7` in `variables.tf`) on the Aurora cluster. For RDS/Aurora, point-in-time recovery is not a separate toggle — it is inherent to `backup_retention_period > 0` — so this single setting satisfies both the "PITR" and "7-day retention" acceptance bullets.
- Cross-region replication of actual product data is explicitly deferred to Epic E4 (RISK_REGISTER.md R-26) — there's no real data yet to replicate.

## Observability (E1 Part 8, Critical 1 / ADR-016)

`modules/compute` gives every ECS task definition a second, non-essential container running the ADOT Collector (`aws-otel-collector`), alongside the app container. The app container's `packages/observability` OTLP exporter reaches this sidecar over `localhost`; the sidecar forwards traces to X-Ray and logs/metrics to CloudWatch. This is wired once, here, for all 8 skeleton services — not bolted on per-service later.

## Container hardening (E1 Part 8, Risk #9/R-30)

Every app container in `modules/compute`'s task definitions sets `readonlyRootFilesystem = true` and `linuxParameters.capabilities.drop = ["ALL"]`, mirroring the `--read-only --cap-drop=ALL` hardening verified against the actual Docker images in T17 (`infrastructure/docker/*`). Next.js services (`web`, `admin`) get a small `tmpfs` mount for `.next/cache`, matching the recommendation documented in their Dockerfiles — not required for the app to run, but avoids losing the on-disk ISR cache. Every task definition also sets explicit `cpu`/`memory` at both the task and container level — never left at an account default.

## Budget alert (E1 Part 14, Risk #15)

`modules/budget` creates an `aws_budgets_budget` (monthly, USD) with SNS-driven email alerts at 50/80/100% of actual spend. The `$500`/month default threshold is a placeholder for a pre-launch environment with no real traffic yet, not a sized production figure — revisit once real usage data exists (DEPLOYMENT.md §6.1).

## GitHub Actions deployment (T23)

`deploy-staging.yml` (merge to `main`) and `deploy-production.yml` (manual `workflow_dispatch`) both: ensure ECR repositories exist (a targeted `apply`, since `modules/compute` creates them — see below) → build, sign, and verify each image → run the environment's full `terraform apply`, which updates the ECS services to the newly verified image → smoke-test the deployed URLs.

**Required one-time setup before either workflow can run for real** (none of this is Terraform-managed — it's the account/repo-level scaffolding those workflows assume already exists):

1. Apply `modules/github-oidc` once against the target AWS account (local state is fine for this one-time bootstrap, same as `modules/state-backend`'s own bootstrap note below) — creates the OIDC trust relationship and the deploy role both workflows assume via `aws-actions/configure-aws-credentials`.
2. In this repo's Settings → Environments, create `staging`, `production`, and `preview` environments. **Production must have a required-reviewers protection rule** — that's what actually implements "production deploy requires manual approval" (T23's acceptance criterion); no workflow YAML can set this on its own, the same way T25's branch-protection settings can't either. `modules/github-oidc`'s trust policy is scoped to each environment's own OIDC claim, so AWS credentials for production genuinely aren't issued until that approval happens — the gate holds at the credential level, not just the workflow-UI level. `preview` has no such rule — T24's own workflow is explicitly non-blocking.
3. Set these repository/environment variables (Settings → Secrets and variables → Actions → Variables): `AWS_DEPLOY_ROLE_ARN` (from step 1's output), `STAGING_SENTRY_DSN_SECRET_ARN`, `PRODUCTION_SENTRY_DSN_SECRET_ARN`, `BUDGET_ALERT_EMAILS`, `APPRUNNER_ECR_ACCESS_ROLE_ARN` (from `modules/preview`'s output, applied once the same way as `modules/github-oidc`).

**Why ECR repositories live in `modules/compute`, not their own module**: they're tightly coupled to the same `var.services` map the task definitions already iterate over, and to what image each task definition references (`aws_ecr_repository.this[each.key].repository_url`). Image scanning on push is enabled as a second, independent check alongside `security-scan.yml`'s Trivy gate (T20) — this one still runs even for an image pushed outside a PR.

**Why the deploy role currently uses `AdministratorAccess`**: `terraform apply` genuinely needs broad permissions across every AWS service this Terraform manages (EC2/VPC, RDS, ElastiCache, S3, ECS, IAM, ELB, CloudFront, WAFv2, Route53, DynamoDB, SNS, Budgets). Scoping this to real least-privilege is legitimate, valuable follow-up work — tracked as a known risk, not silently accepted as permanent. `AdministratorAccess` is the pragmatic starting point most Terraform CI roles begin from in practice, not a shortcut unique to this repo.

**Image promotion, simplified for the E1 skeleton**: `deploy-production.yml` takes a `image_tag` input (a Git SHA already built and smoke-tested in staging) and **rebuilds from that exact commit** rather than binary-copying the already-built staging image between ECR repositories. Given this monorepo's locked dependencies (`pnpm-lock.yaml`) and deterministic multi-stage Dockerfiles, a rebuild from the same SHA is equivalent in practice. True binary promotion (guaranteeing bit-identical artifacts, not just same-source-rebuilt) is a reasonable later hardening step, not implemented here.

**services/ai-engine's canary deploy** (DEPLOYMENT.md §4: prompt/model changes need a smaller-blast-radius rollout than a standard health check) is explicitly deferred — E1's ai-engine skeleton has no real prompt/model logic yet for a canary to meaningfully protect. Tracked, not silently dropped.

## Preview environments (T24)

`preview.yml` deploys `apps/web` and `apps/admin` — the two apps a design/QA reviewer actually looks at — to AWS App Runner on every PR open/push, comments the URLs on the PR, and tears them down on close. Deliberately scoped to just these two apps, not the full 8-service topology: E1 Part 10 itself calls this a non-blocking "convenience gate," and standing up a whole VPC/RDS/ECS stack per open PR would be slow, expensive, and contrary to that framing. `preview-cleanup.yml` is the safety net for when a PR's close event doesn't fire the teardown for some reason — a nightly sweep deletes anything older than 7 days (E1 Part 15's stated default), regardless of PR state.

Preview builds reuse `linguaai-staging-web`/`linguaai-staging-admin` (the same ECR repos `environments/staging` already creates) tagged by PR head commit SHA — no separate preview-specific ECR repos, since every commit already gets a unique, immutable tag. Preview images are never signed/verified (T21) or referenced by `deploy-staging.yml`/`deploy-production.yml` — they're throwaway review artifacts, never promoted.

## Running a plan locally

Requires Terraform >= 1.9 (developed against 1.15.8) and no AWS credentials for `modules/*/example`:

```bash
cd infrastructure/terraform/modules/<module>/example
terraform init
terraform plan
```
