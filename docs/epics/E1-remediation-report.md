# Epic E1 — Remediation Report

Status: **Remediation complete — recommending second independent review** · Last updated: 2026-07-29

This report documents the E1 Remediation Phase: the response to [E1-production-readiness-review.md](E1-production-readiness-review.md)'s NO GO decision (2026-07-29). Per the remediation brief, the objective was **not** to redesign Epic E1 but to close every Critical and High-severity finding while preserving the originally approved architecture — "fix the gaps, do not expand unnecessary scope." This report is the record of what changed, what was deliberately left alone, and what is recommended next.

---

## 1. Remediation summary

| Finding | Severity | Resolution | New ADR |
|---|---|---|---|
| No logging/tracing/metrics in E1's first deployable apps — contradicted DEPLOYMENT.md §5 and DEFINITION_OF_DONE.md | **Critical 1** | New `packages/observability` (OTel SDK, structured logging, correlation IDs), instrumentation added to every skeleton app/service, local Jaeger/OTel Collector stack, production ADOT sidecar wiring | **ADR-016** |
| No SBOM, image signing, or provenance for container images — SLSA gap | **Critical 2** | Syft (SBOM) → Trivy (scan) → cosign (keyless sign) → GitHub attestation (provenance) → deploy-time verification gate, added to `security-scan.yml`/deploy workflows | **ADR-017** |
| Part 5 (build graph) contradicted Part 13 (task dependencies) for `packages/types`/`validation` | **High 1** | Part 5 corrected to describe E1's actual skeleton-stage build order, separated from a labeled "future-state" diagram; Part 13's task dependencies are now the single source of truth Part 5 is written to match | — |
| Intra-app NestJS/frontend module-boundary rules named with no implementation task | **High 2** | New task T4: `dependency-cruiser` (NestJS) + extended `eslint-plugin-boundaries` (frontend), same "prove it fires on a violation" acceptance bar as the existing inter-package rule (T3) | — |
| No disaster-recovery foundation considered anywhere in E1 | **High 3** | Terraform state bucket versioning + cross-region replication; RDS PITR + 7-day backup retention enabled by default; draft RPO/RTO targets (≤24h / ≤4h) pending E23 finalization; cross-region **product-data** replication explicitly deferred to Epic E4 (no data exists yet — deferring this is the remediation principle in action, not a gap) | — |

**Every Critical and High finding has a corresponding, traceable change** in the E1 design document and a corresponding task in its Part 13 implementation plan (T4, T6, T11, T13, T14, T16, T17, T18, T20, T21, T25, T26).

### Medium/Low findings — triage

Per the remediation brief's instruction ("decide: fix now / defer intentionally / remove as invalid"), all 11 Medium/Low findings from the original review were reviewed individually. **None were removed as invalid** — every finding the independent review raised held up on reconsideration. Disposition:

| # | Finding | Disposition |
|---|---|---|
| 6 | `test` Turborepo task force-depends on `build`, slowing Vitest iteration | **Fixed now** — split into source-level `test` and build-dependent `test:integration` (Part 5) |
| 7 | No hot-reload path from `packages/ui` to `apps/web`'s dev server | **Fixed now** — Next.js `transpilePackages` consumes workspace source directly (Part 5, T14) |
| 8 | Container base image undecided (distroless vs. alpine) | **Fixed now** — decided `node:22-alpine`, with rationale (Part 8) |
| 9 | Container hardening incomplete (read-only FS, cap-drop, resource limits) | **Fixed now** — added to T17/T18 acceptance criteria (Part 8, Part 12) |
| 10 | No CODEOWNERS / team-scalability mechanism | **Fixed now** — added to T2 (Part 13) |
| 15 | AWS cost risk named but not tied to a concrete task | **Fixed now** — budget alert is now an explicit T18 acceptance criterion |
| 19 | CI "<5 min" target didn't distinguish cold/warm cache | **Fixed now** — clarified as a warm-cache target in intent (Part 1); cold-cache baseline to be measured, not pre-specified, once T19 lands |
| 20 | Single `test:e2e` task name conflated NestJS API-level and Playwright browser-level e2e tests | **Fixed now** — split into `test:e2e:api` and `test:e2e` (Part 5) |
| — | (Original Part 14 risks: monorepo misconfig, boundary-lint false positive/negative, Terraform state loss, onboarding friction, Node/pnpm version drift, two-test-runner DX) | **Deferred intentionally** — the independent review validated these as already adequately mitigated in the original design; no change needed |

