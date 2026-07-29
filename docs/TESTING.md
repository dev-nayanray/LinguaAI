# LinguaAI — Testing Strategy

Status: **v1.1 — Consolidated baseline** · Owner: Principal Architect · Last updated: 2026-07-29

Supersedes Draft v1.0. See [BASELINE.md](BASELINE.md) for the current authoritative summary. Performance thresholds referenced below are owned canonically by [PERFORMANCE.md](PERFORMANCE.md); AI evaluation detail by [AI_GOVERNANCE.md](AI_GOVERNANCE.md) §3; tenant-isolation testing detail by [MULTITENANCY.md](MULTITENANCY.md) §6.

Testing is a release gate, not an afterthought. No module from PRD.md §6 is considered done without meeting the bar below.

## 1. Test pyramid

| Layer | Scope | Tooling | Lives in |
|---|---|---|---|
| Unit | Pure functions, utilities, individual services/components in isolation | Jest/Vitest (TS), `flutter test` (mobile) | Beside source, `*.spec.ts` / `*_test.dart` |
| Integration | NestJS modules against a real (test-container) Postgres/Redis, Prisma queries, API contract validation | Jest + Testcontainers | `tests/integration` |
| End-to-end | Full user journeys through the actual UI against a running stack | Playwright (web/admin), integration_test (Flutter) | `tests/e2e` |
| Contract | Frontend/backend payload shape matches `packages/validation`/`packages/types` | Type-level + runtime Zod parsing in CI | Co-located with schemas |

Guiding ratio: many fast unit tests, a focused set of integration tests per module covering real database/queue behavior, and e2e tests limited to the critical user journeys in PRD.md §5 (onboarding/assessment, daily learning loop, speaking practice, subscription upgrade, exam prep) plus key regression-prone flows — e2e suites are kept intentionally small and fast, not a rewrite of the integration suite in browser form.

## 2. Coverage & quality bar

- New code in `apps/api` and `packages/*` requires unit test coverage for business logic (not enforced as a blind percentage target on generated/boilerplate code) — enforced via CI coverage reporting with module-level thresholds reviewed periodically, not a single global vanity number.
- Every module ships tests for its **loading, empty, error, and success states** (see DESIGN_SYSTEM.md §5) at the component/integration level — a PR adding a screen without covering these states does not meet the bar in CLAUDE.md.
- Every API endpoint has integration tests covering: happy path, validation failure (400), authorization failure (401/403), and relevant conflict/edge cases (409/422) — matching the error envelope in API.md §4.

## 3. AI system testing (governance detail: AI_GOVERNANCE.md §3)

AI behavior cannot be tested purely with deterministic assertions, so it uses a distinct strategy — four suites, all blocking gates on `services/ai-engine` changes:
- **Golden-set regression evaluation**: a curated, versioned set of representative learner inputs per agent (Conversation Partner, Grammar Coach, etc.) with expected-quality rubrics (tone/structure/helpfulness).
- **Factual-accuracy evaluation** *(added)*: grammar-rule and exam-rubric correctness checked against the curated RAG knowledge base (AI_SYSTEM.md §4) — the suite that specifically closes the hallucination-risk finding from the Architecture Review; a regression here is treated with the same severity as a functional test failure, not a "quality nice-to-have."
- **Structural/contract tests**: verify agent responses conform to expected structure (e.g., a Writing Coach response always includes a score and an explanation; a specialist-agent tool call always returns a schema-validated critique object per the Orchestrator handoff protocol — AI_GOVERNANCE.md §2) independent of exact wording — these are deterministic and run in standard CI.
- **Latency tests**: automated checks against the PERFORMANCE.md §2 latency budget for the speaking-practice pipeline, run in staging against real provider integrations (not mocked) on a scheduled basis, since provider performance drifts independently of our code changes.
- **Safety/red-team tests**: a maintained set of prompt-injection and abuse-pattern test cases run against the Safety Layer (AI_GOVERNANCE.md §6) as a release gate, not a one-time audit.
- **Cost regression tests**: flag prompt/model changes that materially increase token usage/cost per request without a corresponding quality justification, using `AIUsageLog` data from staging runs (AI_GOVERNANCE.md §5); also validates the platform-level cost circuit breaker (ADR-012) trips correctly under simulated runaway-cost conditions.

## 4. Speech & real-time testing

- STT/TTS integration tested against recorded audio fixtures per supported language/accent, checked for transcription accuracy thresholds and latency, not just "doesn't error."
- WebSocket session flows (API.md §7) tested for reconnection/session-resumption behavior explicitly, including simulated network drop mid-session — this is a common real-world condition for mobile users, not an edge case to skip.

## 5. Security testing

- SAST, dependency, and container image vulnerability scanning run in CI on every PR (DEPLOYMENT.md §4 `security-scan.yml`).
- Authorization tests explicitly verify that role/ownership boundaries hold (e.g., a test asserting `USER` A cannot read `USER` B's progress, an `ENTERPRISE_ADMIN` cannot cross into another organization) — these are treated as security tests, not generic functional tests.
- **Cross-tenant leak tests are a required test class per tenant-scoped table** *(added)*: every table added with an RLS policy (MULTITENANCY.md §6) ships with an accompanying integration test asserting one organization cannot read/write another's rows — CI treats a missing test here the same as a missing migration.
- **MFA enforcement tests** *(added)*: verify an `ADMIN`/`ENTERPRISE_ADMIN` account cannot be activated or remain active without MFA enrollment (ADR-011).
- Scheduled (not just pre-launch) dependency and penetration testing per SECURITY.md §6.

## 6. Performance testing

- Load testing validates the budgets defined canonically in [PERFORMANCE.md](PERFORMANCE.md) (API latency classes, DB query thresholds, AI conversation round-trip) under concurrent load — target: sustained SLOs at 3× the largest observed daily concurrent-user peak (PERFORMANCE.md §6), run ahead of major launches (new market/language rollout, marketing campaigns), not only once pre-MVP.
- The AI conversation pipeline is load-tested for concurrent session handling distinctly from standard REST load testing, given its streaming/stateful nature (ARCHITECTURE.md §6).
- Bundle-size and API-latency regression checks run automatically in CI per PR (PERFORMANCE.md §7), not only in ad hoc manual load tests.

## 7. Mobile testing

- Flutter widget tests for UI components, integration tests for core flows (onboarding, daily lesson, speaking practice) run against both iOS and Android targets in CI.
- Manual device-lab testing (a defined matrix of OS versions/device classes) ahead of each app-store release, since emulator coverage doesn't fully substitute for real-device audio/mic behavior central to this product.

## 8. CI enforcement

All of the above are wired into `.github/workflows/ci.yml` and `e2e.yml` (DEPLOYMENT.md §4) as required, non-bypassable checks on `main` — a failing test suite blocks merge, and skipping tests via `--no-verify`-equivalent shortcuts is not an acceptable resolution to a failing check (CLAUDE.md engineering standards).

## 9. Explicitly deferred

- Chaos/fault-injection testing at the infrastructure level — introduced once production traffic and SLO history justify the investment, tracked as a Growth-phase reliability initiative (ROADMAP.md).
- Full cross-browser visual regression testing — introduced once the design system (DESIGN_SYSTEM.md) stabilizes past initial component development.
