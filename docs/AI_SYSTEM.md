# LinguaAI — AI System Architecture

Status: **v1.1 — Consolidated baseline** · Owner: AI Engineering · Last updated: 2026-07-29

Supersedes Draft v1.0. This document is the AI platform's _architecture_. Its _lifecycle governance_ (model/prompt promotion, evaluation gates, RAG knowledge-base curation, agent handoff protocol detail, cost-breaker governance, safety policy) lives in **[AI_GOVERNANCE.md](AI_GOVERNANCE.md)** and is referenced rather than duplicated below. Latency/performance numbers are owned canonically by **[PERFORMANCE.md](PERFORMANCE.md)**. See [BASELINE.md](BASELINE.md) for the current authoritative summary and [DECISIONS.md](DECISIONS.md) for ADR-006, 007, 008, 012.

## 1. Principles

1. **Provider-agnostic by design.** No application code calls an LLM/STT/TTS SDK directly. Everything routes through the AI gateway in `services/ai-engine` (ADR-006). This makes model swaps, cost optimization, and multi-provider fallback a configuration change, not a rewrite.
2. **Agents are personas with a shared substrate, not separate codebases.** All seven AI Teacher agents (module 4) share one orchestration engine, memory system, and safety layer; what differs between them is system prompt, tool access, and scoring rubric — not infrastructure.
3. **Memory is durable and explicit.** A learner's mistakes, interests, and progress persist across sessions and across agents.
4. **Factual and pedagogical claims are grounded, not improvised.** Any agent output that states a grammar rule, cites an exam rubric, or scores a learner's work is grounded in the curated knowledge base (§3, ADR-008) — never left to the model's parametric knowledge alone. This directly addresses the highest-priority finding from the Architecture Review Gate: hallucination risk in exactly the modules where correctness is the entire value proposition.
5. **Cost is a first-class metric, tracked per request from day one, and bounded at the platform level, not just per-user** (§8, ADR-012).

## 2. AI gateway architecture

```
apps/api, apps/web, apps/mobile
            │
            ▼
   services/ai-engine  (the only component that talks to model providers)
   ├── Router               — selects provider/model per request type & tier
   ├── Prompt Manager        — versioned, testable prompt templates per agent
   ├── Orchestrator           — owns session state; invokes specialist agents as tools (§3)
   ├── RAG Retrieval Layer     — grounds factual/pedagogical output against the knowledge base (§4)
   ├── Memory Manager           — reads/writes AIMemoryEntry (Postgres + pgvector)
   ├── Safety Layer               — content filtering, PII redaction, abuse detection (AI_GOVERNANCE.md §6)
   ├── Cost Meter & Circuit Breaker — per-request metering + platform-wide spend cap (§8)
   └── Provider Adapters            — Anthropic, OpenAI, (future) others, behind one interface
            │
            ▼
   services/speech-service (STT/TTS providers, behind the same adapter pattern)
```

All providers are integrated behind a single internal `ModelProvider` interface (`generate`, `stream`, `embed`) so the Router can fail over between providers without callers knowing which provider served a given request. The internal request/response contract between `apps/api` and `ai-engine` is documented alongside the OpenAPI spec (API_GUIDELINES.md §11) rather than left implicit.

## 3. Agent orchestration (implements ADR-007)

One **Orchestrator** agent owns the user-facing voice and full session state for a given `AIAgentSession`. Specialist personas — Grammar Coach, Pronunciation Coach, Vocabulary Coach, Writing Coach, Exam Coach — are **typed tools** the Orchestrator invokes when a defined trigger condition fires (e.g., a recurring grammar-error pattern crossing a confidence threshold during a Conversation Partner session), returning a structured, schema-validated critique object that the Orchestrator weaves into its own response.

