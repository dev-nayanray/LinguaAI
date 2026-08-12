# Epic E11 — Pronunciation Lab

**Epic ID:** E11 (ROADMAP.md)
**Status:** Design phase — first single-pass design, not yet implemented.
**Tech lead:** AI/Speech Engineering (TBD)
**Gate owners assigned:** Architecture, Security, Database, API, AI, Performance, Testing, Documentation (Frontend/Accessibility/Deployment gates apply to the later UI-focused epic that builds the actual practice-mode recording screen, not this backend-engine epic — see §3.6)

## 0. Why this document exists now, and what it is not

E10 (Speaking Practice & Speech Pipeline) is implementation-complete (T1–T7, 2026-08-12 — its own §9 task table's full sequence, confirmed no further task remains). Per ROADMAP.md, E11 is the next epic — its own single dependency (E10) is now satisfied. This is the **first, single-pass design** for Pronunciation Lab (PRD.md module 8) — the same process E4–E10 each went through (CLAUDE.md's own workflow rule: "Architecture and planning precede feature development... do not scaffold or implement application features until the corresponding module has an approved design"). This document does not write any application code; it designs the module, surfaces real gaps found while doing so (§3), and proposes the ADRs implementation will need (§7). Once a direction accepts this document (explicitly, or by the same "proceed by direct instruction" pattern E4–E10's own status lines record), implementation follows IMPLEMENTATION_GUIDE.md's 20-phase lifecycle per task.

Compared to E10, this is a narrower epic — one real capability (phoneme-level pronunciation scoring) surfaced through one new, mostly-synchronous API endpoint, not a new real-time transport. Real complexity is concentrated in one place: no provider integrated anywhere in this platform can actually produce a phoneme-level score (§3.1).

## 1. Epic Definition

PRD.md module 8 names this platform's whole pronunciation-scoring ambition in one line: "Phoneme-level scoring, correction | Feedback below word level, not just pass/fail" (PRD.md §6, row 8). It is also named explicitly as a Premium-only feature in PRD.md's own monetization table (§7: "Unlimited AI conversation, Pronunciation Lab, all exam prep, no ads") and as a concrete example of the free→Premium upsell moment (PRD.md §3: "Free-tier user hits a usage limit... or explores a Premium-only feature (e.g., Pronunciation Lab)").

The schema-level half of this already exists and has sat unused since E4 T5: `ai.prisma`'s `PronunciationScore` model and `PronunciationScoreSource` enum (`AI_MESSAGE | PRONUNCIATION_LAB_ATTEMPT`), confirmed by a full-repo search to have zero write sites anywhere through E1–E10. `ai.prisma`'s own header comment already flags the other half as a real, known gap: "PronunciationScore... tied to an AIMessage or a dedicated Pronunciation Lab attempt, but no 'Pronunciation Lab attempt' entity exists anywhere... whichever future epic designs the real Pronunciation Lab module owns closing this gap for real." This epic is that epic.

This epic also inherits a second, already-registered-but-dormant piece of infrastructure: `services/ai-engine`'s own tool registry (ADR-032, E5 T5) already declares that the Conversation Partner persona may invoke `PRONUNCIATION_COACH` as a specialist tool on a `phoneme_score_threshold` trigger — its own code comment already says this "cannot be evaluated for real until speech-service (E10) produces real phoneme-level confidence scores." E10 is done; this epic is the first one that could, in principle, produce that signal. Whether it actually should wire live, mid-conversation specialist invocation is addressed directly in §3.5 — the answer this document reaches is **not yet**, for a real, separate reason.

**In scope:**

- `services/speech-service`'s first pronunciation-scoring provider: a new, provider-agnostic `PronunciationProvider` adapter (ADR-006's pattern, extended a second time after `SttProvider`/`TtsProvider`) and one real implementation, pinned by a new ADR (§7).
- A new, stateless `POST /v1/pronunciation/score` endpoint on `speech-service` — audio + a target reference phrase in, phoneme/word-level scores out. No persistence, no session state (ADR-044's "no direct Postgres access" principle extended to a second internal HTTP surface, §6.2).
- `apps/api`'s new `PronunciationModule` — the learner-facing `POST /v1/pronunciation-attempts` endpoint, real `PronunciationLabAttempt` + `PronunciationScore` writes (closing the schema gap named above), and the module's own new domain event (§6.5).
- The missing `PronunciationLabAttempt` Prisma model (§6.3) — a real migration, not a placeholder.

**Explicitly out of scope** (cited against ROADMAP.md/PRD.md's own classification, not silently absorbed):

- **Live, mid-conversation specialist-tool invocation** (Pronunciation Coach firing during a Conversation Partner session) — a real, structural gap that predates this epic and is broader than pronunciation alone (§3.5). Not this epic's own scope to close.
- **Real Premium-entitlement enforcement** — PRD.md names this a Premium-only feature, but no epic has yet built the platform's own entitlement-enforcement guard (§3.6/§11). E15 (Subscription & Billing Platform) is the epic ROADMAP.md names for that; this epic's own endpoint is built for every authenticated learner today, with the gate itself named as a real, tracked gap, not silently ignored.
- **The actual practice-mode recording UI** (`apps/web`/`apps/mobile` pixels: target-phrase display, record button, phoneme-level visual feedback) — matching E4–E10's own precedent (backend/engine epics, not UI epics), this epic designs the API contract and backend pipeline a future UI consumes (§3.6).
- **A live provider spike against real Azure Speech traffic** — this environment has no live Azure credentials (RISK_REGISTER R-88, the same standing limitation every AI/speech-calling epic in this session has carried); addressed honestly in §3.8/§11, not silently declared verified.
- **Regional/dialectal accent-fairness tuning** — RISK_REGISTER R-11 already names this exact risk for pronunciation scoring generally; this epic surfaces it again with the real provider now named (§3.7/§11) but does not resolve it — a QA/pedagogy review process, not a schema or code change, is what R-11's own mitigation already calls for.

## 2. Business Objective

Closes PRD.md Journey C's own remaining gap: E10 gave learners live spoken conversation with a coarse, LLM-estimated `FluencyScore.componentScores.pronunciation` (0–100, one number, no positional detail — E10 T5). This epic gives them the differentiator PRD.md module 8 names specifically ("feedback below word level, not just pass/fail") — a dedicated practice mode where a learner attempts a **known** target phrase and gets back which specific phonemes/words were weak, not just a single aggregate score. This is also the concrete, named Premium-conversion trigger PRD.md §3 calls out by name, directly supporting the platform's own unit-economics exit criterion (PRD.md §8: "Positive or credibly-trending-positive unit economics").

## 3. Scoping boundary and conflicts found

### 3.1 No provider integrated anywhere in this platform can produce a phoneme-level score

ADR-043 (E10 T1) pinned `services/speech-service`'s STT to OpenAI's `whisper-1` — a pure transcription model. Whisper has no pronunciation-assessment mode: it returns text, not per-phoneme accuracy/stress/fluency scores against a known reference. This is a real, load-bearing finding, not a minor implementation detail — it means this epic cannot simply reuse E10's existing `SttProvider`. A dedicated pronunciation-assessment API is required (§6.1, §7 ADR-049).

### 3.2 `PronunciationScore`/`PronunciationScoreSource` already exist (E4 T5), unused since inception — this epic is their first real writer

Confirmed by direct inspection of `packages/database/schema/ai.prisma` and a full-repo grep: zero `prisma.pronunciationScore.create(...)` call sites anywhere through E1–E10. The schema shape (`phonemeScores: Json`, `overallScore: Float`, polymorphic `(sourceType, sourceId)`) is exactly what this epic needs for its `PRONUNCIATION_LAB_ATTEMPT` variant; the `AI_MESSAGE` variant (in-conversation scoring) is explicitly out of scope here (§3.5) and remains unwritten after this epic too — a real, honestly-flagged partial closure, not a claim this epic writes every row that table could ever hold.

### 3.3 The `PronunciationLabAttempt` entity `ai.prisma`'s own header comment flags as missing needs designing here

Quoted directly from the schema file's own header: "no 'Pronunciation Lab attempt' entity exists anywhere in DATABASE.md's domain-by-domain list... whichever future epic designs the real Pronunciation Lab module owns closing this gap for real, not this schema." §6.3 designs it.

### 3.4 `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` were removed as dead scaffolding at E10 T1 — this epic is their real, legitimate reintroduction

E10 T1's own evidence text records: "the original E1 'Speech (STT/TTS)' scaffolding (`SPEECH_STT_PROVIDER=whisper`, `SPEECH_TTS_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`) was confirmed via a full-repo search to have never been consumed by any code and named a materially different provider set than this task's own real, researched ADR-043 decision — removed." If this epic pins Azure Speech's Pronunciation Assessment feature (§7, ADR-049), `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` return as real, genuinely-consumed config for the first time — not a reversal of that earlier cleanup, its actual resolution.

### 3.5 Real mid-conversation specialist-tool invocation doesn't exist for **any** persona yet — a structural gap broader than pronunciation, out of this epic's own scope

A direct search of `services/ai-engine/src` confirms `evaluateTrigger()` (T5, ADR-032) has **zero real call sites** anywhere in `OrchestratorService` or any specialist code — not just for the `PRONUNCIATION_COACH`/`phoneme_score_threshold` pairing this epic's own dormant registry entry names, but also for `GRAMMAR_COACH`/`error_pattern_threshold`, registered at the same time for the same reason and equally never wired. Building the _general_ mechanism by which the Orchestrator mid-turn detects a trigger signal, invokes a specialist tool, and weaves its structured critique back into a live reply is real, substantial, cross-cutting work that belongs to whichever epic first needs it for real — not a narrow "wire pronunciation" task bolted onto this epic's own dedicated-practice-mode scope. Flagged here as a real, structural finding (RISK_REGISTER, §11), not silently absorbed into this epic's task list.

### 3.6 This epic is backend/engine + a real, minimal API surface — not the actual practice-mode recording UI, and not real entitlement enforcement

Matches E4–E10's own precedent: this document designs the WebSocket-free HTTP contract and backend pipeline a future UI consumes, not the actual recording screen. Separately, and for a different reason: PRD.md names this feature Premium-only, but no epic prior to E15 (Subscription & Billing Platform, ROADMAP.md) has built any entitlement-enforcement guard anywhere in `apps/api` — confirmed by a full-repo search finding no `EntitlementService`, guard, or interceptor of any kind, despite `Entitlement`/`Plan`/`EntitlementChangeLog` already existing in `billing.prisma`/`identity.prisma` since an earlier epic. This epic's own endpoint is therefore built open to every authenticated learner for now, with the missing gate named as a real, tracked gap (§11) rather than either blocking this epic on E15 or silently building a one-off, throwaway gate that duplicates whatever E15 eventually builds for real.

### 3.7 RISK_REGISTER R-11 names accent-fairness for pronunciation scoring specifically — already tracked, not newly discovered, but now has a real provider name attached

R-11 ("Pronunciation scoring penalizes valid regional/dialectal accents") predates this epic (present in RISK_REGISTER.md before this document existed) and already names its own mitigation ("explicit accent-coverage matrix, QA sign-off distinct from automated metrics"). This epic does not resolve R-11 — it makes it concrete: Azure Speech's Pronunciation Assessment feature (§7) is scored against a fixed reference phoneme sequence for the _target_ language variant it's configured with, and its own documented behavior is that it does not natively distinguish "a different valid regional accent" from "a pronunciation error" — R-11's own mitigation (a human QA/pedagogy review process) remains the real, undone follow-up work.

### 3.8 RISK_REGISTER R-88's standing "no live credentials" limitation extends to the new provider too

The same environment-wide gap every AI/speech-calling epic in this session has carried (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` both empty in local `.env`) applies identically to whatever Azure Speech credentials this epic's own ADR-049 would need — none exist in this environment either. Addressed the same way E10 addressed it throughout: real, honest unit-level verification with a mocked provider; live-provider verification named as required, separately-scoped follow-up the moment real credentials exist.

## 4. Bounded context & ownership

| Concern                                                                                             | Owner                                                 | Why                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PronunciationProvider` adapter, `AzurePronunciationAssessmentProvider`, stateless scoring endpoint | `services/speech-service`                             | Mirrors `SttProvider`/`TtsProvider`'s own ownership (ADR-006, ADR-043) — the one place this platform's provider-agnostic speech adapters already live                                                                                                                                                                                             |
| `PronunciationLabAttempt`/`PronunciationScore` persistence, learner-facing endpoint, domain event   | `apps/api` (new `PronunciationModule`)                | `apps/api` already has direct Postgres access to `ai.prisma`'s tables via the shared client (unlike `speech-service`, ADR-044) — the same ownership split E10 T5's `FluencyScoringService` established for `ai-engine`, applied here to `apps/api` instead since no streaming/session-state concern forces a third internal service into the path |
| The `Entitlement`/`Plan` schema `Pronunciation Lab` will eventually check                           | E15 (Subscription & Billing Platform) — not this epic | Real enforcement infrastructure doesn't exist yet anywhere in this platform (§3.6) — this epic's endpoint does not invent a one-off gate                                                                                                                                                                                                          |

## 5. Component-by-component design summary

| Component                                             | New/Changed                                                                                                                                 | Notes                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `services/speech-service/src/pronunciation-provider/` | New — `PronunciationProvider` interface, `AzurePronunciationAssessmentProvider`, config resolver                                            | Mirrors `speech-provider/`'s own file layout exactly                                                                        |
| `services/speech-service`'s new controller            | New — `POST /v1/pronunciation/score`, no auth guard (internal-network-only, mirrors `ai-engine`'s own `AgentSessionsController` convention) | Stateless: request in, scored response out, nothing persisted                                                               |
| `apps/api/src/modules/pronunciation/`                 | New `PronunciationModule` — `PronunciationLabService`, `PronunciationLabController`                                                         | `POST /v1/pronunciation-attempts` (`AuthGuard('jwt')` only, matching `SpeakingModule`'s own learner-facing precedent)       |
| `packages/database/schema/ai.prisma`                  | New `PronunciationLabAttempt` model; first real writer of `PronunciationScore`/`PronunciationScoreSource.PRONUNCIATION_LAB_ATTEMPT`         | A real migration                                                                                                            |
| `packages/validation/src/pronunciation/`              | New — request/response DTOs for both the `apps/api` and `speech-service` surfaces                                                           | Mirrors `speaking/`'s own "wire-only DTOs, no `packages/types` restatement" precedent where a type already exists elsewhere |
| `docs/EVENT_ARCHITECTURE.md`                          | New catalog row — `pronunciation.attempt.scored`                                                                                            | §6.5                                                                                                                        |
| `.env`/`.env.example`                                 | `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` reintroduced as real, consumed config                                                              | §3.4                                                                                                                        |

## 6. Cross-cutting mechanics

### 6.1 `PronunciationProvider` adapter & the Azure Pronunciation Assessment integration

A new interface, deliberately separate from `SttProvider`/`TtsProvider` (the same interface-segregation precedent those two already established over one shared `ModelProvider`-style interface — a provider that can transcribe or synthesize speech is not thereby able to score pronunciation against a reference, and vice versa):

```ts
export interface PhonemeScore {
  phoneme: string;
  accuracyScore: number; // 0-100
}

export interface WordScore {
  word: string;
  accuracyScore: number; // 0-100
  errorType: 'NONE' | 'MISPRONUNCIATION' | 'OMISSION' | 'INSERTION';
  phonemes: PhonemeScore[];
}

export interface PronunciationScoreResult {
  overallScore: number; // 0-100
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  words: WordScore[];
}

export interface PronunciationProvider {
  readonly name: 'azure';
  scorePronunciation(
    audio: Buffer,
    referenceText: string,
    languageCode: string,
  ): Promise<PronunciationScoreResult>;
}
```

One real implementation, `AzurePronunciationAssessmentProvider`, built on Azure Cognitive Services Speech SDK's Pronunciation Assessment feature (§7, ADR-049) — the one commercially-available API purpose-built for exactly this shape of scoring (reference-text-anchored, phoneme/word/accuracy/fluency/completeness output), unlike a general transcription API. Non-streaming — a Pronunciation Lab attempt is one complete recorded utterance scored against one known target phrase, not a live multi-turn stream, so `scorePronunciation` takes a complete `Buffer`, not an `AsyncIterable`, a deliberate, real difference from `SttProvider.streamTranscribe`'s own shape.

### 6.2 The Pronunciation Lab attempt lifecycle — a stateless request/response, not a WebSocket session

A real, deliberate simplification over E10's own real-time transport: a Pronunciation Lab attempt is one discrete, complete recording of a known target phrase, not a continuous, multi-turn conversation — it does not need E10's WebSocket gateway, its internal token handoff, or any per-connection state. The full path:

1. Client `POST /v1/pronunciation-attempts` to `apps/api` (`AuthGuard('jwt')`) with `{ languageId, targetPhrase, audio }` — `audio` base64-encoded in the request body (a single recorded utterance is small enough that this needs no chunked/streaming upload; E10's own binary-WebSocket-frame path exists specifically because live conversational audio is not bounded in advance, which does not apply here).
2. `PronunciationLabService` calls `speech-service`'s new `POST /v1/pronunciation/score` (internal network, no auth header — the same "already-authenticated request is the trust boundary" reasoning `AiEngineClientService`'s own callers already establish) with the audio, `targetPhrase`, and the resolved language code.
3. `speech-service`'s controller calls `PronunciationProvider.scorePronunciation()` and returns the raw `PronunciationScoreResult` — no persistence, no session state, matching ADR-044's own "no direct Postgres access for `speech-service`" principle extended here to a second internal HTTP surface for a materially different reason (that principle was about not risking a second independent writer to an _encrypted_ column; here it's the more general "stateless services own no persistence" boundary this epic's own ownership split, §4, establishes fresh).
4. `apps/api` persists a real `PronunciationLabAttempt` row and a real `PronunciationScore` row (`sourceType: PRONUNCIATION_LAB_ATTEMPT`, `sourceId` = the new attempt's own id), publishes `pronunciation.attempt.scored` (§6.5), and returns the full result to the caller.

### 6.3 Persistence: `PronunciationLabAttempt` + `PronunciationScore`

```prisma
model PronunciationLabAttempt {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @db.Uuid
  languageId   String   @db.Uuid
  targetPhrase String
  createdAt    DateTime @default(now())

  user     User     @relation(fields: [userId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  language Language @relation(fields: [languageId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@index([userId, createdAt])
  @@map("PronunciationLabAttempt")
}
```

Closes `ai.prisma`'s own header-flagged gap (§3.3) with a real, non-polymorphic entity — the `PronunciationScore.sourceId` pointing at it (`sourceType: PRONUNCIATION_LAB_ATTEMPT`) remains the same no-DB-FK polymorphic pointer T5 (E4) already established, unchanged, since `PronunciationScore`'s own two-variant shape is not this epic's own schema to alter. `targetPhrase` is denormalized onto the attempt itself (not looked up via a separate reference-phrase catalog table) — this epic does not design a curated phrase bank; the target phrase is caller-supplied for now, a real, deliberately narrow MVP scope matching how E10 T1's own single-provider pin kept scope tight rather than speculatively building a feature no document yet requires (a future task/epic may add a curated bank; this epic does not invent one to fill a gap PRD.md itself does not name).

### 6.4 Entitlement gating — explicitly not built here (§3.6)

The endpoint is real, authenticated, and functional for any learner today — no plan check. Flagged as a real, tracked, honest gap (RISK_REGISTER, §11), not a silent decision to make this feature free forever, and not this epic's own scope to fix by building a one-off gate that would only be thrown away once E15 ships the platform's real one.

### 6.5 Domain event: `pronunciation.attempt.scored`

A new catalog row, `docs/EVENT_ARCHITECTURE.md`, mirroring `speech.session.ended`'s own established shape (E10 T5):

```
producedBy: apps/api (Pronunciation module)
consumers: Gamification (future, E14 — not yet built), analytics-service (future, E17 — not yet built)
payload: { attemptId, languageId, overallScore, accuracyScore, fluencyScore, completenessScore }
```

Both named consumers are genuinely future work — `recommendation-engine`'s own RISK_REGISTER R-92 precedent already establishes that a cataloged-but-not-yet-consumed event is a normal, expected state for this platform (the producing epic often lands before its consumers' own epics do); not a new pattern invented here.

## 7. New ADRs proposed (status `Proposed` — full text added to DECISIONS.md at implementation time, starting at ADR-049)

| ADR     | Decision                                                                                                                                                                                                                                                                                                                             | Why it's needed now                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADR-049 | Pronunciation scoring pinned to Azure Cognitive Services Speech SDK's Pronunciation Assessment feature — a second, independent speech-provider integration alongside ADR-043's OpenAI STT/TTS pin (a different capability, not a failover chain for the same one) — behind a new `PronunciationProvider` adapter (ADR-006's pattern) | Closes §3.1's own found gap: no provider integrated anywhere in this platform can produce a phoneme-level score; ADR-043's own OpenAI pin cannot be extended to cover this                 |
| ADR-050 | Pronunciation Lab attempts are a stateless HTTP request/response (`apps/api` → `speech-service`'s new scoring endpoint), not a WebSocket session; `PronunciationLabAttempt`/`PronunciationScore` persistence lives in `apps/api` directly, not routed through `ai-engine`                                                            | A real, deliberate topology decision distinct from E10's own conversational round trip (§6.2) — a bounded, single-utterance interaction does not need real-time transport or session state |

## 8. Alternatives considered

- **Reusing E10's WebSocket gateway/`SttProvider` for pronunciation attempts** (rejected, ADR-050) — whisper-1 cannot produce phoneme-level scores at all (§3.1); even if it could, a Pronunciation Lab attempt is a single bounded utterance, not a multi-turn conversation, so the connection/reconnection/degradation machinery E10 T3/T6/T7 built for a genuinely long-lived session would be real, unjustified complexity here.
- **Routing `PronunciationLabAttempt`/`PronunciationScore` persistence through `ai-engine`, mirroring E10 T5's `FluencyScoringService`** (rejected, ADR-050) — E10's own routing exists specifically because `speech-service` has no Postgres access (ADR-044) and `ai-engine` already owns `ai.prisma`'s conversation tables; `apps/api` already has direct, safe access to the same schema file today (it already writes `AIAgentSession`-adjacent data nowhere, but does write plenty of other `ai.prisma`-adjacent tables via the shared Prisma client elsewhere in this platform) — adding a third internal HTTP hop (`apps/api` → `ai-engine` → Postgres) for a single-request feature with no encryption-boundary concern (`PronunciationScore.phonemeScores` carries no equivalent to `AIMessage.content`'s field-level encryption, ADR-029) would be unjustified indirection.
- **Building a curated reference-phrase bank now** (rejected, §6.3) — no document (PRD.md, this epic's own §1) names this as required scope; a caller-supplied `targetPhrase` is the real, minimal MVP shape, and a bank is real, separately-scoped future work if a future epic's own design calls for it.
- **Wiring live, mid-conversation Pronunciation Coach invocation as part of this epic** (rejected, §3.5) — the general specialist-tool-invocation mechanism doesn't exist for _any_ persona yet; building it as a side effect of "add pronunciation scoring" would silently absorb a structurally separate, larger piece of work this epic's own PRD-named scope (a dedicated practice mode) does not require.
- **Blocking this epic on E15 (Subscription & Billing Platform) shipping first, so the endpoint can be gated from day one** (rejected, §3.6) — E15 is not this epic's own dependency per ROADMAP.md (only E10 is), and no other feature in this platform has ever blocked its own build on a future epic's entitlement infrastructure landing first; the gap is named and tracked instead.

## 9. Task sequence

| Task   | Deliverable                                                                                                                                                                                                                                                                              | Depends on | Evidence (design-phase)                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** | `services/speech-service`'s `PronunciationProvider` adapter + `AzurePronunciationAssessmentProvider` (§6.1, ADR-049); new `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` config schema fragment; the new stateless `POST /v1/pronunciation/score` controller (§6.2)                            | E10        | Unit tests with a mocked Azure SDK client (matching E10 T1's own established convention for a freshly-pinned provider), config-resolver tests, controller tests |
| **T2** | The `PronunciationLabAttempt` migration; `apps/api`'s new `PronunciationModule` (`PronunciationLabService`/`Controller`, `POST /v1/pronunciation-attempts`); real `PronunciationLabAttempt`/`PronunciationScore` writes; `pronunciation.attempt.scored` domain event (§6.3–6.5, ADR-050) | T1         | Unit tests with a mocked `speech-service` HTTP client; a real e2e test against live Postgres proving both rows are created and the event is published           |

Deliberately two tasks, not more — this epic's own real scope (§1) is narrow enough that splitting further would create artificial task boundaries with no independent deliverable of their own, the same "don't pad the task table" discipline CLAUDE.md's own "no half-finished implementations" principle implies.

## 10. Open questions

Genuinely unresolved as of this draft — not silently decided, and not yet put to the user for a resolution decision the way E4–E10's own §10 recorded theirs.

1. **Whether Azure Speech's Pronunciation Assessment feature is available/priced acceptably in every one of this platform's 10 launch target languages** (PRD.md §8's own exit criterion) — a real, provisional research gap; this document names Azure as the real, working provider choice (§7) without having verified full language-coverage parity against PRD.md's own launch list, the same class of honest provisional decision ADR-043's own OpenAI pin already modeled for STT/TTS.
2. **Whether a curated reference-phrase bank (§6.3, rejected as this epic's own scope) is needed before a real practice-mode UI can ship** — a real, deliberately provisional MVP scoping call the eventual UI-focused epic's own design will need to resolve, not silently assumed either way here.

## 11. Risks

| Risk                                                                                                                                                                                                                        | Mitigation                                                                                                                                                                                        | Owner                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| RISK_REGISTER R-11 (accent/dialect fairness) applies directly to this epic's own chosen provider, and remains genuinely unresolved (§3.7)                                                                                   | R-11's own already-named mitigation (an explicit accent-coverage matrix, QA sign-off distinct from automated metrics) is real, undone follow-up work — not something a schema/code change closes  | AI Engineering + Pedagogy (TBD) |
| No entitlement enforcement exists anywhere in this platform yet (§3.6) — this epic's own Premium-named feature is built open to every learner                                                                               | Flagged here and in RISK_REGISTER; real gating is E15's own scope, not this epic's to invent a throwaway version of                                                                               | Backend Platform (TBD)          |
| RISK_REGISTER R-88's own standing "no live credentials" limitation blocks any live-provider verification of the new Azure integration in this environment                                                                   | Real, tracked follow-up the moment live credentials exist; unit-level verification with a mocked client is the real evidence bar this environment can meet (matching every prior AI-calling epic) | AI/Speech Engineering (TBD)     |
| Live, mid-conversation specialist-tool invocation (Grammar/Pronunciation Coach) remains unbuilt for every persona after this epic too (§3.5) — a structural gap this epic's own dormant registry entry still does not close | Flagged as a real, separate, cross-cutting piece of future work for whichever epic first needs real mid-turn specialist invocation — not scoped to this epic                                      | AI Engineering (TBD)            |

## 12. Gate sign-off log

| Gate         | Status        | Reviewer | Date | Notes                                                                                                                                                                                                  |
| ------------ | ------------- | -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture | ☐ Not started | —        | —    | The new second speech-provider integration and the stateless-HTTP-not-WebSocket topology decision (§6.2, ADR-050) are the key items to scrutinize                                                      |
| Security     | ☐ Not started | —        | —    | Voice recordings of a learner's own attempted speech are sensitive personal data — the same class SECURITY.md's file-upload-handling guidance already treats `AIMessage.audioUrl` recordings as (R-93) |
| Database     | ☐ Not started | —        | —    | New `PronunciationLabAttempt` model, first real writer of `PronunciationScore` (§6.3) — a real migration                                                                                               |
| API          | ☐ Not started | —        | —    | `POST /v1/pronunciation-attempts`/`POST /v1/pronunciation/score` contracts (API_GUIDELINES.md)                                                                                                         |
| AI           | ☐ Not started | —        | —    | The new `PronunciationProvider` adapter — this platform's second independent speech-provider integration                                                                                               |
| Performance  | ☐ Not started | —        | —    | No canonical PERFORMANCE.md budget names pronunciation scoring specifically — a real, provisional gap this gate should resolve                                                                         |
| Testing      | ☐ Not started | —        | —    | TESTING.md §4's own speech-related testing requirements, extended to a second provider                                                                                                                 |

## 13. Epic Approval

Not yet approved. Awaiting the same "explicit user direction to proceed" pattern E4–E10 each recorded in their own status line, or a formal Architecture Gate review.
