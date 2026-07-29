# Test Plan Template

Copy this file per feature (or per Epic, for tightly related features). Covers lifecycle phases 12–13, 18 ([IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §2) and feeds the **Testing Gate**. Must comply with [TESTING.md](TESTING.md).

---

## Test plan: [Feature/Epic name]

**Feature spec:** [link]
**Author:** [name]
**QA sign-off:** [name — must be independent of the implementer per IMPLEMENTATION_GUIDE.md §4]

## 1. Unit tests

*One row per functional requirement from FEATURE_SPEC_TEMPLATE.md §3.*

| Requirement | Test case | Status |
|---|---|---|

## 2. Integration tests

| Scenario | Test case | Status |
|---|---|---|
| Happy path | | |
| Validation failure (400) | | |
| Auth failure (401/403) | | |
| Conflict/edge case (409/422) | | |
| **Cross-tenant isolation** *(if tenant-scoped data, MULTITENANCY.md §6)* | | |

## 3. End-to-end tests

*Only for critical journeys (TESTING.md §1) — not every feature needs one.*

**Required:** ☐ Yes ☐ No — [justify if No for a user-facing feature]

## 4. AI evaluation suites (AI_GOVERNANCE.md §3) — if this touches `services/ai-engine`

| Suite | Applicable | Result |
|---|---|---|
| Golden-set regression | ☐ | |
| Factual-accuracy | ☐ | |
| Safety/red-team | ☐ | |
| Cost/latency regression | ☐ | |

## 5. Performance tests

*Against the relevant PERFORMANCE.md budget class.*

| Budget | Target | Measured |
|---|---|---|

## 6. Security tests

*Cross-reference SECURITY_REVIEW_TEMPLATE.md — this section confirms the tests exist, not that the review happened (that's a separate gate).*

- [ ] Authorization boundary tests present (role + ownership)
- [ ] Input validation tests present (boundary/malformed input)
- [ ] MFA enforcement test present (if this touches ADMIN/ENTERPRISE_ADMIN activation)

## 7. Required states coverage (DESIGN_SYSTEM.md §5)

- [ ] Loading state has a test/story
- [ ] Empty state has a test/story
- [ ] Error state has a test/story
- [ ] Success state has a test/story

## 8. QA sign-off

*Independent verification against FEATURE_SPEC_TEMPLATE.md §7 acceptance criteria — not a rerun of the author's own tests.*

**Acceptance criteria verified:** ☐ All pass
**Testing Gate:** ☐ Passed — [QA reviewer, date]
