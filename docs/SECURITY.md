# LinguaAI — Security, Privacy & Compliance

Status: **v1.2 — Consolidated baseline** · Owner: Security Architect · Last updated: 2026-08-01 (§2 OAuth provider list and session-revocation note updated during Epic E2 closure)

Supersedes Draft v1.0. See [BASELINE.md](BASELINE.md) for the current authoritative summary. Deep-dive companions: [MULTITENANCY.md](MULTITENANCY.md) (tenant isolation detail), [AI_GOVERNANCE.md](AI_GOVERNANCE.md) (AI safety governance), [RISK_REGISTER.md](RISK_REGISTER.md) (risk tracking). Security is a launch requirement, not a post-launch hardening pass. This document is binding on every module in PRD.md §6.

## 0. Zero Trust principles (added)

The Architecture Review's findings (app-layer-only tenant filtering, no mandatory admin MFA) share a common root cause worth stating explicitly as a governing principle: **no request is trusted by virtue of network location or prior authentication alone**.

- Being inside the VPC does not exempt a service-to-service call from authentication (ARCHITECTURE.md's signed internal tokens apply even between two `apps/api`-adjacent services).
- Being authenticated does not exempt a request from authorization and tenant-scoping checks on every single query (§3, MULTITENANCY.md) — there is no "trusted internal admin path" that skips RLS.
- Every layer verifies independently; a failure in one layer (e.g., a missed application-layer filter) must not be sufficient on its own to cause a breach (defense in depth, MULTITENANCY.md §2).

## 1. Threat model summary

LinguaAI handles: authentication credentials, voice recordings, personal writing/conversation content (potentially sensitive personal disclosures made to an AI conversation partner), payment data (via Stripe, not stored directly), and enterprise employee data (Enterprise LMS). Minors' data (Family plan) is explicitly out of scope until ADR-013's parental-consent flow is built — see §7. The primary risks this drives:

- Account takeover (credential stuffing, session hijacking).
- Exposure of sensitive personal content shared with the AI (conversation logs, voice recordings).
- Prompt injection / AI abuse (jailbreaks, extraction of other users' data via the AI, cost-abuse via the AI gateway).
- Data breach of PII/PHI-adjacent data at rest or in transit.
- Abuse of gamification/community features (bots, harassment, inappropriate content reaching minors).
- Enterprise data cross-tenant leakage.

## 2. Authentication & session security

- Passwords (where used) hashed with Argon2id; OAuth (Google, Apple — ADR-020) preferred and encouraged over password auth. Facebook is deferred, not offered at MVP — this list previously also named Facebook, a discrepancy against PRD.md §6's MVP scope statement that ADR-020 resolves authoritatively; corrected here to match (Epic E2).
- Short-lived JWT access tokens + rotating, revocable refresh tokens (see API.md §3, API_GUIDELINES.md §12); refresh tokens stored httpOnly/secure/SameSite=strict for web. Session revocation (logout, explicit session revoke) is immediate and server-enforced, not merely a wait-for-natural-expiry guarantee — backed by a `jti` denylist (ADR-018).
- **MFA is mandatory (not merely "ready") for `ADMIN` and `ENTERPRISE_ADMIN` roles before account activation (ADR-011)** — these are the highest-value account-takeover targets in the system. MFA remains optional (but available) for `USER`/`TEACHER` accounts at MVP.
- Session revocation is immediate and server-enforced (not just client-token expiry) — a compromised account can be locked out without waiting for token expiry.
- Brute-force/credential-stuffing protection: rate limiting + progressive backoff on auth endpoints, anomaly detection on login patterns (new device/geo triggers step-up verification).
- Enterprise SSO (SAML/OIDC) is an Enterprise-phase requirement (see ROADMAP.md), architected for in the identity module so it's additive, not a rework.

## 3. Authorization

- Role-based access control (`USER | TEACHER | ADMIN | ENTERPRISE_ADMIN`) enforced server-side on every request — never trust a client-supplied role.
- Resource-level ownership checks in addition to role checks (a `TEACHER` accessing marketplace content, an `ENTERPRISE_ADMIN` accessing org data, is scoped to their own resources/organization).
- **Tenant isolation is enforced at the database layer via Postgres Row-Level Security, in addition to application-layer scoping (ADR-005)** — closes the app-layer-only gap the Architecture Review identified as a critical cross-tenant leak risk. Full design: [MULTITENANCY.md](MULTITENANCY.md).
- Admin platform (module 24) actions, and all automated billing/entitlement changes, are logged to `AuditLog`/`EntitlementChangeLog` (DATABASE.md) — immutable, append-only, reviewed periodically.

## 4. Data protection

- **Encryption in transit**: TLS 1.2+ everywhere, HSTS enforced, no mixed content.
- **Encryption at rest**: database-level encryption (RDS encryption) plus field-level encryption for high-sensitivity PII (`AIMessage.content`, raw voice recordings, any freeform personal content shared with AI agents) — see DATABASE.md §5, §8.
- **Key management**: envelope encryption via AWS KMS; data-encryption keys rotate on a defined schedule (annually at minimum, or immediately on suspected compromise); key access is itself an audited action (DATABASE.md §8) — added detail closing a gap the Architecture Review identified (encryption was specified without a stated key-rotation owner/cadence).
- **Secrets management**: no secrets in source control (`.env.example` documents required variables with no real values); production secrets in AWS Secrets Manager / Parameter Store, injected at deploy time, rotated on a defined schedule. **Pre-commit secret scanning** runs alongside the nightly/CI-level scan (DEPLOYMENT.md §4) — shift-left, catching a leak before it ever enters history, not just after.
- **PII minimization**: only data with a clear product purpose is collected; assessment audio/voice data has a defined retention window per the retention matrix in DATABASE.md §7.

## 5. AI-specific security

- **Prompt injection defense**: user-supplied content (learner writing, conversation input) is treated as untrusted input to the LLM, never concatenated into system-level instructions without boundary delimiting; the AI gateway (see AI_SYSTEM.md) enforces this consistently so no individual feature has to reinvent it.
- **Data isolation in AI context**: a user's AI memory and session context are strictly scoped to that user — the retrieval layer (pgvector queries) is always filtered by authenticated `userId`, preventing cross-user memory leakage.
- **Abuse/cost-abuse prevention**: entitlement checks (see API.md §6, AI_SYSTEM.md §8) gate AI usage before requests reach model providers; anomalous usage patterns (rapid-fire requests, scripted abuse) are rate-limited and flagged.
- **Content safety**: the Safety Layer (AI_GOVERNANCE.md §6) filters model input/output for policy violations, enforced at the AI gateway level via account-age-bracket metadata, not left to prompt instructions alone — the mechanism is built platform-wide even though Family plan (and its minors) is Version 2 (ADR-013), since general community/`TEACHER` exposure to AI content applies today.
- **Output trust boundary**: AI-generated content (including scores/feedback) is treated as generated content, not executed as instructions or trusted as authoritative for security-relevant decisions (e.g., an AI agent cannot grant itself elevated data access).
- **Output sanitization (added)**: AI-generated text rendered as rich content (markdown, potential HTML) is sanitized before rendering — closes an injection/XSS-adjacent gap the Architecture Review identified, where a model tricked into emitting unsafe markup could otherwise have it rendered unsanitized by the client.
- **RAG grounding as a hallucination/trust control**: factual and scoring claims are grounded against the curated knowledge base rather than left to parametric model knowledge (ADR-008, AI_SYSTEM.md §4) — this is as much a trust/security control (preventing confidently-wrong authoritative-sounding output) as it is a product-quality one.

## 6. Application security (OWASP Top 10 discipline)

- Input validation at every boundary via shared Zod schemas (`packages/validation`) — server-side validation is authoritative; client-side is UX only.
- Parameterized queries exclusively via Prisma — no raw SQL string interpolation.
- CSRF protection on cookie-based session flows; CORS explicitly allow-listed per environment, never wildcard in production.
- Content Security Policy and standard security headers (via Helmet in NestJS) on all responses.
- Dependency scanning (automated, in CI) and a defined SLA for patching known-critical vulnerabilities.
- **Container supply-chain integrity (added — ADR-017):** every container image is accompanied by an SBOM (Syft), scanned for vulnerabilities (Trivy, blocking on Critical/High CVEs with an available fix), signed keylessly via cosign/Sigstore (GitHub Actions OIDC — no long-lived signing key), and carries a SLSA-aligned build-provenance attestation (GitHub native `actions/attest-build-provenance`). The deploy pipeline verifies signature and provenance immediately before an image is referenced in an ECS task definition update, aborting with an alert on failure. This closes a gap the Epic E1 Independent Production Readiness Review found: images were previously deployable with no way to prove what was in them or how they were built. Full pipeline: [epics/E1-foundation-platform-bootstrap.md](epics/E1-foundation-platform-bootstrap.md) Part 10, Part 12.
- **Container hardening:** non-root user, read-only root filesystem, dropped Linux capabilities (`--cap-drop=ALL`, explicit re-adds only if proven necessary), and explicit CPU/memory resource limits on every ECS task definition — CIS Docker Benchmark-aligned controls added during the E1 remediation, not left at container-runtime defaults.
- File upload handling (voice recordings, OCR camera images) validates content type/size server-side and stores via S3 with virus/malware scanning on ingest, never executed or served from the same origin as the app.
- **Bot/scraping protection (added)**: WAF-level bot detection mitigates scraping of commercially valuable content endpoints (course/vocabulary content) — a gap the Architecture Review identified, since this content has no protection today beyond standard auth.
- **Distributed rate limiting**: enforced via a Redis-backed limiter shared across the horizontally-scaled fleet (API_GUIDELINES.md §7) — an in-memory, per-instance limiter would be silently bypassable given the stateless scaling model (ARCHITECTURE.md §7).
- **Gamification/referral abuse prevention (added)**: bot-farmed XP/streaks and (once built, Version 1.1) referral fraud are explicitly in scope for anti-abuse detection, not just generic rate limiting — treated as launch-blocking for the Gamification Engine itself (RISK_REGISTER.md R-15), not deferred to a "we'll notice if it happens" posture.
- Regular authenticated and unauthenticated penetration testing cadence established before general-availability launch (not just at MVP soft-launch).

## 7. Privacy & compliance

- **GDPR**: right to access, rectify, and erase data implemented at the data layer (see DATABASE.md §10 — cascading deletion/anonymization design); a documented lawful basis for each category of processing (contract performance, consent for marketing, legitimate interest for product analytics), recorded per-user via `ConsentRecord` (DATABASE.md §2.1); EU user data residency considered in infrastructure region selection (see DEPLOYMENT.md, MULTITENANCY.md §5).
- **CCPA** and equivalent regional privacy laws: "do not sell my data" and data export/delete flows supported by the same erasure/export tooling built for GDPR.
- **COPPA / minors' data**: rather than ship an under-specified consent flow under launch-date pressure, **Family plan is descoped from MVP entirely (ADR-013)** — it ships in Version 2 only once a verifiable parental-consent flow (with the stricter data-minimization defaults this section originally specified) is fully designed and tested. App-store-specific child-safety policies (Apple/Google kids-category requirements, distinct from COPPA itself) are scoped alongside that work, relevant given the Mobile module.
- **Data Processing Agreements**: required with every third-party subprocessor that touches user data (LLM providers, STT/TTS providers, Stripe, email/push providers) — tracked in a subprocessor registry, disclosed in the privacy policy.
- **Privacy policy & terms of service**: drafted and reviewed by legal counsel before any public launch — outside engineering scope but a hard product dependency tracked in ROADMAP.md.

### 7.1 Compliance mapping (added)

| Requirement                                                    | Primary controls                                                    | Documented in                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| GDPR (access/rectify/erase, lawful basis, breach notification) | `ConsentRecord`, erasure/anonymization design, 72h incident process | DATABASE.md §10, §7; SECURITY.md §9 |
| CCPA                                                           | Shared erasure/export tooling with GDPR                             | SECURITY.md §7                      |
| COPPA                                                          | Family plan descoped until consent flow ships (ADR-013)             | DECISIONS.md ADR-013                |
| OWASP Top 10                                                   | §6 of this document                                                 | SECURITY.md §6                      |
| SOC 2 Type II (future)                                         | Controls designed additively from MVP                               | SECURITY.md §10                     |

## 8. Community & content moderation (module 16 risk surface)

- User-generated content (discussions, posts, comments, group chat) passes through automated moderation (toxicity/abuse detection) before broad visibility, with user-reporting and admin-review escalation paths (`ContentReport`/`ModerationAction`, DATABASE.md §2.7, feeding the `community.content.reported` domain event — EVENT_ARCHITECTURE.md).
- Voice rooms (future) require a moderation and abuse-reporting design completed before launch, given real-time voice is harder to moderate than text (RISK_REGISTER.md R-16).

## 9. Incident response

- A documented incident response plan (severity levels, on-call escalation, user/regulator notification timelines per GDPR's 72-hour breach notification requirement) is a launch-readiness requirement, owned jointly by Security and DevOps (see DEPLOYMENT.md observability stack, which incident detection depends on).

## 10. Explicitly deferred

- SOC 2 Type II certification — pursued once Enterprise-phase sales require it (module 20), with controls designed from MVP to make certification additive rather than requiring retrofits.
- Formal third-party penetration test report — scheduled ahead of general-availability launch, not required for internal/architecture-phase milestones.
