# Epic E12 — Listening & Reading Systems

**Epic ID:** E12 (ROADMAP.md)
**Status:** Design phase — first single-pass design, not yet implemented.
**Tech lead:** AI/Speech Engineering + Course Platform (TBD)
**Gate owners assigned:** Architecture, Database, API, AI, Testing, Documentation (Frontend/Accessibility/Deployment gates apply to the later UI-focused epic that builds the actual listening-player/reading screens, not this backend-engine epic — see §3.5)

## 0. Why this document exists now, and what it is not

E11 (Pronunciation Lab) is implementation-complete (T1–T2, 2026-08-13 — its own §9 task table's full sequence, confirmed no further task remains). Per ROADMAP.md, E12 is the next epic — both its dependencies (E5, E8) are already satisfied. This is the **first, single-pass design** for Listening & Reading Systems (PRD.md modules 9 and 10) — the same process E4–E11 each went through (CLAUDE.md's own workflow rule). This document does not write any application code; it designs the module, surfaces real gaps found while doing so (§3), and proposes the ADR implementation will need (§7).

Unlike E10/E11, this epic needs **no new external provider** — its own real finding is that everything it needs (AI content drafting, TTS synthesis, object storage) already exists elsewhere in this platform, unconsumed for this purpose. The real work is closing a schema-shape gap and adding one new stateless endpoint, not integrating anything new.

## 1. Epic Definition

PRD.md names two modules this epic covers together (ROADMAP.md's own "Listening & Reading Systems" bundling):

| #   | Module           | Description                                  | Differentiator                          |
| --- | ---------------- | -------------------------------------------- | --------------------------------------- |
| 9   | Listening System | AI-generated audio lessons, dictation        | Multiple voices/accents per language    |
| 10  | Reading System   | Leveled stories/articles, inline translation | Content reading level matches user CEFR |

Both already have real, if incomplete, footholds in this platform's schema (E4/E8): `ActivityType.LISTENING`/`ActivityType.READING` and `ExerciseType.LISTENING_COMPREHENSION` all exist (`content.prisma`). `ContentDraftingService` (E8 T4, `'content'` `AiRequestClass`) already generates lessons containing every `ActivityType` including these two — confirmed by direct inspection of `content-drafting.prompt.ts`, no `ActivityType` is excluded the way `SPEAKING_PROMPT` is excluded from `Exercise` drafts. **But `Activity.content` itself — the JSON payload meant to carry a Listening activity's own audio reference or a Reading activity's own passage text — has never had a real, type-specific schema anywhere in this platform.** `content.prisma`'s own header comment already anticipates this: "shape varies per ActivityType, validated at the application layer (`packages/validation`), not the database layer" — confirmed by a full-repo search that this application-layer validation is, today, a no-op `z.record(z.string(), z.unknown())` at every call site (`activitySchema`, `createActivityRequestSchema`, `updateActivityRequestSchema`, `contentDraftActivitySchema`). A drafted Listening activity today is real JSON with no guaranteed shape, no real audio, and no guaranteed transcript.

**In scope:**

- Real, discriminated `Activity.content` Zod schemas for `LISTENING` (`{ audioUrl, transcript }`) and `READING` (`{ passage, cefrLevel }`) — the two `ActivityType`s this epic's own PRD modules name, not all seven (§3.2).
- `services/speech-service`'s second stateless REST surface: a new `POST /v1/speech/synthesize` endpoint reusing the **already-integrated** `TtsProvider` (no new provider — ADR-043's OpenAI pin already covers this), mirroring E11's own `POST /v1/pronunciation/score` precedent (ADR-050) exactly.
- `apps/api`'s content-authoring pipeline extended: once a Listening activity's script is AI-drafted (`ContentDraftingService`, already real), a new step synthesizes it to real audio (the new endpoint above) and uploads it via the **already-built** `S3AudioStorageProvider` (E10 T4), producing a genuinely complete, playable activity — not just a text blob.
- A real "does a Reading passage match this learner's own CEFR level" read path — a new, small query against `ProficiencyLevel` (E6), which today has zero read-side consumer anywhere in `apps/api` (confirmed by direct inspection — only a write-side `upsert` inside `AssessmentService`).

