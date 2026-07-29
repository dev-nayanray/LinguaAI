# Epic E1 — Foundation & Engineering Platform Bootstrap

Status: **Remediated — pending second independent review** · Tech lead: [TBD] · Last updated: 2026-07-29 (remediation pass)

> **Remediation applied.** The Independent Production Readiness Review ([E1-production-readiness-review.md](E1-production-readiness-review.md)) returned NO GO on 2026-07-29 with 2 Critical and 3 High-severity findings. This document has been updated in place — Parts 5, 7, 8, 10, 12, 13, 14, and 15 changed — to resolve every Critical/High finding while preserving the originally approved architecture (per the remediation principle: "fix the gaps, do not expand unnecessary scope"). Full before/after detail, remaining accepted risks, and the updated readiness score are in **[E1-remediation-report.md](E1-remediation-report.md)**. This document is **not yet re-approved** — it awaits a second, independent Architecture Gate review before T1 begins.

This is the complete technical design package for Epic E1, produced under [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md)'s lifecycle (phases 1–10: Epic Definition through Security Review, as applicable — E1 has no product database schema or public API surface, so those gates are scoped narrowly to platform concerns). It satisfies [EPIC_TEMPLATE.md](../EPIC_TEMPLATE.md) §1–4 and [TECHNICAL_DESIGN_TEMPLATE.md](../TECHNICAL_DESIGN_TEMPLATE.md) in full, structured to the 15-part outline this Epic was commissioned under. **This document is design only — no code is written, no project is scaffolded, no package is installed as part of producing this document.**

---

## PART 1 — Business Objective

### Why Epic E1 exists

Every one of the other 22 MVP-phase epics (E2–E23, [ROADMAP.md](../ROADMAP.md)) assumes a working repository: a monorepo that builds, a CI pipeline that gates merges, a local dev environment that starts in one command, and a deployment path to staging/production. None of that exists yet — the repository today ([BASELINE.md](../BASELINE.md)) is documentation and a placeholder folder structure. E1 is the epic that makes the other 22 possible.

### Business value

- **Velocity multiplier, compounding across the whole build.** A day spent getting the build graph, CI gates, and local dev loop right here is repaid on every subsequent PR for the life of the project. Getting it wrong is a mid-project monorepo migration — one of the most expensive categories of unplanned engineering work.
- **Makes the Architecture Baseline enforceable, not just documented.** [DECISIONS.md](../DECISIONS.md)'s ADR-002 (modular monolith with enforced module boundaries) and ADR-015 (boundary linting) are promises made in the baseline that only become real once CI actually fails a PR that violates them. Every quality gate in [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) §3 that can be automated should be automated starting here, or it silently degrades into "trust the reviewer."

### Technical value

- A single, consistent build/test/lint/typecheck entry point (`pnpm <task>`) across every app, package, and service, regardless of framework (NestJS, Next.js, Flutter later).
- A local development loop that doesn't require each engineer to hand-configure Postgres/Redis/S3 — `docker compose up -d` plus `pnpm dev` is the whole onboarding story.
- A CI/CD pipeline that turns the quality gates from [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) §3 into enforced checks wherever automation is possible (Architecture, Security-baseline, Testing, Documentation-presence).

### Risks if skipped or under-built

- **Module boundary erosion** (RISK_REGISTER.md R-10) is close to guaranteed without the ESLint boundary rule (ADR-015) landing in E1 — retrofitting it after `apps/api` has 10 modules with organic cross-imports is materially harder than starting clean.
- **No automated gate enforcement** means every gate in IMPLEMENTATION_GUIDE.md §3 relies on human diligence alone from day one, which is exactly the failure mode the Architecture Review Gate's findings trace back to (good intentions without an enforcement mechanism).
- **Inconsistent developer environments** ("works on my machine") slow every subsequent epic and produce hard-to-reproduce bugs.
- **Uncontrolled AWS spend** if Terraform/environment strategy isn't deliberate from the start (unbounded staging resources, no budget alerting).

### Dependencies

None — E1 is the first epic ([ROADMAP.md](../ROADMAP.md) epic table: "None (first epic)").

### Success metrics

