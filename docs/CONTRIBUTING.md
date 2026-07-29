# Contributing to LinguaAI

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-07-29

Supersedes Draft v1.0. See [BASELINE.md](BASELINE.md) for the current authoritative summary; code-level conventions referenced below are owned canonically by [CODING_STANDARDS.md](CODING_STANDARDS.md).

This document defines how work moves through this repository. It applies to every `apps/`, `packages/`, and `services/` workspace.

## 1. Before you write code

Per [CLAUDE.md](../CLAUDE.md): architecture and planning precede feature development. If the module you're touching isn't described in [docs/PRD.md](PRD.md) (and, where relevant, [docs/ARCHITECTURE.md](ARCHITECTURE.md)), stop and get the doc updated/reviewed first. This is not bureaucracy for its own sake — it's what keeps 30 product modules from drifting into inconsistent, undocumented implementations.

## 2. Branching & commits

- Branch from `main`: `feature/<short-description>`, `fix/<short-description>`, `docs/<short-description>`.
- Commits are scoped and descriptive; explain *why*, not just *what* (the diff already shows what changed).
- No direct pushes to `main` — all changes land via pull request (see [DEPLOYMENT.md](DEPLOYMENT.md) §4 branch protection).
- Rebase on `main` before requesting review to keep history linear and reviewable; never force-push over a branch others are actively reviewing without a heads-up.

## 3. Pull requests

A PR is ready for review when:
- CI is green: lint, typecheck, unit tests, integration tests (see [TESTING.md](TESTING.md)).
- New/changed screens implement loading, empty, error, and success states ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) §5).
- New/changed API endpoints follow [API.md](API.md) conventions and update the OpenAPI-derived docs automatically (no manual doc drift).
- Schema changes update [docs/DATABASE.md](DATABASE.md) in the same PR; a new tenant-scoped table includes its RLS policy in the same migration ([MULTITENANCY.md](MULTITENANCY.md) §6).
- Architectural or AI-system changes update [docs/ARCHITECTURE.md](ARCHITECTURE.md) / [docs/AI_SYSTEM.md](AI_SYSTEM.md) in the same PR; a significant architecture decision gets a new entry in [docs/DECISIONS.md](DECISIONS.md) rather than being made implicitly.
- A new producer/consumer of a domain event updates the catalog in [docs/EVENT_ARCHITECTURE.md](EVENT_ARCHITECTURE.md) §3 in the same PR.
- Security-relevant changes (auth, data access, third-party integrations) are called out explicitly in the PR description for reviewer attention, per [docs/SECURITY.md](SECURITY.md).

PR description should state: what changed, why, how it was tested, and any explicitly deferred follow-up (tracked, not silently dropped).

## 4. Code review

- At least one approval required before merge.
- Reviewers check correctness, adherence to the standards in [CLAUDE.md](../CLAUDE.md) (no demo-level shortcuts, no unexplained temporary solutions), test coverage, and documentation currency — not just style.
- Disagreements about architecture are resolved by referencing the relevant `docs/` file; if the docs don't cover it, that's a signal the docs need updating, not that the decision is ad hoc.

## 5. Code style & conventions

- TypeScript strict mode across `apps/` and `packages/`; no `any` without a documented reason.
- Shared types live in `packages/types`, shared validation in `packages/validation` — do not redefine a DTO locally that already exists in a shared package.
- Lint/format are enforced automatically (ESLint + Prettier, run via `lint-staged` on commit and CI on push) — do not hand-fix formatting nits in review that a tool should catch.
- Follow the module boundaries in [ARCHITECTURE.md](ARCHITECTURE.md) §3–5: don't reach into another package's internals; consume its public exports.

## 6. Working with the AI system

Changes to `services/ai-engine` (prompts, agent definitions, model routing) additionally require:
- A golden-set regression run (see [TESTING.md](TESTING.md) §3) attached to the PR.
- A prompt version bump if the system prompt template changes (see [AI_SYSTEM.md](AI_SYSTEM.md) §5) — silent in-place prompt edits are not acceptable since they break traceability of quality regressions.

## 7. Reporting issues

- Bugs and feature requests are tracked in the project's issue tracker (linked from the repo) with enough reproduction detail for someone unfamiliar with the immediate context to act on it.
- Security vulnerabilities are **not** filed as public issues — report per the process defined in [docs/SECURITY.md](SECURITY.md) §9 (incident response).

## 8. Documentation changes

Docs-only PRs (`docs/<short-description>` branches) follow the same review bar as code — an inaccurate architecture doc is worse than no doc, because it actively misleads the next contributor (including future AI agents working in this repo per [CLAUDE.md](../CLAUDE.md)).