**Explicitly out of scope** (cited against ROADMAP.md/PRD.md's own classification, not silently absorbed):

- **Dictation exercise scoring** (PRD's own "dictation" differentiator for module 9) — a materially different exercise mechanic (transcribe what you hear, scored against a reference transcript) from the already-real `LISTENING_COMPREHENSION` `ExerciseType` (multiple-choice comprehension questions about an audio clip). Real, separately-scoped future work; this epic closes the audio-content gap dictation would also depend on, but does not itself build a dictation-scoring exercise type.
- **Inline translation** (PRD's own module 10 differentiator) — a real, separate feature (tap a word/phrase in a Reading passage, get a translation) with no schema or API surface anywhere in this platform yet. Flagged as a real, concrete gap (§11) for whichever future task builds the actual reading-screen UI, not this backend epic's own scope.
- **Multiple voices/accents per language** (PRD's own module 9 differentiator) — `OpenAiSpeechProvider`'s own `TTS_VOICE` is a single hardcoded constant (`'alloy'`, `speech-provider/openai-speech.provider.ts`); making voice a real, selectable parameter is real, cheap, separately-scoped future work this epic does not attempt, since no document requires it for a first working Listening pipeline.
- **The remaining five `ActivityType`s' own real content shapes** (`VOCABULARY_DRILL`, `GRAMMAR_EXPLANATION`, `SPEAKING`, `WRITING`, `CONVERSATION`) — the same untyped-JSON gap applies to all of them, but only `LISTENING`/`READING` are this epic's own named PRD modules; typing the rest is real, separately-scoped future work for whichever epic (or a dedicated content-platform hardening task) needs it.
- **The actual listening-player/reading-screen UI** — matching E4–E11's own precedent, this epic designs the schema/API a future UI consumes, not the actual screen (§3.5).
- **Real entitlement/usage-limit enforcement** on AI-generated audio synthesis cost — the same platform-wide gap RISK_REGISTER R-96 already names (found at E11), not re-litigated here.

## 2. Business Objective

Closes the last two of PRD.md's four core skill-practice modules (Speaking/E10, Pronunciation/E11 already done; Listening/Reading are modules 9-10) with a real, working content pipeline — not just a schema placeholder. Directly supports PRD.md §8's own "10 launch target languages with complete A1–B2 content" exit criterion, which is unreachable for Listening/Reading specifically today (no real audio exists for any `LISTENING` activity; no CEFR-matching exists for `READING`).

## 3. Scoping boundary and conflicts found

### 3.1 `Activity.content`'s "validated at the application layer" promise has never been kept for any `ActivityType`

`content.prisma`'s own header comment on `Activity.content` reads: "shape varies per ActivityType, validated at the application layer... not the database layer." Confirmed by a full-repo search: no such validation exists anywhere — every schema touching `Activity.content` (`packages/validation/src/content/index.ts`) uses a bare `z.record(z.string(), z.unknown())`. This is a real, load-bearing gap this epic closes for its own two named types.

### 3.2 Only two of seven `ActivityType`s are this epic's own real scope

Typing all seven would be real, disproportionate scope creep against what PRD.md's own module list actually asks this epic to build (modules 9-10 only). `SPEAKING`'s own content shape is E10's own domain (already handled via the real-time WebSocket protocol, not `Activity.content`); `WRITING`/`CONVERSATION`/`VOCABULARY_DRILL`/`GRAMMAR_EXPLANATION` remain untyped after this epic too — a real, explicitly-scoped-out gap (§11), not silently forgotten.

### 3.3 `services/speech-service` has no stateless TTS synthesis endpoint — only the WebSocket-bound realtime path

Confirmed by direct inspection: `TTS_PROVIDER`/`STT_PROVIDER` are consumed only by `realtime/speech-session.gateway.ts` (the live conversational WebSocket, E10 T3) and internally by `speech-provider.module.ts`. The service's only two HTTP controllers are its health check and E11's own pronunciation-scoring endpoint. Content-authoring needs to synthesize a Listening script into audio **outside** any live conversation session — the same real, structural reason E11 built a stateless `POST /v1/pronunciation/score` rather than reusing the WebSocket transport (§7 ADR-051, mirroring ADR-050's own reasoning exactly).

### 3.4 No read-side CEFR-level accessor exists anywhere in `apps/api`

`ProficiencyLevel` (E6) has exactly one consumer in this platform today: a write-side `upsert` inside `AssessmentService`'s own scoring transaction. Confirmed by direct inspection — no `apps/api` service anywhere reads a learner's own current CEFR level for a language. Reading-level matching (PRD's own module 10 differentiator) needs this as a real, new query.

### 3.5 This epic is backend/engine + a real, minimal API surface — not the actual listening-player/reading-screen UI

Matches E4–E11's own precedent exactly.

## 4. Bounded context & ownership

| Concern                                                              | Owner                                                                          | Why                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Activity.content` LISTENING/READING schemas                         | `packages/validation/src/content/`                                             | Same file every other `content.prisma`-adjacent DTO already lives in                                                                                                                  |
| New stateless `POST /v1/speech/synthesize`                           | `services/speech-service`                                                      | Mirrors `PronunciationScoringController`'s own ownership split exactly (ADR-050/051) — reuses the already-injected `TTS_PROVIDER` token, no new module needed beyond a new controller |
| AI-drafted script → real synthesized audio → S3 upload orchestration | `apps/api` (`CourseModule`, extending existing content-authoring)              | `apps/api` already owns the admin content-authoring flow (E8 T4) and already has a real HTTP client pattern to `speech-service` (E11 T2, `SpeechServiceClientModule`) to extend       |
| CEFR-level-matched Reading read path                                 | `apps/api` (`CourseModule`, extending existing learner-facing lesson read API) | `LessonContentService` (E8 T2) already owns the learner-facing published-content read surface                                                                                         |

## 5. Component-by-component design summary

| Component                                  | New/Changed                                                                                                                      | Notes                                                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/validation/src/content/index.ts` | New — `listeningActivityContentSchema`, `readingActivityContentSchema`                                                           | Discriminated by `ActivityType`, applied at the same `activitySchema`/`createActivityRequestSchema` call sites that currently accept a bare record |
| `services/speech-service`'s new controller | New — `POST /v1/speech/synthesize` (§6.1, ADR-051), no auth guard (internal-network-only, mirrors E11's own convention)          | Text in, synthesized audio bytes (base64) out — stateless, reuses the already-injected `TTS_PROVIDER`                                              |
| `apps/api`'s `SpeechServiceClientService`  | Extended — new `synthesizeSpeech(text): Promise<Buffer>` method                                                                  | Same client E11 T2 introduced, its second real method                                                                                              |
| `apps/api`'s `CourseModule`                | New — a listening-audio-generation step in the admin content-authoring flow; a new CEFR-matched Reading read endpoint            | Extends already-real modules, no new top-level module needed                                                                                       |
| `packages/database`                        | No schema migration — `Activity.content`'s own `Json` column shape is unchanged; only its application-layer contract is now real | A real, deliberate non-change: the polymorphic-JSON design was already correct for this need                                                       |

## 6. Cross-cutting mechanics

### 6.1 The new stateless TTS synthesis endpoint

```ts
POST /v1/speech/synthesize
{ text: string, languageCode: string }
→ { audio: string /* base64 */, contentType: 'audio/mpeg' }
```

Reuses `OpenAiSpeechProvider.streamSynthesize()` (already real, E10 T1) end to end — buffers the stream into a single response rather than a live chunked reply, the same "a bounded, single-shot operation doesn't need E10's streaming transport" reasoning E11's own `ADR-050` already established for pronunciation scoring.

### 6.2 Real Listening-activity content generation

1. Admin calls the existing `POST /v1/admin/lessons/ai-draft` (E8 T4) — unchanged, still returns a full draft including a `LISTENING` activity's own script as plain text in `content`.
2. **New**: before persisting a `LISTENING` activity for real, `apps/api` calls the new `SpeechServiceClientService.synthesizeSpeech()`, then uploads the resulting audio via the already-built `S3AudioStorageProvider` (E10 T4's own object-storage adapter, reused directly — no new upload code).
3. The real, persisted `Activity.content` becomes `{ audioUrl: <real S3 URL>, transcript: <the drafted script> }`, validated by `listeningActivityContentSchema` (§6.1's own schema) at write time.

### 6.3 Real Reading-level matching

A new, small read method (`LessonContentService` or a sibling) queries the caller's own `ProficiencyLevel` row for the requested `languageId`, then filters/orders published Reading activities by how closely their own `content.cefrLevel` matches — a real, working v1 (nearest-band match, the same "no speculative complexity beyond what's needed" discipline this session's own design docs have followed throughout), not a sophisticated recommendation algorithm.

## 7. New ADR proposed (status `Proposed` — full text added to DECISIONS.md at implementation time, starting at ADR-051)

| ADR     | Decision                                                                                                                                                                                                        | Why it's needed now                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-051 | A second stateless REST surface on `services/speech-service` (`POST /v1/speech/synthesize`), reusing the already-integrated `TtsProvider` — no new provider, unlike ADR-049/050's own Azure integration for E11 | Closes §3.3's own found gap: content-authoring needs to synthesize audio outside any live conversation session, and no such path exists today |

## 8. Alternatives considered

- **Routing Listening-audio synthesis through the existing WebSocket realtime gateway** (rejected, ADR-051) — that transport exists for a live, bidirectional conversational session; content-authoring is a one-shot, admin-triggered, offline operation with no client socket to speak of.
- **A brand-new TTS provider for content-authoring, separate from `OpenAiSpeechProvider`** (rejected) — no real requirement distinguishes "synthesize a conversational reply" from "synthesize a lesson script"; reusing the already-integrated, already-paid-for provider is the real, minimal-cost choice.
- **Typing all seven `ActivityType`s' own content shapes now, closing the gap completely** (rejected, §3.2) — real, disproportionate scope beyond what PRD.md's own module list asks this epic to build; a future content-platform hardening task's own scope if ever needed.
- **A sophisticated CEFR-matching/recommendation algorithm for Reading** (rejected, §6.3) — no document names this as required; a real, working nearest-band match is the honest v1, the same provisional-but-real discipline E7's own weakness-detection thresholds already modeled.

## 9. Task sequence

| Task   | Deliverable                                                                                                                                                                                                                                                                                 | Depends on | Evidence (design-phase)                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** | `listeningActivityContentSchema`/`readingActivityContentSchema` (§6.1); `speech-service`'s new `POST /v1/speech/synthesize` (ADR-051); `SpeechServiceClientService.synthesizeSpeech()`; `apps/api`'s content-authoring flow wired to produce real, persisted, playable Listening activities | E11        | Unit tests with a mocked `TtsProvider`/`fetch`; a real e2e test proving a genuinely uploaded (local MinIO) audio URL ends up on a persisted `Activity.content` |
| **T2** | The CEFR-level-matched Reading read path (§6.3) — a new query + learner-facing endpoint                                                                                                                                                                                                     | T1         | Unit tests against a mocked `ProficiencyLevel` row; a real e2e test against live Postgres proving the returned ordering matches the caller's own level         |

## 10. Open questions

1. **Whether Listening-activity audio should be regenerated if its own drafted transcript is later edited** — a real, provisional MVP scoping call (this design assumes synthesis happens once, at first real persistence, matching `ContentVersion`'s own "each published edit is a new version" precedent from E8 T2 rather than live re-synthesis on every edit) — not yet put to the user for a resolution decision.
2. **Whether a Reading passage's own `cefrLevel` is admin-assigned at authoring time, or AI-estimated** — this design assumes admin-assigned (the same "content pipeline requires human sign-off" discipline RISK_REGISTER R-03 already established for AI-drafted content generally), not a new AI-estimation feature.

## 11. Risks

| Risk                                                                                                                                                                                                                          | Mitigation                                                                                   | Owner                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------- |
| Real audio synthesis cost for every Listening activity has no entitlement/usage-limit gate — the same platform-wide gap RISK_REGISTER R-96 already names                                                                      | Flagged here, not re-litigated; E15's own future scope                                       | Backend Platform (TBD)      |
| Only `LISTENING`/`READING` get real content-shape typing — the other five `ActivityType`s remain an untyped-JSON gap after this epic too (§3.2)                                                                               | Flagged as real, explicitly scoped-out; a future content-platform hardening task's own scope | Course Platform (TBD)       |
| RISK_REGISTER R-93's own already-tracked gaps (stored audio URLs not independently servable without a signed-URL layer; no malware scanning on ingest) apply identically to this epic's own newly-synthesized Listening audio | Same mitigation R-93 already names — not a new, separate risk, just a new instance of it     | AI/Speech Engineering (TBD) |

## 12. Gate sign-off log

| Gate         | Status        | Reviewer | Date | Notes                                                                              |
| ------------ | ------------- | -------- | ---- | ---------------------------------------------------------------------------------- |
| Architecture | ☐ Not started | —        | —    | The new stateless synthesis endpoint's own topology (§6.1, ADR-051)                |
| Database     | ☐ Not started | —        | —    | No migration — confirms the existing polymorphic-JSON design already fit this need |
| API          | ☐ Not started | —        | —    | `POST /v1/speech/synthesize` contract                                              |
| AI           | ☐ Not started | —        | —    | Reuses an already-governed provider (ADR-043) — no new AI-governance surface       |
| Testing      | ☐ Not started | —        | —    | Real e2e proof of genuine audio upload + persisted content shape                   |

## 13. Epic Approval

Not yet approved. Awaiting the same "explicit user direction to proceed" pattern E4–E11 each recorded, or a formal Architecture Gate review.
