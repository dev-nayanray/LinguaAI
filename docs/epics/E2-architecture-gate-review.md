# Epic E2 — Independent Architecture Gate Review

**Epic:** Identity & Access Platform
**Design under review:** [E2-identity-access-platform.md](E2-identity-access-platform.md) (Draft, 2026-07-30)
**Review date:** 2026-07-30
**Reviewers:** Architecture Review Board (CTO Reviewer, Principal Security Architect, Principal Identity Architect, Principal Backend Architect, Principal Database Architect, Principal Platform Architect, Principal QA Architect)

> **Independence disclosure.** The design under review and this review were produced in the same working session by the same agent. That is **not** the independent, differently-accountable review [IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) §4 requires ("no self-approval on Security, Database, or Architecture gates under any circumstance") — a real human Architecture Gate reviewer, distinct from the design's author, must still perform this review before E2's Architecture Gate can be marked Passed in the Epic's own gate log. What follows is a genuinely adversarial re-check of the design's actual text against its own citations and against the negative-test checklist requested — every finding below is checked against the literal document, not asserted from memory of writing it — but it does not substitute for that required independent sign-off, and this document's own status line says so rather than implying otherwise. This mirrors the same caveat [E1-acceptance-report.md](E1-acceptance-report.md) already applied to E1 for the identical reason.

**Decision: NO GO.** 3 Critical and 4 High findings block implementation start. Findings below, organized by the requested review areas, then negative-test results, then scores.

---

## 1. Findings by review area

### 1.1–1.3 Identity architecture / Authentication flows / Authorization model (RBAC)

**CRITICAL-1 — No mechanism exists anywhere in the design for changing a `User.role` or `OrganizationMembership.orgRole` after creation.** Part 5 states `role` is "Server-assigned only; never client-settable at registration," and Part 10 defines an `identity.role.changed` event — both imply role changes happen post-registration, through some server-side path. But Part 6's API table contains no endpoint to change either field, and no part of the document specifies who is authorized to promote a `USER` to `ADMIN`, or a `MEMBER` to `ENTERPRISE_ADMIN`. This is also, concretely, **the unspecified mechanism by which the very first `ADMIN` account in the system would ever exist** — every `ADMIN`/`ENTERPRISE_ADMIN` gate in the rest of the design (MFA enforcement, org management, the RolesGuard itself) assumes such an account already exists, but nothing in Part 6–9 explains how one is minted. An unspecified privilege-grant path is worse than a documented one: whoever implements this will invent the authorization check without design-time review, which is exactly the failure mode a role-based system most needs to avoid.

**HIGH-1 — JWT claim shape is never specified.** Part 8 references a `jti` claim for the Redis revocation denylist, but no part of the document (Part 5, 6, or 8) defines the actual token payload. Two consequences, both real: (a) if `role`/`organizationId` are not embedded as claims, every authenticated request needs a `User` DB read to authorize, which contradicts ADR-018's own stated rationale for choosing stateless JWTs; (b) if they _are_ embedded, the design never addresses claim freshness — a role change (Critical-1, once it exists) or org-membership change would not take effect for a caller's already-issued access token until its natural 15-minute expiry, which is a real, current-session privilege-lag window the design doesn't acknowledge or accept explicitly.

### 1.4–1.5 Session management / Refresh token lifecycle

Refresh-token rotation-with-reuse-detection (Part 8) is a genuinely solid, non-trivial control, correctly reasoned. Two gaps:

**MEDIUM-1 — No stated atomicity guarantee on rotation.** Two near-simultaneous uses of the same refresh token (a legitimate client retry racing an attacker's replay of a stolen token) — the design doesn't state that the "mark old token used, issue new one" step is a single atomic DB operation. Without that, a race could let both succeed, defeating the reuse-detection Part 8 relies on as its core replay defense.

**MEDIUM-2 — Password-reset token: no stated expiry, single-use guarantee, or storage form** (contrast with `RefreshToken.tokenHash`, which explicitly stores only a hash — the reset token's storage form is left unstated in Part 5, since no `PasswordResetToken` entity appears there at all; where it's persisted, and how, is undefined).

### 1.6 OAuth integration

**HIGH-2 — No CSRF `state` parameter (or PKCE) specified for the OAuth flow.** Part 6/8 describe `GET /v1/auth/oauth/:provider` and the callback but never mention validating a `state` value round-tripped through the redirect — the standard, well-known defense against OAuth authorization-code-injection CSRF. This is a concrete, checklist-named gap (the review brief explicitly asks for "OAuth attack vectors").

**HIGH-3 — OAuth-to-existing-account linking rule is unstated and risks account takeover.** Part 6 says the callback "Creates `User`+`OAuthAccount` on first login, links on repeat" without stating the matching rule. If linking an OAuth login to an existing `User` row is done by matching the provider's email to `User.email`, this is a known, exploitable account-takeover pattern (an attacker pre-registers a victim's email via password auth; the victim's later "Sign in with Google" either takes over the attacker's shell account or is blocked in a way the design never specifies). The design needs an explicit rule — matching only by `(provider, providerAccountId)`, never by email, or requiring re-authentication of any existing password account before a new OAuth linkage is accepted.