| Agent                     | Role                                                                            | Key tools/context                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Personal Language Teacher | Default Orchestrator for general sessions; explains the "why" behind the plan   | `LearningPlan`, `ProficiencyLevel`, memory                                                                 |
| Conversation Partner      | Orchestrator for real-time spoken/written dialogue practice, scenario role-play | Speech-service streaming, memory, fluency scoring; invokes Grammar/Pronunciation Coach as tools on trigger |
| Grammar Coach             | Specialist tool: explains and corrects grammar errors in context                | RAG-grounded (§4) rule lookup + LLM explanation; writes to `AIMemoryEntry` on recurring mistakes           |
| Pronunciation Coach       | Specialist tool: phoneme-level feedback                                         | Speech-service phoneme scoring output as tool input                                                        |
| Vocabulary Coach          | Specialist tool / Orchestrator for dedicated vocabulary sessions                | `UserVocabulary` read/write, generates example sentences                                                   |
| Writing Coach             | Orchestrator for writing-review sessions                                        | RAG-grounded rubric scoring, structured critique output                                                    |
| Exam Coach                | Orchestrator for exam-prep sessions                                             | RAG-grounded `ExamProgram` rubric data (§4), mock test scoring                                             |

This preserves one consistent voice and full memory continuity per session, bounds cost (a specialist is invoked only on a real trigger, not by default every turn), and produces a testable, structural contract (TESTING.md §3). Full governance detail — including the exact trigger-condition catalog and tool-registry versioning — lives in [AI_GOVERNANCE.md](AI_GOVERNANCE.md) §2, §6.

## 4. RAG architecture & knowledge base strategy (implements ADR-008)

A curated, versioned **knowledge base** (`KnowledgeBaseEntry`, DATABASE.md §2.5) is retrieved and injected as grounding context for any agent response making a factual or scoring claim:

```
Agent needs to state a fact / score against a rubric
        │
        ▼
RAG Retrieval Layer: pgvector similarity search against KnowledgeBaseEntry
   (separate collection from AIMemoryEntry — same infra, different governance)
        │
        ▼
Retrieved grounding passages injected into the prompt context, cited internally
        │
        ▼
Model generates response constrained to the grounded content;
low-confidence/ungrounded claims are flagged rather than stated as fact
```

- **Sources**: CEFR level descriptors, grammar reference content, official exam rubrics (IELTS/TOEFL/JLPT/TOPIK/HSK/DELE) — licensed/sourced content, never model-generated content feeding back into the knowledge base uncurated.
- **Governance**: curation, sign-off, versioning, and update cadence are owned by AI_GOVERNANCE.md §4 — this document owns the technical retrieval architecture, that document owns the human accountability process (a named linguist/pedagogy review function).
- **Distinct from personalization memory** (§5): the knowledge base answers "what is objectively true/correct," `AIMemoryEntry` answers "what do we know about this specific learner." The two are never merged into one collection, even though both use pgvector.
- **This is a blocking dependency**, not an enhancement: Grammar Coach and Exam Coach do not ship (ROADMAP.md Epics E13/E19) without RAG grounding in place.

## 5. Memory architecture

