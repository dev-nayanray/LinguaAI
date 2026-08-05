# LinguaAI — AI Governance

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-07-29

[AI_SYSTEM.md](AI_SYSTEM.md) describes the AI platform's _architecture_. This document governs its _lifecycle_: how a model, prompt, or knowledge-base change is proposed, evaluated, and safely shipped, and who is accountable for correctness and safety. It directly resolves Architecture Review blockers #1 (RAG grounding), #3 (agent handoff protocol), and #4 (AI cost circuit breaker), and implements ADR-007, ADR-008, ADR-012.

## 1. Model & prompt lifecycle

```
Propose → Offline evaluation (golden set) → Staging canary → Production rollout → Monitoring → Deprecation
```

| Stage              | Gate                                                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Propose            | Change is described (what/why) and attached to a PR touching `services/ai-engine` prompt templates or model routing config                                                                                                              |
| Offline evaluation | Golden-set regression (tone/structure/factual-accuracy — §3) must pass; a regression is a blocking failure, not a warning                                                                                                               |
| Staging canary     | Deployed to staging behind the same promotion pipeline as code (DEPLOYMENT.md §4) — a prompt change is a production behavior change and never ships out-of-band of the normal release process                                           |
| Production rollout | Canary rollout to a small traffic percentage first, specifically for `ai-engine` (DEPLOYMENT.md §4), with automated rollback if golden-set-equivalent production signals (safety-filter trigger rate, user-reported-issue rate) regress |
| Monitoring         | Cost, latency, and quality dashboards (OBSERVABILITY.md) watched for the first 48h at minimum                                                                                                                                           |
| Deprecation        | Superseded prompt/model versions are retained (not deleted) for a minimum window to support incident investigation and rollback                                                                                                         |

Every prompt template and every `AIUsageLog`/`AIMessage` record carries an explicit **prompt version** and **model identifier** (DATABASE.md) — this is what makes a quality regression traceable to a specific change rather than a mystery.

## 2. Multi-agent coordination (implements ADR-007)

One **Orchestrator** agent owns the user-facing voice and full session state for any given `AIAgentSession`. Specialist personas (Grammar Coach, Pronunciation Coach, Vocabulary Coach, Writing Coach, Exam Coach) are **not** independent chat participants — they are typed tools the Orchestrator invokes when a defined trigger condition fires (e.g., a grammar-error pattern crosses a confidence threshold within a Conversation Partner session).

- A specialist tool call **always returns a structured, schema-validated critique object** (never freeform prose) — this is what makes specialist behavior testable via structural contract tests (TESTING.md §3), independent of exact wording.
- The Orchestrator decides _whether and how_ to surface a specialist's critique in its own response — it is never a silent hand-off that changes "who's talking" from the user's perspective.
- This bounds cost: a specialist is invoked only on a real trigger, not by default on every conversational turn.
- The Personal Language Teacher persona (AI_SYSTEM.md §3) is the default Orchestrator for general sessions; Conversation Partner, Exam Coach, etc. can also act as the Orchestrator for their own session type, always with the same tool-calling relationship to the remaining specialists.

## 3. Evaluation framework

Four evaluation suites gate every prompt/model/knowledge-base change (extends TESTING.md §3):

| Suite                    | Checks                                                                                                                                                  | Blocking?                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Golden-set regression    | Representative learner inputs per agent, rubric-scored for tone/structure/helpfulness                                                                   | Yes                                     |
| **Factual-accuracy set** | Grammar-rule and exam-rubric correctness against the curated knowledge base (§4) — the suite specifically added to close the hallucination-risk finding | Yes                                     |
| Red-team/safety set      | Prompt-injection and abuse-pattern cases against the Safety Layer (§6, SECURITY.md §5)                                                                  | Yes                                     |
| Cost/latency regression  | Flags material token-usage or latency increases without a documented quality justification                                                              | Yes, with documented-exception override |

Suites run automatically in CI for `services/ai-engine` PRs and on a schedule against production traffic samples (drift can occur without any code change, e.g., provider-side model updates).

## 4. RAG knowledge base governance (implements ADR-008)

A curated, versioned knowledge base is retrieved and injected as grounding context for any agent response making a factual or scoring claim — architecturally distinct from the personalization memory store (AI_SYSTEM.md §4: same pgvector infrastructure, separate collection).

