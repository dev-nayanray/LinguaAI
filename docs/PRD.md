# LinguaAI — Product Requirements Document

Status: **v1.1 — Consolidated baseline** · Owner: CPO · Last updated: 2026-07-29

Supersedes Draft v1.0. Incorporates findings from the Architecture Review Gate — see [BASELINE.md](BASELINE.md) for the current authoritative summary and [DECISIONS.md](DECISIONS.md) for the ADRs referenced throughout this document.

## 1. Purpose

Define what LinguaAI builds, for whom, why, and how success is measured, before any application code is written. This document is the source of truth for scope; [ARCHITECTURE.md](ARCHITECTURE.md), [AI_SYSTEM.md](AI_SYSTEM.md), and [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) implement what this document specifies.

## 2. Product summary

LinguaAI is an AI-native language learning platform. Every learner gets a personal AI teacher that assesses their level, builds a personalized curriculum, and coaches them in real time across speaking, writing, listening, reading, vocabulary, and grammar — combining structured course progression (Babbel), conversational practice (Cambly), gamified engagement (Duolingo), and general-purpose AI tutoring (ChatGPT) in one product.

**Core message:** "Your personal AI teacher for every language."

## 3. Goals & non-goals

### Goals (v1 / MVP scope — see [ROADMAP.md](ROADMAP.md))
- Deliver an AI placement assessment that produces an accurate, explainable proficiency level (CEFR-aligned: A1–C2) in under 15 minutes.
- Deliver a personalized daily curriculum that adapts to demonstrated weaknesses.
- Deliver a Personal AI Teacher and Conversation Partner agent capable of real-time text and voice interaction with persistent memory of the learner.
- Deliver core gamification (XP, streaks, levels, badges) to drive daily engagement.
- Support at least 10 launch **target (learning) languages**, with English as the sole launch **UI (interface) language** — the two are distinct concepts (see §5.1 Localization Strategy); expanding UI languages is a Version 1.1+ decision, not implied by target-language count.
- Support Free and Premium subscription tiers via Stripe, including trial and cancellation/downgrade flows (see §5.1).
- Ship web (responsive) first; mobile (Flutter) and admin follow in the same major phase.

### Non-goals (explicitly out of scope for MVP)
- AI Avatar Teacher (real-time video avatars) — future phase, see ROADMAP.md.
- Teacher Marketplace revenue-sharing — Growth phase.
- Enterprise LMS — Enterprise phase.
- Public developer API — future phase.
- Native offline mode on web (mobile offline is a Growth-phase mobile feature; MVP mobile offline uses simple last-write-wins sync, not full conflict resolution — see §5.1).
- **Family plan** — descoped from MVP launch per **ADR-013**: a COPPA-compliant parental-consent flow must be fully specified and tested before Family plan ships (Version 2, see ROADMAP.md). MVP subscription scope is Free/Premium only.

## 4. Target users & personas

### Persona 1 — "Maria, the Relocating Professional" (primary)
28, mid-career, needs conversational fluency in German for a job relocation in 6 months. Time-constrained (20–30 min/day), motivated by a deadline, values speaking practice over grammar drills. Will pay for Premium if it demonstrably accelerates fluency.

