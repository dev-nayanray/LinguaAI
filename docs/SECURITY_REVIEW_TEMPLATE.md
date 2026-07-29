# Security Review Template

Copy this file per feature that touches authentication, authorization, PII, tenant-scoped data, third-party integrations, or the AI gateway. Covers lifecycle phase 10 ([IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §2) and feeds the **Security Gate**. Must comply with [SECURITY.md](SECURITY.md).

---

## Security review: [Feature name]

**Feature spec:** [link]
**Author:** [name]
**Security Gate reviewer:** [name — Security Architect or delegate, never the feature's author]

## 1. Does this feature require a security review?

*A feature touching any of the below requires this template filled in full. If none apply, state so and skip to §9 with a one-line justification — don't leave the template blank.*

- ☐ New authentication/authorization surface
- ☐ New or changed data access to PII or tenant-scoped data
- ☐ New third-party integration or subprocessor
- ☐ Touches `services/ai-engine` (agents, prompts, memory, RAG)
- ☐ New file upload / user-generated content surface
- ☐ New public/unauthenticated endpoint

## 2. Threat delta

*What new attack surface does this introduce, relative to SECURITY.md §1's threat model? Not "list all possible attacks" — specifically what's new here.*

## 3. AuthN/Z

- **Roles that can access this:** [cite `USER | TEACHER | ADMIN | ENTERPRISE_ADMIN`]
- **Resource-level ownership check present:** ☐ Yes ☐ N/A
- **MFA implication:** [does this touch ADMIN/ENTERPRISE_ADMIN activation — ADR-011? ☐ Yes ☐ No]

## 4. Data classification

| Data touched | Classification | Encryption | Retention (DATABASE.md §7) |
|---|---|---|---|
| | PII / Sensitive-PII / Internal / Public | | |

## 5. Tenant isolation (if applicable)

*Cross-reference DATABASE_CHANGE_TEMPLATE.md §3 — this section confirms the security implication is understood, not just the mechanical RLS checklist.*

**Could this feature leak data across `Organization` boundaries if a single check failed?** ☐ Yes → explain the defense-in-depth layers (MULTITENANCY.md §2) ☐ No

## 6. AI-specific risks (if applicable)

- **Prompt injection surface:** [is user input concatenated into a prompt? How is the boundary enforced — AI_GOVERNANCE.md §6]
- **Output rendered as rich content:** ☐ Yes → sanitization confirmed ☐ No
- **RAG grounding required:** [does this agent/feature make factual/scoring claims? ADR-008] ☐ Yes → knowledge base source confirmed ☐ No
- **Cost exposure:** [does this add a new AI-invoking path not yet covered by an entitlement check? AI_GOVERNANCE.md §5]

## 7. Third-party/subprocessor impact

*New subprocessor touching user data requires a Data Processing Agreement (SECURITY.md §7) before this ships — not after.*

## 8. Compliance impact

*Does this change anything in the SECURITY.md §7.1 compliance mapping (GDPR/CCPA/COPPA)? If it touches minors' data in any way, stop — Family plan is descoped from MVP (ADR-013) and this likely needs product/legal escalation, not just a security review.*

## 9. Security Gate checklist

- [ ] Threat delta documented (§2)
- [ ] AuthN/Z reviewed (§3)
- [ ] Data classified with correct encryption/retention (§4)
- [ ] Tenant isolation confirmed if applicable (§5)
- [ ] AI-specific risks addressed if applicable (§6)
- [ ] No unresolved compliance impact (§8)
- [ ] Reviewed by Security Architect or delegate, not the author

**Security Gate:** ☐ Passed — [reviewer, date]
