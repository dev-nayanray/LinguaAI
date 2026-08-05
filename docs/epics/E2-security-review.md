# Security review: E2 — Identity & Access Platform

_Completed instance of [SECURITY_REVIEW_TEMPLATE.md](../SECURITY_REVIEW_TEMPLATE.md), scoped to the whole epic (E2-T28) rather than a single feature — the natural unit here, since every task in E2 is part of one authentication/authorization surface. Cross-references [Part 13](E2-identity-access-platform.md#part-13--security-review-feeds-security_review_templatemd) (the design-level threat table) throughout, but verifies each claim against what was actually built and tested, not just what was designed — a design-level claim and a built-and-verified one are not the same thing, and this document is explicit about which is which for every row._

**Feature spec:** [E2-identity-access-platform.md](E2-identity-access-platform.md)
**Author:** This session's implementer (E2-T1–T28)
**Security Gate reviewer:** _Pending — per this template's own rule ("never the feature's author"), the author cannot self-certify the Security Gate. Requires a genuinely independent human reviewer, the same outstanding requirement [E2-fourth-targeted-review.md](E2-fourth-targeted-review.md) already names for the architecture side (IMPLEMENTATION_GUIDE.md §4) and never resolved through any review pass in this epic's history._

---

## 1. Does this feature require a security review?

- ☑ New authentication/authorization surface
- ☑ New or changed data access to PII or tenant-scoped data
- ☑ New third-party integration or subprocessor (Google/Apple OAuth)
- ☐ Touches `services/ai-engine` — N/A, E2 has no AI surface
- ☐ New file upload / user-generated content surface — N/A
- ☑ New public/unauthenticated endpoint (`register`, `login`, OAuth start/callback, password-reset request/confirm, MFA challenge)

## 2. Threat delta

Relative to SECURITY.md §1's baseline threat model, E2 is what _introduces_ the identity/access/tenancy surface that model describes in the abstract — every item below is genuinely new attack surface, not incremental:

- **Credential-based account takeover** — password guessing, credential stuffing, session/token theft.
- **Cross-tenant data access** — the first tables in this codebase carrying `organizationId`/RLS at all (Part 9).
- **Privilege escalation** — the first role/org-role mutation paths that exist anywhere in the system.
- **OAuth-specific**: authorization-code CSRF, account-takeover-via-email-matching, provider-token leakage.
- **MFA-specific**: enrollment bypass, brute force against a 6-digit code space.
- **Governance-function abuse** — `SECURITY DEFINER` functions are inherently higher-privilege code; a bug here is structurally worse than a bug in an ordinary `app_role`-scoped query.
- **Audit-trail tampering** — the first `AuditLog`/`EntitlementChangeLog` write paths.

## 3. AuthN/Z

- **Roles that can access this:** all four (`USER | TEACHER | ADMIN | ENTERPRISE_ADMIN`) — this epic defines the roles themselves.
- **Resource-level ownership check present:** ☑ Yes — verified by dedicated test classes, not just asserted: cross-tenant leak suite (E2-T23, `tenant-rls.e2e-spec.ts`, 26 tests covering read _and_ write policies for `User`/`Organization`/`OrganizationMembership`), governance-function authorization suite (E2-T24, `role-lifecycle.e2e-spec.ts`), session/ownership checks (`users.e2e-spec.ts` — a caller can only see/revoke their own sessions).
- **MFA implication:** ☑ Yes — ADR-011's mandatory MFA for `ADMIN`/`ENTERPRISE_ADMIN` is enforced at three independent points, verified: (1) `MfaGuard` blocks every guarded route pre-enrollment (`mfa.e2e-spec.ts`), (2) login itself step-up-gates an MFA-enrolled admin via `MFA_REQUIRED` rather than issuing a session directly (E2-T22), (3) `bootstrap-admin.ts`'s CLI-created accounts are equally gated (`role-lifecycle.e2e-spec.ts`'s "Bootstrap CLI, exercised end-to-end").

## 4. Data classification

| Data touched                           | Classification           | Encryption                                                                                                                                                                                                              | Retention (DATABASE.md §7)                                                                                                                               |
| -------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User.passwordHash`                    | Sensitive-PII            | Argon2id, one-way (never decrypted, only verified)                                                                                                                                                                      | Anonymized on GDPR erasure (Part 9A/DATABASE.md §10), not retained                                                                                       |
| `User.mfaSecret`                       | Sensitive-PII            | Field-level AES-256-GCM at rest (`packages/utils`'s `encryptField`/`decryptField`), verified genuinely encrypted (not just transformed) by `mfa.e2e-spec.ts` decrypting a real stored value back to the original secret | Anonymized on erasure                                                                                                                                    |
| `User.email`/`displayName`/etc.        | PII                      | Postgres-level only (no field-level encryption — matches the design's own classification)                                                                                                                               | Anonymized in place on erasure, never hard-deleted (Part 9A's own RLS/FK-driven necessity, E2-T18)                                                       |
| `AuditLog`/`EntitlementChangeLog`      | Internal                 | N/A                                                                                                                                                                                                                     | Immutable/append-only (E2-T7/T25) — retention window still a placeholder pending real legal input (Part 9B, already flagged, not this task's to resolve) |
| `identity.login.failed`'s email signal | Internal (pseudonymized) | HMAC-keyed hash, not a bare hash or raw email (E2-T20)                                                                                                                                                                  | N/A — event payload, not a stored table                                                                                                                  |
| OAuth provider tokens                  | Sensitive-PII            | Never persisted beyond the linking transaction (Part 8) — verified by inspection: no column anywhere stores a provider access/refresh token                                                                             | N/A                                                                                                                                                      |

## 5. Tenant isolation

**Could this feature leak data across `Organization` boundaries if a single check failed?** ☑ Yes → defense-in-depth layers (MULTITENANCY.md §2), each independently verified:

1. **Application query layer** — every tenant-scoped query includes an explicit `organizationId` filter (code-reviewed per CONTRIBUTING.md).
2. **Postgres RLS** — the authoritative layer; E2-T23's suite deliberately _bypasses_ layer 1 (raw `appPrisma` calls through a test-only controller) and confirms layer 2 alone still denies cross-tenant access, for all three tenant-scoped tables, across all four policy directions (read/insert/update/delete) — not just the read-only negative examples the design doc's own prose happened to spell out.
3. **`SECURITY DEFINER` governance functions** — independently re-derive and check authorization from the database rather than trusting `RolesGuard`/the caller; E2-T24 specifically proves this _independence_ (not just that the functions work when called correctly) by calling them with a caller-supplied identity that doesn't match the authenticated session, and by exercising `set_org_role()`'s org-scoped actor check with a caller who has some privilege, just not for the target org.

**One disclosed, non-blocking gap in this layer** (inherited, not introduced by E2): the fourth targeted review's own "Additional finding" — `app.current_user_id`/`app.current_org_id`/etc. are custom Postgres GUCs, and nothing in this design restricts _which role_ may `SET` them; `app_role` is not structurally prevented from setting these itself. Exploiting it requires already having `app_role`-level raw SQL execution — a materially larger prior compromise than anything else in this table. Recommended (not mandatory) follow-up: restrict `app_role`'s ability to `SET` custom GUCs, or move to a mechanism Postgres restricts by role natively. Not remediated here — it predates this review, is explicitly out of a single Epic's remediation scope, and doesn't block this Gate per the same reasoning the fourth targeted review already gave.

## 6. AI-specific risks

N/A — E2 has no AI surface.

## 7. Third-party/subprocessor impact

Google and Apple OAuth (ADR-020) are the only new subprocessors. Both integrations: never receive more than the standard OpenID Connect profile scope; never store a provider token beyond the linking transaction; CSRF-protected via a signed, single-use, 10-minute `state` value (verified for both providers independently, including cross-provider replay in both directions, E2-T26). Data Processing Agreements with Google/Apple are a legal/product dependency (SECURITY.md §7), not an engineering one — tracked there, not re-litigated here.

## 8. Compliance impact

- **GDPR erasure**: implemented (E2-T18) as anonymize-in-place, not hard-delete — a structural necessity proven by three independent facts (RLS's `user_delete` policy is `USING (false)`, `RoleChangeRequest`'s FKs are `onDelete: Restrict`, `ConsentRecord`'s own retention requirement conflicts with cascading it away). **Disclosed, unresolved tension** (flagged since E2-T18, never revisited): no documented carve-out exists for a GDPR erasure request from a user who is also their org's last `ENTERPRISE_ADMIN` or the platform's last `ADMIN` — the last-admin-standing invariant (Part 9A) and the erasure right (Part 9A/DATABASE.md §10) are both individually correct but their interaction was never specified. Not a P0/P1 security finding (nothing leaks, nothing is insecure) — a compliance-process gap: an operator would need a manual procedure today (e.g., transfer admin status first) that the design doesn't name.
- **Data export/portability (GDPR Article 20)**: `GET /v1/users/me` covers the _access_ right; no dedicated data-export/portability endpoint exists in Part 6's actual API surface, despite SECURITY.md §7.1's compliance-mapping table describing "erasure/export tooling" as already built. **Flagged as a real documentation-vs-implementation mismatch** — recommend SECURITY.md §7.1 be corrected to describe erasure only, with export tracked as an open item, rather than silently left implying more coverage exists than does.
- **CCPA**: shares the same erasure tooling and the same export gap above.
- **COPPA/minors**: N/A — Family plan descoped from MVP entirely (ADR-013), unaffected by E2.
- **Password-reset email delivery**: flagged since E2-T19, still true — no real email-delivery mechanism exists anywhere in this codebase yet, so a real user currently has no way to _receive_ a password-reset token even though the full security design (enumeration resistance, single-use tokens, session revocation on reset) is built and tested. A completeness gap, not a security weakness in what does exist.

## 9. Security Gate checklist

- [x] Threat delta documented (§2)
- [x] AuthN/Z reviewed (§3)
- [x] Data classified with correct encryption/retention (§4)
- [x] Tenant isolation confirmed (§5)
- [x] AI-specific risks addressed — N/A (§6)
- [ ] No unresolved compliance impact (§8) — **two real, disclosed items remain open** (GDPR erasure/last-admin interaction; SECURITY.md §7.1's export-tooling overstatement) — neither is a security vulnerability, both need a decision this document doesn't make unilaterally
- [ ] Reviewed by Security Architect or delegate, not the author — **outstanding**, per this template's own rule

**Security Gate:** ☐ Passed — _cannot self-certify; awaiting independent review._

---

## Appendix A — P0/P1 findings from this review, and their resolution

This review's own audit (not a re-statement of the design doc's claims) found **one real P1**, now closed:

### P1 (closed): single-session revocation did not immediately invalidate the access token

**Finding:** Part 13's own threat table claims "revocation denylist + `tokensValidAfter` for immediate effect" and Part 8 documents a JWT-`jti` Redis denylist in detail — but no code anywhere in the repository ever implemented it. `tokensValidAfter` (E2-T9, real and working) is a _per-user_ mechanism, deliberately not used for single-session revocation because it would over-invalidate every other active session (Part 8's own stated reason the jti-denylist was supposed to exist as a separate mechanism). The practical consequence: `POST /v1/auth/logout` and `DELETE /v1/users/me/sessions/:id` correctly revoked the _refresh_ token immediately, but the _already-issued access token_ for that session remained fully valid and usable for up to its full 15-minute life — directly contradicting SECURITY.md §2's explicit "session revocation is immediate and server-enforced (not just client-token expiry)" requirement.

**Resolution:** Implemented the mechanism Part 8 always specified, not a new design:

- `Session.currentJti` (new column, migration `20260731160000_add_session_current_jti`) tracks the `jti` of the most-recently-issued access token per session.
- `JtiDenylistService` (new) — a Redis-backed denylist, reusing `RateLimitModule`'s own connection (its fail-fast tuning suits both concerns). **Deliberately fails open** (unlike rate limiting's fail-closed default) — a documented, reasoned deviation: the alternative (every already-authenticated request across the entire API failing on any Redis blip) is a far larger blast radius than "immediate revocation is best-effort during an outage, while `tokensValidAfter`/refresh-rotation still apply regardless."
- `AuthService.revokeSession`/`revokeAllSessions` now denylist the affected session(s)' `currentJti` at revocation time; `JwtStrategy.validate()` checks the denylist on every authenticated request.
- **Verified for real**, not just unit-tested: `users.e2e-spec.ts` proves (a) a revoked session's access token fails immediately on the very next request, for both `logout` and explicit session deletion, and (b) — the property that makes this a per-session mechanism and not a blunter per-user one — revoking one session does **not** invalidate a different, still-active session's token for the same user.

No other P0/P1-severity finding surfaced. Everything else this review names (§8's two compliance items, the fourth targeted review's inherited GUC-trust observation) is either a lower-severity/non-security completeness gap or an already-disclosed, already-reasoned-through non-blocking item from a prior review.

## Appendix B — Verified strengths (not just claims)

Worth recording plainly, not only gaps: several Part 13 claims that could easily have been "designed but not verified" were independently checked and hold:

- **`SECURITY DEFINER` function ownership** — the third targeted review's own "Medium, not concretely specified" finding is in fact fully closed: every governance function (`approve_role_change`, `set_org_role`, `complete_mfa_enrollment`, `enforce_last_enterprise_admin`) is owned by a dedicated, minimal `governance_role` (`NOLOGIN NOSUPERUSER NOBYPASSRLS`), confirmed by direct migration inspection, not assumed.
- **Audit immutability** — extended in this review's own pass (E2-T25) to cover `app_service_role`, not just `app_role`: `bootstrap-admin.ts` actively writes `AuditLog` rows via `app_service_role`, and that role's `UPDATE`/`DELETE` on both audit tables was still live until this epic's own work closed it (migration `20260731150000`).
- **Governance-function concurrency invariants** (last platform admin, last org admin) — proven under real concurrent load against real Postgres (advisory-lock-based, not merely reasoned about), including the specific sequential exploit the third targeted review originally demonstrated.
- **RLS performance** — E2-T27's load test confirms RLS-protected query paths meet the Database budget (p95 < 50ms) by roughly a 20x margin under a realistic (1,000-user, 50-org) dataset, not an empty one.