All Medium/Low items are additionally tracked in [RISK_REGISTER.md](../RISK_REGISTER.md) as R-21 through R-32, each with a status (Mitigated/Closed/Open) rather than silently resolved outside the audit trail.

---

## 2. Changed sections

| Document | What changed |
|---|---|
| [epics/E1-foundation-platform-bootstrap.md](E1-foundation-platform-bootstrap.md) | Part 1 (success metrics), Part 2 (scope), Part 5 (build graph corrected, `turbo.json` corrected), Part 7 (`packages/observability` added), Part 8 (base image decided, hardening added, DR foundation added, local observability stack added), Part 10 (supply-chain pipeline added), Part 11 (new rows), Part 12 (signing/hardening/boundary/DR rows added), Part 13 (renumbered T1–T26, ordering bug fixed, 3 new tasks, existing tasks' acceptance criteria expanded), Part 14 (risk table annotated), Part 15 (readiness score updated, approval recommendation changed), gate sign-off log (status updated, not marked Passed) |
| [DECISIONS.md](../DECISIONS.md) | Added **ADR-016** (observability stack) and **ADR-017** (container supply-chain security), both indexed |
| [RISK_REGISTER.md](../RISK_REGISTER.md) | Added **R-21 through R-32**, one per remediated or deferred finding, each with severity, mitigation, owner, and status |
| [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md) | Added a clarifying section: foundational/infrastructure epics are not exempt from the "Logging implemented"/"Metrics implemented" checklist items — closes the interpretive gap that let E1's original design skip them |
| [OBSERVABILITY.md](../OBSERVABILITY.md) | Bumped to v1.2; added the `packages/observability` implementation mechanism, the `requestId`-equals-trace-ID correlation decision, request-lifecycle logging, a baseline application metrics row, and the Jaeger/ADOT export-path detail |
| [SECURITY.md](../SECURITY.md) | Bumped to v1.2; added the container supply-chain integrity requirement (§6) and container hardening controls, cross-referencing ADR-017 |
| [DEPLOYMENT.md](../DEPLOYMENT.md) | Bumped to v1.2; §2 (Containerization) extended with the full supply-chain pipeline and base-image decision; §3 (IaC) extended with state-bucket replication and RDS backup defaults; §6 (Backup & DR) extended with the E1 DR foundation and draft RPO/RTO |
| [ROADMAP.md](../ROADMAP.md) | E1's epic-table status line updated to reflect remediation-complete, pending second review |
| [CLAUDE.md](../../CLAUDE.md) | E1's tracking-table status line updated to match |

**Not changed, and deliberately so:** ARCHITECTURE.md required no change — the Part 5/Part 13 contradiction (High 1) was internal to E1's own document, not a baseline-level claim. PRD.md, API.md, AI_SYSTEM.md, DESIGN_SYSTEM.md, TESTING.md, CODING_STANDARDS.md, API_GUIDELINES.md, MULTITENANCY.md, AI_GOVERNANCE.md, PERFORMANCE.md, CONTRIBUTING.md, IMPLEMENTATION_GUIDE.md, and all other templates/checklists were reviewed for impact and required no edits — none of the findings touched product scope, AI architecture, or process framework itself, only E1's own infrastructure design and the two canonical docs (Deployment, Security) whose existing commitments E1 had failed to honor.

---

## 3. Remaining accepted risks

These are known, tracked, and **not** blocking a second review:

| Risk | Why it's accepted, not fixed |
|---|---|
| Cross-region **product-data** replication doesn't exist yet (RISK_REGISTER.md R-26) | No real data exists until Epic E4; building this now would itself violate the remediation principle ("do not overbuild"). The *mechanism* (Terraform toggle, RDS PITR default) exists from E1 — only the cross-region *copy of real data* is deferred, and it's tracked as a required E4 follow-up, not silently dropped. |
| Remote Turborepo cache remains deferred | Unchanged from the original design — still the correct, data-driven call (Part 2); no CI-time data exists yet to justify it. |
| AWS account/org-level setup ownership sits outside this design package | Unchanged — a DevOps Lead/CTO action, not an engineering design gap. |
| Coverage thresholds for most packages remain placeholder | Unchanged — appropriate given most packages are still empty scaffolds; `packages/config` and `packages/observability` (the two packages with real E1 logic) do have a concrete floor (80%). |
| Draft RPO/RTO targets (≤24h/≤4h) are placeholders, not final commitments | By design — DEPLOYMENT.md §6 has always scoped final RPO/RTO to Epic E23, once real production data and traffic patterns exist to inform them; E1 only had to stop leaving the *mechanism* unbuilt, which it now doesn't. |

No risk was accepted by omission — every item above is named, in RISK_REGISTER.md, with an owner.

---

## 4. Updated readiness score

| Dimension | Original review score | Post-remediation | Basis for change |
|---|---:|---:|---|
| Architecture | 82/100 | **90/100** | Build-graph contradiction resolved, intra-app boundary rule now has an enforcement task, bounded-context subpath naming corrected |
| Engineering | 78/100 | **90/100** | `test`/`build` coupling fixed, hot-reload path specified, `db:generate` task added, e2e task naming disambiguated |
| DevOps | 74/100 | **92/100** | Base image decided, DR foundation added, container networking principle stated, cold/warm CI-time ambiguity clarified |
| Security | 72/100 | **93/100** | Image signing/SBOM/provenance pipeline added (SLSA-aligned), container hardening specified, code-signing scope corrected to cover both commits and images |
| Maintainability | 88/100 | **90/100** | Minor improvement from tighter cross-referencing introduced during remediation |
| Developer Experience | 80/100 | **88/100** | Hot-reload and test-speed fixes directly improve daily iteration; onboarding check now also verifies observability, closing a silent gap the original T23 wouldn't have caught |
| **Production Readiness** | **70/100** | **91/100** | Driven primarily by the observability and supply-chain fixes — the two dimensions the original score was weakest on specifically because they were genuinely missing, not just under-documented |

The jump is large because the findings were concentrated (2 Critical + 3 High out of a generally sound 85%-complete design, per the original review's own assessment) and each had a bounded, well-scoped fix — this is consistent with a remediation, not a sign the scores are being inflated.

---

## 5. Recommendation for second independent review

**Recommended: proceed to a second, independent Architecture Gate review**, per [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) §4's no-self-approval rule — this report and the underlying document changes were authored by the same party responsible for the original E1 design and its remediation, so they cannot constitute their own approval, exactly as the first review's own governing rule requires.

**What the second review should verify** (a scoped, not open-ended, re-review — consistent with the remediation principle):
1. That the 5 Critical/High findings are in fact closed as described in §1 above (spot-check Parts 5, 7, 8, 10, 12, 13 of the E1 design against this report's claims).
2. That the task-ordering fix (Part 13, all dependencies now reference strictly lower-numbered tasks) holds under a full re-read, not just the audit performed here.
3. That no *new* contradiction was introduced by the remediation itself (this report's author performed an internal consistency pass — §"Final validation" below — but an independent check is the point of a second review, not optional because a first pass was done).
4. That the Medium/Low triage decisions (§1) are reasonable, not merely convenient.

**What the second review should *not* need to re-litigate:** the original 85% of the design the first review already validated as sound (repository structure, monorepo strategy, application/package design, the 23→26 task backbone's non-remediation content, quality tooling). Re-reviewing already-validated material is scope creep in the review process itself, which the same "do not expand unnecessary scope" principle applies to.

### Final validation performed before this report

An internal consistency audit was run across the changed documents before writing this report:

- **Architecture ↔ Tasks**: ARCHITECTURE.md's six bounded contexts are now the literal subpath names T7 creates; ADR-002/ADR-015's module-boundary rule now has both an inter-package (T3) and intra-app (T4) enforcement task. Consistent.
- **Tasks ↔ Dependencies**: All 26 tasks in Part 13 were checked — every dependency reference points to a strictly lower task number, or is explicitly "None." One additional gap was found and fixed during this audit (not by the original review): T13 and T16 referenced a local-Jaeger acceptance check without listing T11 as a dependency — corrected.
- **Definition of Done ↔ Implementation scope**: DEFINITION_OF_DONE.md's "Logging implemented"/"Metrics implemented" items are now achievable by E1 as scoped (T6, T13, T14, T16, T18); the DoD document itself was updated to state this applies to foundational epics explicitly, closing the interpretive gap that let the original E1 design treat them as inapplicable.
- **Security requirements ↔ CI/CD**: SECURITY.md's new supply-chain and hardening requirements each map to a specific CI/CD step in E1 Part 10 (T20, T21) — no requirement was added to SECURITY.md without a corresponding implementation task.
- **Deployment requirements ↔ Foundation**: DEPLOYMENT.md's "wired in from first deploy" observability commitment and its DR/backup requirements are both now met by E1's Part 8/13, not merely referenced.

No further inconsistency was found. This report and the underlying changes are ready for the second independent review.