### 1.7 MFA design

**HIGH-4 — No rate limiting specified on `POST /v1/auth/mfa/verify`.** Part 8 specifies rate limiting for `/v1/auth/login` and password-reset, but not MFA code verification. A TOTP code is a 6-digit value (10⁶ space); without a rate limit and lockout on this specific endpoint, it is brute-forceable within its ~30-second validity window at realistic request rates. This directly undermines the entire purpose of ADR-011/ADR-019 for the exact accounts (`ADMIN`/`ENTERPRISE_ADMIN`) they exist to protect — the review brief explicitly names "missing rate limits" as a check item, and this is the most consequential instance of it in the design.

Positive: `MfaGuard` blocking every privileged-role route (not just login) correctly closes the "enroll later, never actually gated" bypass class — well-designed.

### 1.8–1.9 Multi-tenancy integration / PostgreSQL RLS strategy

**CRITICAL-2 — RLS policy coverage is incomplete for the one table the design itself calls out as tenant-scoped.** Part 5 states `User.organizationId` is "the tenant-scoping column." Part 9 states "every table carrying `organizationId`" gets an RLS policy, but the only concrete `CREATE POLICY` example given anywhere in the document is for `OrganizationMembership` — not `User`. This is not a nitpick: `User` is the table an admin-facing search/lookup endpoint would most plausibly query directly (independent of `OrganizationMembership`), and if no RLS policy is confirmed to exist on it, any such future query path is not provably tenant-isolated. R-06 and ADR-005 — the exact risk and decision this Epic states its purpose is to finally implement and prove (Part 1: "E2 is also where that mechanism gets built and proven for the first time") — are left unproven for the table most likely to leak. This is a correctness gap in the design's central deliverable, not a peripheral one.

### 1.10 Prisma model quality

No blocking issues in the field-level design itself (Part 5's types/constraints/uniqueness rules are reasonable and consistent with DATABASE.md §2.1's existing entity assignment). Two non-blocking notes: `mfaSecret`'s field-level encryption is stated as a requirement (correctly, citing SECURITY.md §4) but the encryption mechanism/key-management approach is not specified — reasonable to leave to implementation, but worth a one-line acknowledgment that this is deferred, not forgotten.

### 1.11 API consistency

