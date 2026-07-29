# LinguaAI — Risk Register

Status: **v1.1 — Consolidated baseline** · Last updated: 2026-07-29

Living register of technical and product risks, consolidated from PRD.md §9, the Architecture Review Gate, and ADR consequences (DECISIONS.md). Reviewed at minimum each phase transition (ROADMAP.md) and whenever a new epic materially changes exposure.

| ID | Risk | Category | Likelihood | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| R-01 | AI conversational cost exceeds margin assumptions at scale | Financial | Medium | High | Model tiering, entitlement caps, platform cost circuit breaker (AI_GOVERNANCE.md §5, ADR-012) | AI Engineering | Mitigated (design), monitored in production |
| R-02 | AI hallucination undermines trust in factual/scoring content | Product/Trust | Medium | High | RAG grounding requirement (ADR-008), factual-accuracy evaluation suite (AI_GOVERNANCE.md §3) | AI Engineering + Pedagogy | Mitigated (design) |
| R-03 | Content pipeline can't produce 10-language A1–B2 content at launch quality/cost | Product | Medium | High | AI-assisted content authoring (ROADMAP.md Epic E8), phased language rollout if needed | Product/Content | Open |
| R-04 | Speech provider latency/quality fails the conversational UX budget | Technical | Medium | High | Provider spike before full commitment (ROADMAP.md E10 risk note), fallback provider chain (AI_GOVERNANCE.md §7) | AI/Speech Engineering | Open — de-risking spike required in E10 |
| R-05 | AI assessment's CEFR-alignment isn't valid against real proficiency | Product/Trust | Medium | High | Human-rater validation before marketing "accurate" (PRD.md §9) | Product + Pedagogy | Open |
| R-06 | Cross-tenant data leak in Enterprise data | Security | Low (post-mitigation) | Critical | Postgres RLS + app-layer + integration tests (MULTITENANCY.md, ADR-005) | Security + Backend | Mitigated (design), verify at E22 |
| R-07 | Minors' data handling fails COPPA/app-store child-safety requirements | Compliance | Low (post-mitigation) | Critical | Family plan descoped from MVP until consent flow is fully specified and tested (ADR-013) | Security + Legal | Mitigated (scope decision) |
| R-08 | Runaway/unbounded AI cost from a provider pricing change or bug | Financial/Operational | Low | High | Platform-level cost circuit breaker (ADR-012) | AI Engineering + DevOps | Mitigated (design) |
| R-09 | Privileged (Admin/Enterprise Admin) account takeover | Security | Low (post-mitigation) | Critical | Mandatory MFA (ADR-011) | Security | Mitigated (design) |
| R-10 | `apps/api` module-boundary erosion as 20+ modules accumulate | Engineering/Maintainability | Medium | Medium | Enforced dependency-graph lint (ADR-002, Epic E1) | Backend/Architecture | Open — tooling due in E1 |
| R-11 | Pronunciation scoring penalizes valid regional/dialectal accents (fairness) | Product/Ethics | Medium | Medium | Explicit accent-coverage matrix, QA sign-off distinct from automated metrics (ARCHITECTURE_REVIEW.md Part 5) | AI Engineering + Pedagogy | Open |
| R-12 | Single-region infrastructure has no disaster recovery from a regional AWS outage | Operational | Low | High | Cross-region backup snapshot replication (DEPLOYMENT.md §6) | DevOps | Open — scheduled in E23 |
| R-13 | AI provider (LLM/STT/TTS) outage with no fallback | Operational | Medium | Medium | Provider failover chain (AI_GOVERNANCE.md §7) | AI Engineering | Mitigated (design) |
| R-14 | Embedding-model drift silently degrades AI memory/RAG retrieval quality | Technical | Low | Medium | Pinned `embeddingModelVersion`, explicit tracked re-embedding migration (AI_GOVERNANCE.md §4) | AI Engineering | Mitigated (design) |
| R-15 | Gamification/referral abuse (bot-farmed XP/streaks, referral fraud) | Product/Integrity | Medium | Medium | Anti-gaming safeguards treated as launch-blocking (ROADMAP.md E14), fraud detection before referral program ships | Backend + Trust & Safety | Open |
| R-16 | Community/voice-room moderation fails to catch harassment or unsafe content | Trust & Safety | Medium | High | Automated moderation + reporting flow before Community ships broadly (SECURITY.md §8); voice rooms specifically deferred pending moderation design | Trust & Safety | Open — Growth phase |
| R-17 | Course/vocabulary content is scraped by competitors | Business/IP | Medium | Low-Medium | WAF-level bot/scraping mitigation (SECURITY.md §6) | Security + DevOps | Open |
| R-18 | Regulatory change in AI-specific legislation affects product operation | Compliance | Low | Medium | Compliance mapping maintained (SECURITY.md §7), legal review cadence | Legal + Security | Monitoring |
| R-19 | Key-person/vendor dependency on a single linguist/pedagogy reviewer function | Operational | Medium | Medium | Named function (not a single individual) accountable for content accuracy (AI_GOVERNANCE.md §8) | Product | Open |
| R-20 | Mobile app-store review delays block release cadence | Operational | Medium | Low-Medium | Separate mobile release pipeline with buffer built into planning (DEPLOYMENT.md §8) | Mobile Engineering | Monitoring |

## Review cadence

This register is reviewed: (a) at every ROADMAP.md phase transition, (b) whenever a new ADR is accepted with a materially new risk consequence, (c) quarterly at minimum regardless of other triggers. Risks are never silently removed — a resolved risk is marked **Closed** with a one-line resolution note, not deleted, so the history of what was considered and why remains auditable.