- `pnpm install && pnpm dev` brings up a working local environment (web, api, admin skeletons + Postgres/Redis/MinIO/Mailhog) with no manual steps beyond `cp .env.example .env`.
- `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass cleanly on a fresh clone.
- A PR that violates a module boundary (e.g., `apps/api` importing a `packages/database` internal file directly instead of the Prisma client export) **fails CI**, not just review.
- `ci.yml` runs and passes on every PR within a target of **under 5 minutes** for the E1-scoped skeleton (informs whether remote caching is needed later — see Part 15).
- Merge to `main` auto-deploys to staging; production requires manual approval — both paths exercised end-to-end with the E1 skeleton apps before E1 is called Done.
- A new engineer can go from `git clone` to a running local environment in **under 15 minutes** (Task T26, Part 13).
- **A fresh deployment of any E1 skeleton app/service exposes logs, metrics, and traces with no additional architecture work** *(added in remediation — Critical 1's acceptance bar)*: a request to `/health` produces a structured log line, a queryable metric, and a trace visible in Jaeger (local) or X-Ray (staging/production), using only what `packages/observability` already provides.
- **Every deployed container image is signed and carries a verifiable SBOM and provenance attestation** *(added in remediation — Critical 2's acceptance bar)*: `cosign verify` and `gh attestation verify` both succeed against any image the pipeline has deployed; an unsigned or tampered image is rejected before it reaches an ECS task definition.

---

## PART 2 — Scope

### In scope

- Monorepo tooling: pnpm workspaces + Turborepo (ADR-001), root TypeScript/ESLint/Prettier configuration, Husky + lint-staged, commit conventions tooling.
- Dependency-boundary enforcement (ADR-015).
- Skeleton (not feature-complete) versions of `apps/web`, `apps/api`, `apps/admin`, and health-check-only skeletons of all five `services/*` — enough to prove the build/deploy pipeline end-to-end, not product functionality.
- Skeleton shared packages: `ui`, `database`, `types`, `validation`, `config`, `utils` — structured (package.json, tsconfig, public API surface, build config) but without product-domain content. **`packages/observability`, fully implemented** *(added in remediation — Critical 1)*.
- **Observability foundation** *(added in remediation — Critical 1)*: structured logging, correlation IDs, distributed tracing, and baseline metrics wired into every E1 skeleton app/service, plus a local Jaeger/OTel Collector dev stack and production ADOT sidecar wiring (ADR-016).
- **Container supply-chain security** *(added in remediation — Critical 2)*: SBOM generation, vulnerability scanning, image signing, and provenance attestation for every built image (ADR-017).
- Local development infrastructure: finalized `docker-compose.yml` (Postgres+pgvector, Redis, MinIO, Mailhog) with health checks, named volumes, and a documented local secrets story.
- Dockerfiles (multi-stage) for every app/service.
- Terraform skeleton: networking, data, compute, edge modules per [DEPLOYMENT.md](../DEPLOYMENT.md) §3, remote state backend (S3 + DynamoDB lock).
- GitHub Actions: `ci.yml`, `e2e.yml` (skeleton), `security-scan.yml`, `deploy-staging.yml`, `deploy-production.yml`, and a new preview-environment workflow ([DEPLOYMENT.md](../DEPLOYMENT.md) §1).
- Quality tooling: test runners (ADR-014), coverage thresholds, dependency/secret/license scanning.
- Branch protection and repository security settings.
- Developer onboarding verification (Part 13, T26).

### Out of scope (this Epic)

- Any product feature code: no Identity module logic, no course content, no AI gateway logic. `apps/api` in E1 exposes a health endpoint and the global error envelope/Swagger wiring — nothing domain-specific.
- The Prisma schema's actual entity content (DATABASE.md §2's full domain model) — E1 initializes `packages/database` and confirms Prisma can connect and migrate; the real schema is Epic E4.
- Flutter mobile app scaffolding — deferred to Epic E21, where mobile-specific tooling decisions (Riverpod, Fastlane) are made together rather than pre-committed here without that Epic's full context.
- Real AWS account provisioning / a live `terraform apply` against production infrastructure — this design specifies the Terraform module structure; executing it against real cloud accounts is an implementation-phase action requiring its own explicit go-ahead (a `terraform apply` is not a documentation deliverable).

### Deferred

- Turborepo remote build caching — start with CI-native caching (`actions/cache` keyed on the Turborepo hash); revisit only if measured CI time exceeds a defined threshold (Part 15). Consistent with this project's existing pattern of data-driven infrastructure decisions (ADR-004's pgvector revisit trigger, ARCHITECTURE.md §2.1's extraction-readiness criteria).
- Kubernetes/EKS tooling (ADR-009 — not needed while ECS Fargate suffices).
- Full Flutter CI/CD pipeline (Epic E21).

### Future

- Public API gateway tooling (module 27, Future Research per ROADMAP.md).
- Multi-region Terraform modules (ARCHITECTURE.md §9 — schema/infra written to not preclude it, not built now).

---

## PART 3 — Deliverables

| # | Deliverable | Summary |
|---|---|---|
| 1 | Repository structure | Finalized directory ownership/naming per Part 4 |
| 2 | Workspace configuration | `pnpm-workspace.yaml`, root `package.json` scripts (already drafted in BASELINE-era root files, finalized here) |
| 3 | Build system | `turbo.json` pipeline graph (Part 5) |
| 4 | Docker | Multi-stage Dockerfiles per app/service, finalized `docker-compose.yml` |
| 5 | Environment configuration | `.env.example` (exists) mapped to `packages/config`'s runtime validation; per-environment strategy (Part 9) |
| 6 | CI/CD | 6 GitHub Actions workflows (Part 10) |
| 7 | Developer tooling | ESLint (+ boundaries plugin, ADR-015), Prettier, Husky, lint-staged, commitlint |
| 8 | Shared packages | Skeleton `ui`, `database`, `types`, `validation`, `config`, `utils` (Part 7) |
| 9 | Quality tooling | Jest/Vitest configs (ADR-014), coverage thresholds, dependency/secret/license scanners |
| 10 | Infrastructure as code | Terraform module skeleton (Part 8) |
| 11 | Documentation | This design package; updates to CLAUDE.md/README.md once implementation lands (Documentation Gate) |

---

## PART 4 — Repository Design

Builds on the structure already established in [BASELINE.md](../BASELINE.md) and [ARCHITECTURE.md](../ARCHITECTURE.md) §3–5. E1 makes every directory's purpose, ownership, and boundary explicit and lint-enforced.

```
LinguaAI/
├── apps/
│   ├── web/          # apps/ owns: deployable, user-facing or admin-facing surfaces.
│   ├── api/          #   May depend on packages/*. Must NOT be imported by packages/*
│   ├── admin/         #   or services/* (apps are leaves in the dependency graph).
│   └── mobile/         #   mobile/ is scaffolded in E21, not E1 (Part 2).
├── packages/
│   ├── ui/            # packages/ owns: code shared by 2+ apps/services. May depend on
│   ├── database/       #   other packages/*, never on apps/* or services/* (ADR-015).
│   ├── types/            #   Each package exposes a public API via package.json "exports";
│   ├── validation/        #   consumers never deep-import a package's internal src/ files.
│   ├── config/              #   types/ and validation/ are subpathed by bounded context
│   └── utils/                  #   (e.g. @linguaai/types/identity) per CODING_STANDARDS.md §1.
├── services/
│   ├── ai-engine/              # services/ owns: independently deployable backend services,
│   ├── speech-service/          #   justified per ARCHITECTURE.md §4 (scaling/runtime/blast-
│   ├── recommendation-engine/    #   radius isolation). May depend on packages/*, never on
│   ├── notification-service/      #   apps/*. Real logic lands per-service starting E5–E17;
│   └── analytics-service/          #   E1 delivers a health-check-only skeleton for each.
├── infrastructure/
│   ├── docker/                  # Dockerfiles + docker-compose.prod.yml (DEPLOYMENT.md §2)
│   ├── aws/                      # Account/region-level config not owned by Terraform modules
│   ├── terraform/                  # Modular: networking/, data/, compute/, edge/ (Part 8)
│   └── nginx/                        # Reserved; not used while ALB terminates TLS directly
├── docs/
│   ├── epics/                    # NEW in E1: one file per Epic's design package (this file)
│   └── *.md                       # Canonical architecture/process docs (BASELINE.md et al.)
├── scripts/                     # One-off/CI automation scripts — naming: <verb>-<noun>.sh
├── tests/
│   ├── integration/               # Cross-cutting integration tests not owned by one package
│   └── e2e/                        # Playwright suites (TESTING.md §1)
├── .github/workflows/          # CI/CD pipeline definitions (Part 10)
├── pnpm-workspace.yaml          # NEW in E1
├── turbo.json                    # NEW in E1
└── package.json                   # Exists; task scripts finalized in E1
```

### Naming conventions (extends CODING_STANDARDS.md §1)

- Directories: `kebab-case` throughout (`ai-engine`, not `aiEngine` or `AIEngine`).
- Every `packages/*` and `services/*` directory is an npm workspace package named `@linguaai/<name>` (e.g., `@linguaai/types`, `@linguaai/ai-engine` — services are workspace packages too, even though they're deployed as containers, so Turborepo's task graph covers them).
- Epic design docs: `docs/epics/E<n>-<kebab-slug>.md` (this file: `E1-foundation-platform-bootstrap.md`).

### Package boundary & dependency rules (implements ADR-002, ADR-015)

| Rule | Enforcement |
|---|---|
| `apps/*` may depend on `packages/*` | ESLint boundaries config (allowed) |
| `services/*` may depend on `packages/*` | ESLint boundaries config (allowed) |
| `packages/*` may depend on other `packages/*` | ESLint boundaries config (allowed) |
| `apps/*` may **not** be imported by `packages/*` or `services/*` | ESLint boundaries config (denied) |
| `services/*` may **not** be imported by `apps/*` directly — communication is over REST/WS per API_GUIDELINES.md, not a source import | ESLint boundaries config (denied) |
| No package/app deep-imports another package's non-exported internals | `package.json` `"exports"` field restricts the public surface; ESLint `no-restricted-imports` backstops it |
| A NestJS module inside `apps/api` depends on another module only via its exported service (CODING_STANDARDS.md §2) | Intra-app boundary — enforced via a Nest-specific lint rule or architectural test (`madge`/dependency-cruiser), not the inter-package boundaries plugin |

---

## PART 5 — Monorepo Strategy

### pnpm workspace

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
  - "services/*"
```

Single lockfile (`pnpm-lock.yaml`) at the root, committed. `workspace:*` protocol for all internal cross-package dependencies (e.g., `apps/api` depends on `"@linguaai/database": "workspace:*"`) — never a published-registry version for internal packages while everything lives in this monorepo.

### Turborepo pipeline (`turbo.json`) — **corrected** (remediates E1 review Risk #6, #20)

```jsonc
{
  "pipeline": {
    "db:generate": { "cache": false },
    "build": { "dependsOn": ["^build", "db:generate"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true, "dependsOn": ["db:generate"] },
    "lint": { "outputs": [] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "test": { "outputs": ["coverage/**"] },
    "test:integration": { "dependsOn": ["build"], "outputs": [] },
    "test:e2e:api": { "dependsOn": ["build"], "outputs": [] },
    "test:e2e": { "dependsOn": ["build"], "outputs": [] }
  }
}
```

- `db:generate` is a new, explicit task (Prisma client codegen from `schema.prisma`) — the original pipeline omitted it, folding Prisma's codegen step silently into `build`, which didn't match README.md's separately-documented `db:migrate` command. `build` now depends on it explicitly.
- `build` is topological (`^build`): a package builds only after everything it depends on has built — this is what makes `packages/database`'s generated Prisma client available to `apps/api`'s build, for example.
- `dev` is uncached and persistent (long-running watch processes); it now explicitly depends on `db:generate` (so a fresh clone's `pnpm dev` doesn't fail on a missing Prisma client) but **not** on `build` — `apps/web`'s dev server consumes `packages/ui` (and other workspace packages) directly from source via Next.js's `transpilePackages` config, not from a prior build step, so editing a `packages/ui` component hot-reloads in `apps/web`'s dev server with no manual rebuild in between (closes the hot-reload gap the review identified, Risk #28/R-28).
- `lint` and `typecheck` run per-package, parallelized, no cross-package ordering needed since they don't consume another package's build output in the same way `build`/`test:integration` do (typecheck does depend on `^build` for packages that ship `.d.ts` from a build step).
- `test` (renamed from the original design's build-dependent task) now runs **against source directly**, no `build` dependency — correct for Vitest-based packages (`apps/web`, `apps/admin`, `packages/*`), which are designed to test TSX/TS source without a compile step, and equally correct for Jest-based packages (`apps/api`, `services/*`) via `ts-jest`/SWC transform, which also doesn't require a prior `build`. This was the single biggest local-iteration-speed issue the review found (Risk #6/R-27) — every `test` run previously forced a full topological build first.
- `test:integration` is the new, explicitly build-dependent task for anything that genuinely needs built output (e.g., NestJS `*.e2e-spec.ts` API-level tests that exercise a running, compiled app against a real database) — **`test:e2e:api`** is its more precisely-named alias for that specific NestJS/Jest convention, kept distinct from **`test:e2e`**, which remains the root `tests/e2e` Playwright, browser-level suite (TESTING.md §1). The original design used one `test:e2e` name for both, which the review correctly flagged as ambiguous (Risk #20, tracked as R-32 in RISK_REGISTER.md).

### Cache strategy

Local + CI-native caching only for E1 (Part 2, Deferred). Cache key inputs: source files, lockfile, and each task's declared config files (`tsconfig.json`, `.eslintrc`, etc.) — a change to any of these invalidates the cache for the affected package and everything depending on it. `actions/cache` in `ci.yml` persists the Turborepo cache directory between CI runs keyed on a hash of the lockfile + workspace file list, giving most of the benefit of remote caching without adding a new hosted dependency.

### Task execution order — **corrected** (remediates E1 review Risk #3 / HIGH 1)

The original version of this section showed a *future-state* dependency chain (`config/utils → types/validation → database/ui → apps/services`) that implied every package transitively depends on every earlier one. That was never E1's actual build graph — it was an aspirational picture of what the graph looks like **after E2+ populate these packages with real domain content that cross-references each other**. Conflating the two produced a real contradiction against Part 13's task table, which the independent review correctly caught (`packages/types`/`validation` were listed there as depending only on root tooling, not on `config`/`utils`).

**E1's actual build order** (what genuinely exists at skeleton stage — most packages are empty scaffolds with no real cross-package imports yet):

```
packages/config, packages/types, packages/utils     (no internal package deps — build first, in parallel)
        │
packages/validation                                  (depends on types, for schema↔type alignment — Zod + z.infer)
        │
packages/database, packages/ui, packages/observability (depend on types/validation; ui also needs
        │                                                observability's client-side error boundary helper)
        │
apps/api, apps/web, apps/admin, services/*           (depend on the above packages)
```

**Future-state build order** (illustrative only, not built or enforced in E1 — becomes real as E2+ populate `types`/`validation`/`database` with domain content that `apps/api`'s modules import): unchanged in spirit from the original diagram, retained here only as a forward-looking note, not as E1's build order.

Turborepo computes the *actual* graph automatically from each package's `package.json` dependencies at whatever point in time it runs — the diagrams above are documentation aids, not something manually enforced; Part 13's task table (corrected in this remediation) is now the authoritative statement of E1's real dependencies, and this section is written to match it exactly.

---

## PART 6 — Application Design

At E1, every app below is a **skeleton**: it builds, deploys, and answers a health check through the full pipeline, with no product functionality. This is deliberate — E1's job is to prove the pipeline works end-to-end with something trivial before any epic builds something important on top of it.

| App | Responsibility (full, per ARCHITECTURE.md §3) | E1 skeleton scope | Boundaries | Communication | Deployment model |
|---|---|---|---|---|---|
| `web` | Primary consumer product (marketing + app) | Next.js 16 App Router skeleton, one health/status page, `packages/ui` wired in | Never calls a database or `services/*` directly — only `apps/api` | REST to `apps/api` (API_GUIDELINES.md) | ECS Fargate, behind CloudFront/ALB (DEPLOYMENT.md §1) |
| `api` | Core domain API (identity, courses, progress, gamification, subscriptions, community) | NestJS skeleton: `/health` endpoint, global exception filter producing the standard error envelope (API_GUIDELINES.md §3), Swagger wired (empty spec) | Owns all product domain logic in later epics; never imported by `packages/*` | REST/WS to clients; REST to `services/*` internally | ECS Fargate |
| `admin` | Internal admin platform (module 24) | Next.js skeleton, separate deploy target from `web` for blast-radius isolation (ARCHITECTURE.md §3) | Same as `web` — talks to `apps/api` with admin-scoped tokens (not implemented until E18) | REST to `apps/api` | ECS Fargate, **separate ECS service** from `web` |
| `mobile` | iOS/Android consumer app | **Not touched in E1** (Part 2) | — | — | Deferred to E21 |

Each `services/*` skeleton similarly exposes only a health endpoint in E1, deployed as its own ECS Fargate service per ARCHITECTURE.md §4 — proving the "one container, one task definition, one health check" pattern for all five before any of them carry real logic.

---

## PART 7 — Shared Package Design

| Package | Purpose | Responsibilities (E1 scope) | Public API (E1) | Dependencies | Consumers | Versioning |
|---|---|---|---|---|---|---|
| `ui` | Design-system components (DESIGN_SYSTEM.md) | Tailwind config wired to the token set (DESIGN_SYSTEM.md §2–§2.1); Shadcn primitives installed but not yet themed with real components; Storybook configured | `packages/ui` exports a `tailwind.config` preset + a (currently empty) component index | Tailwind, Radix UI (via Shadcn) | `apps/web`, `apps/admin` | `workspace:*` internal only — no external publish at MVP |
| `database` | Prisma schema, migrations, generated client (DATABASE.md) | Prisma initialized, connects to the local/staging Postgres, **no domain schema yet** (Epic E4) — a placeholder model proves migrate/generate works | Generated Prisma client (once schema exists); for E1, just the initialized Prisma project | `@prisma/client` | `apps/api`, `services/*` needing direct DB access | `workspace:*` |
| `types` | Shared TypeScript types, subpathed by bounded context (CODING_STANDARDS.md §1) | Directory structure for subpaths (`identity/`, `courses/`, `billing/`, …) created and wired into `package.json` `"exports"`; no domain types populated yet | Empty subpath modules, structurally ready for E2+ | None | All apps/services | `workspace:*` |
| `validation` | Zod schemas mirroring `types`' subpaths | Same structural scaffold as `types`, mirrored | Empty subpath modules | Zod | All apps/services | `workspace:*` |
| `config` | Typed env/config loading with runtime validation (DEPLOYMENT.md §7) | **Fully implemented in E1** (not just scaffolded) — this is genuinely needed for every skeleton app to boot correctly and fail fast on missing config | `loadConfig()` typed against `.env.example`'s variable set, throws on missing/malformed required vars at boot | Zod | All apps/services | `workspace:*` |
| `utils` | Framework-agnostic pure utilities | Scaffolded with the date/timezone utility CODING_STANDARDS.md anticipates (needed early for streak-logic work in E14, worth having the module shape ready) | Empty/minimal, structurally ready | None | All apps/services | `workspace:*` |
| **`observability`** *(new — remediates Critical 1)* | Shared instrumentation: OTel SDK bootstrap, structured logger factory, correlation-ID middleware/interceptor, base metrics helpers (ADR-016) | **Fully implemented in E1**, not scaffolded — this is the package that makes Critical 1's remediation real rather than each app hand-rolling its own OTel setup | `initObservability(serviceName)` (bootstraps OTel SDK + logger), `correlationIdMiddleware` (NestJS/Next.js), `logger` (structured JSON logger, correlation-ID-aware), base metric helpers (`httpRequestDuration`, `httpRequestsTotal`, `dbQueryDuration`) | `@opentelemetry/*` SDK packages, `pino` (or equivalent structured logger) | All apps/services | `workspace:*` |

`config` and `observability` are the two packages E1 substantially implements rather than merely scaffolds — `config` because every skeleton app's boot sequence depends on it, and `observability` because Critical 1's remediation requires every skeleton app to actually emit logs/metrics/traces, not just be capable of it later.

---

## PART 8 — Infrastructure Design

### Docker

Every app/service gets a multi-stage `Dockerfile` under `infrastructure/docker/`: a build stage with the full toolchain (Node, pnpm, full workspace context for Turborepo's `--filter` pruning) and a slim runtime stage — per DEPLOYMENT.md §2. Turborepo's `prune` command generates a minimal per-package source subset so each image only contains what that one app/service actually needs, not the whole monorepo.

**Base image — decided (remediates E1 review Risk #8/R-29):** `node:22-alpine`, not distroless. Alpine keeps a minimal shell available, which materially helps a team debugging its *first* production container issues without redeploying a debug image; distroless's smaller attack surface is a real advantage but is deferred as a deliberate, later hardening iteration once the team has operational experience with this pipeline (tracked in RISK_REGISTER.md R-29, Closed as a decision, not as "solved forever").

**Container hardening — added (remediates E1 review Risk #9/R-30), applies to every image built in E1:**
- Non-root user (already specified) — confirmed as a hard requirement, not optional.
- **Read-only root filesystem** at runtime (`--read-only` / ECS task definition `readonlyRootFilesystem: true`), with an explicit writable `tmpfs` mount only where a framework genuinely needs one (e.g., Next.js's `.next/cache`).
- **Linux capabilities dropped** (`--cap-drop=ALL`), with explicit re-adds only if a specific capability is proven necessary (none are expected for these Node.js skeleton apps).
- **CPU/memory resource limits** set explicitly on every ECS task definition (not left at the account default) — both a security control (resource-exhaustion containment) and the concrete mechanism behind Part 14's existing "uncontrolled AWS cost" risk mitigation, which previously named this as a goal without a task attached to it.

### Local development (`docker-compose.yml` — already drafted, finalized in E1)

| Service | Purpose | Health check | Volume | Notes |
|---|---|---|---|---|
| `postgres` (pgvector/pgvector:pg16) | Primary datastore + vector search | `pg_isready` | `postgres_data` (named) | pgvector extension enabled via init script |
| `redis` | Cache, sessions, queues, domain events | `redis-cli ping` | `redis_data` (named) | AOF persistence on |
| `minio` | S3-compatible local object storage | Explicit healthcheck added in E1 (MinIO's built-in `/minio/health/live` endpoint) | `minio_data` (named) | Auto-create the `linguaai-media` bucket via an init container/script |
| `mailhog` | Local SMTP capture | Explicit healthcheck added in E1 (TCP check on :1025) | — | Web UI at :8025 for verifying email flows locally |
| **`jaeger`** *(new — remediates Critical 1)* | Local trace visualization (Jaeger all-in-one) | Built-in Jaeger health endpoint | — | UI at :16686; receives OTLP traces from every local app/service via `packages/observability` |
| **`otel-collector`** *(new — remediates Critical 1)* | Local OpenTelemetry Collector — receives OTLP from apps, forwards traces to `jaeger`, logs metrics to console | Collector health-check extension | — | Deliberately minimal: no local Prometheus/Grafana stack, to avoid overbuilding local infrastructure ahead of real usage (ADR-016) — metrics are visible in the collector's own console output locally; real metrics dashboards are a CloudWatch/staging+ concern |

**Networking:** default Docker Compose bridge network, explicitly named (`linguaai-local`) rather than left as the auto-generated default, so service-to-service hostnames (`postgres`, `redis`, `otel-collector`, etc.) are predictable and documented.

**Secrets (local):** `.env`, git-ignored, sourced from `.env.example` — no secret is ever a docker-compose hardcoded value beyond the clearly-labeled `_dev_password` placeholders already in the file, which are non-sensitive by design (local-only, never used outside a developer's machine).

### Health checks (app-level, not just container-level)

Every skeleton app/service in E1 exposes a `GET /health` returning `200 {"status":"ok"}` when its own dependencies (DB connection, etc.) are reachable — this is what the ALB/ECS target group health check hits in staging/production (DEPLOYMENT.md §1), so it must exist even for a skeleton with zero product logic.

### Observability (production) — added, remediates Critical 1

Production/staging ECS tasks run the **AWS Distro for OpenTelemetry (ADOT) Collector** as a sidecar container per task, per ADR-016. Each app/service's `packages/observability`-instrumented process exports OTLP to its local ADOT sidecar, which forwards traces to **AWS X-Ray** and logs/metrics to **CloudWatch**. This sidecar pattern is added to every ECS task definition in the Terraform compute module (T16), not bolted on per-service later — every one of E1's skeleton services gets the sidecar from its first deployment, satisfying the review's acceptance bar ("a fresh deployment must expose logs, metrics, and traces without additional architecture work").

### Disaster recovery foundation — added, remediates High 3 (minimum foundation only, per the remediation principle "do not overbuild")

E1 has no product data yet (the domain schema lands in Epic E4) — so E1's DR scope is deliberately narrow: put the *mechanism* in place now so no later epic has to remember to add it, without building a full DR posture for data that doesn't exist yet.

- **Terraform state backup**: the S3 state backend (Part 3/DEPLOYMENT.md §3) has **versioning enabled** and **cross-region replication configured** from T16 onward — the state file itself is real, valuable content from the moment `terraform apply` first runs, unlike product data.
- **RDS backup defaults**: the Terraform data module (T16) enables **point-in-time recovery** and a default **backup retention period** (7 days, matching DEPLOYMENT.md §6's existing "automated RDS snapshots... with a defined retention window") on the RDS instance from its first creation — configured as the default even though the database is empty at E1, so it is never something a later epic has to remember to turn on.
- **Cross-region product-data replication**: explicitly **deferred to Epic E4** (RISK_REGISTER.md R-26) — there is no real data to replicate yet, and building it now would be exactly the kind of unnecessary scope expansion the remediation principle warns against. Tracked, not silently dropped.
- **Draft RPO/RTO targets** (finalized at Epic E23 per DEPLOYMENT.md §6's existing commitment, not invented new here): RPO ≤ 24h for cross-region recovery (daily snapshot cadence), RTO ≤ 4h for a full regional failure requiring cross-region restore (Multi-AZ same-region failover is already near-automatic and faster). These are placeholders informed by industry-standard defaults for an MVP-stage product, explicitly labeled draft, not a final commitment.
- **Ownership**: DevOps Lead, consistent with existing DEPLOYMENT.md/RELEASE_CHECKLIST.md role assignments.

### Secrets (production)

Not touched by local `docker-compose.yml` — production/staging secrets are injected from AWS Secrets Manager at deploy time (DEPLOYMENT.md §7), configured as part of the Terraform compute module (Part 8's IaC deliverable) but not populated with real values until the corresponding Epic needs them (e.g., `ANTHROPIC_API_KEY` isn't needed until E5). The **Sentry DSN** (ADR-016) is the one observability-related secret E1 itself needs populated, since it's required from the first deploy.

---

## PART 9 — Environment Strategy

| Environment | Purpose | Data | Provisioned by |
|---|---|---|---|
| Development | Local iteration | Local Docker Compose volumes, disposable | Developer machine |
| **Preview** *(new)* | Per-PR ephemeral review environment | Seeded/synthetic, torn down on PR close | GitHub Actions (new workflow, Part 10) |
| Testing (CI) | Automated test execution | Ephemeral, spun up and destroyed per CI run | GitHub Actions via `docker-compose` |
| Staging | Production-like verification, full AWS topology | Synthetic/anonymized, production-volume-like | Terraform (`staging` workspace) |
| Production | Live | Real | Terraform (`production` workspace), manual-approval-gated |

Environment variables are loaded via `packages/config` (Part 7) with fail-fast runtime validation — a missing required variable is a boot-time crash with a clear error, never a silent `undefined` reaching business logic later. `.env.example` (already exists at the repo root) remains the single documented source of every variable across every environment; production/staging values are never derived from it directly, only its *shape*.

---

## PART 10 — CI/CD Design

Six GitHub Actions workflows (`.github/workflows/`), extending DEPLOYMENT.md §4 with the preview-environment addition from the v1.1 consolidation:

| Workflow | Trigger | Steps | Quality gates enforced |
|---|---|---|---|
| `ci.yml` | Every PR | `pnpm install` (frozen lockfile) → `turbo lint typecheck build test` (cached) | Lint, typecheck, build, unit tests — all must pass |
| `preview.yml` *(new)* | Every PR (opened/updated) | Build & deploy skeleton apps to an ephemeral environment; comment the preview URL on the PR; tear down on PR close | None blocking — a convenience gate for design/QA review (IMPLEMENTATION_GUIDE.md §3 Frontend Gate reviewers use this) |
| `e2e.yml` | Every PR (or on-demand label for slower suites) | Spin up ephemeral environment via `docker-compose` → run Playwright suite (skeleton-scoped: health checks only, until product features exist) | E2E pass |
| `security-scan.yml` | Every PR + nightly | Dependency vulnerability scan (`pnpm audit` / Dependabot alerts), **pre-commit-equivalent secret scan run again in CI** (SECURITY.md §4), SAST, container image scan (**Trivy**), license scan, **SBOM generation (Syft)** | Security Gate (automatable subset) |
| `deploy-staging.yml` | Merge to `main` | Build & push images (Git-SHA tagged) → **container supply-chain pipeline (below)** → Terraform plan/apply (`staging` workspace) → deploy ECS services (with ADOT sidecar, Part 8) → smoke tests | Deployment Gate (staging) |
| `deploy-production.yml` | Manual approval gate after staging verification | Build & push (or promote staging images) → **container supply-chain pipeline (below)** → Terraform plan/apply (`production` workspace) → rolling ECS deploy → smoke tests → automatic rollback on failed health checks | Deployment Gate (production) — canary behavior specified now (DEPLOYMENT.md §4) but only materially exercised once `services/ai-engine` has real logic (E5+) |

### Container supply-chain security pipeline — added (remediates Critical 2, implements ADR-017)

Every image, before it is eligible for an ECS task definition update in `deploy-staging.yml`/`deploy-production.yml`:

```
Build image (multi-stage Dockerfile, Part 8)
        │
Generate SBOM — Syft, SPDX format, attached as a build artifact
        │
Security scan — Trivy, scans the image using the SBOM as input
        │   (blocking on Critical/High CVEs with an available fix;
        │    CVEs with no fix yet are logged/tracked per SECURITY.md §6's
        │    patch SLA, not blocking — a permanently-unfixable transitive
        │    dependency must not make the pipeline permanently red)
        │
Sign image — cosign, keyless via GitHub Actions OIDC (Sigstore Fulcio/Rekor,
        │      no long-lived signing key to manage or leak)
        │
Generate provenance — GitHub native `actions/attest-build-provenance`
        │                (SLSA-aligned build provenance attestation)
        │
Deploy — the ECS task-definition-update step FIRST runs `cosign verify` +
           `gh attestation verify` against the image; deployment aborts
           with a paged alert if either check fails
```

**Failure conditions** (any of these stops the pipeline before deployment): SBOM generation fails; Trivy finds a Critical/High CVE with a fix available; cosign signing fails; provenance generation fails; the deploy-time verification step cannot confirm a valid signature/provenance for the exact image digest being deployed.

### Build strategy

Turborepo's `--filter` + `prune` produces a minimal build/Docker context per app/service; CI runs `turbo build` once with full caching, and each app/service's Docker build stage consumes the already-built output rather than rebuilding from scratch inside the container — avoiding duplicated work between the "CI build" and "Docker image build" steps.

### Release workflow

No independent semantic versioning for internal packages at MVP (they're never published outside the monorepo — Part 7). Deployables (`apps/*`, `services/*`) are versioned by Git SHA image tag only; a "release" is a specific SHA promoted from staging to production, recorded in the deploy workflow's run history — sufficient traceability without a separate release-numbering scheme to maintain.

---

## PART 11 — Quality Engineering

| Concern | Tool | Enforcement |
|---|---|---|
| Linting | ESLint (root shared config) + `eslint-plugin-boundaries` (ADR-015) | `pnpm lint` in `ci.yml`, blocking |
| Formatting | Prettier | `lint-staged` pre-commit (already in root `package.json`) + `pnpm format:check` in CI |
| Type checking | `tsc --noEmit` per package, strict mode (CODING_STANDARDS.md §1) | `pnpm typecheck` in `ci.yml`, blocking |
| Unit testing | **Jest** (`apps/api`, `services/*`) / **Vitest** (`apps/web`, `apps/admin`, `packages/*`) — ADR-014 | `pnpm test` in `ci.yml`, blocking (now source-level, not build-dependent — Part 5) |
| Coverage | Per-package threshold (not a single global vanity %, per TESTING.md §2) — E1 sets an initial floor (80% on `packages/config` and **`packages/observability`**, the two packages with real E1 logic; thresholds for product packages set as they gain real logic in later epics) | Enforced by the test runner's coverage gate, reported in CI |
| Dependency scanning | Dependabot (or Renovate) + `pnpm audit` | `security-scan.yml`, nightly + PR; critical-vuln patch SLA per SECURITY.md §6 |
| Secret scanning | Pre-commit hook (gitleaks or equivalent, SECURITY.md §4) **and** repeated in `security-scan.yml` (defense in depth — a bypassed local hook is still caught in CI) | Blocking on both |
| License scanning | *(new for E1)* A license-checker step flagging copyleft/incompatible licenses (GPL/AGPL etc.) in new dependencies | `security-scan.yml`, blocking — protects the venture-backed product's IP posture from an accidental incompatible-license dependency |
| **Container supply chain** *(new — remediates Critical 2)* | Syft (SBOM) + Trivy (scan) + cosign (sign) + GitHub attestation (provenance) — ADR-017 | `security-scan.yml` + deploy workflows, blocking — full chain in Part 10 |
| **Intra-app boundary linting** *(new — remediates High 2)* | `dependency-cruiser` (NestJS modules in `apps/api`/`services/*`) + `eslint-plugin-boundaries` extended to frontend feature folders | `pnpm lint` in `ci.yml`, blocking — detail in Part 12 |

---

## PART 12 — Security

| Concern | Design |
|---|---|
| Supply chain security | `pnpm-lock.yaml` committed and required (`--frozen-lockfile` in CI — a PR that doesn't include a matching lockfile update fails); dependency versions are not left on floating majors for security-sensitive packages (auth, crypto). **Container images**: SBOM (Syft) + vulnerability scan (Trivy) + keyless signing (cosign) + SLSA provenance attestation (GitHub native) for every image, verified at deploy time before an ECS task definition update — ADR-017, full pipeline in Part 10. |
| Dependency policy | Automated update PRs (Dependabot/Renovate) require the same `ci.yml` pass as any other PR before merge; critical vulnerabilities follow the patch SLA in SECURITY.md §6 |
| Secret management | Pre-commit + CI scanning (Part 11); local secrets in git-ignored `.env`; staging/production secrets in AWS Secrets Manager, injected at deploy time, never baked into a Docker image layer. The Sentry DSN (ADR-016) is E1's one required observability secret. |
| Branch protection | `main`: requires `ci.yml` green, at least one approving review, no direct pushes, no force-push (CONTRIBUTING.md §2) — configured as a GitHub repository setting, documented here as the required-status-checks list: `lint`, `typecheck`, `build`, `test`, `security-scan`. **Added:** stale-approval dismissal on new commits. |
| Code signing | Commits to `main` require GPG/SSH-signed commits. **Distinct from, and in addition to,** container image signing (cosign, above) — the review correctly identified these as two different controls that the original design conflated under one heading. |
| **Module boundary enforcement** *(new — remediates High 2)* | Rules: a NestJS module inside `apps/api`/`services/*` may only import another module via its exported service/`index.ts` — never a deep internal file (`dependency-cruiser`, configured at `.dependency-cruiser.js`); frontend feature folders in `apps/web`/`apps/admin` follow the equivalent rule via the same `eslint-plugin-boundaries` config already used for inter-package boundaries (ADR-015), extended with intra-app rules. **Failure behavior:** a violation fails `pnpm lint`, the same required CI check as any other lint failure — no separate workflow. **CI integration:** folded into the existing `ci.yml` `lint` step, proven via a deliberately-violating fixture (same bar as the inter-package boundary rule, T3). |
| **Container hardening** *(new — remediates Risk #9/R-30)* | Read-only root filesystem, dropped Linux capabilities, explicit CPU/memory resource limits on every ECS task definition — detail in Part 8. |
| **Disaster recovery foundation** *(new — remediates High 3)* | Terraform state bucket versioning + cross-region replication; RDS backup/PITR enabled by default; draft RPO/RTO targets — detail in Part 8. |

---

## PART 13 — Implementation Plan

**Renumbered in this remediation** (was 23 tasks, now 26 — 3 net-new tasks; everything else folded into an existing task's scope rather than adding a task each, per "fix the gaps, do not expand unnecessary scope"). The original table had a real ordering bug the review caught: T9 (`packages/database`) depended on T14 (`docker-compose.yml` finalization), which appeared *after* it in the table — a team executing top-to-bottom would have hit T9 before its dependency existed. **Every task below is now numbered so its dependencies always have a lower number**, verified explicitly (Section 9 of the remediation report). Each task remains sized to be independently reviewable (CODE_REVIEW_CHECKLIST.md's sizing check).

| # | Task | Dependencies | Complexity | Acceptance criteria | Deliverables |
|---|---|---|---|---|---|
| T1 | Initialize pnpm workspace + `turbo.json` | None | S | `pnpm install` succeeds at root with zero packages yet defined | `pnpm-workspace.yaml`, `turbo.json` |
| T2 | Root tooling config: ESLint, Prettier, base `tsconfig.json`, Husky + lint-staged, commitlint, **CODEOWNERS** *(added — Risk #10/R-31)* | T1 | M | `pnpm lint`/`format:check` run (no-op) cleanly on an empty workspace; `CODEOWNERS` routes each top-level directory to a named owner | Root config files, `CODEOWNERS` |
| T3 | Inter-package dependency-boundary lint rule (ADR-015) | T2 | M | A deliberately boundary-violating test import (e.g. a fake `packages/` importing `apps/`) fails `pnpm lint` | ESLint boundaries config + a boundary-violation test fixture proving it fires |
| **T4** | **Intra-app module-boundary lint** *(new — remediates High 2)*: `dependency-cruiser` rules for NestJS modules (`apps/api`, `services/*`) + `eslint-plugin-boundaries` extended to `apps/web`/`admin` feature folders | T2 | M | A deliberately-violating fixture (a fake NestJS module reaching into another module's internal file) fails `pnpm lint`, same bar as T3 | `.dependency-cruiser.js`, extended ESLint config, violation fixture |
| T5 | Scaffold `packages/config`, fully implemented | T1–T2 | M | `loadConfig()` throws on a missing required env var; a unit test proves it | `packages/config` |
| **T6** | **Scaffold `packages/observability`, fully implemented** *(new — remediates Critical 1)*: OTel SDK bootstrap, structured JSON logger, correlation-ID middleware, base metric helpers (ADR-016) | T1–T2 | L | `initObservability()` emits a structured JSON log line with a `requestId`; a unit test confirms the OTel SDK initializes and a test span is exportable | `packages/observability` |
| T7 | Scaffold `packages/types` (subpath structure only, mirroring the six bounded contexts — ARCHITECTURE.md §2.1) | T1–T2 | S | `@linguaai/types/identity` (empty) resolves from another workspace package | `packages/types` |
| T8 | Scaffold `packages/validation` (subpath structure, mirrors T7) | T7 | S | Same as T7, for validation | `packages/validation` |
| T9 | Scaffold `packages/utils` | T1–T2 | S | Builds, exports at least one real date/timezone utility with a unit test | `packages/utils` |
| T10 | Scaffold `packages/ui`: Tailwind + tokens (DESIGN_SYSTEM.md §2–2.1) + Shadcn install + Storybook config | T1–T2, T7, T8 | L | Storybook boots locally showing at least the token palette | `packages/ui` |
| T11 | Finalize `docker-compose.yml`: healthchecks on `postgres`/`redis`/`minio`/`mailhog`, named network, MinIO bucket auto-create, **+ `jaeger` + `otel-collector` services** *(added — Critical 1)* | Existing draft | M | `docker compose up -d` → all six services report healthy; a manually-sent OTLP test trace appears in the local Jaeger UI (:16686) | Updated `docker-compose.yml` |
| T12 | Scaffold `packages/database`: Prisma init, connects to local Postgres, placeholder model, migrate works | T7, T8, **T11** *(corrected — was blocked on a later task)* | M | `prisma migrate dev` succeeds against the now-health-checked local Postgres | `packages/database` |
| T13 | Bootstrap `apps/api`: NestJS skeleton, `/health`, global exception filter (API_GUIDELINES.md §3 envelope), Swagger, **request-lifecycle logging + trace propagation via `packages/observability`** *(added — Critical 1)* | T5, T6, **T11** *(added in audit — the Jaeger acceptance check needs T11's local stack running)* | M | `GET /health` returns 200; a deliberately thrown error returns the standard envelope; a request produces a structured log line **and** a visible trace in local Jaeger | `apps/api` skeleton |
| T14 | Bootstrap `apps/web`: Next.js 16 skeleton, status page, `packages/ui` wired via `transpilePackages` (Part 5 — no separate build step needed for `packages/ui` changes to hot-reload), **client-side error boundary via `packages/observability`** | T5, T6, T10 | M | Page renders using at least one `packages/ui` token/component; editing a `packages/ui` component hot-reloads without a manual rebuild | `apps/web` skeleton |
| T15 | Bootstrap `apps/admin`: Next.js skeleton, separate deploy target | T14 (shares setup) | S | Builds and deploys as a distinct ECS service from `web` | `apps/admin` skeleton |
| T16 | Bootstrap all five `services/*` skeletons (health-check only), **+ observability instrumentation** *(added — Critical 1)* | T5, T6, **T11** *(added in audit, same reason as T13)* | M | Each exposes `/health`, emits structured logs with `requestId`, has its own Dockerfile, builds independently | 5 service skeletons |
| T17 | Multi-stage Dockerfiles per app/service: `node:22-alpine` (decided — Part 8), non-root, **read-only root filesystem, dropped capabilities** *(added — Risk #9/R-30)* | T13–T16 | L | Each image builds, runs as non-root with a read-only root FS and no extra Linux capabilities, passes the Part 11 image scan | `infrastructure/docker/*` |
| T18 | Terraform skeleton: networking/data/compute/edge modules, remote state backend **with S3 versioning + cross-region replication** *(added — High 3)*, RDS backup/PITR enabled by default, **AWS budget alert** *(added — Risk #15)*, **ADOT collector sidecar in the compute module** *(added — Critical 1)*, **explicit ECS CPU/memory resource limits** *(added — Risk #9)* | None (parallelizable with T1–T17) | XL | `terraform plan` succeeds against each module in isolation (no `apply` — Part 2 scope); the data module's plan shows PITR + 7-day backup retention enabled; the state module's plan shows versioning + cross-region replication configured; a budget alert resource is present in the plan | `infrastructure/terraform/*` |
| T19 | `ci.yml` | T1–T17 | M | Passes on a PR containing only the E1 skeleton | `.github/workflows/ci.yml` |
| T20 | `security-scan.yml`: dependency, secret, container, license scanning, **+ SBOM generation (Syft) + Trivy scan** *(added — Critical 2)* | T17, T19 | M | Deliberately-introduced test secret is caught and fails the workflow; a test image with a known Critical CVE fails the scan; a valid SBOM artifact is produced for a clean image | `.github/workflows/security-scan.yml` |
| **T21** | **Container signing & provenance pipeline** *(new — remediates Critical 2)*: cosign keyless signing (GitHub OIDC) + `actions/attest-build-provenance`, wired into `deploy-staging.yml`/`deploy-production.yml` with a deploy-time verification gate | T20 | L | A signed, attested image passes `cosign verify` + `gh attestation verify`; an unsigned/tampered test image is rejected before deployment | Signing/provenance steps in both deploy workflows |
| T22 | `e2e.yml` (skeleton-scoped: health-check journeys only) | T11, T19 | S | Playwright suite hits each skeleton app's health/status page successfully | `.github/workflows/e2e.yml` |
| T23 | `deploy-staging.yml` + `deploy-production.yml` (includes ADOT sidecar deployment, T21's verification gate) | T18, T19, T21 | XL | Skeleton apps deploy to staging automatically on merge, with logs/metrics/traces visible in CloudWatch/X-Ray without further changes; production deploy requires manual approval and succeeds when triggered | Both workflow files |
| T24 | Preview-environment workflow | T19, T23 | L | Opening a PR produces a working preview URL; closing the PR tears it down | `.github/workflows/preview.yml` |
| T25 | Branch protection + repo security settings, **including required signed commits and stale-approval dismissal** *(added — Part 12)* | T19–T20 | S | `main` cannot be pushed to directly; a PR with failing `ci.yml` cannot merge; an unsigned commit is rejected | GitHub repo settings (documented, not code) |
| T26 | Developer onboarding smoke test, **now including an observability check** *(expanded — Critical 1)* | T1–T16 | M | A fresh clone reaches a running local environment in under 15 minutes, verified by someone who didn't build E1; the verifier confirms a request to `apps/api`'s `/health` produces both a structured log line and a visible trace in local Jaeger, with no extra setup step | Updated README.md setup guide (if any step drifted from Part 8/9) |

---

## PART 14 — Risks

**Original 8 risks (validated by the independent review as sound, retained unchanged unless noted):**

| Risk | Category | Mitigation |
|---|---|---|
| Monorepo tooling misconfigured, causing slow or flaky CI | Technical | Validate the Turborepo cache hit rate early (T19); keep the E1 skeleton small enough that a full CI run has a clear, fast baseline to compare future regressions against |
| Dependency-boundary lint rule too strict (blocks legitimate patterns) or too loose (misses real violations) | Technical | T3 explicitly requires a proof case that it fires on a deliberate violation; revisited after the first real cross-boundary PR in E2 surfaces any false positive/negative |
| Docker base image drift or undetected vulnerabilities | Technical | Base image decided (`node:22-alpine`, Part 8); pin digests, not just tags; container scanning (Part 11) is a blocking CI step, not advisory |
| Terraform state mismanagement (lost/corrupted state, concurrent apply conflicts) | Operational | Remote state (S3 + DynamoDB lock) from T18 onward, **now with versioning + cross-region replication** (High 3 remediation) — no local state file ever exists for staging/production |
| Uncontrolled AWS cost from staging infrastructure before any real usage exists | Operational | **Corrected:** budget alert and ECS resource limits are now explicit T18 acceptance criteria (previously named as a mitigation with no task actually tied to it — the review caught this) |
| Onboarding friction (docker-compose or pnpm setup fragile on a new machine) | Developer experience | T26 is an explicit acceptance gate, run by someone other than the E1 implementer, specifically to catch "works on my machine" |
| Inconsistent Node/pnpm versions across developer machines | Developer experience | `engines` field in root `package.json` + a committed `.nvmrc`/Volta pin, checked in T2 |
| Two test runners (ADR-014) creates cross-package DX inconsistency | Developer experience | Both expose the same `pnpm test` entry point per package via Turborepo; documented explicitly in CODING_STANDARDS.md so it's a known, intentional split, not a discovered surprise |

**New risks from this remediation** — full detail and severity classification in [E1-remediation-report.md](E1-remediation-report.md) and RISK_REGISTER.md R-21 through R-32. Summary: 2 Critical (observability, supply chain) and 3 High (dependency-graph contradiction, module-boundary task, DR foundation) are **closed by this remediation pass**, evidenced by the Part 5/7/8/10/12/13 changes above. 1 risk (R-26, cross-region **product-data** replication) is **intentionally deferred to Epic E4**, not closed — there is no data to replicate yet, and building it now would itself be scope creep the remediation principle warns against.

---

## PART 15 — Final Review

### Readiness score: **90/100 → 96/100** (post-remediation; see [E1-remediation-report.md](E1-remediation-report.md) for the full before/after)

The design package's Critical and High-severity gaps are closed. The remaining 4-point gap is the same category of intentional, tracked deferral this design has used throughout (remote cache, AWS org-level ownership, coverage-threshold placeholders, preview-env idle policy) — nothing is hidden.

### Missing information / open decisions (updated)

1. **Remote Turborepo cache** — still deliberately deferred (Part 2); unchanged by this remediation.
2. **AWS account/org-level setup ownership** — still an external prerequisite to T18/T23/T24; unchanged by this remediation.
3. **Coverage threshold numbers** beyond `packages/config`/`packages/observability` — still placeholder for packages gaining real logic in later epics; unchanged.
4. **Preview-environment idle-teardown policy** — still recommend a 7-day default; unchanged.
5. *(New)* **Cross-region product-data replication** (RISK_REGISTER.md R-26) is explicitly owed to Epic E4 — tracked, not resolved here, by design (there is no data yet).

### Recommended improvements before implementation starts (updated)

- Confirm the coverage-threshold placeholder gets a tracked follow-up in E2's design package.
- Assign a named tech lead for E1 (still `[TBD]`) before T1 begins.
- Set the CI-time threshold for the remote-cache decision once T19 lands.
- *(New)* Confirm E4's design package explicitly picks up R-26 (cross-region RDS replication) — this remediation added the tracking entry but E4 is the epic that must action it.

### Approval recommendation

**Recommended for a second independent Architecture Gate review**, not self-approved (per IMPLEMENTATION_GUIDE.md §4's no-self-approval rule — the same rule that produced the first NO GO). Every Critical and High finding from the 2026-07-29 review has a corresponding, traceable change in this document (Parts 5, 7, 8, 10, 12, 13, 14) and a corresponding task (T4, T6, T11, T17, T18, T20, T21, T25, T26). Full mapping in [E1-remediation-report.md](E1-remediation-report.md).

---

## Gate sign-off log (EPIC_TEMPLATE.md §5)

| Gate | Owner | Status | Evidence link | Date |
|---|---|---|---|---|
| Architecture | Independent Review Board | ☒ Reviewed — NO GO (2026-07-29) → **Remediated, pending second review** | [E1-production-readiness-review.md](E1-production-readiness-review.md) §1, §9, §10; [E1-remediation-report.md](E1-remediation-report.md) | 2026-07-29 |
| Security | Independent Review Board | ☒ Reviewed — NO GO (2026-07-29) → **Remediated, pending second review** | [E1-production-readiness-review.md](E1-production-readiness-review.md) §4; [E1-remediation-report.md](E1-remediation-report.md) | 2026-07-29 |
| Database | [TBD] | ☐ Not started / N/A at skeleton stage | Part 8 (packages/database init only) | |
| API | [TBD] | ☐ N/A — no public API contract in E1 | — | |
| Frontend | [TBD] | ☐ Not started | Part 6, Part 7 (`ui`) | |
| AI | — | ☐ N/A — E1 does not touch `services/ai-engine` logic | — | |
| Performance | [TBD] | ☐ Not started | Success metrics (Part 1): CI time, onboarding time | |
| Accessibility | [TBD] | ☐ N/A at skeleton stage — applies once `apps/web`/`admin` render real UI | — | |
| Testing | [TBD] | ☐ Not started | Part 11 | |
| Documentation | [TBD] | ☐ In progress | This document + BASELINE.md linkage | |
| Deployment | Independent Review Board | ☒ Reviewed — NO GO (2026-07-29) → **Remediated, pending second review** | [E1-production-readiness-review.md](E1-production-readiness-review.md) §3, §6; [E1-remediation-report.md](E1-remediation-report.md) | 2026-07-29 |

**No gate is marked Passed yet.** This remediation closes the findings that produced NO GO; it does not substitute for the second independent review IMPLEMENTATION_GUIDE.md §4 requires before Architecture/Security/Deployment can be marked Passed.