- **Short-term (session) memory**: full conversation turns held in-process/Redis for the duration of an `AIAgentSession`, passed as context to the model. For sessions long enough to approach the model's context window (e.g., an extended conversation-practice session), the Orchestrator applies rolling summarization rather than truncating context silently.
- **Long-term memory**: durable facts extracted after sessions (recurring grammar mistakes, topics of interest, goal context, tone preference) stored as `AIMemoryEntry` records, embedded and indexed via pgvector.
- **Retrieval**: at session start, the orchestrator retrieves the top-N most relevant memory entries by recency + semantic similarity, bounded by a token budget so memory injection doesn't crowd out conversation context.
- **Decay model**: each `AIMemoryEntry` carries a `confidence`/`lastReinforcedAt` pair (DATABASE.md §2.5) — an unreinforced note decays in retrieval weight over time rather than carrying the same confidence indefinitely, preventing stale personalization (e.g., an 8-month-old "struggles with subjunctive" note that's since been resolved).
- **Hygiene**: memory entries are versioned/superseded rather than unboundedly appended; a scheduled job periodically consolidates stale entries. Deletion of memory is part of GDPR account-deletion handling (DATABASE.md §10).

## 6. Model, prompt & embedding versioning

Every prompt template, every `AIMessage`/`AIUsageLog` record, and every embedding carries an explicit version (`promptVersion`, `modelId`, `embeddingModelVersion` — DATABASE.md). The full lifecycle a version change goes through (offline evaluation → staged canary → production rollout → monitoring → deprecation) is governed by **[AI_GOVERNANCE.md](AI_GOVERNANCE.md) §1** — this is what makes a quality regression traceable to a specific change rather than a mystery, and what makes embedding-model drift an explicit, tracked migration rather than silent degradation.

## 7. Latency budget (speaking practice)

Canonical latency numbers (stage-by-stage budget, p95 target) now live in **[PERFORMANCE.md](PERFORMANCE.md) §2** — referenced here, not restated, to keep a single source of truth. Streaming is used at every stage (streamed STT partials, streamed LLM tokens, streamed TTS) so the user perceives responsiveness well before the full response completes; this is a design constraint on provider selection, not a post-hoc optimization target.

## 8. Cost controls (implements ADR-012)

- **Per-user entitlement caps** (`Entitlement`, DATABASE.md §2.9) enforced at the API layer before a request reaches the AI gateway — the first line of defense against individual abuse.
- **Platform-level cost circuit breaker** — an aggregate, platform-wide spend-rate cap independent of per-user entitlements, closing the gap the Architecture Review identified (nothing previously capped aggregate/runaway cost from a provider pricing change or systemic bug). Breach response: degrade to cheaper model tier first, then hard-stop with a graceful user message, then page on-call. Full governance in AI_GOVERNANCE.md §5.
- Every AI request writes an `AIUsageLog` entry (tokens in/out, model, cost estimate, latency) feeding the same cost dashboards DevOps uses for infrastructure spend (OBSERVABILITY.md §2, §6) — AI cost is not a disconnected concern from platform cost.
- Response caching/reuse is applied where semantically valid (e.g., generated example sentences for common vocabulary items) to avoid redundant model calls for non-personalized content.

## 9. AI observability

Logging, tracing, metrics, and alerting for the AI pipeline follow the platform-wide standard in **[OBSERVABILITY.md](OBSERVABILITY.md)** — the AI-specific additions (cost-per-request, latency-per-pipeline-stage, entitlement-rejection rate, golden-set pass-rate trend, circuit-breaker trip count) are cataloged in that document's §2, not duplicated here.

## 10. AI safety & fallback strategy

Safety policy (content filtering tiers, input/output sanitization, human-in-the-loop sampling, bounded tool surface) and the provider/degrade fallback chain (primary→secondary LLM provider, STT/TTS failure→text-only, all-providers-down behavior) are governed in **[AI_GOVERNANCE.md](AI_GOVERNANCE.md) §6–§7**. Architecturally, the Safety Layer sits in the gateway (§2) as a mandatory pass for all input/output, not an optional per-agent integration.

## 11. Vector database

- **MVP**: `pgvector` on the primary Postgres instance (ADR-004) — avoids operating a second stateful system before scale demands it, and keeps memory/RAG retrieval transactionally close to the relational data it's joined with.
- **Scale trigger for migration** to a managed vector DB: sustained query-latency degradation or index-size thresholds, reviewed quarterly against production metrics (ARCHITECTURE.md §9).
- Embedding model and dimensionality are pinned per deployment (§6); a model change requires a tracked re-embedding migration.

## 12. Explicitly deferred

- AI Avatar Teacher (module 17, real-time video avatars) — significant additional infra deferred to a future phase per ROADMAP.md.
- Public AI/education API (module 27) — the agent/gateway boundary is designed to make this additive later, not a redesign.
- Fine-tuning custom models — MVP relies on prompting + RAG retrieval rather than fine-tuning; revisited if evaluation data (AI_GOVERNANCE.md §3) shows a clear quality/cost case.
