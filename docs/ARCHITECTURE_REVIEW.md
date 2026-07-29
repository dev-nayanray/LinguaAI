# LinguaAI — Architecture Review Gate (Draft v1 → v1.1 Review)

> **ARCHIVED — SUPERSEDED.** This document is a **temporary review artifact**, preserved for historical record only. Every finding, ADR-worthy decision, and roadmap item below has been triaged and merged into the canonical documentation as of the v1.1 Architecture Consolidation pass. **Do not treat this document as current** — for the authoritative, up-to-date state of the architecture, see:
> - **[BASELINE.md](BASELINE.md)** — the current Architecture Baseline Report (supersedes Part 10 of this document)
> - **[DECISIONS.md](DECISIONS.md)** — the ADRs that resolved this review's 8 blockers
> - **[RISK_REGISTER.md](RISK_REGISTER.md)** — supersedes this document's risk framing
> - **[CHANGELOG.md](CHANGELOG.md)** — the dated history of how this review's findings were consolidated
> - **[ROADMAP.md](ROADMAP.md)** — supersedes Parts 8–9 (implementation epics, MVP classification) with the current, living version
>
> Findings referenced elsewhere in the docs as "(Architecture Review)" or "(Part N finding)" point back to the sections below for original context.

Status: **Archived (was: Review complete — findings pending triage/approval)** · Reviewers: CTO, CPO, Principal Solution Architect, Lead UX Architect, Principal Backend Engineer, Principal Frontend Engineer, AI Platform Architect, Database Architect, DevOps Architect, Security Architect, QA Lead · Reviewed: 2026-07-29 · Archived: 2026-07-29

## How to use this document

