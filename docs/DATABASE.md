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

- `AssessmentAttempt` — one per placement/re-assessment run, status, started/completed timestamps.
- `AssessmentResponse` — individual item responses within an attempt, per skill (reading/writing/listening/speaking/vocabulary/grammar).
- `ProficiencyLevel` — **current** CEFR level per user, per language, per skill, with confidence score and last-updated source (assessment vs. inferred from ongoing performance).
- `ProficiencyLevelHistory` _(added)_ — append-only record of every `ProficiencyLevel` change over time. `ProficiencyLevel` alone only holds current state and cannot answer "did this user's fluency actually improve" — the named MVP success metric (PRD.md §8) — so history is a required table, not an optimization.
- `LearningPlan` — the active personalized roadmap for a user/language: goal, target date, generated milestones.
- `DailyGoal` — per-user, per-day target (XP, minutes, activities) and completion state.

### 2.3 Content & curriculum (module 5)

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

- `VocabularyItem` — a word/phrase in a target language with translations, part of speech, audio, example sentences.
- `UserVocabulary` — per-user SRS state for a `VocabularyItem`: ease factor, interval, repetitions, next review date (SM-2-derivative algorithm — see AI_SYSTEM.md for AI-assisted example generation).
- `PersonalDictionary` — user-saved words/phrases sourced from any module (reading, camera translation, conversation).

### 2.5 AI teacher & conversation (modules 4, 7, 8, 29)

- `AIAgentSession` — a session with a given agent persona; `orchestratorAgent` field records which persona held the Orchestrator role for the session (AI_GOVERNANCE.md §2, ADR-007), and `specialistInvocations` (JSON) records any tool-called specialist critiques for auditability.
- `AIMessage` — individual turns within a session (role, content, audio reference, latency metadata, `promptVersion`, `modelId`). See §5 Conversation lifecycle for this table's dedicated retention/partitioning/encryption treatment.
- `AIMemoryEntry` — durable, embedded memory facts about a learner (recurring mistakes, interests, goals) referenced by `ai-engine`; vector-indexed via pgvector; `embeddingModelVersion` field _(added)_ pins the embedding model used, per AI_SYSTEM.md §11/AI_GOVERNANCE.md §4 — a model change requires an explicit re-embedding migration, never silent drift. `confidence`/`lastReinforcedAt` fields _(added)_ support the memory-decay model (AI_SYSTEM.md §4).
- `KnowledgeBaseEntry` _(added)_ — the curated, versioned RAG grounding content (CEFR descriptors, grammar reference, exam rubrics — ADR-008, AI_GOVERNANCE.md §4), vector-indexed like `AIMemoryEntry` but in a separate collection with its own `knowledgeBaseVersion` and linguist-sign-off metadata.
- `PronunciationScore` — phoneme-level scoring results tied to an `AIMessage` or a dedicated Pronunciation Lab attempt.
- `FluencyScore` — session-level scoring for speaking practice.

### 2.6 Gamification (module 15)

- `UserXP` — running XP total and level, per user.
- `Streak` — current/longest streak, last-active date (timezone-aware, UTC-anchored with a defined grace window for cross-timezone travel — ARCHITECTURE.md, PRD.md §5.1).
- `Badge` / `UserBadge` — badge catalog and earned badges.
- `Mission` / `UserMission` — time-boxed challenges and progress.
- `League` / `Cohort` _(added)_ — the scoping entity `LeaderboardEntry.league` references; groups users into comparable, periodically-rotated competitive cohorts.
- `LeaderboardEntry` — denormalized, periodically recomputed (not read-path joins) leaderboard standings, scoped by `League`.

### 2.7 Community (module 16)

- `Friendship` — user-to-user connection with status (pending/accepted/blocked).
- `Group` — community group, ownership, membership.
- `GroupMembership`.
- `Challenge` — group or friend challenges tied to gamification.
- `Discussion` / `Post` / `Comment` — lightweight community content, moderated (see SECURITY.md).
- `ContentReport` / `ModerationAction` _(added)_ — user-submitted reports (target type/id, reason) and the resulting moderation decision, feeding the `community.content.reported` domain event (EVENT_ARCHITECTURE.md).

### 2.8 Exams & certification (modules 19, 21)

- `ExamProgram` — supported exam definitions (IELTS, TOEFL, JLPT, TOPIK, HSK, DELE) with rubric metadata, linked to relevant `KnowledgeBaseEntry` rows for RAG-grounded scoring (ADR-008).
- `MockTestAttempt` — a full or partial mock test run, scored per section.
- `Certificate` — issued certificate record with a public verification token/URL; **explicitly foreign-keyed to the `Course`/`Level`/`ExamProgram` milestone that triggered it** (previously implicit, now a required relationship).

### 2.9 Subscriptions & billing (module 22)

- `Plan` — Free/Premium plan definitions at MVP (Family/Business plan rows exist in the schema but are inactive/unreleased per ADR-013 — see ROADMAP.md), entitlement limits.
- `Subscription` — user or organization subscription state, Stripe customer/subscription IDs, status, renewal date; `trialEndsAt` field _(added)_ supports the trial flow (PRD.md §5.1).
- `Invoice` — synced from Stripe for in-app billing history.
- `Entitlement` — resolved, queryable feature/usage limits for a user at a point in time (derived from `Plan` + `Subscription`, cached in Redis, source of truth in Postgres).
- `EntitlementChangeLog` — see §2.1, already implemented (E2). Listed here too since it's this domain's own audit trail, not because it's separate new work.
- `Coupon` / `Discount` _(added, schema-reserved)_ — promotional code definitions; not exposed in product UI until a promotions feature ships, but reserved now to avoid a painful later migration. **Not built by E4** (docs/epics/E4-database-schema-core-data-layer.md §10, resolved item 3) — a genuinely unshaped reservation was judged more likely to lock in a wrong shape than to save a later migration; still reserved conceptually here for whichever future epic designs the real promotions feature.

### 2.10 Analytics & platform (modules 23, 30)

- `LearningEvent` — append-only event log (lesson completed, exercise answered, session started/ended) — the source for analytics aggregation, partitioned by month given expected volume. Structurally, this table is the persisted form of the domain events cataloged in EVENT_ARCHITECTURE.md.
- `AIUsageLog` — per-request AI cost/latency/token metering, keyed by user, agent, model, `promptVersion` — critical for the cost controls in AI_SYSTEM.md §8 / AI_GOVERNANCE.md §5.
- `NotificationLog` — delivery record per notification (module 25), channel, status.
- `NotificationPreference` _(added)_ — per-user, per-channel, per-notification-type opt-in/opt-out (previously only delivery was modeled, not preference) — required for the granular consent PRD.md and SECURITY.md commit to.
- `AuditLog` — see §2.1, already implemented (E2). Listed here too since it's this domain's own action trail (modules 24, 26), not because it's separate new work.

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

- **Partitioning**: range-partitioned by month, same pattern as `LearningEvent`/`AIUsageLog`.
- **Encryption**: field-level encryption on the `content` column (not just table/disk-level encryption), keyed via KMS envelope encryption (§7).
- **Retention**: active partition retained for the product-facing window needed for session history/review (default 12 months — see §6 retention matrix); older partitions are archived, not deleted outright, per §8.
- **Access**: read access to raw `AIMessage.content` is restricted to the owning user and the serving request path — admin/support tooling accesses a redacted view by default, with full access requiring a logged, justified break-glass action (`AuditLog`).

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
