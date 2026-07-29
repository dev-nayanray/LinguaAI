# UI/UX Review Template

Copy this file per screen or component group. Covers lifecycle phase 5 ([IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §2) and feeds the **Frontend Gate** and **Accessibility Gate**. Must comply with [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

---

## UX review: [Screen/component name]

**Feature spec:** [link]
**Designer/author:** [name]
**Frontend Gate reviewer:** [name]
**Accessibility Gate reviewer:** [name]

## 1. Design tokens used

*Confirm no ad hoc values — every color/spacing/radius/elevation/z-index traces to DESIGN_SYSTEM.md §2/§2.1.*

☐ Confirmed — no hardcoded colors, spacing, or one-off values outside `packages/ui` tokens.

## 2. Components used

| Component | Source | New component needed? |
|---|---|---|
| | `packages/ui` existing / new | |

*If a new component is needed, it's added to `packages/ui` (DESIGN_SYSTEM.md §4) — not built inline in the feature.*

## 3. Required states (DESIGN_SYSTEM.md §5)

| State | Design specified | Notes |
|---|---|---|
| Loading | ☐ | |
| Empty | ☐ | |
| Error | ☐ | |
| Success | ☐ | |

*A state marked "not applicable" requires a one-line justification, not a blank.*

## 4. Responsive & mobile-first

- ☐ Designed mobile-first (base styles target mobile, DESIGN_SYSTEM.md §5), enhanced upward for tablet/desktop.
- ☐ Verified at all three breakpoints (desktop ≥1280px, tablet ≥768px, mobile <768px).

## 5. Motion

- ☐ Uses standard duration/easing defaults (DESIGN_SYSTEM.md §2.2) — no bespoke timing.
- ☐ `prefers-reduced-motion` fallback defined, especially if this includes a celebratory/gamification moment.

## 6. AI content signaling (if applicable)

- ☐ AI-originated content uses AI-purple **paired with an icon/label**, never color alone (DESIGN_SYSTEM.md §2).
- ☐ Streaming AI text uses throttled `aria-live="polite"`, not raw per-token updates (DESIGN_SYSTEM.md §5).

## 7. Accessibility checklist (WCAG 2.1 AA — DESIGN_SYSTEM.md §5)

- [ ] Full keyboard navigation (tab order logical, no keyboard traps)
- [ ] Visible focus states on every interactive element
- [ ] Contrast ≥4.5:1 body text / ≥3:1 large text & UI components, verified in **both** light and dark theme
- [ ] Screen-reader tested (not just semantic-HTML-assumed) — actual pass with VoiceOver/NVDA/TalkBack
- [ ] Audio/voice content has a text equivalent or transcript
- [ ] Custom components (progress rings, waveforms, custom selects) have correct ARIA roles/labels

## 8. Localization readiness

- ☐ No hardcoded user-facing strings (externalized per PRD.md §5.1).
- ☐ Layout tolerates translated string length (no fixed-width text containers that'll clip a longer translation).
- ☐ RTL-safe layout (logical CSS properties, not hardcoded left/right) even if no RTL language ships yet.

## 9. Frontend + Accessibility Gate sign-off

**Frontend Gate:** ☐ Passed — [reviewer, date]
**Accessibility Gate:** ☐ Passed — [reviewer, date]