**MEDIUM-3 — Registration's `CONFLICT` (409) on duplicate email is a user-enumeration vector, inconsistent with the anti-enumeration discipline the same document applies to login and password-reset** (Part 6 explicitly designs those to return identical responses regardless of account existence, citing SECURITY.md §6). The document correctly identifies this threat class for two of three relevant flows and misses it for the third. This is partly inherited from API_GUIDELINES.md's own existing example (duplicate-email-as-409 is that document's own stated case for the `CONFLICT` code) — so this is as much a pre-existing baseline inconsistency as a new one, but a design that already reasons carefully about enumeration in two places should either apply the same treatment to the third or explicitly document the trade-off as accepted, rather than leaving the inconsistency unaddressed.

### 1.12 Security compliance

MFA-mandatory enforcement, Argon2id, field-level encryption, and the RLS/RBAC separation are all correctly inherited from existing, cited ADRs/docs with no contradiction found. The three new ADRs (Part 15) are well-reasoned, each with alternatives considered, and correctly left in "Proposed" status rather than self-approved.

### 1.13 Audit logging

**CRITICAL-3 — No `AuditLog`/`EntitlementChangeLog` entity exists anywhere in the data model.** SECURITY.md §3 states, verbatim, as an existing requirement this design is bound by: _"Admin platform (module 24) actions, and all automated billing/entitlement changes, are logged to `AuditLog`/`EntitlementChangeLog`... immutable, append-only, reviewed periodically."_ Part 5 defines nine entities; none is an audit log. Role changes (once Critical-1 is resolved), organization membership changes, and MFA enrollment all have domain events (Part 10) but domain events are not a substitute for a durable, immutable, queryable audit record — the document itself distinguishes these concepts correctly elsewhere (`ConsentRecord`'s own Part 5 note: "distinct from `AuditLog`, since consent is a compliance record, not an admin-action record" — a sentence which references `AuditLog` as though it already exists in this design, when it does not appear anywhere in it). This is a direct, citable non-compliance with an existing canonical document, not a matter of interpretation.

### 1.14 Privacy & consent

No blocking issues. `ConsentRecord` and the GDPR/CCPA erasure flow correctly defer to DATABASE.md §10's already-accepted design rather than inventing a parallel one. ADR-013's Family-plan/parental-consent descope is correctly respected (no parental-consent flow attempted).

### 1.15 Domain events

The eight new events (Part 10) are reasonably scoped and follow the existing envelope with no shape deviation. One note: `identity.login.failed`'s payload names an "email-hash" field with no stated hashing strategy — an unsalted/unkeyed hash of a bounded, guessable input space (email addresses) provides materially weaker protection than intended; if the intent is to avoid storing raw emails in `analytics-service`, this needs to be a keyed hash (HMAC with a server-held secret), not a bare hash. Not blocking on its own, but worth folding into remediation given it's a one-line fix once flagged.

### 1.16 Performance implications

Argon2id CPU cost under load is explicitly named as deferred to a future load test (Part 16/19) rather than solved speculatively — reasonable, not a gap. No other performance-relevant design choice raised a concern.

### 1.17 Mobile compatibility

ADR-018's Bearer-token choice (over a web-only cookie) is well-reasoned specifically for E21 mobile compatibility, and refresh-token storage correctly names platform-secure storage (Keychain/Keystore) as the mobile equivalent of the web httpOnly cookie. No gap found here.

### 1.18 Enterprise readiness

Organization provisioning and bulk CSV import correctly follow MULTITENANCY.md §4's existing design. SSO is correctly out of scope with no code attempted, consistent with ROADMAP.md's Enterprise-phase placement. Data-residency (`Organization.dataRegion`) is correctly reserved-but-unenforced, matching MULTITENANCY.md §5 exactly.

### 1.19 Future AI integration

Not directly relevant to E2's scope (Identity has no AI surface, correctly marked N/A in the gate log) — no finding.

---

## 2. Negative-test checklist — explicit results

| Check                      | Result                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privilege escalation paths | **Finding (Critical-1)** — no role-change authorization path specified at all                                                                                                                                                                                                                                                                                                                       |
| Session fixation           | Not addressed in the design (no statement that a new session identifier is issued post-authentication rather than reusing a pre-auth one) — **Medium**, not scored as a named finding above only because no pre-auth session concept appears in the design to fixate in the first place (stateless pre-auth, per the flows described); still worth an explicit one-line confirmation in remediation |
| Token replay               | Refresh-token replay: addressed (rotation + reuse detection). Access-token replay: partially addressed (short TTL + denylist) but denylist relies on an unspecified `jti` claim — see High-1                                                                                                                                                                                                        |
| Cross-tenant leakage       | **Finding (Critical-2)** — `User` table RLS coverage unconfirmed                                                                                                                                                                                                                                                                                                                                    |
| OAuth attack vectors       | **Findings (High-2, High-3)** — no CSRF state param; email-linking rule unstated                                                                                                                                                                                                                                                                                                                    |
| Missing revocation         | Largely addressed (session/refresh revocation, password-reset revokes all sessions); OAuth-unlink → session revocation interaction is unstated (minor, not scored separately)                                                                                                                                                                                                                       |
| Missing audit events       | **Finding (Critical-3)** — no `AuditLog` entity despite an existing, cited requirement for one                                                                                                                                                                                                                                                                                                      |
| Weak password recovery     | **Finding (Medium-2)** — reset token expiry/single-use/storage unstated                                                                                                                                                                                                                                                                                                                             |
| Account enumeration        | **Finding (Medium-3)** — registration inconsistent with the design's own anti-enumeration treatment of login/reset                                                                                                                                                                                                                                                                                  |
| Race conditions            | **Finding (Medium-1)** — refresh-token rotation atomicity unstated                                                                                                                                                                                                                                                                                                                                  |
| Missing rate limits        | **Finding (High-4)** — MFA verification endpoint has none specified                                                                                                                                                                                                                                                                                                                                 |
| Missing abuse protection   | No CAPTCHA/bot protection on registration — not required by any cited canonical doc, **not scored as a blocking finding**, noted only                                                                                                                                                                                                                                                               |

---

## 3. Scores

| Dimension                | Score      | Rationale                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture Score       | 80/100     | Bounded-context placement, component layering, event design, and failure-mode analysis are all sound and correctly grounded in existing ADRs/docs; deductions for the unspecified role-change path (Critical-1) and missing audit trail (Critical-3), both of which are architectural omissions, not implementation detail |
| Security Score           | 54/100     | Strong foundational choices (Argon2id, MFA-mandatory enforcement, refresh-token rotation, field-level encryption) undercut by three Critical/four High findings directly in the negative-test checklist's own named categories (privilege escalation, cross-tenant leak, OAuth CSRF, missing MFA rate limit)               |
| Identity Readiness       | 58/100     | Core registration/login/OAuth/MFA flows are well-specified individually, but the missing role-change mechanism (Critical-1) means the design cannot actually produce a working `ADMIN` account — a fundamental readiness gap, not a polish item                                                                            |
| Multi-tenancy Readiness  | 62/100     | The three-layer design (Part 9) is conceptually correct and matches MULTITENANCY.md exactly, but incomplete RLS coverage on `User` (Critical-2) means the design's own stated central purpose — proving RLS for the first time — is not yet actually proven                                                                |
| **Overall E2 Readiness** | **61/100** | Weighted toward Security/Identity/Multi-tenancy Readiness, since those are where the blocking findings concentrate; Architecture Score alone would not justify a GO given three Critical findings remain                                                                                                                   |

---

## 4. Decision

## NO GO

Three Critical findings and four High findings must be remediated, and the design updated, before this Epic proceeds to implementation (T1) or the Architecture Gate row in [E2-identity-access-platform.md](E2-identity-access-platform.md)'s gate log is marked Passed. This mirrors E1's own precedent exactly: a first Architecture Gate review returning NO GO is not a failure of process, it is the process working as designed (IMPLEMENTATION_GUIDE.md §4's no-self-approval rule exists precisely to catch gaps like these before they're built, not after).

### Mandatory remediation items

1. **(Critical-1)** Specify the role-change/promotion mechanism in full: the endpoint(s), the authorization rule for who may change `User.role` or `OrganizationMembership.orgRole`, and — specifically — how the first `ADMIN` account in a fresh deployment is created (a one-time bootstrap/seed process, an out-of-band operational procedure, or an explicit API path; the design must state which and why).
2. **(Critical-2)** Confirm and specify the RLS policy for the `User` table itself (not only `OrganizationMembership`), or explicitly state and justify why `User` does not need one (e.g., if every real query path is proven to always go through an already-RLS-protected join table — but that claim needs to be made and defended, not left implicit).
3. **(Critical-3)** Add an `AuditLog` (and, if billing/entitlement actions are in scope elsewhere, `EntitlementChangeLog`) entity to Part 5's data model, specify what admin/privileged actions write to it, and confirm it is immutable/append-only at the schema level (e.g., no `UPDATE`/`DELETE` grant, or a database-level trigger enforcing it) — closing the direct SECURITY.md §3 non-compliance found in §1.13.
4. **(High-2)** Specify OAuth CSRF protection: a `state` parameter validated round-trip through the redirect (minimum), or PKCE if applicable to the client type.
5. **(High-3)** Specify the exact OAuth-to-existing-account linking rule (recommended: match only by `(provider, providerAccountId)`, never by email; require authenticated re-confirmation for any explicit "link this OAuth account to my existing password account" user-initiated flow).
6. **(High-4)** Add rate limiting to `POST /v1/auth/mfa/verify`, in the same stricter endpoint class already specified for login/password-reset.
7. **(High-1)** Specify the JWT claim shape explicitly (at minimum: `sub`, `role`, `organizationId`, `jti`, `iat`, `exp`) and state the accepted staleness window for `role`/`organizationId` claims relative to a mid-session change to either.

Medium findings (§1.6, §1.9's password-reset-token gap, §1.15's rate-limiting timing, §1.15's email-hash gap) are recommended to fold into the same remediation pass since they're each small, but are not independently blocking per the review brief's "list only mandatory remediation items" — items 1–7 above are the mandatory set.