### Persona 2 — "Kenji, the Self-Directed Hobbyist"
34, learning Spanish for travel and personal enjoyment, no deadline. Motivated by streaks, badges, and community. High churn risk without gamification; price-sensitive, likely to stay on Free tier or convert only with an annual discount (Family plan is Version 2 — see §3 non-goals — so this persona's household-sharing use case is not served at MVP).

### Persona 3 — "Aisha, the Exam Candidate"
21, university student preparing for IELTS to study abroad. Needs structured, exam-aligned practice with scored mock tests and detailed feedback on writing and speaking. High willingness to pay for exam-specific coaching close to the exam date.

### Persona 4 — "Enterprise L&D Buyer" (Growth/Enterprise phase)
HR/L&D manager at a multinational needing to onboard employees with business-language proficiency, with reporting on team progress. Buys seats, needs admin dashboards and compliance guarantees.

## 5. Core user journeys

### Journey A — Onboarding & Assessment
1. User signs up (email or social auth) and selects a target language and a goal ("travel," "career," "exam," "general fluency").
2. AI Language Assessment Engine evaluates reading, listening, vocabulary, and grammar via adaptive testing, and (if microphone access is granted) speaking via a short recorded response.
3. System outputs a CEFR level per skill and an initial personalized roadmap.
4. User lands on their dashboard with a Day 1 lesson plan already generated.

**Acceptance criteria:** assessment completes in ≤15 minutes; produces a per-skill CEFR level with a confidence score; roadmap is visible and explained in plain language before the user leaves onboarding; drop-off is instrumented at every step.

### Journey B — Daily Learning Loop
1. User opens the app to a dashboard showing today's goal, streak, and recommended activities.
2. User completes a lesson (vocabulary, grammar, or skill-specific exercise) generated/selected by the Personalized Learning Engine.
3. User optionally starts a live conversation session with the AI Conversation Partner.
4. XP, streak, and progress update in real time; weakness detection silently adjusts tomorrow's plan.

**Acceptance criteria:** dashboard loads in <2s p95; lesson completion updates progress without page reload; streak logic is timezone-correct for the user's locale; every lesson type has loading/empty/error/success states.

### Journey C — Speaking Practice Session
1. User starts a conversation session with a chosen AI Teacher persona and scenario (e.g., "order coffee in Paris").
2. Real-time voice capture → STT → AI response generation → TTS playback, with a target round-trip latency the user perceives as conversational.
3. Session ends with fluency score, corrected transcript, and vocabulary extracted for spaced repetition.

**Acceptance criteria:** end-to-end voice round-trip p95 ≤ 2.5s at launch (see AI_SYSTEM.md for latency budget); session gracefully degrades to text-only on poor network/mic permission denial; feedback is specific (not generic) and tied to the transcript.

### Journey D — Subscription Upgrade
1. Free-tier user hits a usage limit (e.g., daily AI conversation minutes) or explores a Premium-only feature (e.g., Pronunciation Lab).
2. Paywall explains value in terms of the user's stated goal, not generic feature list.
3. User upgrades via Stripe Checkout; access unlocks immediately; invoice/receipt emailed.

**Acceptance criteria:** paywall triggers are configurable without a deploy (feature-flagged); checkout failure states are handled and recoverable; entitlement changes propagate to the API within seconds of webhook receipt.

### Journey E — Exam Preparation
1. User selects a target exam (IELTS, TOEFL, JLPT, TOPIK, HSK, DELE) and target score/date.
2. Curriculum re-weights toward exam-format practice; mock tests are scored against the exam's real rubric.
3. Writing and speaking responses get AI-scored with rubric-aligned feedback (band scores where applicable).

**Acceptance criteria:** at least one full mock test per supported exam at MVP; scoring rubric is documented and consistent; user can see historical mock scores over time.

### 5.1 Additional flows, strategy notes, and accessibility (consolidated from Architecture Review)

**Additional MVP flows** (identified as gaps in the Architecture Review Gate and now required, not optional):

| Flow | Acceptance bar |
|---|---|
| Account recovery / password reset | Works for email-auth accounts; OAuth-only accounts are redirected to their provider, never left at a dead end |
| Subscription cancellation / downgrade | Symmetric to Journey D's upgrade flow; entitlement changes propagate on the same timeline as an upgrade |
| Re-assessment | User-initiated at MVP (a "re-check my level" action); automatic trigger-based re-assessment is Version 1.1 |
| Low-confidence assessment result | A defined fallback UX (e.g., an offer to retake the weak-confidence skill) rather than presenting an uncertain result as definitive |
| Multi-device session handling | Last-active-session-wins is acceptable at MVP; no silent data loss across devices |
| Mobile offline sync | Last-write-wins conflict resolution at MVP (full conflict resolution UX is Version 1.1, per §3 non-goals) |
| Content/abuse reporting (user-facing) | A visible report action on community and AI-generated content, feeding the moderation queue (SECURITY.md §8) |
| Enterprise roster sync | CSV bulk-invite at minimum before any Enterprise pilot (module 20); SCIM is a later Enterprise-phase enhancement |

**TEACHER role, pre-Marketplace:** the `TEACHER` role (module 1) exists at MVP with a scoped capability set — a public profile and the ability to be assigned learners in an Enterprise context — but no monetization or self-serve course publishing until Teacher Marketplace (module 18, Growth/Enterprise phase) ships with its content-governance workflow.

**Localization strategy:** MVP ships with **one UI language (English)** and **10 target learning languages** — these are tracked as distinct fields on the user profile (DATABASE.md), never conflated. RTL script support (for future Arabic UI/content) is a schema/layout requirement designed for from MVP (DESIGN_SYSTEM.md) even though no RTL UI language ships at launch. Regional payment methods beyond card payments and multi-currency price display are Version 1.1+, tracked as a distinct localization workstream from UI translation.

**Accessibility strategy:** every journey in this document is held to the WCAG 2.1 AA bar defined in DESIGN_SYSTEM.md §5 as an explicit acceptance criterion, not an implied one — a journey is not "done" if it fails keyboard navigation or screen-reader testing, regardless of functional completeness.

**Learning-outcome analytics:** because "CEFR-level progression rate" is a named success metric (§8), the product instruments **re-assessment score deltas over time** per user/cohort from MVP (OBSERVABILITY.md §2, `ProficiencyLevelHistory` in DATABASE.md) — this is treated as a required deliverable of the Analytics Platform (module 23), not an optional reporting nicety.

## 6. Feature specifications by module

Each module below maps 1:1 to the 30 modules in the product mandate. Detailed technical design lives in ARCHITECTURE.md and AI_SYSTEM.md; this section defines product-level scope and acceptance bar.

| # | Module | MVP scope | Acceptance bar |
|---|---|---|---|
| 1 | User Identity Platform | Email + Google + Apple auth, profile, goals/preferences, RBAC (USER/TEACHER/ADMIN/ENTERPRISE_ADMIN) | Passwordless-capable; **MFA mandatory for ADMIN/ENTERPRISE_ADMIN (ADR-011)**, optional for USER/TEACHER; session revocation works |
| 2 | AI Language Assessment Engine | Adaptive test across 6 skill areas, CEFR output | Reproducible scoring, explainable result; writes to `ProficiencyLevelHistory`, not just current state |
| 3 | Personalized Learning Engine | Daily goals, adaptive curriculum, weakness detection | Curriculum changes measurably in response to performance; owned by `recommendation-engine` per its documented boundary with `ai-engine` (ARCHITECTURE.md §3) |
| 4 | AI Teacher Platform | 7 agents live in MVP, with memory, coordinated via the single-Orchestrator handoff protocol (ADR-007, AI_GOVERNANCE.md §2) | Agents recall prior sessions; personas are distinguishable; factual/scoring output is RAG-grounded (ADR-008) |
| 5 | Course Management | Language > Course > Level > Unit > Lesson > Activity > Exercise/Quiz hierarchy | Content authorable by non-engineers via admin |
| 6 | Vocabulary Intelligence | SRS flashcards, personal dictionary | SRS scheduling follows a documented algorithm (SM-2 derivative) |
| 7 | Speaking Practice | Real-time AI conversation, fluency scoring | See Journey C acceptance criteria |
| 8 | Pronunciation Lab | Phoneme-level scoring, correction | Feedback below word level, not just pass/fail |
| 9 | Listening System | AI-generated audio lessons, dictation | Multiple voices/accents per language |
| 10 | Reading System | Leveled stories/articles, inline translation | Content reading level matches user CEFR |
| 11 | Writing Assistant | Grammar correction, essay scoring | Errors explained, not just flagged |
| 12 | AI Story Generator | Personalized stories with vocabulary extraction | Stories reuse target vocabulary the user is learning |
| 13 | AI Translation Camera | OCR + translation from image | Works on packaging/signage-style text at MVP |
| 14 | Video Learning | Subtitle-synced learning | MVP: curated content only; user-submitted URLs post-MVP |
| 15 | Gamification Engine | XP, streaks, levels, badges, missions | Anti-gaming safeguards are launch-blocking, not fast-follow (see SECURITY.md, RISK_REGISTER.md R-15) |
| 16 | Community Platform | Friends, groups, challenges | Post-MVP: voice rooms |
| 17 | AI Avatar Teacher | Not in MVP | Documented as future in ROADMAP.md |
| 18 | Teacher Marketplace | Not in MVP; `TEACHER` role exists with scoped, non-monetized capability (see §5.1) | Growth phase — requires content-governance workflow before launch |
| 19 | Exam Preparation | IELTS, TOEFL, JLPT, TOPIK, HSK, DELE | See Journey E |
| 20 | Enterprise LMS | Not in MVP | Enterprise phase |
| 21 | Certificate System | Completion certificates, verification | Publicly verifiable via unique URL, explicitly linked to its triggering milestone (DATABASE.md) |
| 22 | Subscription Platform | Free, Premium via Stripe at MVP; **Family is Version 2 (ADR-013)**, Business is Enterprise phase | See Journey D + §5.1 cancellation/trial flows |
| 23 | Analytics Platform | User, learning, AI usage, revenue, retention, **CEFR-progression outcome measurement (§5.1)** | Internal-only at MVP |
| 24 | Admin Platform | User/content/AI management, reports | RBAC-gated; every admin and automated billing action writes to `AuditLog` (DATABASE.md) |
| 25 | Notification System | Email + push, streak reminders, granular per-channel preferences | User-controllable preferences, unsubscribe honored |
| 26 | Security System | AuthN/Z, encryption, GDPR, **RLS-based multi-tenancy (MULTITENANCY.md), mandatory admin MFA (ADR-011)** | See SECURITY.md — non-negotiable at MVP |
| 27 | API Platform | Internal only at MVP, built to API_GUIDELINES.md standards | Public developer API is future |
| 28 | Mobile Application | Flutter iOS/Android | Same major phase as web, may trail by weeks |
| 29 | AI Infrastructure | Agents, prompt mgmt, vector DB, memory, model mgmt | See AI_SYSTEM.md |
| 30 | Internal Platform Services | Logging, monitoring, jobs, queues, analytics pipeline | See ARCHITECTURE.md |

## 7. Business model

### Subscription tiers

| Plan | Price point (indicative) | Includes |
|---|---|---|
| Free | $0 | 1 language, limited daily AI conversation minutes, core gamification, ads optional |
| Premium | Monthly/annual, individual, with a free-trial window | Unlimited AI conversation, Pronunciation Lab, all exam prep, no ads |
| Family *(Version 2)* | Premium × up to 5 seats at a discount | Shared billing, per-member progress, parental controls — blocked on the parental-consent flow required by ADR-013 |
| Business *(Enterprise phase)* | Per-seat, annual, sold to Enterprise LMS buyers | Admin dashboards, reporting, SSO — depends on MULTITENANCY.md RLS work being in place |

Monetization also considers (Version 1.1+, not MVP-blocking): a referral/viral growth program (with fraud prevention designed before launch — RISK_REGISTER.md R-15), gift subscriptions, cosmetic in-app purchases (streak freezes, avatar items), exam-prep add-ons close to test dates, teacher marketplace take-rate (Growth phase), and B2B/API licensing (future).

### Key business metrics (tracked from MVP — see Analytics Platform)
- Activation: % of signups completing assessment + first lesson within 24h
- D1/D7/D30 retention, streak survival curve
- Free → Premium conversion rate, time-to-conversion
- AI cost per active user (critical for margin — see AI_SYSTEM.md cost controls)
- CEFR-level progression rate (proof the product works)

## 8. Success metrics (MVP exit criteria)

- Assessment completion rate ≥ 70% of signups who start it.
- D7 retention ≥ industry benchmark for language-learning category (target set post-beta).
- Median voice conversation round-trip latency within budget (see AI_SYSTEM.md).
- Zero P0/P1 security findings open at launch (see SECURITY.md).
- All 10 launch languages have complete A1–B2 curriculum content.

## 9. Risks & open questions

Full risk tracking, likelihood/impact, mitigation, and ownership now lives in the canonical [RISK_REGISTER.md](RISK_REGISTER.md) (not duplicated here). The product-relevant risks carried forward from this document's original draft are **R-01** (AI cost at scale), **R-03** (content quality at 10-language launch), **R-04** (speech latency), and **R-05** (assessment validity) — see RISK_REGISTER.md for current status and mitigation owners.
