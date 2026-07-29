# CLAUDE.md — LinguaAI Engineering Guide

This file orients any AI coding agent (or human) working in this repository. Read it before making changes.

## What this repo is

LinguaAI is an AI-powered global language learning platform (Duolingo-style gamification + ChatGPT-level tutoring + Cambly-style live conversation + Babbel-style structured curriculum). It is being built to production SaaS standards for a venture-backed company, not as a demo or prototype.

Full product/architecture context lives in [`docs/`](docs/). **Start with [docs/BASELINE.md](docs/BASELINE.md)** — the frozen, official architecture baseline — then the specific doc(s) below relevant to your change:

| Doc | Purpose |
|---|---|
| [docs/BASELINE.md](docs/BASELINE.md) | **Start here.** The frozen v1.1 architecture baseline — summary of everything below |
| [docs/PRD.md](docs/PRD.md) | What we're building and why — requirements, personas, acceptance criteria |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, service boundaries, data flow, scaling |
| [docs/DATABASE.md](docs/DATABASE.md) | Entity model and database strategy |
| [docs/API.md](docs/API.md) | API policy — see API_GUIDELINES.md for implementation detail |
| [docs/AI_SYSTEM.md](docs/AI_SYSTEM.md) | AI agent architecture, RAG, orchestration — see AI_GOVERNANCE.md for lifecycle/evaluation |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Brand, color, typography, component standards |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model, privacy, compliance requirements |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Cloud architecture and CI/CD |
| [docs/ROADMAP.md](docs/ROADMAP.md) | MVP → Growth → Enterprise sequencing, 23 implementation epics |
| [docs/TESTING.md](docs/TESTING.md) | Test strategy and quality bar |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Branching, commit, and review conventions |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture Decision Records (ADRs) — why, not just what |
| [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md) | TypeScript/NestJS/React/Flutter code conventions |
| [docs/API_GUIDELINES.md](docs/API_GUIDELINES.md) | Exhaustive API implementation reference (error codes, pagination, idempotency, WebSocket) |
| [docs/EVENT_ARCHITECTURE.md](docs/EVENT_ARCHITECTURE.md) | Domain event catalog and messaging conventions |
| [docs/MULTITENANCY.md](docs/MULTITENANCY.md) | Tenant isolation strategy (Postgres RLS) |
| [docs/AI_GOVERNANCE.md](docs/AI_GOVERNANCE.md) | AI model/prompt lifecycle, evaluation, RAG governance, safety |
| [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) | Logging, metrics, tracing, SLOs, alerting |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Canonical performance budgets (web, API, AI latency, mobile) |
| [docs/RISK_REGISTER.md](docs/RISK_REGISTER.md) | Tracked technical and product risks |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Dated history of the architecture baseline itself |
| [docs/ARCHITECTURE_REVIEW.md](docs/ARCHITECTURE_REVIEW.md) | *Archived.* Original review gate findings — historical record only, superseded by BASELINE.md |

## Repository layout

This is a **Turborepo + pnpm workspaces monorepo**.

```
apps/        Deployable applications (web, api, mobile, admin)
packages/    Shared libraries consumed by apps/ and services/ (ui, database, types, validation, config, utils)
services/    Independently deployable backend microservices (ai-engine, speech-service, recommendation-engine, notification-service, analytics-service)
infrastructure/  Docker, AWS, Terraform, Nginx — infra as code
scripts/     One-off and CI automation scripts
tests/       Cross-cutting integration/e2e tests (unit tests live beside their source)
docs/        Product, architecture, and process documentation (source of truth — keep in sync with code)
```

Rules for this layout:
- Code that is used by more than one app/service belongs in `packages/`, never duplicated.
- A `service/` is only justified if it needs independent scaling, a different runtime/language, or isolation for AI cost/latency reasons. Don't create a new service for something a NestJS module in `apps/api` can do.
- Every package/service is independently typed, linted, and testable — no reaching into another package's `src/` internals; consume its public exports only.

## Tech stack (do not substitute without updating docs/ARCHITECTURE.md)

- **Frontend:** Next.js 16+, TypeScript, Tailwind CSS, Shadcn UI, React Query, Zustand
- **Backend:** NestJS, TypeScript, Prisma ORM, PostgreSQL, Redis, BullMQ
- **Mobile:** Flutter
- **AI:** LLM APIs (provider-agnostic via an internal AI gateway), speech-to-text, text-to-speech, vector database, an AI agent framework with persistent memory
- **Infra:** Docker, AWS, Terraform, GitHub Actions

## Engineering standards

- **No demo-level work.** Every feature ships with loading, empty, error, and success states; input validation at the boundary; and tests. See [docs/TESTING.md](docs/TESTING.md).
- **No temporary solutions.** If something is a stopgap, it must be tracked as tech debt in the relevant doc, not silently merged.
- **Documentation is not optional.** A PR that changes architecture, database schema, an API contract, or the AI agent system updates the corresponding doc in `docs/` in the same PR.
- **Security by default.** Follow [docs/SECURITY.md](docs/SECURITY.md) — OWASP Top 10 discipline, least-privilege access, encrypted PII, GDPR-compliant data handling.
- **Design system compliance.** All UI consumes tokens/components from `packages/ui` per [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — no ad hoc colors, spacing, or one-off components.
- **Type safety end-to-end.** Shared types in `packages/types`; API contracts validated with `packages/validation` (Zod) on both client and server.

## Workflow rule for this repository

Architecture and planning precede feature development. If `docs/` does not yet describe a module, write or update the doc and get it reviewed before implementing the module. Do not scaffold or implement application features until the corresponding module has an approved design in `docs/PRD.md` and, where relevant, `docs/ARCHITECTURE.md`. A significant architecture decision gets a new entry in `docs/DECISIONS.md`, not an implicit choice buried in code — see `docs/CHANGELOG.md` for how baseline changes are tracked over time.

## Common commands (once the toolchain is installed)

```bash
pnpm install          # install all workspace dependencies
pnpm dev              # run all apps in dev mode via Turborepo
pnpm build            # build all apps/packages
pnpm lint             # lint all workspaces
pnpm test             # run unit tests across workspaces
pnpm test:e2e         # run end-to-end tests
docker compose up -d  # start local Postgres, Redis, and supporting services
```
