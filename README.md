# LinguaAI

**Your personal AI teacher for every language.**

LinguaAI is an AI-powered global language learning platform that combines Duolingo-style gamification, ChatGPT-level conversational intelligence, Cambly-style live speaking practice, and Babbel-style structured curriculum into a single personalized learning ecosystem — a personal AI teacher that teaches, converses, corrects, and adapts to every learner.

> Status: **Epic E1 (Foundation & Engineering Platform Bootstrap) implementation in progress.** See [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/epics/E1-foundation-platform-bootstrap.md](docs/epics/E1-foundation-platform-bootstrap.md).

## Vision

Create the world's most advanced AI language learning ecosystem, where every person has a personal AI teacher that can teach, communicate, correct mistakes, and adapt to their learning journey.

## Mission

Make language learning accessible, personalized, engaging, and effective through artificial intelligence.

## Product overview

LinguaAI evaluates a learner's true level across reading, writing, listening, speaking, vocabulary, and grammar, then builds a personalized roadmap and daily curriculum. A set of specialized AI teacher agents (conversation partner, grammar coach, pronunciation coach, vocabulary coach, writing coach, exam coach) provide continuous, memory-aware coaching, while a gamification and community layer keeps learners engaged over the long term. See the full specification in [docs/PRD.md](docs/PRD.md).

## Core feature areas

- **AI Language Assessment** — placement testing across all four skills plus vocabulary and grammar
- **Personalized Learning Engine** — adaptive curriculum, daily goals, weakness detection
- **AI Teacher Platform** — seven specialized AI agents with memory and context awareness
- **Course Management** — languages, courses, levels, units, lessons, activities, quizzes
- **Vocabulary Intelligence** — spaced repetition, flashcards, personal dictionary
- **Speaking Practice & Pronunciation Lab** — real-time AI conversation, accent/phoneme analysis
- **Listening & Reading Systems** — AI-generated audio, dictation, stories, translation
- **Writing Assistant & AI Story Generator**
- **AI Translation Camera** — OCR-based real-world vocabulary capture
- **Video Learning** — subtitle-aware learning from YouTube and film
- **Gamification & Community** — XP, streaks, leaderboards, groups, voice rooms
- **Teacher Marketplace & Enterprise LMS**
- **Exam Preparation** — IELTS, TOEFL, JLPT, TOPIK, HSK, DELE
- **Subscriptions** — Free, Premium, Family, Business (Stripe)

Full module inventory: [docs/PRD.md](docs/PRD.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Tech stack

| Layer          | Technology                                                                        |
| -------------- | --------------------------------------------------------------------------------- |
| Frontend       | Next.js 16+, TypeScript, Tailwind CSS, Shadcn UI, React Query, Zustand            |
| Backend        | NestJS, TypeScript, Prisma ORM, PostgreSQL, Redis, BullMQ                         |
| Mobile         | Flutter (iOS & Android)                                                           |
| AI             | LLM APIs, speech recognition, text-to-speech, vector database, AI agent framework |
| Infrastructure | Docker, AWS, Terraform, GitHub Actions                                            |

## Repository structure

```
LinguaAI/
├── apps/            web, api, mobile, admin
├── packages/         ui, database, types, validation, config, utils
├── services/         ai-engine, speech-service, recommendation-engine, notification-service, analytics-service
├── infrastructure/   docker, aws, terraform, nginx
├── docs/             product & architecture documentation (start here)
├── scripts/          automation scripts
└── tests/            integration & e2e tests
```

See [CLAUDE.md](CLAUDE.md) for engineering conventions and repo rules.

## Documentation

**Start with [docs/BASELINE.md](docs/BASELINE.md)** — the frozen, official architecture baseline.

| Document                                                   | Contents                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| [docs/BASELINE.md](docs/BASELINE.md)                       | **Start here.** Frozen v1.1 architecture baseline summary             |
| [docs/PRD.md](docs/PRD.md)                                 | Requirements, personas, journeys, acceptance criteria, business model |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)               | System design, services, data flow, scaling                           |
| [docs/DATABASE.md](docs/DATABASE.md)                       | Entity model, database strategy                                       |
| [docs/API.md](docs/API.md)                                 | API policy (see API_GUIDELINES.md for implementation detail)          |
| [docs/AI_SYSTEM.md](docs/AI_SYSTEM.md)                     | AI agent architecture, RAG, orchestration                             |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)             | Brand, color, typography, components                                  |
| [docs/SECURITY.md](docs/SECURITY.md)                       | Security, privacy, compliance                                         |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                   | Cloud architecture, CI/CD                                             |
| [docs/ROADMAP.md](docs/ROADMAP.md)                         | MVP, growth, enterprise phases, 23 implementation epics               |
| [docs/TESTING.md](docs/TESTING.md)                         | Test strategy                                                         |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)               | Contribution workflow                                                 |
| [docs/DECISIONS.md](docs/DECISIONS.md)                     | Architecture Decision Records (ADRs)                                  |
| [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)       | Code conventions                                                      |
| [docs/API_GUIDELINES.md](docs/API_GUIDELINES.md)           | API implementation reference                                          |
| [docs/EVENT_ARCHITECTURE.md](docs/EVENT_ARCHITECTURE.md)   | Domain events & messaging                                             |
| [docs/MULTITENANCY.md](docs/MULTITENANCY.md)               | Tenant isolation strategy                                             |
| [docs/AI_GOVERNANCE.md](docs/AI_GOVERNANCE.md)             | AI lifecycle, evaluation, safety governance                           |
| [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md)             | Logging, metrics, tracing, SLOs                                       |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md)                 | Performance budgets                                                   |
| [docs/RISK_REGISTER.md](docs/RISK_REGISTER.md)             | Tracked risks                                                         |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)                     | Architecture baseline history                                         |
| [docs/ARCHITECTURE_REVIEW.md](docs/ARCHITECTURE_REVIEW.md) | _Archived_ — original review gate findings                            |

