# LinguaAI — Database Strategy & Entity Planning

Status: **v1.1 — Consolidated baseline** · Owner: Principal Architect · Last updated: 2026-08-01

Supersedes Draft v1.0. See [BASELINE.md](BASELINE.md) for the current authoritative summary. Tenant-isolation detail lives in [MULTITENANCY.md](MULTITENANCY.md) (this document states _what_ is tenant-scoped; that document states _how_ isolation is enforced). Performance numbers referenced below are owned canonically by [PERFORMANCE.md](PERFORMANCE.md).

## 1. Strategy

- **Primary datastore**: PostgreSQL (via Amazon RDS/Aurora Postgres in production), accessed exclusively through Prisma ORM in `packages/database`. One schema, one migration history, one generated client shared by `apps/api` and all `services/*` that need direct DB access.
- **Vector data**: `pgvector` extension on the same Postgres instance for MVP (AI memory embeddings, RAG knowledge-base retrieval, semantic search over content — ADR-004). Isolated into a managed vector DB only if query volume/latency data justifies it (see ARCHITECTURE.md §9).
- **Cache/ephemeral state**: Redis — sessions, rate limits, hot leaderboard snapshots, BullMQ queues/domain events (EVENT_ARCHITECTURE.md). Never the system of record.
- **Object storage**: S3 (MinIO locally) for audio recordings, generated TTS audio, images (OCR camera captures, avatars, certificates). Postgres stores references (URLs/keys), never binary blobs.
- **Migrations**: Prisma Migrate, forward-only in production. Every schema change ships with a migration file and an update to this document in the same PR (see CLAUDE.md engineering standards). A migration adding a tenant-scoped table must include its RLS policy in the same migration (MULTITENANCY.md §6) — CI rejects one without the other.
- **Multi-tenancy**: single database, row-level tenancy via `organizationId` (nullable for individual consumer accounts), enforced through **Postgres Row-Level Security in addition to application-layer scoping** (ADR-005) — RLS is the authoritative mechanism, not a fallback. Full design in [MULTITENANCY.md](MULTITENANCY.md).

## 2. Core entity domains

The schema is organized into the following domains. Each maps to one or more Prisma schema files composed into the shared `packages/database` schema.

### 2.1 Identity & access

**Status: Implemented — Epic E2** ([docs/epics/E2-identity-access-platform.md](epics/E2-identity-access-platform.md), ADR-018–023). The entity list below reflects the schema as built, including RLS (MULTITENANCY.md §6), the column-privilege allowlist, and the `SECURITY DEFINER` governance functions (ADR-023) — not just the original design intent.

- `User` — core account: email, hashed credentials (or OAuth-only), display name, avatar, locale, timezone, role (`USER | TEACHER | ADMIN | ENTERPRISE_ADMIN`), status, `mfaEnrolled` (required `true` before an `ADMIN`/`ENTERPRISE_ADMIN` account activates — ADR-011).
- `OAuthAccount` — linked social identities (Google, Apple — ADR-020; Facebook deferred), one-to-many with `User`.
- `UserProfile` — learning goals, native language, target language(s), motivation/goal type, daily time commitment, **UI language** (distinct field from target language — PRD.md §5.1).
- `Organization` — enterprise tenant (module 20), owns seats and `ENTERPRISE_ADMIN` users; `dataRegion` field reserved (nullable, defaults to platform region) for future data-residency support (MULTITENANCY.md §5).
- `OrganizationMembership` — user ↔ organization, with role within the org.
- `Session` / `RefreshToken` — server-side session/token records for revocation (paired with stateless JWT access tokens). `Session.currentJti` tracks the most recently issued access token's `jti` so revoking a session can immediately denylist it (ADR-018), rather than waiting out the token's own 15-minute expiry.
- `ConsentRecord` _(added)_ — explicit consent audit trail: consent type (ToS, privacy policy, marketing, parental-consent), policy version consented to, timestamp — distinct from `AuditLog`, since consent is a compliance record, not an admin-action record.
- `DeviceToken` _(added)_ — push-notification device registry (module 25), userId, platform, token, active flag.
- `PasswordResetToken` — single-use, hashed (never stored raw), 1-hour-lived reset token; same hash-not-raw pattern as `RefreshToken`.
- `MfaChallengeToken` — the "partial session" (post-password, pre-MFA) opaque hashed single-use token an MFA-enrolled `ADMIN`/`ENTERPRISE_ADMIN` exchanges via `/v1/auth/mfa/challenge` to complete login (Part 6/8) — not a JWT, matching `PasswordResetToken`'s pattern.
- `RoleChangeRequest` — the two-person-approval workflow record for `ADMIN`-involving role changes (ADR-021): target/requester/approver, from/to role, status, 72-hour expiry.
- `AuditLog` — immutable (`INSERT`-only grant, no `UPDATE`/`DELETE` for `app_role` or `app_service_role`), append-only record of every privileged/admin action, written atomically with its triggering state change inside the same `SECURITY DEFINER` function call (ADR-023) where applicable.
- `EntitlementChangeLog` — immutable record of entitlement grants/revocations (billing/admin-override sourced), same `INSERT`-only immutability grant as `AuditLog`.