- **Sources**: CEFR level descriptors, grammar reference content, official exam rubrics (IELTS/TOEFL/JLPT/TOPIK/HSK/DELE band descriptors) — licensed/sourced content, not model-generated.
- **Curation & sign-off**: content is reviewed and approved by a named linguist/pedagogy function before entering the knowledge base — this is the human accountability process the Architecture Review found missing ("educational accuracy" gap, ARCHITECTURE_REVIEW.md Part 5). Engineering owns the retrieval pipeline; pedagogy owns the content's correctness.
- **Versioning**: the knowledge base has its own version, independent of prompt version and embedding-model version, so any of the three can change without implying the others changed.
- **Update cadence**: reviewed at minimum each time a supported exam program updates its official rubric, and on a standing quarterly review cycle otherwise.
- **Embedding-model pinning**: the embedding model used to index the knowledge base (and `AIMemoryEntry`) is pinned per deployment (`embeddingModelVersion` field, DATABASE.md); a model change requires an explicit, tracked re-embedding migration — silent drift here would silently degrade retrieval quality platform-wide.

## 5. Cost governance (implements ADR-012)

- **Per-user entitlement caps** (AI_SYSTEM.md §8) are the first line of defense against individual abuse.
- **Platform-level circuit breaker** is the second, independent line of defense: an aggregate spend-rate cap (per-minute/per-hour) across all AI traffic. On breach: (1) automatically degrade new requests to a cheaper model tier where the request class allows it, (2) if breach persists, hard-stop new AI-invoking requests with a graceful, honest user-facing message ("AI teacher is temporarily busy — try again shortly"), never a silent failure, (3) page on-call immediately.
- Thresholds are set from real staging/production traffic data and reviewed monthly, not fixed permanently at a guessed initial value.
- Cost data (`AIUsageLog`) feeds the same dashboards DevOps uses for infrastructure cost (OBSERVABILITY.md, DEPLOYMENT.md §7) — AI cost is not tracked as a separate, disconnected concern.

## 6. AI safety policy

- **Input handling**: user-supplied content is treated as untrusted input to the model (never concatenated into system-level instructions without boundary delimiting) — SECURITY.md §5.
- **Output handling**: AI-generated text rendered as rich content is sanitized before rendering (SECURITY.md §5 output-sanitization requirement) — protects against the model being tricked into emitting unsafe markup.
- **Age-appropriate content boundaries**: enforced at the gateway level via account-age-bracket metadata, not left to prompt instructions alone — elevated priority given Family-plan minors (SECURITY.md §7; Family plan itself is Version 2 per ADR-013, but the content-boundary mechanism is built as part of the Safety Layer regardless, since `TEACHER`-role and general community exposure to AI content applies platform-wide).
- **Human-in-the-loop sampling**: a defined percentage of agent outputs are sampled for human quality/safety review, weighted higher in the weeks immediately after any production rollout (§1) and for any newly launched agent or language.
- **Bounded tool surface**: every tool an agent can invoke is explicitly declared per agent definition in a versioned **tool registry** (no agent has unscoped code execution or unrestricted external calls) — resolves the Architecture Review's AI-extensibility gap (ARCHITECTURE.md §8).

## 7. Fallback strategy

| Failure                                               | Fallback                                                                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary LLM provider errors/times out                 | `ai-engine` Router fails over to a configured secondary provider/model for the same request class (AI_SYSTEM.md §2), logged for reliability monitoring                                                                 |
| STT/TTS provider failure                              | Speaking session degrades to text-only conversation rather than failing the session entirely (PRD.md Journey C)                                                                                                        |
| All LLM providers unavailable for a non-critical path | Cached/canned response where semantically valid (e.g., a static "please try again" for conversational endpoints); critical paths (assessment scoring) fail closed with an honest error rather than a fabricated result |
| Vector DB (pgvector) degraded                         | Agents proceed without memory/RAG context rather than failing the session, with a lower-confidence flag on any factual claims made without grounding                                                                   |

## 8. Accountability

| Concern                                                           | Owner                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Prompt template correctness & tone                                | AI/Product Engineering                                                          |
| Factual/pedagogical accuracy of knowledge base and system prompts | Linguist/pedagogy review function (named role, not diffused across engineering) |
| Safety filter effectiveness                                       | Security + AI Engineering, jointly                                              |
| Cost governance thresholds                                        | AI Engineering + Finance/DevOps, reviewed monthly                               |
