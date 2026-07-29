# LinguaAI — Event Architecture

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-07-29

Resolves the Architecture Review finding that point-to-point queue calls between modules (Gamification, Analytics, and Notifications all separately reacting to the same underlying occurrences) create hidden N:M coupling as consumers multiply (ADR-010). This document is the canonical domain-event catalog and event-transport contract for LinguaAI.

## 1. Transport

Domain events ride on the same Redis infrastructure already used for BullMQ (ARCHITECTURE.md §7) — no new infrastructure is introduced. A producer publishes to a named event stream; any number of consumers subscribe independently. This is additive to, not a replacement for, BullMQ's use for direct job queuing (e.g., "send this specific email now") — events are for "something happened, react if you care," jobs are for "do this specific unit of work."

## 2. Event envelope

Every event uses this fixed shape:

```json
{
  "eventId": "evt_01hxyz...",
  "type": "learning.lesson.completed",
  "version": 1,
  "occurredAt": "2026-07-29T14:03:00Z",
  "producedBy": "apps/api",
  "tenantId": "org_... | null",
  "userId": "usr_...",
  "payload": { "...": "event-specific fields" }
}
```

- `type` follows `domain.entity.action`, all lowercase, dot-separated.
- `version` increments on any breaking payload shape change; consumers declare which version(s) they handle; a producer bumping the version publishes both old and new versions during a defined migration window, mirroring API_GUIDELINES.md §10's deprecation discipline.
- `eventId` is used by consumers for idempotent processing (§4).

## 3. Event catalog (MVP)

| Event | Producer | Key consumers | Payload summary |
|---|---|---|---|
| `identity.user.registered` | `apps/api` (Identity module) | `notification-service`, `analytics-service` | userId, signupSource |
| `identity.consent.recorded` | `apps/api` | `analytics-service` | consentType, policyVersion |
| `assessment.attempt.completed` | `apps/api` (Assessment module) | `recommendation-engine`, `analytics-service` | userId, skillScores, cefrLevel |
| `learning.lesson.completed` | `apps/api` (Course module) | Gamification, `recommendation-engine`, `analytics-service` | userId, lessonId, score |
| `learning.exercise.answered` | `apps/api` | `recommendation-engine`, `analytics-service` | userId, exerciseId, correct |
| `speech.session.ended` | `services/speech-service` | Gamification, `ai-engine` (memory write), `analytics-service` | userId, durationSec, fluencyScore |
| `gamification.xp.awarded` | Gamification module | `notification-service` (milestone push), `analytics-service` | userId, amount, reason |
| `gamification.streak.updated` | Gamification module | `notification-service`, `analytics-service` | userId, streakLength, atRisk |
| `gamification.badge.awarded` | Gamification module | `notification-service`, `analytics-service` | userId, badgeId |
| `billing.subscription.changed` | `apps/api` (Billing module, from Stripe webhook) | `analytics-service`, `notification-service` (receipt) | userId, plan, status |
| `billing.entitlement.changed` | `apps/api` | (cache invalidation — internal to Billing module) | userId, entitlementKey, newValue |
| `ai.memory.updated` | `services/ai-engine` | `analytics-service` | userId, memoryEntryId, kind |
| `content.published` | `apps/api` (Course module, admin action) | Cache invalidation (ARCHITECTURE.md §7), `analytics-service` | contentId, contentType |
| `community.content.reported` | `apps/api` (Community module) | Admin moderation queue, `analytics-service` | reportId, targetType, targetId |
| `notification.preference.changed` | `apps/api` | `notification-service` | userId, channel, enabled |
| `account.deletion.requested` | `apps/api` (Identity module) | All services owning user data (cascade/anonymize per DATABASE.md §10) | userId, requestedAt |

New events are added to this table in the same PR that introduces the producer — an undocumented event is treated as a review-blocking omission (CONTRIBUTING.md).

## 4. Idempotent consumption

Every consumer stores processed `eventId`s (or relies on a natural idempotency key in its own write, e.g., `UNIQUE(userId, lessonId)` for a completion record) and no-ops on a duplicate delivery. At-least-once delivery is the assumed guarantee — consumers must never assume exactly-once.

## 5. Failure handling

- A consumer that fails processing retries with exponential backoff (BullMQ's built-in retry) up to a defined attempt count, then moves to a dead-letter queue.
- Dead-lettered events page on-call if the DLQ depth crosses a threshold (OBSERVABILITY.md alerting policy) — a silently growing DLQ is a common way for "it reacts to events" systems to quietly stop reacting.
- A producer publishing an event is never blocked or failed by a consumer being down — publication and consumption are fully decoupled by the queue.

## 6. What is *not* an event

Synchronous, request-scoped reads (e.g., "does this user have an active subscription") are direct service calls, not events — events model things that *happened*, not things you *ask*. Real-time, low-latency flows (speech streaming, live AI chat tokens) use the WebSocket channel (API_GUIDELINES.md §9) directly, not the event bus, which is not designed for sub-second delivery guarantees.