### 2.2 Assessment & learning plan

**Status: Implemented (schema only) — Epic E4 T3, extended in E6 T1** (docs/epics/E4-database-schema-core-data-layer.md, docs/epics/E6-ai-language-assessment-engine.md). Schema/migrations exist in `packages/database`; the application logic that runs assessments and generates plans is separate, epic scope (E6 for assessment scoring, E7 for `LearningPlan`/`DailyGoal` generation).

- `AssessmentAttempt` — one per placement/re-assessment run, status, started/completed timestamps.
- `AssessmentResponse` — individual item responses within an attempt, per skill (reading/writing/listening/speaking/vocabulary/grammar). `itemId` _(added, E6 T1)_ — nullable FK to `AssessmentItem`, the item this response answered.
- `AssessmentItem` _(added, E6 T1, ADR-037)_ — the curated placement-test item bank: per `(language, skill, cefrLevel)`, a real, versioned, linguist-sign-off-tracked item with a relative `difficulty` (the adaptive algorithm's own selection input), a `prompt`, an optional `audioUrl` (Listening-skill items — real audio-file authoring/storage is separately-scoped future content work, not yet delivered), and `correctAnswer` (null for `OPEN_RESPONSE`/Writing items, scored by `ai-engine` instead of an answer key). Closes a real gap E6's design doc found: no reusable, standalone item bank existed anywhere in the schema before this — `AssessmentResponse.prompt` was free text, and §2.3's `Exercise` is bound to an authored curriculum `Activity`, structurally incompatible with a pre-course placement test.
- `ProficiencyLevel` — **current** CEFR level per user, per language, per skill, with confidence score and last-updated source (assessment vs. inferred from ongoing performance).
- `ProficiencyLevelHistory` _(added)_ — append-only record of every `ProficiencyLevel` change over time. `ProficiencyLevel` alone only holds current state and cannot answer "did this user's fluency actually improve" — the named MVP success metric (PRD.md §8) — so history is a required table, not an optimization. `userId` is nullable (§6's append-only-anonymized-in-place category — fixed in T10, see §2.10).
- `LearningPlan` — the active personalized roadmap for a user/language: goal, target date, generated milestones.
- `DailyGoal` — per-user, per-day target (XP, minutes, activities) and completion state.

### 2.3 Content & curriculum (module 5)

**Status: Implemented (schema only) — Epic E4 T2** (docs/epics/E4-database-schema-core-data-layer.md). Schema/migration exist in `packages/database`; the application logic that authors/serves this content is separate, later epic scope (E8 Course Management System).

Hierarchy: `Language → Course → Level → Unit → Lesson → Activity → Exercise/Quiz`.

- `Language` — supported languages metadata (code, name, script direction, voice/TTS availability); a separate `uiLanguageSupported` boolean distinguishes "learnable as a target language" from "available as an interface language" (PRD.md §5.1).
- `Course` — a structured curriculum for a language (e.g., "Spanish for Travel").
- `Level` — CEFR-aligned grouping within a course (A1–C2).
- `Unit` — thematic grouping within a level.
- `Lesson` — a single learning session's worth of content.
- `Activity` — a typed learning unit within a lesson (vocabulary drill, grammar explanation, listening clip, etc.).
- `Exercise` / `Quiz` — scored interactions within an activity, with `ExerciseAttempt` capturing user responses.
- `ContentVersion` — versioning for authored content so live edits don't retroactively alter a learner's in-progress history.

### 2.4 Vocabulary intelligence (module 6)

**Status: Implemented (schema only) — Epic E4 T4** (docs/epics/E4-database-schema-core-data-layer.md). Schema/migration exist in `packages/database`; the application logic that surfaces/reviews vocabulary is separate, later epic scope.

- `VocabularyItem` — a word/phrase in a target language with translations, part of speech, audio, example sentences.
- `UserVocabulary` — per-user SRS state for a `VocabularyItem`: ease factor, interval, repetitions, next review date (SM-2-derivative algorithm — see AI_SYSTEM.md for AI-assisted example generation).
- `PersonalDictionary` — user-saved words/phrases sourced from any module (reading, camera translation, conversation).

### 2.5 AI teacher & conversation (modules 4, 7, 8, 29)

**Status: Implemented (schema only) — Epic E4 T5** (docs/epics/E4-database-schema-core-data-layer.md). Schema/migration exist in `packages/database`; the application logic that runs sessions/RAG/scoring is separate, later epic scope (E5+).

- `AIAgentSession` — a session with a given agent persona; `orchestratorAgent` field records which persona held the Orchestrator role for the session (AI_GOVERNANCE.md §2, ADR-007 — restricted to the five personas AI_SYSTEM.md §3 actually lists as Orchestrator-capable: Personal Language Teacher, Conversation Partner, Vocabulary Coach, Writing Coach, Exam Coach; Grammar/Pronunciation Coach are specialist-tool-only in that same table), and `specialistInvocations` (JSON) records any tool-called specialist critiques for auditability. `rollingSummary`/`summarizedThroughAt` fields _(added, E5 T6)_ durably persist the Orchestrator's rolling conversation summary (AI_SYSTEM.md §5) across a process restart or a different Fargate replica handling the next turn — an in-process cache (`services/ai-engine`) is the fast path, this pair is the safe fallback, not itself encrypted (a summary carries materially less sensitive detail than raw `AIMessage.content`, and encryption would block direct SQL consolidation queries a future hygiene job would need).
- `AIMessage` — individual turns within a session (role, content, audio reference, latency metadata, `promptVersion`, `modelId`). See §5 Conversation lifecycle for this table's dedicated retention/partitioning/encryption treatment — all three genuinely implemented in T5 (range-partitioned via pg_partman/ADR-028, `content` field-level encrypted via a Prisma Client Extension/ADR-029), not deferred.
- `AIMemoryEntry` — durable, embedded memory facts about a learner (recurring mistakes, interests, goals) referenced by `ai-engine`; vector-indexed via pgvector (real HNSW index, cosine distance); `embeddingModelVersion` field pins the embedding model used, per AI_SYSTEM.md §11/AI_GOVERNANCE.md §4 — a model change requires an explicit re-embedding migration, never silent drift. `confidence`/`lastReinforcedAt` fields support the memory-decay model (AI_SYSTEM.md §4), implemented for real in E5 T6 (`services/ai-engine`'s `MemoryManagerService`, exponential half-life decay). `supersededByEntryId` field _(added, E5 T6)_ — a nullable self-relation implementing AI_SYSTEM.md §5's "memory entries are versioned/superseded rather than unboundedly appended" requirement; null means the entry is current, `onDelete: SetNull`. `embedding` is `vector(1536)`, OpenAI `text-embedding-3-small` — pinned for real by **ADR-031 (Accepted, E5 T2)**, no longer provisional; a model change is still a real, tracked re-embedding migration (unchanged cost, just no longer an open item).
- `KnowledgeBaseEntry` _(added)_ — the curated, versioned RAG grounding content (CEFR descriptors, grammar reference, exam rubrics — ADR-008, AI_GOVERNANCE.md §4), vector-indexed like `AIMemoryEntry` but in a separate collection with its own `knowledgeBaseVersion` and linguist-sign-off metadata. Same embedding pin (ADR-031) as `AIMemoryEntry`.
- `PronunciationScore` — phoneme-level scoring results tied to an `AIMessage` or a dedicated Pronunciation Lab attempt. **Flagged gap:** no "Pronunciation Lab attempt" entity exists anywhere in this document's domain list — modeled in T5 as a polymorphic `(sourceType, sourceId)` pointer with no DB-level FK; whichever future epic designs the real Pronunciation Lab module owns closing this for real.
- `FluencyScore` — session-level scoring for speaking practice.
- `EncryptionDataKey` _(added)_ — envelope-encryption key registry supporting `AIMessage.content`'s field-level encryption (ADR-029); not itself a DATABASE.md-named domain entity, added as T5's own supporting infrastructure.

### 2.6 Gamification (module 15)

**Status: Implemented (schema only) — Epic E4 T6** (docs/epics/E4-database-schema-core-data-layer.md). Schema/migration exist in `packages/database`; the application logic (XP grants, streak grace-window computation, mission progress, league rotation, anti-gaming safeguards — PRD.md §6, RISK_REGISTER.md R-15) is separate, later epic scope (E14).

- `UserXP` — running XP total and level, per user. 1:1 with `User` (same `userId`-as-primary-key pattern as `UserProfile`).
- `Streak` — current/longest streak, last-active date (timezone-aware, UTC-anchored with a defined grace window for cross-timezone travel — ARCHITECTURE.md, PRD.md §5.1). 1:1 with `User`; stores an IANA `timezone` string so the application layer's grace-window logic has what it needs — the grace-window policy itself (how much leeway) is an application-config parameter, not a schema concern. Streak-freeze/cosmetic streak-repair items are Version 1.1+ (PRD.md §6) — not modeled here, matching the `Coupon`/`Discount` precedent (§2.9).
- `Badge` / `UserBadge` — badge catalog and earned badges. `Badge.criteria` (JSON) stores structured earning criteria consumed by the gamification-engine app logic.
- `Mission` / `UserMission` — time-boxed challenges and progress. `UserMission.progress` is always attributable to a specific per-user-per-mission row (not a bare shared counter), so E14's anti-gaming logic has a real audit trail to inspect.
- `League` / `Cohort` _(added)_ — the scoping entity `LeaderboardEntry.league` references; groups users into comparable, periodically-rotated competitive cohorts. Modeled as one `League` row per rotation/tier instance (e.g. "Gold League, week of 2026-08-03"), not a static tier catalog.
- `LeaderboardEntry` — denormalized, periodically recomputed (not read-path joins) leaderboard standings, scoped by `League`.

### 2.7 Community (module 16)

**Status: Implemented (schema only) — Epic E4 T7** (docs/epics/E4-database-schema-core-data-layer.md). Schema/migration exist in `packages/database`; the application logic (friend requests, group management, moderation review UI/queue) is separate, later epic scope. Voice rooms (PRD.md module 16: "Post-MVP") are out of scope entirely, pending the moderation design SECURITY.md §8/RISK_REGISTER.md R-16 require first.

- `Friendship` — user-to-user connection with status (pending/accepted/blocked). Self-referential (`requester`/`addressee` named relations on `User`).
- `Group` — community group, ownership, membership.
- `GroupMembership`.
- `Challenge` — group or friend challenges tied to gamification; `metric` reuses §2.6's `MissionMetric` enum rather than a duplicate vocabulary. `groupId` nullable — null means a direct friend-to-friend challenge.
- `ChallengeParticipant` _(added)_ — per-user progress tracking for a `Challenge`, needed for both group members opting in and the two sides of a friend challenge.
- `Discussion` / `Post` / `Comment` — lightweight community content, moderated (see SECURITY.md). Hierarchy: `Discussion` (topic, optionally group-scoped) → `Post` → `Comment`. All three (plus `Group`) are soft-delete (§6).
- `ContentReport` / `ModerationAction` _(added)_ — user-submitted reports (target type/id, reason) and the resulting moderation decision, feeding the `community.content.reported` domain event (EVENT_ARCHITECTURE.md). `targetType`/`targetId` are polymorphic (no DB-level FK, same shape as `ContentVersion`) since the reported/actioned-on item varies by table. `ModerationAction.contentReportId`/`moderatorId` are nullable — an action can originate from proactive automated moderation, not only a user report.

### 2.8 Exams & certification (modules 19, 21)

**Status: Implemented (schema only) — Epic E4 T8** (docs/epics/E4-database-schema-core-data-layer.md). Schema/migration exist in `packages/database`; the application logic (mock test delivery, RAG-grounded scoring, certificate issuance/public verification UI) is separate, later epic scope (E19/E20). ROADMAP.md scopes MVP to 1-2 active exam programs and basic verification; full 6-program breadth and "verification depth" are Version 1.1 — the schema supports all six programs from the start (`ExamProgram.isActive`, mirroring `Plan`'s §2.9 inactive-rows pattern) rather than needing a later migration.

- `ExamProgram` — supported exam definitions (IELTS, TOEFL, JLPT, TOPIK, HSK, DELE) with rubric metadata, linked to relevant `KnowledgeBaseEntry` rows for RAG-grounded scoring (ADR-008) via `ExamProgramKnowledgeBaseEntry` _(added)_, the N:N join table §3's ERD names the relationship for but not the table itself.
- `MockTestAttempt` — a full or partial mock test run, scored per section (`MockTestSectionScore` _(added)_). `status` reuses §2.2's `AssessmentStatus` enum; `MockTestSectionScore.skill` reuses §2.2's `Skill` enum — a mock test attempt's lifecycle and scoring vocabulary are the same shape as a placement assessment's, not independently defined.
- `Certificate` — issued certificate record with a public verification token/URL; **explicitly foreign-keyed to the `Course`/`Level`/`ExamProgram` milestone that triggered it** (previously implicit, now a required relationship) — three real, separate nullable FK columns plus a `CHECK (num_nonnulls(...) = 1)` constraint enforcing exactly one is ever set, not a polymorphic no-FK pointer. Never deleted (a legal/verification artifact, same immutability class as `AuditLog`). `verificationTokenHash` follows §2.1's hash-not-raw pattern (`PasswordResetToken`, `MfaChallengeToken`) — a 32-byte (256-bit) random token, SHA-256 hashed for storage; the public verification endpoint is rate-limited to 10 requests/IP/5min at the application layer (E20), stricter than the platform default given no auth to fall back on.

### 2.9 Subscriptions & billing (module 22)

**Status: Implemented (schema only) — Epic E4 T9** (docs/epics/E4-database-schema-core-data-layer.md). Schema/migration exist in `packages/database`; the application logic (Stripe webhook handling, checkout, entitlement resolution/Redis caching) is separate, later epic scope (E15).

- `Plan` — Free/Premium plan definitions at MVP (Family/Business plan rows exist in the schema but are inactive/unreleased per ADR-013 — see ROADMAP.md), entitlement limits. `limits` is structured JSON (not fixed per-feature columns) — PRD.md §7's plan/feature table is explicitly indicative, not a finalized schema.
- `Subscription` — user or organization subscription state, Stripe customer/subscription IDs, status, renewal date; `trialEndsAt` field _(added)_ supports the trial flow (PRD.md §5.1). "User or organization" is two real, separate FK columns plus a `CHECK (num_nonnulls(...) = 1)` constraint (same pattern as §2.8's `Certificate`), not a polymorphic pointer — both targets are always concrete and resolvable. **Tenant-scoped** (T11 correction — a Business-tier `Subscription` is genuinely org-owned, not the redundant-denormalization pattern the rest of this epic's tables avoid): real RLS policies added in T11, reusing E2's `app_role`/session-GUC pattern.
- `Invoice` — synced from Stripe for in-app billing history. Amounts are integer minor-units (cents), never a float. Retained per the 7-year billing floor (§7), never shortened by an erasure request.
- `Entitlement` — resolved, queryable feature/usage limits for a user at a point in time (derived from `Plan` + `Subscription`, cached in Redis, source of truth in Postgres). 1:1 with `User` (same `userId`-as-primary-key pattern as `UserXP`/`Streak`); `limits`/`usage` are structured JSON, mirroring `Plan.limits`'s own reasoning.
- `EntitlementChangeLog` — see §2.1, already implemented (E2). Listed here too since it's this domain's own audit trail, not because it's separate new work.
- `Coupon` / `Discount` _(added, schema-reserved)_ — promotional code definitions; not exposed in product UI until a promotions feature ships, but reserved now to avoid a painful later migration. **Not built by E4** (docs/epics/E4-database-schema-core-data-layer.md §10, resolved item 3) — a genuinely unshaped reservation was judged more likely to lock in a wrong shape than to save a later migration; still reserved conceptually here for whichever future epic designs the real promotions feature.

### 2.10 Analytics & platform (modules 23, 30)

**Status: Implemented (schema only) — Epic E4 T10** (docs/epics/E4-database-schema-core-data-layer.md). Schema/migration exist in `packages/database`; the application logic (event publishing/consumption, cost dashboards, notification delivery) is separate, later epic scope (E16/E17).

- `LearningEvent` — append-only event log (lesson completed, exercise answered, session started/ended) — the source for analytics aggregation, partitioned by month given expected volume. Structurally, this table is the persisted form of the domain events cataloged in EVENT_ARCHITECTURE.md — its columns mirror that document's §2 event envelope (`eventId`/`type`/`version`/`occurredAt`/`producedBy`/`tenantId`→`organizationId`/`userId`/`payload`) directly, not just the three named example event types. `eventId` is a plain (non-unique) index, not a uniqueness constraint — found via direct testing that a partitioned table's unique-constraint requirement (must include the partition column) makes a true cross-partition `eventId` uniqueness guarantee structurally impossible here; idempotent processing is EVENT_ARCHITECTURE.md §1/§2's Redis-backed live-stream consumer concern, not this historical log's insert path.
- `AIUsageLog` — per-request AI cost/latency/token metering, keyed by user, agent, model, `promptVersion` — critical for the cost controls in AI_SYSTEM.md §8 / AI_GOVERNANCE.md §5. Cost stored as integer micro-USD, never a float.
- `NotificationLog` — delivery record per notification (module 25), channel, status.
- `NotificationPreference` _(added)_ — per-user, per-channel, per-notification-type opt-in/opt-out (previously only delivery was modeled, not preference) — required for the granular consent PRD.md and SECURITY.md commit to.
- `AuditLog` — see §2.1, already implemented (E2). Listed here too since it's this domain's own action trail (modules 24, 26), not because it's separate new work.

**Retroactive fix (T10):** §6's soft-delete policy explicitly names `LearningEvent`, `AIUsageLog`, and §2.2's `ProficiencyLevelHistory` together as anonymized-in-place via a **nulled** `userId` on account erasure — `ProficiencyLevelHistory.userId` was built `NOT NULL` in T3 (matching that domain's other tables instead of this specific stated policy); corrected to nullable here via a safe `ALTER COLUMN ... DROP NOT NULL`, confirmed working (not just schema-valid) by nulling a real row in the verification script.

### 2.11 Reserved for future phases (schema-planned, not built at MVP)

`TeacherProfile`, `TeacherPayout` (module 18, Growth/Enterprise), `ApiKey` (module 27, Future) — named here so a future migration adds new tables rather than retrofitting relationships onto tables that already have production data.

## 3. Entity relationship overview (high level)

```
User ──1:1── UserProfile
User ──1:N── OAuthAccount
User ──1:N── ProficiencyLevel (per language/skill) ──1:N── ProficiencyLevelHistory
User ──1:N── LearningPlan ──1:N── DailyGoal
User ──1:N── AssessmentAttempt ──1:N── AssessmentResponse
User ──1:N── UserVocabulary ──N:1── VocabularyItem
User ──1:N── AIAgentSession ──1:N── AIMessage
User ──1:N── AIMemoryEntry (vector-indexed)
User ──1:1── UserXP
User ──1:1── Streak
User ──N:N── Badge (via UserBadge)
User ──N:1── League (via LeaderboardEntry)
User ──N:N── Friendship (self-referential)
User ──1:N── Subscription ──N:1── Plan
Subscription ──1:N── EntitlementChangeLog
User ──1:N── LearningEvent
User ──1:N── ConsentRecord
User ──N:1── Organization (nullable, via OrganizationMembership)

Language ──1:N── Course ──1:N── Level ──1:N── Unit ──1:N── Lesson ──1:N── Activity ──1:N── Exercise
ExamProgram ──1:N── MockTestAttempt ──N:1── User
ExamProgram ──N:N── KnowledgeBaseEntry
Certificate ──N:1── Course | Level | ExamProgram (triggering milestone)
```

Full field-level schema is authored directly in `packages/database/schema.prisma` as the single source of truth; this document tracks entity intent and relationships, and must be updated whenever a domain's shape changes materially.

## 4. Indexing & performance considerations

- Composite indexes on all `(userId, languageId)` and `(userId, createdAt)` query patterns — the dashboard and progress views are the hottest read paths (target: p95 < 50ms, PERFORMANCE.md §4).
- `LearningEvent` and `AIUsageLog` are high-write, append-only, and range-partitioned by month from the start to keep indexes small and enable cheap retention/archival.
- `LeaderboardEntry` is a materialized/denormalized table recomputed by a scheduled job (BullMQ), never computed via live aggregation on the request path.
- Vector similarity search (`AIMemoryEntry`, `KnowledgeBaseEntry`) uses an HNSW index via pgvector; embedding dimensionality and index parameters are fixed per model version (`embeddingModelVersion`) to avoid silent re-embedding needs.
- Full-text/trigram (`pg_trgm`) indexes on `Course`/`Lesson` content and `Discussion`/`Post`/`Comment` support admin content search and moderation search respectively — both named use cases that had no index plan before this revision.

## 5. Conversation lifecycle (`AIMessage`) — dedicated treatment

`AIMessage` is the largest-volume, most PII-sensitive table in the system (raw learner conversation transcripts) and the Architecture Review specifically flagged it as underspecified relative to that risk. It now has its own explicit policy, distinct from the generic PII statement in §7:

- **Partitioning**: range-partitioned by month, same pattern as `LearningEvent`/`AIUsageLog`. **Implemented (E4 T5)** via native Postgres declarative partitioning + `pg_partman` (ADR-028) for ongoing monthly partition creation — not a design intent, a real, verified mechanism.
- **Encryption**: field-level encryption on the `content` column (not just table/disk-level encryption), keyed via KMS envelope encryption (§7). **Implemented (E4 T5)** via a Prisma Client Extension (ADR-029) with a real `AwsKmsDataKeyProvider` (used in production) and a `LocalStubDataKeyProvider` (dev/CI, no AWS credentials required — env-gated, refuses to run in production). Proven via a raw-SQL bypass confirming the on-disk value is genuine ciphertext, not merely a working decrypted read.
- **Retention**: active partition retained for the product-facing window needed for session history/review (default 12 months — see §6 retention matrix); older partitions are archived, not deleted outright, per §8. Archival job itself is later, application-layer scope — not built by E4.
- **Access**: read access to raw `AIMessage.content` is restricted to the owning user and the serving request path — admin/support tooling accesses a redacted view by default, with full access requiring a logged, justified break-glass action (`AuditLog`). **Not yet enforced** — this is an application/API-authorization concern (later epic scope, e.g. E5), not something E4's schema alone can guarantee.

## 6. Soft delete policy

Two distinct mechanisms were previously conflated; they are now explicit per entity category:

| Category                                              | Mechanism                                                                                                                                                                                                                            | Examples                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Content & community (reversible, moderation-relevant) | Soft delete (`deletedAt` timestamp, excluded from default queries, recoverable by admin action)                                                                                                                                      | `Discussion`, `Post`, `Comment`, `Group`, `Course` (unpublish)        |
| User-account PII (GDPR-erasure-driven)                | Hard delete or anonymization — never merely flagged                                                                                                                                                                                  | `User` PII fields, `AIMessage.content`, raw assessment audio — see §7 |
| Append-only historical/event records                  | Neither deleted nor flagged — anonymized in place (userId nulled/pseudonymized) on account erasure, since the row's aggregate/statistical value (analytics, `ProficiencyLevelHistory` trend data) outlives the individual's identity | `LearningEvent`, `AIUsageLog`, `ProficiencyLevelHistory`              |

## 7. Data retention matrix

| Data category                                       | Default retention                                                                                                                   | Mechanism                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Assessment/conversation raw audio                   | 90 days, configurable                                                                                                               | Hard delete from S3 after window; transcript (`AIMessage.content`) retention is separate (below) |
| `AIMessage.content` (conversation transcripts)      | 12 months active, then archived (§8)                                                                                                | Partition archival, field-level encryption throughout                                            |
| `LearningEvent` / `AIUsageLog`                      | 24 months active, then archived                                                                                                     | Partition archival                                                                               |
| Billing records (`Invoice`, `EntitlementChangeLog`) | Per legal/financial compliance requirement (typically 7 years)                                                                      | Distinct from user-content retention; never shortened by a user erasure request                  |
| `AuditLog`                                          | Per compliance requirement, minimum 24 months                                                                                       | Immutable, append-only                                                                           |
| `ConsentRecord`                                     | Retained for the life of the account + the compliance-required window after erasure (proof consent was properly obtained/withdrawn) | Survives account anonymization                                                                   |

## 8. Encryption & key management

- **At rest**: database-level encryption (RDS/Aurora encryption) on the whole instance, plus **field-level encryption** for high-sensitivity columns: `AIMessage.content`, raw assessment audio references, and other freeform PII fields identified in a data-classification pass owned by Security.
- **Key management**: envelope encryption via AWS KMS; data-encryption keys are rotated on a defined schedule (annually at minimum, or immediately on suspected compromise); key access is itself an audited action.
- **In transit**: TLS 1.2+ everywhere (SECURITY.md §4).

## 9. Archiving strategy

Tables with a defined active-retention window (§7) move aged partitions to S3 (Glacier-tier for cost) rather than deleting them outright, preserving the ability to serve a legal/compliance request or a historical analytics query without keeping "hot" data in the primary database indefinitely. Archival is a scheduled job (BullMQ), not a manual process, and archived-partition restoration is a defined (if slower) operational runbook, not an unsupported edge case.

## 10. GDPR erasure implementation

Account deletion (right to erasure) cascades through owned entities per the soft-delete policy (§6): PII fields are hard-deleted/anonymized, append-only historical records are anonymized in place rather than deleted (preserving referential integrity and aggregate analytics value), and billing/consent records are retained per their independent compliance-driven retention (§7) regardless of the erasure request — this is a lawful exception, not an oversight.

## 11. Explicitly deferred

- Sharding/partitioning beyond time-based partitioning of event tables — revisited at defined scale thresholds.
- Read-replica routing in the ORM layer — introduced when replica lag and read-query volume justify the added complexity (see ARCHITECTURE.md §7).
- Enforced data-residency (`Organization.dataRegion` is schema-reserved but not yet enforced) — see MULTITENANCY.md §5.
