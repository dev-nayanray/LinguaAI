# Technical Design Template

Copy this file per feature (or per Epic, for small Epics) requiring a real design decision. Covers lifecycle phases 6–7 ([IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §2) and feeds the **Architecture Gate**. A feature that's a pure CRUD extension of an existing pattern may reference an existing design instead of filling this out fresh — the tech lead decides, and states why in §1.

---

## Technical Design: [Feature/Epic name]

**Feature spec:** [link to FEATURE_SPEC_TEMPLATE.md instance]
**Author:** [name]
**Architecture Gate reviewer:** [name — must not be the author]
**Status:** `Draft | In review | Approved`

## 1. Design necessity

_Why does this need a design doc rather than reusing an existing pattern? If it's a novel pattern, what makes it novel?_

## 2. Bounded context & ownership

_Which bounded context (ARCHITECTURE.md §2.1) does this belong to? Which app/service hosts it? If it's ambiguous between `recommendation-engine` and `ai-engine`, apply the rule in ARCHITECTURE.md §2.1 explicitly and state the conclusion._

## 3. Component design

_Diagram or bullet list: what new modules/classes/components are introduced, and how do they relate to existing ones? Reference CODING_STANDARDS.md layering (controller → service → repository) explicitly if backend._

## 4. Data flow

_Sequence of what talks to what. If this involves a domain event, cite the event name from EVENT_ARCHITECTURE.md §3 (or add a new row to that catalog if none fits — required, not optional)._

## 5. Dependencies

| Depends on | Type                                      | Status |
| ---------- | ----------------------------------------- | ------ |
|            | Epic / Package / External API / Migration |        |

## 6. Failure modes

_What happens when each dependency in §5 is unavailable? Cross-reference ARCHITECTURE.md §7.1's graceful-degradation table if this is a known dependency; define new behavior if not._

| Failure | Behavior |
| ------- | -------- |

## 7. Alternatives considered

_At least one alternative approach, and why it was rejected. A design with no considered alternative usually means the alternatives weren't actually thought through._

| Alternative | Why rejected |
| ----------- | ------------ |

## 8. ADR impact

_Does this design require a new entry in [DECISIONS.md](DECISIONS.md), or does it operate entirely within existing accepted ADRs? If new, draft the ADR alongside this design, don't defer it._

**New ADR required:** ☐ Yes → [link] · ☐ No, operates within: [ADR-XXX, ADR-YYY]

## 9. Architecture Gate checklist

- [ ] Respects bounded-context ownership (§2)
- [ ] Does not contradict an existing ADR (DECISIONS.md)
- [ ] Service-boundary rules honored (no cross-module reach into internals, ARCHITECTURE.md §2.1)
- [ ] Failure modes defined for every external dependency (§6)
- [ ] Reviewed by someone other than the author

**Architecture Gate:** ☐ Passed — [reviewer, date]