This is a **gate**, not a rewrite. It reviews the Draft v1 foundation (`docs/PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `AI_SYSTEM.md`, `DESIGN_SYSTEM.md`, `SECURITY.md`, `DEPLOYMENT.md`, `ROADMAP.md`, `TESTING.md`) and records what's missing or risky before implementation starts. Findings here are **not yet applied** to the source docs — Part 10 lists what must be resolved before coding begins; everything else is triaged in Part 9 and should be merged into the relevant `docs/*.md` file as a follow-up pass once prioritized, per the documentation-currency rule in `CLAUDE.md`.

No application code, scaffolding, or new packages are produced in this pass.

---

## PART 1 — PRODUCT REVIEW

### Missing product requirements
- **Trial and refund/dunning mechanics** — no free-trial model, no failed-payment dunning flow, no refund policy defined. Every SaaS with Stripe billing needs this specified before `Subscription Platform` is built, not discovered mid-implementation.
- **TEACHER role scope pre-Marketplace** — the `TEACHER` role exists at MVP (module 1) but Teacher Marketplace (module 18) is Growth-phase. What can a TEACHER actually do for the ~2 phases before Marketplace ships? Undefined role is worse than no role.
- **Referral / viral growth loop** — Duolingo's dominant CAC channel is absent from all 30 modules. For a consumer product citing Duolingo as a positioning anchor, this is a conspicuous gap.
- **Re-assessment policy** — `ProficiencyLevel` can go stale; there's no product rule for when/how a user is re-assessed (time-based, performance-triggered, or user-initiated).
- **Multi-target-language support** — can one user learn two languages concurrently? PRD implies single active language per journey but never states the constraint explicitly.
- **UI (interface) language vs. target (learning) language** — conflated throughout. "10 launch languages" (PRD §8) — are these 10 UI languages, 10 target languages, or both? This blocks Design/Engineering from scoping i18n work.
- **Self-service data export UX** — GDPR export is a backend capability in SECURITY.md but has no defined product surface (where does a user click "download my data"?).
- **Content governance for Marketplace** — no review/approval workflow defined for teacher-authored content before it reaches learners.

### Missing user flows
- Password reset / account recovery.
- Downgrade/cancel-subscription flow (only upgrade — Journey D — is specified).
- Concurrent multi-device session handling (web + mobile simultaneously).
- Offline-to-online sync conflict resolution (mobile offline mode is a module; sync semantics aren't).
- Content/abuse reporting flow as a *user-facing* flow (SECURITY.md covers moderation backend, not the report button/flow).
- Re-engagement flow for users who abandon assessment mid-way (drop-off is instrumented per PRD Journey A, but no recovery flow is defined for what happens next).
- Enterprise roster sync / bulk invite (CSV or SCIM) — required before any real enterprise pilot.

### Missing edge cases
- Low-confidence/inconclusive AI assessment result — no fallback UX defined.
- Target language change mid-course — does progress migrate, reset, or fork?
- Family plan: primary payer cancels — do dependent child accounts get orphaned, downgraded, or grace-held?
- Timezone travel mid-streak — ARCHITECTURE.md flags this as a technical concern; no *product* policy (grace window? UTC-locked streak day?) is defined to implement against.
- Hardware-less fallback matrix — DESIGN_SYSTEM.md states voice features need text equivalents, but PRD never enumerates which features degrade (and how) without mic/camera access.
- Concurrent content editing by two admins/teachers on the same lesson — no conflict policy.

### Missing enterprise features
SSO enforcement policy (optional vs. mandatory per org), SCIM/HR-system provisioning, custom branding/white-labeling, per-department reporting rollups, seat reassignment, and a defined support/SLA tier are all absent from module 20's MVP-adjacent scope. None block MVP, but Enterprise-phase entry criteria (ROADMAP.md Phase 3) can't be met without them scoped in advance.

### Missing AI capabilities
- **AI-assisted content authoring** for admins/teachers (mentioned only as a PRD risk, never scoped as a capability) — this is likely required to hit "10 languages with complete A1–B2 content" (PRD §8 exit criterion) at reasonable cost.
- **Selectable AI teacher personality/tone** (strict vs. encouraging) — a known differentiator in this category, currently absent.
- **Proactive coaching nudges** ("you keep missing X in the evening, want a 2-minute drill?") — the Personalized Learning Engine is reactive (user opens app) rather than proactive; a meaningful engagement lever is unclaimed.
- **Code-switching / bilingual-aware tutoring** for users who mix languages mid-sentence — not addressed.

### Missing LMS capabilities (Enterprise)
Assignment due-dates and reminders, compliance-certification expiry tracking, manager-assigns-course-to-employee flow, and skills-gap-to-job-role reporting are all absent from module 20's spec.

### Missing monetization opportunities
Gift subscriptions, cosmetic in-app purchases (streak freezes, avatar items — a proven high-margin Duolingo revenue line), institutional bulk discounts distinct from per-seat Business pricing, and exam-voucher affiliate revenue are all unaddressed in PRD §7.

### Missing accessibility requirements
DESIGN_SYSTEM.md sets a WCAG AA bar, but PRD's per-journey acceptance criteria never reference it — accessibility reads as a design-system concern rather than a product acceptance gate. Recommend every journey in PRD §5 cross-reference the relevant DESIGN_SYSTEM.md §5 requirement explicitly.

### Missing localization requirements
No stated RTL support requirement despite Arabic being a highly likely launch/near-term language; no regional payment method requirements (iDEAL, Alipay, etc.) for a product explicitly positioned as "global"; no currency localization for pricing display.

### Missing analytics requirements
The single most important gap: **no instrumentation is defined to prove the product actually improves fluency** (re-assessment score deltas over time), despite "CEFR-level progression rate" being a named PRD §8 success metric. Also missing: an experimentation/A-B testing program (feature flags exist infrastructurally per ARCHITECTURE.md §8, but no product-owned experimentation process is defined), and content-performance analytics (which lessons have abnormal drop-off/failure rates) feeding back to content authors.

---

## PART 2 — ARCHITECTURE REVIEW

| Dimension | Assessment |
|---|---|
| Scalability | Sound defaults (stateless tier, Redis cache, BullMQ async) but **apps/api scope risk**: 20+ MVP modules in one deployable with no enforced internal boundaries is a real coupling risk as team size grows. |
| Maintainability | `packages/*` layering is good; **types/validation risk becoming god-packages** without domain subpaths (auth/, course/, ai/, billing/). |
| Domain boundaries | ARCHITECTURE.md describes services by *infrastructure* rationale, not by *bounded context*. No DDD-style context map exists — recommend adding one (Identity, Learning, AI Coaching, Commerce, Community, Enterprise) before module boundaries harden in code. |
| Service separation | `recommendation-engine` and `ai-engine` have an ambiguous split — both do "personalization." Undocumented boundary → likely duplicated logic. Recommend an explicit rule: `recommendation-engine` owns deterministic/algorithmic sequencing (SRS, next-best-activity scoring); `ai-engine` owns generative/LLM-mediated output. |
| Event-driven opportunities | Async today is point-to-point BullMQ enqueue calls, not a domain-event model. As Gamification, Analytics, and Notifications all end up reacting to the same underlying events (lesson completed, session ended, subscription changed), point-to-point coupling will multiply. Recommend a lightweight **domain-event catalog** (even over the same Redis/BullMQ transport) before a third consumer is added to any single producer. |
| API strategy | REST is the right default. Gap: no BFF (backend-for-frontend) or aggregation layer for admin/mobile dashboards — risk of dashboard over-fetching as UI complexity grows. Recommend a thin aggregation layer scoped to dashboard reads only, not a wholesale GraphQL migration. |
| Multi-tenancy readiness | Row-level `organizationId` tenancy is the right MVP choice, but DATABASE.md doesn't specify **enforcement mechanism**. App-layer-only filtering (a missed `WHERE organizationId = ...`) is a realistic cross-tenant leak vector. Recommend Postgres Row-Level Security as defense-in-depth, designed for now even if enabled closer to Enterprise phase. |
| Future microservice migration | Extraction rationale exists per-service, but no **extraction-readiness criteria** are defined (e.g., "Gamification becomes a service when leaderboard write QPS contends with core OLTP"). Without a trigger, extraction decisions become political rather than data-driven. |
| AI platform extensibility | Gateway pattern is correct. No **tool registry** (versioned, scoped tool definitions agents can call) is specified — AI_SYSTEM.md states agents have "a bounded tool surface" but not how that surface is declared, versioned, or audited. |

**Architectural risks ranked:**
1. `apps/api` module-boundary erosion as 20+ modules land without enforced internal contracts (dependency-graph lint, e.g., `madge`/Nx boundaries, not yet specified).
2. Tenant isolation is app-layer-only — no RLS defense-in-depth.
3. `recommendation-engine` / `ai-engine` boundary ambiguity → duplicated personalization logic.
4. No domain-event catalog → hidden N:M coupling as consumers multiply.
5. No BFF/aggregation layer → dashboard performance debt accrues silently.

---

## PART 3 — DATABASE REVIEW

### Missing entities
`NotificationPreference` (granular per-channel opt-in — `NotificationLog` records delivery, not preference), `DeviceToken` (push registry), `ContentReport`/`ModerationAction` (community moderation), `ConsentRecord` (explicit GDPR/COPPA consent audit trail, distinct from `AuditLog`), `Coupon`/`Discount`, `League`/`Cohort` (leaderboard scoping is referenced in DATABASE.md §2.6 but has no owning entity), and forward-reserved `TeacherProfile`/`TeacherPayout`/`ApiKey` for Growth/Future modules (worth reserving schema space now to avoid a painful later migration).

### Missing relationships
`Certificate` doesn't explicitly link to the `Course`/`ExamProgram`/milestone that triggered it. `LeaderboardEntry.league` has no foreign key target until `League`/`Cohort` exists (above). `Subscription.organizationId` (Business plan) vs. individual `User` billing ownership needs an explicit, documented precedence rule — currently implied, not modeled.

### Normalization issues
`ProficiencyLevel` overwrites in place — there's no `ProficiencyLevelHistory`, which is exactly the data needed to prove the "CEFR-level progression rate" success metric (Part 1 analytics gap). Recommend an append-only history table, not just a current-state row.

### Index strategy
Composite indexes for hot dashboard paths are well covered. Missing: full-text/trigram indexes for admin content search and community moderation search — both are named admin/moderation use cases with no index plan.

### Partitioning strategy
`LearningEvent`/`AIUsageLog` monthly partitioning is specified. **`AIMessage` (raw conversation transcripts) is not** — it will be the largest-volume, most PII-sensitive table in the system and currently has no partitioning, retention, or field-level-encryption plan distinct from the generic PII statement in DATABASE.md §5. This deserves its own explicit treatment given its risk profile.

### Audit logging
`AuditLog` covers admin actions. No explicit **billing audit trail** (entitlement changes, refunds, plan changes) is specified — needed for dispute resolution and financial compliance, not just security review.

### Soft delete policy
Not specified anywhere. Two distinct mechanisms are currently conflated: (a) reversible soft-delete for content/community entities (`deletedAt`), and (b) GDPR-driven hard-delete/anonymization for PII erasure. Recommend the two be explicitly separated per-entity in DATABASE.md.

### Versioning strategy
`ContentVersion` covers course content. `AIMemoryEntry` has no `embeddingModelVersion` column despite AI_SYSTEM.md §9 stating embedding-model version is pinned per deployment — the schema doesn't yet reflect that constraint, which is exactly the kind of silent-drift risk AI_SYSTEM.md itself warns against.

### Data retention
Stated qualitatively ("finite, configurable") with no concrete numbers or per-category matrix (assessment audio vs. conversation transcripts vs. analytics events have very different appropriate retention windows). Recommend a retention matrix as a required addition before any user data is collected in staging with real users.

### GDPR compliance
Erasure/export conceptually covered. Missing: consent **versioning** (which privacy-policy version a user consented to, and when — needs `ConsentRecord`), data-residency tagging (relevant once multi-region is considered per ARCHITECTURE.md §9), and a defined portable-export schema (machine-readable format, not just "export capability exists").

---

## PART 4 — DESIGN SYSTEM REVIEW

| Dimension | Assessment |
|---|---|
| Brand consistency | Strong token discipline. One gap: AI-purple as the *sole* signal for "this is AI" fails WCAG 1.4.1 (use of color) for colorblind users (deuteranopia particularly affects purple/blue discrimination) — needs a persistent icon/label pairing, not color alone. |
| Accessibility | Good baseline (contrast, keyboard nav, audio transcripts). Two concrete misses: no `prefers-reduced-motion` handling for gamification celebration animations, and no aria-live strategy for token-by-token AI chat streaming — naive streaming text is close to unusable for screen-reader users without throttled live-region announcements. This is a P0-level component requirement, easy to miss until a real screen-reader test happens post-build. |
| Mobile-first | Breakpoints are defined but there's no stated authoring direction (mobile-first vs. desktop-first). Given category precedent (majority of language-learning usage is mobile), recommend mandating mobile-first component authoring explicitly. |
| Component completeness | Missing from the §4 inventory: pronunciation comparison UI (user vs. native-speaker waveform/score diff), onboarding/wizard stepper, paywall/upgrade modal (functionally required by PRD Journey D, never listed as a component), admin data table, date/time picker (exam date, goals), file/image upload (camera translation, avatars). |
| Design token strategy | Color and type scales are specified; **spacing, elevation/shadow, border-radius, and z-index scales are not** — these are foundational tokens that block any component build, not a later nicety. |
| Motion guidelines | Explicitly deferred in Draft v1. Risk: gamification (XP toasts, streak celebrations, level-ups) is core competitive positioning against Duolingo and cannot be built without at least motion *principles* (duration/easing defaults, reduced-motion fallback), even if full choreography is still deferred. |
| Empty states | The four-state principle (loading/empty/error/success) is well established, but there is no empty-state content inventory — 30 modules × an empty state each is a real content workload with no owner assigned yet. |
| Error states | Principle is sound (API.md error envelope → UI mapping); no catalog of user-facing error copy per error `code` exists yet. |
| AI interaction patterns | Chat bubble and streaming-renderer are named; missing: "thinking vs. typing" state distinction, mid-stream failure recovery UI, a formal voice-session state machine (listening/processing/speaking/idle), and inline correction/diff UI (strikethrough + replacement) — the last is central to Grammar/Writing Coach UX and currently unspecified as a component. |
| Dashboard consistency | Learner/admin/enterprise dashboards are described as "responsive grid shells" independently; no shared dashboard-grid/widget primitive is defined, risking three divergent implementations of the same pattern. |

---

## PART 5 — AI PLATFORM REVIEW

- **AI architecture**: gateway pattern is the right call. Missing: a documented internal request/response contract between `apps/api` and `ai-engine` (API.md specs the *external* API; the internal gateway contract is currently implicit).
- **Agent orchestration**: persona-based agents are defined, but there's **no multi-agent handoff protocol**. Concretely: if the Conversation Partner detects a recurring grammar error mid-conversation, does it silently note it, hand off to the Grammar Coach, or ignore it? This is a consequential, currently-undecided design choice that affects memory continuity, latency, and cost — it should be resolved before agent implementation, not discovered during it.
- **Prompt management**: versioning is specified. Missing: prompts aren't explicitly included in the staging→production promotion gate in DEPLOYMENT.md — a prompt change is a production behavior change and should go through the same pipeline as code, not be deployed out-of-band.
- **Context management**: token-budget-bounded memory injection is specified for session start, but there's no strategy for **long-running session context** (a 20-minute conversation practice session can exceed a model's context window) — needs a rolling-summarization strategy.
- **Memory lifecycle**: consolidation and GDPR deletion are covered. Missing a **decay/confidence model** — an unreinforced "struggles with subjunctive" note from 8 months ago shouldn't carry the same weight as one from last week; without decay, personalization quality silently degrades over time.
- **RAG readiness**: memory retrieval via pgvector is specified, but there's **no RAG layer for pedagogical/rubric content** (actual IELTS band descriptors, actual grammar rules). Agents currently appear to rely on parametric LLM knowledge for factual content — a meaningful hallucination risk specifically for the Exam Coach and Grammar Coach, where factual accuracy is the entire value proposition. This is the single highest-priority AI gap in the review.
- **Model abstraction**: `ModelProvider` interface is sound; minor note that provider-specific streaming semantics need a normalizing layer, not just a shared method signature.
- **Cost optimization**: tiering, streaming, and caching are well specified. Missing a **platform-level cost circuit breaker** — per-user entitlements cap individual abuse, but nothing caps aggregate/runaway cost from a provider pricing change or a systemic bug. This is an operational, not just a product, safeguard.
- **AI safety**: automated filtering is specified. Missing a **human-in-the-loop sampling process** — a defined percentage of agent outputs reviewed by humans for quality/safety, particularly pre-launch, rather than relying solely on automated filters from day one.
- **Hallucination mitigation**: not explicitly addressed anywhere in AI_SYSTEM.md today. Recommend three concrete mitigations: (1) RAG grounding for factual content (above), (2) confidence flagging on uncertain corrections rather than false confidence, (3) explicit factual-accuracy cases in the golden-set regression suite (TESTING.md §3), not just tone/structure checks.
- **Educational accuracy**: no named human accountability process (e.g., a linguist/pedagogy review board) for agent system prompts and course content exists. For a product whose entire premise is "this AI teaches you correctly," this needs a human owner, not just an engineering-owned prompt file.
- **Speech pipeline**: latency budget is well specified. Missing an explicit **accent/dialect coverage and fairness strategy** — which regional accents are supported at launch per language, and how pronunciation scoring avoids penalizing valid dialectal variation rather than only "native-like" pronunciation. This is both a quality and a fairness/bias risk.

---

## PART 6 — SECURITY REVIEW

| Dimension | Assessment |
|---|---|
| Authentication | MFA is "ready" but not required anywhere. Recommend **mandatory MFA for `ADMIN`/`ENTERPRISE_ADMIN`** before launch — these are the highest-value account-takeover targets in the system. |
| Authorization | Reinforces Part 2's finding: app-layer-only tenant filtering is a security-critical gap, not just an architectural one. |
| Secrets management | Solid (Secrets Manager, rotation). Gap: only nightly/CI-level secret scanning is specified — recommend adding pre-commit secret scanning (shift-left, catches leaks before they hit history at all). |
| Rate limiting | Specified at API and AI-usage-entitlement level, but doesn't state the limiter is Redis-backed/shared — without that, per-instance in-memory limiting would be trivially bypassable across a horizontally-scaled fleet (which ARCHITECTURE.md commits to). Should be explicit. |
| Abuse prevention | Gamification anti-gaming is named once in a PRD table cell and never detailed (bot-farmed XP/streaks, referral fraud if a referral program is added per Part 1). Needs a dedicated subsection. |
| Prompt injection protection | Input-side handling is covered well. Missing: **output-side sanitization** — AI-generated text rendered as rich content (markdown, potential HTML) is a real injection/XSS-adjacent surface if the model is tricked into emitting unsafe markup that the client then renders unsanitized. |
| API security | CORS/CSRF/headers are covered. Missing: scraping/bot protection for commercially valuable content endpoints (course/vocabulary content) — recommend WAF-level bot mitigation. |
| Encryption | At-rest/in-transit is covered. Missing: a stated key-management/rotation policy for field-level encryption keys (KMS envelope encryption ownership, rotation cadence). |
| Compliance | COPPA is correctly flagged as launch-blocking for Family plan. Missing: app-store-specific child-safety policies (Apple/Google have kids-category requirements distinct from COPPA itself), relevant given the Mobile module. |

**Critical security risks, ranked:**
1. Tenant isolation is app-layer-only (no RLS) — realistic cross-tenant data leak path for Enterprise data.
2. No mandatory MFA for privileged (`ADMIN`/`ENTERPRISE_ADMIN`) roles.
3. `AIMessage` (conversation transcripts) is high-volume, high-sensitivity PII with underspecified retention/encryption treatment relative to its risk.
4. No platform-level AI cost circuit breaker (financial/DoS-via-cost exposure).
5. No output-side sanitization requirement for AI-generated rich content.
6. COPPA/parental-consent flow is named as a requirement but not yet designed in implementable detail.

---

## PART 7 — DEVOPS REVIEW

- **CI/CD**: pipeline structure (lint/test/build → staging → gated production) is sound. Missing: **canary/progressive rollout specifically for `ai-engine`** — a bad prompt or model-routing change has product-quality blast radius that differs from a typical backend bug and deserves its own rollout gate tied to golden-set evaluation results (TESTING.md §3), not just generic health checks.
- **Docker architecture**: multi-stage builds and ECR are appropriate. Missing: explicit container image vulnerability scanning (Trivy/Grype) as a build-gate step, distinct from the general "security-scan.yml" dependency scan already specified.
- **Environment strategy**: dev/staging/production is sufficient structurally. Missing: **ephemeral per-PR preview environments** — for a UI-heavy, 30-module product, preview deploys would materially speed up design/QA review cycles and are now standard practice at this product's stated engineering bar.
- **Monitoring/Logging/Tracing**: comprehensive tooling choices (OTel, Sentry, CloudWatch). Missing: **no starting SLO/error-budget targets are defined** — alerting thresholds are described as "reviewed as scale" rather than anchored to a concrete initial SLO (e.g., API 99.9% availability, defined p95 latency targets), which alerting needs from day one to be meaningful rather than arbitrary.
- **Backups/DR**: Multi-AZ RDS with point-in-time recovery is a good baseline but is **not** disaster recovery against a regional AWS outage. Recommend cross-region snapshot replication as a minimum DR posture, ahead of and independent from any future multi-region *active* expansion.
- **Cost optimization**: not addressed in DEPLOYMENT.md at all beyond implicit infra choices. Recommend: Fargate Spot for non-critical/batch workloads (e.g., `recommendation-engine` nightly jobs), and — most importantly — **AI provider cost (AI_SYSTEM.md's cost meter) should feed the same DevOps cost dashboards as infrastructure spend**, not be tracked as a separate, disconnected concern, since it will likely be the largest single variable cost line (PRD.md §7, §9).

---

## PART 8 — IMPLEMENTATION ROADMAP (EPICS)

Epics are sequenced for the MVP phase (ROADMAP.md Phase 1) unless marked otherwise. Complexity: S / M / L / XL.

### E1 — Foundation & DevOps Bootstrap
- **Objective**: Stand up the monorepo toolchain, CI/CD pipelines, base Terraform modules, and environments (dev/staging/prod) for real.
- **Business value**: Nothing else ships without this; determines team velocity for every subsequent epic.
- **Dependencies**: None (first epic).
- **Complexity**: L
- **Acceptance criteria**: `pnpm dev`/`build`/`test`/`lint` work across all workspaces; CI runs on every PR; staging deploy is automatic on merge to `main`; production deploy requires manual approval.
- **Risks**: Under-investing here compounds into every later epic's velocity.
- **Deliverables**: Turborepo config, base Dockerfiles, Terraform network/data/compute modules, GitHub Actions workflows, preview-environment support (Part 7 finding).

### E2 — Identity & Access Platform
- **Objective**: Registration, login, social auth, RBAC, session management (module 1).
- **Business value**: Blocks every authenticated feature; also the highest-value attack surface (SECURITY.md).
- **Dependencies**: E1.
- **Complexity**: L
- **Acceptance criteria**: Email + Google + Apple auth work end-to-end; MFA available and mandatory for ADMIN/ENTERPRISE_ADMIN (Part 6 finding); session revocation works; RLS or equivalent tenant isolation enforced (Part 2/6 finding), not deferred.
- **Risks**: Tenant isolation shortcuts taken here are expensive to retrofit later.
- **Deliverables**: `User`/`OAuthAccount`/`Session` schema, auth module in `apps/api`, auth UI in `apps/web`.

### E3 — Design System & Component Library v1
- **Objective**: Tokens (color, type, spacing, elevation, radius, z-index — Part 4 finding) and the core component set in `packages/ui`.
- **Business value**: Every screen in every later epic depends on this; rework here is the most expensive kind.
- **Dependencies**: E1.
- **Complexity**: M
- **Acceptance criteria**: All four required states (loading/empty/error/success) built into base components; WCAG AA validated; Storybook coverage per component (TESTING.md).
- **Risks**: Motion/animation principles (Part 4) must be at least minimally defined here, or gamification components in E14 will be built inconsistently.
- **Deliverables**: Token set, button/form/card/nav primitives, dashboard-grid primitive, paywall modal, data table.

### E4 — Database Schema & Core Data Layer
- **Objective**: Full Prisma schema covering identity, content, gamification, billing, and the entities identified as missing in Part 3.
- **Business value**: Schema mistakes are the most expensive to fix post-launch (migrations against live user data).
- **Dependencies**: E1.
- **Complexity**: L
- **Acceptance criteria**: Schema includes `ProficiencyLevelHistory`, `ConsentRecord`, `NotificationPreference`, `League`/`Cohort`, and explicit soft-delete vs. hard-delete policy per entity (Part 3 findings); `AIMessage` has a defined partitioning/retention/encryption plan.
- **Risks**: Retrofitting the Part-3 missing entities after other epics have shipped against the old schema is costlier than including them now.
- **Deliverables**: `packages/database` schema, migrations, seed scripts.

### E5 — AI Gateway & Agent Orchestration Core
- **Objective**: The `ai-engine` gateway, provider adapters, prompt manager, and the multi-agent handoff protocol (Part 5 finding — must be decided here, not left implicit).
- **Business value**: Every AI-facing feature (E6, E10–E13, E19) depends on this being right once, not per-feature.
- **Dependencies**: E1, E4.
- **Complexity**: XL
- **Acceptance criteria**: Internal gateway contract documented; agent handoff protocol decided and documented; cost circuit breaker implemented (Part 5/6 finding); prompts included in the staging promotion gate (Part 7 finding).
- **Risks**: This is the epic most likely to be under-scoped if treated as "just call an LLM API."
- **Deliverables**: `services/ai-engine`, `AIUsageLog` metering, golden-set evaluation harness (feeds TESTING.md §3).

### E6 — AI Language Assessment Engine
- **Objective**: Adaptive placement testing across 6 skill areas (module 2).
- **Business value**: First AI moment a user experiences; drives activation (PRD §8).
- **Dependencies**: E4, E5.
- **Complexity**: L
- **Acceptance criteria**: Completes in ≤15 min; produces per-skill CEFR + confidence; low-confidence fallback UX defined (Part 1 finding); writes to `ProficiencyLevelHistory`, not just current state.
- **Risks**: CEFR-alignment validity (PRD §9) — recommend human-rater validation before marketing "accurate."
- **Deliverables**: Assessment flow, scoring engine, roadmap generator.

### E7 — Personalized Learning Engine
- **Objective**: Daily goals, adaptive curriculum, weakness detection (module 3), owned by `recommendation-engine` with the boundary from `ai-engine` made explicit (Part 2 finding).
- **Business value**: The daily-return mechanic — directly drives D7/D30 retention (PRD §8).
- **Dependencies**: E4, E6.
- **Complexity**: L
- **Acceptance criteria**: Curriculum measurably changes in response to performance; re-assessment trigger policy implemented (Part 1 finding).
- **Risks**: Boundary drift with `ai-engine` if not enforced from the first PR.
- **Deliverables**: `services/recommendation-engine`, nightly plan-generation job.

### E8 — Course Management System
- **Objective**: Language→Course→Level→Unit→Lesson→Activity→Exercise hierarchy plus admin authoring (module 5), including AI-assisted authoring (Part 1 finding, required to hit 10-language content scope affordably).
- **Business value**: Without this, there is no content to personalize or gamify.
- **Dependencies**: E4.
- **Complexity**: XL
- **Acceptance criteria**: Non-engineers can author/publish content; `ContentVersion` prevents retroactive changes to a learner's in-progress history; concurrent-edit conflict policy implemented (Part 1 finding).
- **Risks**: Content pipeline throughput is the likely bottleneck to the 10-language MVP exit criterion.
- **Deliverables**: Content schema, admin authoring UI (feeds E18), content API.

### E9 — Vocabulary Intelligence (SRS)
- **Objective**: Flashcards, spaced repetition, personal dictionary (module 6).
- **Business value**: High-engagement, low-AI-cost feature — good margin contributor.
- **Dependencies**: E4, E8.
- **Complexity**: M
- **Acceptance criteria**: SM-2-derivative scheduling documented and testable; personal dictionary ingests from reading, camera, and conversation sources.
- **Risks**: Low — well-understood problem space.
- **Deliverables**: SRS scheduler, flashcard UI, personal dictionary.

### E10 — Speaking Practice & Speech Pipeline
- **Objective**: Real-time AI conversation (module 7) — STT/TTS streaming via `services/speech-service`.
- **Business value**: The signature "personal AI teacher" moment; core differentiator vs. Babbel/Duolingo.
- **Dependencies**: E5.
- **Complexity**: XL
- **Acceptance criteria**: p95 round-trip ≤2.5s (AI_SYSTEM.md §6); graceful text-only degradation; WebSocket reconnection/session-resumption (API.md §7) tested against simulated drops (TESTING.md §4).
- **Risks**: Latency budget is aggressive and provider-dependent — de-risk with a provider spike before committing the full epic.
- **Deliverables**: `services/speech-service`, conversation session UI, fluency scoring.

### E11 — Pronunciation Lab
- **Objective**: Phoneme-level scoring and correction (module 8), including accent/dialect fairness handling (Part 5 finding).
- **Business value**: Premium-tier differentiator (PRD §7).
- **Dependencies**: E10.
- **Complexity**: L
- **Acceptance criteria**: Below-word-level feedback; documented accent-coverage matrix per language at launch.
- **Risks**: Fairness/bias risk if dialectal variation is scored as "wrong" — needs explicit QA sign-off, not just automated metrics.
- **Deliverables**: Phoneme scoring model integration, comparison UI (Part 4 component gap).

### E12 — Listening & Reading Systems
- **Objective**: Modules 9–10 — AI-generated audio, dictation, leveled stories/articles, inline translation.
- **Business value**: Broadens the content surface beyond conversation; supports Persona 2 (hobbyist) engagement.
- **Dependencies**: E5, E8.
- **Complexity**: M
- **Acceptance criteria**: Content reading level matches user CEFR; multiple voices/accents per language.
- **Risks**: Low.
- **Deliverables**: Audio generation pipeline, reading content UI.

### E13 — Writing Assistant & AI Story Generator
- **Objective**: Modules 11–12 — grammar correction, essay/email scoring, personalized AI stories.
- **Business value**: Serves Persona 3 (exam candidate) directly; feeds vocabulary reinforcement loop.
- **Dependencies**: E5, E9.
- **Complexity**: L
- **Acceptance criteria**: Errors explained, not just flagged (RAG-grounded per Part 5 finding, not purely parametric); stories reuse the learner's active vocabulary set.
- **Risks**: Hallucination risk on grammar "rules" without RAG grounding (Part 5) — treat as a blocking dependency, not a nice-to-have.
- **Deliverables**: Writing Coach agent, inline correction/diff UI (Part 4 component gap), story generator.

### E14 — Gamification Engine
- **Objective**: XP, streaks, levels, badges, missions (module 15), with anti-gaming safeguards (Part 6 finding).
- **Business value**: Primary engagement/retention lever alongside E7.
- **Dependencies**: E4, E3.
- **Complexity**: M
- **Acceptance criteria**: Timezone-correct streak logic with an explicit grace-window policy (Part 1 finding); bot/farming abuse detection in place before public launch, not after.
- **Risks**: Anti-gaming is easy to deprioritize until abuse is already occurring — treat as launch-blocking, not fast-follow.
- **Deliverables**: XP/streak/badge schema and service logic, celebration UI (motion-aware per Part 4).

### E15 — Subscription & Billing Platform
- **Objective**: Free/Premium via Stripe (module 22, MVP scope), including trial, cancellation, and dunning flows (Part 1 finding).
- **Business value**: Revenue. The entire business model depends on this working correctly and being auditable.
- **Dependencies**: E2, E4.
- **Complexity**: L
- **Acceptance criteria**: Full journey D (PRD §5) plus cancellation/downgrade (Part 1 gap) implemented; webhook idempotency verified; `EntitlementChangeLog` audit trail (Part 3 finding) in place.
- **Risks**: Billing bugs are trust-destroying and hard to unwind — extra QA rigor justified here specifically.
- **Deliverables**: Stripe integration, entitlement resolution service, billing UI.

### E16 — Notification System
- **Objective**: Email + push, streak reminders (module 25), with granular preferences (`NotificationPreference`, Part 3 finding).
- **Business value**: Direct retention lever; also a compliance surface (unsubscribe honored).
- **Dependencies**: E4, E1.
- **Complexity**: M
- **Acceptance criteria**: Per-channel, per-type opt-in respected; delivery logged.
- **Risks**: Low.
- **Deliverables**: `services/notification-service`, preference center UI.

### E17 — Analytics Platform & Instrumentation
- **Objective**: Module 23, including the outcome-measurement instrumentation identified as the top Part 1 analytics gap (re-assessment score deltas over time).
- **Business value**: Without this, the company cannot prove the product works — the single most important MVP exit criterion (PRD §8) has no instrumentation without this epic.
- **Dependencies**: E4, E6.
- **Complexity**: L
- **Acceptance criteria**: `LearningEvent` pipeline live; CEFR-progression cohort reporting exists; content-performance (drop-off) reporting exists.
- **Risks**: Commonly deprioritized as "not user-facing" — flagged here explicitly as launch-critical, not optional.
- **Deliverables**: `services/analytics-service`, internal dashboards.

### E18 — Admin Platform
- **Objective**: Module 24 — user/content/AI management, reports.
- **Business value**: Unblocks E8 content operations and E15 billing support at scale.
- **Dependencies**: E2, E4, E8.
- **Complexity**: M
- **Acceptance criteria**: RBAC-gated; every admin action writes to `AuditLog` (including billing actions per Part 3 finding).
- **Risks**: Low.
- **Deliverables**: `apps/admin`.

### E19 — Exam Preparation System
- **Objective**: Module 19, initial exam program(s) with RAG-grounded rubric scoring (Part 5 finding — non-negotiable for this module specifically).
- **Business value**: Serves Persona 3 directly; high willingness-to-pay segment (PRD §4).
- **Dependencies**: E5, E13.
- **Complexity**: L
- **Acceptance criteria**: At least one full mock test scored against the exam's real, RAG-grounded rubric; historical score tracking.
- **Risks**: Scoring credibility is the entire value proposition here — hallucinated rubric application is a launch-blocking defect class for this module specifically.
- **Deliverables**: `ExamProgram`/`MockTestAttempt` schema, Exam Coach agent with RAG grounding.

### E20 — Certificate System
- **Objective**: Module 21 — completion certificates with public verification.
- **Business value**: Low engineering cost, meaningful perceived value and shareability (organic marketing surface).
- **Dependencies**: E8.
- **Complexity**: S
- **Acceptance criteria**: Publicly verifiable via unique URL; explicit link to the triggering milestone (Part 3 finding).
- **Risks**: Low.
- **Deliverables**: Certificate generation, public verification page.

### E21 — Mobile Application (Flutter parity)
- **Objective**: Module 28 — core learning loop on iOS/Android.
- **Business value**: Category-standard usage pattern is mobile-first; this is not optional for MVP credibility.
- **Dependencies**: E2–E17 (consumes the same contracts).
- **Complexity**: XL
- **Acceptance criteria**: Feature parity on the core loop (assessment, daily lesson, conversation practice); offline sync conflict policy implemented (Part 1 finding).
- **Risks**: May trail web by weeks per ROADMAP.md — acceptable if explicitly planned, risky if it silently slips.
- **Deliverables**: `apps/mobile`, mobile CI/release pipeline (DEPLOYMENT.md §8).

### E22 — Security Hardening & Compliance Gate
- **Objective**: Close every Part 6 critical finding — RLS, mandatory admin MFA, output sanitization, AI cost circuit breaker, COPPA consent flow — before public launch.
- **Business value**: Launch-blocking by definition; also the highest-downside-risk epic if skipped.
- **Dependencies**: Cross-cutting; touches E2, E4, E5, E15.
- **Complexity**: L
- **Acceptance criteria**: Every Part 6 "critical risk" item has a closed PR referencing it; penetration test scheduled (SECURITY.md §10) ahead of GA.
- **Risks**: The epic most likely to be compressed under launch-date pressure — recommend explicit executive sign-off gate, not just engineering self-attestation.
- **Deliverables**: RLS policies, MFA enforcement, sanitization middleware, cost circuit breaker, consent flow.

### E23 — Public Beta Launch Readiness
- **Objective**: Cross-cutting hardening pass — load testing, SLO definition (Part 7 finding), cross-region backup replication (Part 7 finding), incident response runbook (SECURITY.md §9).
- **Business value**: Converts "feature-complete" into "safe to put real users and real payments through."
- **Dependencies**: All prior epics.
- **Complexity**: M
- **Acceptance criteria**: SLOs defined and alerting tuned to them; DR restore tested at least once against a real snapshot; incident runbook exists and has been walked through.
- **Risks**: Commonly compressed at the end of a timeline — treat as a fixed-scope gate, not a flexible buffer.
- **Deliverables**: SLO doc, DR test report, on-call runbook.

### Growth/Enterprise-phase epics (scoped later, named now for dependency awareness)
E24 Community Platform (module 16) · E25 AI Translation Camera (module 13) · E26 Video Learning (module 14) · E27 Teacher Marketplace (module 18, depends on TEACHER-role decisions made in E2) · E28 Enterprise LMS (module 20, depends on E22's RLS work being in place) · E29 Public API Platform (module 27, depends on API.md's versioning discipline having been followed since E2).

---

## PART 9 — MVP DEFINITION

| Feature / Module | Classification | Rationale |
|---|---|---|
| User Identity Platform | **MVP** | Blocks everything |
| MFA enforcement (Admin/Enterprise) | **MVP** | Part 6 critical finding |
| AI Language Assessment Engine | **MVP** | Core value prop entry point |
| Personalized Learning Engine | **MVP** | Retention mechanic |
| AI Teacher Platform (7 agents) | **MVP** | Core value prop |
| Multi-agent handoff protocol | **MVP** | Must be decided before agents ship, not after |
| Course Management System | **MVP** | No product without content |
| AI-assisted content authoring | **MVP** | Required to hit 10-language content scope affordably |
| Vocabulary Intelligence (SRS) | **MVP** | Low-cost, high-engagement |
| Speaking Practice | **MVP** | Signature differentiator |
| Pronunciation Lab | **MVP** | Named premium differentiator in PRD §7 |
| Listening System | **MVP** | Core skill coverage |
| Reading System | **MVP** | Core skill coverage |
| Writing Assistant | **MVP** | Core skill coverage |
| AI Story Generator | **MVP** | Cheap to build once E5/E13 exist; strong engagement |
| RAG grounding for factual/rubric content | **MVP** | Blocking dependency for Exam Coach/Grammar Coach credibility |
| Gamification (XP/streaks/badges/missions) | **MVP** | Core engagement loop |
| Anti-gaming safeguards | **MVP** | Launch-blocking, not fast-follow (Part 6) |
| Subscription Platform — Free/Premium | **MVP** | Revenue |
| Cancellation/downgrade flow | **MVP** | Cannot launch billing without an off-ramp |
| Trial mechanics | **MVP** | Standard SaaS conversion lever, cheap to build with E15 |
| Analytics — outcome measurement (CEFR delta) | **MVP** | Proves the core PRD §8 success metric |
| Admin Platform (core) | **MVP** | Needed to operate content/support at launch |
| Notification System | **MVP** | Retention lever |
| Security System (full) | **MVP** | Non-negotiable |
| Mobile Application (core loop) | **MVP** | Category-standard usage pattern |
| AI Infrastructure (gateway, memory, model mgmt) | **MVP** | Foundational |
| Internal Platform Services | **MVP** | Foundational |
| Referral / viral growth loop | **Version 1.1** | High value, not launch-blocking; needs its own fraud-prevention design first |
| Cosmetic in-app purchases | **Version 1.1** | Monetization upside, not core value prop |
| Gift subscriptions | **Version 1.1** | Incremental revenue, low complexity |
| Proactive AI coaching nudges | **Version 1.1** | Engagement upside once baseline usage data exists to target nudges |
| Selectable AI teacher personality | **Version 1.1** | Differentiator, but not required for core loop credibility |
| Re-assessment automation | **Version 1.1** | Manual/user-triggered re-assessment is an acceptable MVP substitute |
| Certificate System | **Version 1.1** | Nice-to-have proof point, not core loop |
| Exam Preparation — full 6-program breadth | **Version 1.1** | MVP ships 1–2 programs (E19); breadth is a fast-follow |
| Full multi-device/offline sync | **Version 1.1** | MVP can ship with simpler last-write-wins semantics; proper conflict resolution is a fast-follow |
| AI Translation Camera | **Version 2** | New modality, independent of core loop |
| Video Learning | **Version 2** | New modality, independent of core loop |
| Community Platform (full: groups, voice rooms) | **Version 2** | Engagement upside, meaningful moderation investment required first |
| Family plan | **Version 2** | Requires COPPA-compliant consent flow (Part 6) built and tested first |
| Business plan / SSO | **Enterprise** | Depends on E22 RLS work and SSO integration |
| Enterprise LMS (full) | **Enterprise** | Depends on Business plan, reporting rollups |
| Teacher Marketplace | **Enterprise** (or late V2) | Depends on TEACHER role, payments/payouts, content governance |
| Public API Platform | **Future Research** | No committed demand signal yet; API.md is written to not preclude it |
| AI Avatar Teacher | **Future Research** | Significant unproven infra investment (real-time video generation) |
| White-labeling / custom branding | **Future Research** | Only relevant once Enterprise demand is validated |

---

## PART 10 — FINAL CTO REPORT

### Readiness scores

| Dimension | Score | Basis |
|---|---:|---|
| Overall architecture | **72/100** | Sound foundational choices (modular monolith, gateway pattern, IaC-first) with real but fixable gaps: no domain-event catalog, ambiguous service boundary (`ai-engine`/`recommendation-engine`), app-layer-only tenancy. |
| Product readiness | **65/100** | Strong module inventory and journey coverage, but outcome-measurement analytics, billing off-ramps, and several edge cases (Part 1) are not yet specified — these are planning gaps, not deep flaws, and are closeable before coding starts. |
| Engineering readiness | **75/100** | Repo, CI/CD, and documentation discipline are ahead of where most teams are at this stage; the main risk is boundary enforcement discipline as `apps/api` grows past its first several modules. |
| AI readiness | **60/100** | The gateway/agent architecture is the right shape, but **no RAG grounding for factual/rubric content** is the most serious single finding in this entire review — it directly threatens the product's core credibility claim ("your personal AI teacher") for the modules where correctness matters most (Grammar Coach, Exam Coach). Must be resolved before those modules ship, not after. |
| UX readiness | **70/100** | Brand/token system is genuinely strong; foundational tokens (spacing/elevation/motion) and several concrete components (paywall, correction-diff, pronunciation comparison) are missing and would otherwise be discovered mid-build, which is the expensive way to find them. |
| Security readiness | **62/100** | The written security model is comprehensive in *intent*, but several concrete, launch-relevant mechanisms are not yet specified: RLS tenant isolation, mandatory admin MFA, AI cost circuit breaker, output sanitization for AI content, and an implementable COPPA consent flow. None require new capabilities to build — they require being written down and assigned an owner now. |

### Critical blockers (must be resolved before implementation begins)

1. **No RAG grounding for factual/pedagogical content** (Part 5) — Grammar Coach and Exam Coach cannot ship without this; hallucinated grammar rules or exam rubrics are a core trust failure, not a minor quality issue.
2. **Tenant isolation is app-layer-only** (Parts 2 & 6) — must decide RLS-vs-not before `apps/api`'s data-access layer is built, since retrofitting it later touches every query.
3. **No multi-agent handoff protocol** (Part 5) — agent behavior is inconsistent/undefined without this; blocks E5 and everything downstream of it.
4. **No platform-level AI cost circuit breaker** (Parts 5 & 6) — real financial exposure; must exist before any AI endpoint is publicly reachable, including staging with real provider keys.
5. **No mandatory MFA for privileged roles** (Part 6) — must be decided as an E2 requirement, not bolted on later.
6. **`AIMessage` retention/partitioning/encryption plan is underspecified relative to its risk** (Part 3) — the largest, most sensitive table in the system needs an explicit plan before real user conversations start being stored.
7. **No outcome-measurement analytics for CEFR progression** (Part 1) — without this, the company cannot evaluate whether it is meeting its own stated MVP exit criterion (PRD §8); must be designed alongside E6/E17, not added retroactively.
8. **COPPA/parental-consent flow is named but not implementable-detail-specified** (Parts 1 & 6) — launch-blocking specifically for the Family plan; must either be fully specified or Family plan must be explicitly moved out of the launch scope (Part 9 already reflects the latter as the recommended path).

### Recommendation

The foundation is **directionally strong and unusually disciplined for this stage** — the gaps found here are the normal, expected output of a first architecture-review gate, not signs of a flawed foundation. None of the eight blockers above require new infrastructure or a redesign; each is a scoping/decision gap that can be closed with focused follow-up passes on the affected `docs/*.md` files.

**Recommended next step**: triage this document — confirm the Part 9 MVP/V1.1/V2 classifications, assign owners to the 8 blockers in Part 10, and fold accepted findings into `PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `AI_SYSTEM.md`, `DESIGN_SYSTEM.md`, and `SECURITY.md` as a v1.1 documentation update — before E1 (Foundation & DevOps Bootstrap) begins.
