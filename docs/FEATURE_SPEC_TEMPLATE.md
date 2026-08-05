# Feature Spec Template

Copy this file per non-trivial feature within an Epic. Covers lifecycle phases 3–4 ([IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §2). This is a **product/functional** spec — technical design lives in [TECHNICAL_DESIGN_TEMPLATE.md](TECHNICAL_DESIGN_TEMPLATE.md), not here.

---

## Feature: [Name]

**Parent Epic:** [Epic ID]
**Owner:** [name]
**Status:** `Draft | Approved | In implementation | Done`

## 1. Summary

_One paragraph: what does the user do, and what happens?_

## 2. User story / journey reference

_Cite the PRD.md journey this belongs to (§5), or write a new user story if this feature isn't already covered by an existing journey — in which case, PRD.md needs updating too (IMPLEMENTATION_GUIDE.md §3 Documentation Gate)._

> As a [persona from PRD.md §4], I want to [action], so that [outcome].

## 3. Functional requirements

_Numbered, testable statements — each becomes a test case in TEST_PLAN_TEMPLATE.md._

1.
2.
3.

## 4. Edge cases & error conditions

_What happens when things go wrong? Every row here should map to an explicit handled case in implementation, not a hope that it won't occur._

| Condition | Expected behavior |
| --------- | ----------------- |
|           |                   |

## 5. Non-functional requirements

- **Performance budget:** [cite the relevant class in PERFORMANCE.md — e.g., "Standard CRUD, §3" or "AI-invoking, §3"]
- **Accessibility:** WCAG 2.1 AA (DESIGN_SYSTEM.md §5) — default; note any feature-specific accessibility consideration (e.g., audio content needs a transcript).
- **Security/privacy:** [does this feature touch PII, tenant-scoped data, or AI-generated content requiring sanitization? See SECURITY_REVIEW_TEMPLATE.md.]
- **Localization:** [does this feature's copy need translation? Does it handle RTL? See PRD.md §5.1.]

## 6. Required UI states

_Per DESIGN_SYSTEM.md §5 — all four are mandatory unless a state is genuinely inapplicable (justify why)._

| State   | Behavior |
| ------- | -------- |
| Loading |          |
| Empty   |          |
| Error   |          |
| Success |          |

## 7. Acceptance criteria

_The bar this feature is tested against (TEST_PLAN_TEMPLATE.md) and reviewed against (CODE_REVIEW_CHECKLIST.md). Written so a QA engineer unfamiliar with the implementation can verify each one directly._

- [ ]
- [ ]
- [ ]

## 8. Out of scope

_What this feature deliberately does not do — prevents scope creep and clarifies what a reviewer shouldn't expect._

-
