# CLAUDE.md — LinguaAI Engineering Guide

This file orients any AI coding agent (or human) working in this repository. Read it before making changes.

## What this repo is

LinguaAI is an AI-powered global language learning platform (Duolingo-style gamification + ChatGPT-level tutoring + Cambly-style live conversation + Babbel-style structured curriculum). It is being built to production SaaS standards for a venture-backed company, not as a demo or prototype.

Full product/architecture context lives in [`docs/`](docs/). **Start with [docs/BASELINE.md](docs/BASELINE.md)** — the frozen, official architecture baseline — then the specific doc(s) below relevant to your change:

| Doc                                                        | Purpose                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [docs/BASELINE.md](docs/BASELINE.md)                       | **Start here.** The frozen v1.1 architecture baseline — summary of everything below           |
| [docs/PRD.md](docs/PRD.md)                                 | What we're building and why — requirements, personas, acceptance criteria                     |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)               | System design, service boundaries, data flow, scaling                                         |
| [docs/DATABASE.md](docs/DATABASE.md)                       | Entity model and database strategy                                                            |
| [docs/API.md](docs/API.md)                                 | API policy — see API_GUIDELINES.md for implementation detail                                  |
| [docs/AI_SYSTEM.md](docs/AI_SYSTEM.md)                     | AI agent architecture, RAG, orchestration — see AI_GOVERNANCE.md for lifecycle/evaluation     |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)             | Brand, color, typography, component standards                                                 |
| [docs/SECURITY.md](docs/SECURITY.md)                       | Security model, privacy, compliance requirements                                              |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                   | Cloud architecture and CI/CD                                                                  |
| [docs/ROADMAP.md](docs/ROADMAP.md)                         | MVP → Growth → Enterprise sequencing, 23 implementation epics                                 |
| [docs/TESTING.md](docs/TESTING.md)                         | Test strategy and quality bar                                                                 |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)               | Branching, commit, and review conventions                                                     |
| [docs/DECISIONS.md](docs/DECISIONS.md)                     | Architecture Decision Records (ADRs) — why, not just what                                     |
| [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)       | TypeScript/NestJS/React/Flutter code conventions                                              |
| [docs/API_GUIDELINES.md](docs/API_GUIDELINES.md)           | Exhaustive API implementation reference (error codes, pagination, idempotency, WebSocket)     |
| [docs/EVENT_ARCHITECTURE.md](docs/EVENT_ARCHITECTURE.md)   | Domain event catalog and messaging conventions                                                |
| [docs/MULTITENANCY.md](docs/MULTITENANCY.md)               | Tenant isolation strategy (Postgres RLS)                                                      |
| [docs/AI_GOVERNANCE.md](docs/AI_GOVERNANCE.md)             | AI model/prompt lifecycle, evaluation, RAG governance, safety                                 |
| [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md)             | Logging, metrics, tracing, SLOs, alerting                                                     |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md)                 | Canonical performance budgets (web, API, AI latency, mobile)                                  |
| [docs/RISK_REGISTER.md](docs/RISK_REGISTER.md)             | Tracked technical and product risks                                                           |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)                     | Dated history of the architecture baseline itself                                             |
| [docs/ARCHITECTURE_REVIEW.md](docs/ARCHITECTURE_REVIEW.md) | _Archived._ Original review gate findings — historical record only, superseded by BASELINE.md |

### Engineering Execution Framework (mandatory for every Epic — read before writing code)

| Doc                                                                    | Purpose                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [docs/IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md)           | **Start here for delivery process.** The 20-phase Epic lifecycle and 11 quality gates every Epic must pass |
| [docs/EPIC_TEMPLATE.md](docs/EPIC_TEMPLATE.md)                         | Copy per Epic — scope, objective, gate sign-off log                                                        |
| [docs/FEATURE_SPEC_TEMPLATE.md](docs/FEATURE_SPEC_TEMPLATE.md)         | Copy per feature — functional requirements, states, acceptance criteria                                    |
| [docs/TECHNICAL_DESIGN_TEMPLATE.md](docs/TECHNICAL_DESIGN_TEMPLATE.md) | Copy per feature needing real design — feeds the Architecture Gate                                         |
| [docs/API_SPEC_TEMPLATE.md](docs/API_SPEC_TEMPLATE.md)                 | Copy per endpoint — feeds the API Gate                                                                     |
| [docs/DATABASE_CHANGE_TEMPLATE.md](docs/DATABASE_CHANGE_TEMPLATE.md)   | Copy per schema change — feeds the Database Gate                                                           |
| [docs/UI_UX_REVIEW_TEMPLATE.md](docs/UI_UX_REVIEW_TEMPLATE.md)         | Copy per screen — feeds the Frontend and Accessibility Gates                                               |
| [docs/TEST_PLAN_TEMPLATE.md](docs/TEST_PLAN_TEMPLATE.md)               | Copy per feature — feeds the Testing Gate                                                                  |
| [docs/SECURITY_REVIEW_TEMPLATE.md](docs/SECURITY_REVIEW_TEMPLATE.md)   | Copy per security-relevant feature — feeds the Security Gate                                               |
| [docs/CODE_REVIEW_CHECKLIST.md](docs/CODE_REVIEW_CHECKLIST.md)         | Standing checklist every PR reviewer applies                                                               |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)                 | Standing checklist before any deploy — feeds the Deployment Gate                                           |
| [docs/DEFINITION_OF_DONE.md](docs/DEFINITION_OF_DONE.md)               | The single non-negotiable checklist for calling a feature/Epic "Done"                                      |

### Epic design packages (`docs/epics/`)

Each Epic's filled-out EPIC_TEMPLATE.md + TECHNICAL_DESIGN_TEMPLATE.md lives in `docs/epics/E<n>-<slug>.md`.

| Epic                                             | Design doc                                                                                       | Status                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 — Foundation & Engineering Platform Bootstrap | [docs/epics/E1-foundation-platform-bootstrap.md](docs/epics/E1-foundation-platform-bootstrap.md) | **Remediated** — [independent review](docs/epics/E1-production-readiness-review.md) returned NO GO (2 Critical + 3 High); [E1-remediation-report.md](docs/epics/E1-remediation-report.md) documents the fix; awaiting a second, independent Architecture Gate review before T1 begins |

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

**Once implementation begins**, every Epic (E1–E23, `docs/ROADMAP.md`) follows the mandatory process in `docs/IMPLEMENTATION_GUIDE.md` — the 20-phase lifecycle and 11 quality gates. No Epic skips a phase; no gate is self-approved by its own implementer.

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