### Engineering Execution Framework

Mandatory delivery process for every Epic — see [docs/IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) to start. Templates: [EPIC_TEMPLATE.md](docs/EPIC_TEMPLATE.md), [FEATURE_SPEC_TEMPLATE.md](docs/FEATURE_SPEC_TEMPLATE.md), [TECHNICAL_DESIGN_TEMPLATE.md](docs/TECHNICAL_DESIGN_TEMPLATE.md), [API_SPEC_TEMPLATE.md](docs/API_SPEC_TEMPLATE.md), [DATABASE_CHANGE_TEMPLATE.md](docs/DATABASE_CHANGE_TEMPLATE.md), [UI_UX_REVIEW_TEMPLATE.md](docs/UI_UX_REVIEW_TEMPLATE.md), [TEST_PLAN_TEMPLATE.md](docs/TEST_PLAN_TEMPLATE.md), [SECURITY_REVIEW_TEMPLATE.md](docs/SECURITY_REVIEW_TEMPLATE.md). Standing checklists: [CODE_REVIEW_CHECKLIST.md](docs/CODE_REVIEW_CHECKLIST.md), [RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md), [DEFINITION_OF_DONE.md](docs/DEFINITION_OF_DONE.md).

## Setup guide

> Prerequisites: Node.js 20+, pnpm 9+, Docker Desktop, Flutter SDK (for mobile work).

```bash
# 1. Clone and install
git clone <repo-url> && cd LinguaAI
pnpm install

# 2. Configure environment
cp .env.example .env
# fill in database, redis, LLM provider, and OAuth credentials
# (pnpm dev loads this file automatically via dotenv-cli — see below)

# 3. Start local infrastructure: Postgres (pgvector), Redis, Mailhog, MinIO,
#    Jaeger, and an OpenTelemetry Collector (traces/metrics sink for local dev)
docker compose up -d

# 4. Run database migrations
pnpm --filter @linguaai/database db:migrate

# 5. Start the platform in dev mode (web, admin, api, and all 5 backend services)
pnpm dev
```

**Notes:**

- `pnpm dev` runs `dotenv -e .env -- turbo run dev`, so every app/service picks up `.env` (database/redis URLs, `OTEL_EXPORTER_OTLP_ENDPOINT`, etc.) automatically — no per-app `.env` files needed locally.
- If a port below is already in use by another project on your machine, override it for one run, e.g. `PORT=4010 pnpm --filter @linguaai/api dev` — this is a local machine conflict, not a LinguaAI setup issue.
- Docker Desktop (WSL2 backend) can take a few seconds after a container reports "healthy" before its port is actually reachable from the host. If `db:migrate` or a service's first request fails to connect, retry once before assuming something is broken.

| App/service             | URL                    |
| ----------------------- | ---------------------- |
| Web                     | http://localhost:3000  |
| Admin                   | http://localhost:3001  |
| API                     | http://localhost:4000  |
| AI Engine               | http://localhost:4001  |
| Speech Service          | http://localhost:4002  |
| Recommendation Engine   | http://localhost:4003  |
| Notification Service    | http://localhost:4004  |
| Analytics Service       | http://localhost:4005  |
| Jaeger UI (traces)      | http://localhost:16686 |
| Mailhog UI (test email) | http://localhost:8025  |
| MinIO Console           | http://localhost:9001  |

Every app/service also exports OpenTelemetry traces to the local collector (`OTEL_EXPORTER_OTLP_ENDPOINT`) — after making a request, its service name and spans should appear in the Jaeger UI within a few seconds.

## License

Proprietary — © LinguaAI. All rights reserved.
