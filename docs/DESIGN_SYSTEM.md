# LinguaAI — Design System

Status: **v1.1 — Consolidated baseline** · Owner: UX Director · Last updated: 2026-07-29

Supersedes Draft v1.0. See [BASELINE.md](BASELINE.md) for the current authoritative summary.

## 1. Brand identity

**Product name:** LinguaAI
**Category:** AI-powered global language learning platform
**Core message:** "Your personal AI teacher for every language."

**Positioning:** Duolingo-style gamification + ChatGPT-level intelligence + Cambly-style live conversation practice + Babbel-style structured courses + AI personalized coaching.

**Brand personality:** Intelligent, friendly, global, premium, innovative, trustworthy, human.

**Target feeling:** "I have my own personal language teacher available anytime." The product should feel like a capable, patient, encouraging human tutor — never like a generic chatbot wrapper or a gamified toy that doesn't take the learner's progress seriously.

**Design direction:** Premium AI SaaS product. Inspiration: Apple's simplicity and restraint, Linear's craft and speed, Notion's productivity clarity, Duolingo's engagement mechanics, ChatGPT's conversational intelligence — synthesized, not imitated wholesale. LinguaAI should never look like a Duolingo clone; gamification is an engagement layer on top of a premium, credible AI-education product.

## 2. Color system

All colors are defined as design tokens in `packages/ui` (CSS custom properties + Tailwind theme extension), never hardcoded in components.

| Token             | Name            | Hex       | Usage                                                                                                                                         |
| ----------------- | --------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-primary` | Lingua Blue     | `#2563EB` | Primary actions, links, brand marks, focus states                                                                                             |
| `--color-ai`      | AI Purple       | `#7C3AED` | AI-specific surfaces: agent avatars, AI chat bubbles, "AI-generated" badges — a consistent visual signal that the user is interacting with AI |
| `--color-accent`  | Cyan            | `#06B6D4` | Communication/conversation features (speaking practice, voice UI)                                                                             |
| `--color-success` | Success Green   | `#22C55E` | Correct answers, completed goals, positive feedback                                                                                           |
| `--color-warning` | Warning Amber   | `#F59E0B` | Mistakes flagged for review, approaching usage limits, non-blocking warnings                                                                  |
| `--color-bg`      | Background      | `#F8FAFC` | Default light-mode app background                                                                                                             |
| `--color-bg-dark` | Dark Background | `#020617` | Default dark-mode app background                                                                                                              |
| `--color-text`    | Primary Text    | `#0F172A` | Primary text on light backgrounds                                                                                                             |

**Semantic color rules:**

- Purple is reserved exclusively for AI-originated content/actions. It must never be reused for generic decoration — this preserves it as a meaningful signal ("this came from the AI teacher") across the whole product. **AI-purple is always paired with a persistent icon or label, never used as the sole signal** — color alone fails WCAG 1.4.1 for colorblind users (deuteranopia in particular reduces purple/blue discrimination), a gap the Architecture Review flagged explicitly.
- Cyan is reserved for real-time communication contexts (live conversation, voice, speaking practice indicators) — distinct from general interactive blue.
- Success/Warning map to gamification and correctness feedback consistently — a green checkmark and amber flag must mean the same thing everywhere in the product (course exercises, writing assistant, exam scoring).
- Dark mode is a first-class palette (`--color-bg-dark` + derived surface/text tokens), not an auto-inverted light theme — contrast and color usage are separately validated for dark mode (see §5 Accessibility).

Extended neutral, surface, and state (info/error/disabled) scales are derived programmatically from these anchors in the Tailwind theme config in `packages/ui`, keeping a single set of brand decisions as the source of truth.

### 2.1 Foundational tokens (added — required before component build starts)

Color and type were originally the only specified token scales; spacing, elevation, radius, and z-index are equally foundational and block any component work without them:

| Token scale      | Values                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Spacing          | 4px base unit scale: `0, 1(4px), 2(8px), 3(12px), 4(16px), 6(24px), 8(32px), 12(48px), 16(64px)`                             |
| Elevation/shadow | `flat, low (cards), medium (dropdowns/popovers), high (modals), overlay (toasts/celebrations)`                               |
| Border radius    | `sm(4px), md(8px), lg(12px), pill(9999px)` — pill reserved for badges/tags/streak indicators                                 |
| Z-index          | `base(0), dropdown(10), sticky(20), overlay(30), modal(40), toast(50)` — fixed scale, never an arbitrary per-component value |

### 2.2 Motion principles (added — no longer deferred)

The original draft explicitly deferred motion/animation choreography. The Architecture Review flagged this as a risk specifically because gamification (XP toasts, streak celebrations, level-ups) is core competitive positioning and cannot be an afterthought. At minimum, before component build begins:

- **Duration defaults**: micro-interactions 150–200ms, standard transitions 200–300ms, celebratory moments (level-up, streak milestone) up to 600ms.
- **Easing default**: standard ease-out for entrances, ease-in for exits — consistent across `packages/ui`, not chosen per component.
- **`prefers-reduced-motion` is respected everywhere** — celebratory animations degrade to a static/brief equivalent, never simply removed (the success feedback must still register).
  A full choreography spec (per-component timing/sequencing) remains a later, deliberate addition — these principles are the non-negotiable floor.

## 3. Typography

- **Primary typeface:** Inter — used for all UI text, body copy, and default headings. Chosen for legibility across the many non-Latin scripts LinguaAI's own interface may eventually need to support alongside strong Latin-script readability at small sizes (dense lesson/exercise UI).
- **Alternative typeface:** Manrope — available for marketing/editorial contexts (landing pages, campaign content) where a slightly warmer, more distinctive display face suits brand storytelling without diverging from Inter in the product UI itself.
- **Type scale:** a fixed modular scale (defined as Tailwind `fontSize` tokens in `packages/ui`) from `xs` (captions, metadata) through `4xl`/`5xl` (marketing hero, dashboard headline numbers like streak count). Product UI typically uses `sm` through `2xl`; larger sizes are reserved for marketing surfaces and celebratory moments (level-up, streak milestones).
- **Learning-content typography is a distinct concern**: target-language text (which may be in scripts with different line-height/rendering needs — e.g., Japanese, Korean, Arabic) uses locale-aware font stacks and line-height overrides layered on top of the base type scale, not the same fixed values used for UI chrome.

## 4. Component library (`packages/ui`)

Built on Shadcn UI primitives (Radix UI + Tailwind), themed to the tokens above, so we get accessible, unstyled primitives and own the visual layer rather than fighting a heavier component framework.

Required component categories at foundation stage:

| Category                     | Components                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Buttons                      | Primary, secondary, ghost, destructive, icon-only; loading and disabled states built in, not bolted on per usage                                                                                                                                                                                                                                                                                                                                                                     |
| Forms                        | Text input, textarea, select, checkbox, radio, switch, combobox, all with label/help-text/error-text slots wired to `packages/validation` Zod errors                                                                                                                                                                                                                                                                                                                                 |
| Cards                        | Base card, stat card (dashboard metrics), lesson card, achievement card                                                                                                                                                                                                                                                                                                                                                                                                              |
| Navigation                   | Top nav, sidebar (desktop), bottom tab bar (mobile/responsive), breadcrumbs                                                                                                                                                                                                                                                                                                                                                                                                          |
| Dashboard layouts            | A **single shared dashboard-grid/widget primitive** (added — resolves the Architecture Review finding that learner/admin/enterprise dashboards were each described independently, risking three divergent implementations of the same pattern), composed differently per context rather than rebuilt per context                                                                                                                                                                     |
| AI chat components           | Message bubble (user vs. AI, with AI-purple + icon treatment per §2), streaming-token text renderer (with throttled `aria-live` announcements — see §5 Accessibility), voice waveform/recording indicator, "thinking" vs. "typing" state distinction, mid-stream failure/recovery state, formal voice-session state machine (listening/processing/speaking/idle), inline correction/diff UI (strikethrough + replacement, central to Grammar/Writing Coach UX), agent persona header |
| Progress components          | Linear progress bar, circular/ring progress (skill mastery), XP bar, streak flame indicator, CEFR level badge                                                                                                                                                                                                                                                                                                                                                                        |
| Gamification components      | XP toast/celebration, badge grid, leaderboard row, mission/challenge card, streak calendar                                                                                                                                                                                                                                                                                                                                                                                           |
| Commerce & forms _(added)_   | Paywall/upgrade modal (functionally required by PRD.md Journey D, previously unlisted as a component), onboarding/wizard stepper, date/time picker (exam date, goals), file/image upload (camera translation, avatars)                                                                                                                                                                                                                                                               |
| Admin & comparison _(added)_ | Admin data table (sort/filter/paginate — heavily used by module 24 and currently unlisted), pronunciation comparison UI (user vs. native-speaker waveform/score diff, Pronunciation Lab-specific)                                                                                                                                                                                                                                                                                    |

Every component in `packages/ui` ships with: a default, loading, disabled, and (where applicable) error variant — enforced by Storybook stories per component, reviewed as part of PR review (see CONTRIBUTING.md). Empty-state and error-state **copy** per module (30 modules × an empty state each) is a Product+Design-owned content inventory tracked outside this document — this document owns the _pattern_, not the per-module content catalog.

## 5. UX requirements (non-negotiable, apply to every screen)

**Responsive breakpoints:** desktop (≥1280px), tablet (≥768px), mobile (<768px), defined once in `packages/ui`/Tailwind config and used consistently — no per-feature breakpoint decisions. **Components are authored mobile-first** (base styles target mobile, enhanced upward via breakpoint overrides) — an explicit mandate added given language-learning usage is predominantly mobile (category precedent), previously left as an implicit/unstated direction.

**Accessibility (WCAG 2.1 AA baseline):**

- Full keyboard navigation for every interactive flow, including the AI chat interface and exercise interactions (not just marketing pages).
- **Streaming AI text uses throttled `aria-live="polite"` announcements**, not a raw per-token update — naive token-by-token streaming is close to unusable for screen-reader users without this, a concrete failure mode the Architecture Review flagged as easy to miss until real screen-reader testing happens. Treated as a P0 requirement for the AI chat component (§4), not a post-launch fix.
- `prefers-reduced-motion` is respected for all gamification/celebration animations (§2.2).
- Minimum 4.5:1 contrast for body text, 3:1 for large text/UI components, validated for both light and dark themes against the token set in §2.
- Visible focus states on all interactive elements (never `outline: none` without a replacement focus style).
- Voice/audio features (speaking practice, listening exercises) have text-based equivalents/transcripts so the product remains usable without audio.
- Semantic HTML and ARIA labeling for custom components (progress rings, waveforms, custom selects).

**Required screen states — every screen/feature must implement all four:**

1. **Loading** — skeleton/placeholder matching the eventual layout, not a generic spinner-only blank screen, for anything with perceptible latency (notably AI responses — see AI_SYSTEM.md latency budget, which loading states are designed around).
2. **Empty** — a first-run or zero-data state that guides the user to the next action (e.g., "No vocabulary saved yet — words you look up will appear here"), not a bare blank list.
3. **Error** — a specific, recoverable message with a retry path where applicable; never a raw error code or stack trace surfaced to the user (see API.md error envelope, which frontend error states are built to consume).
4. **Success feedback** — explicit confirmation of a completed action (toast, inline state change, or celebratory moment for gamification-relevant actions), so the user is never uncertain whether an action succeeded.

## 6. UX principles

- **The AI should feel present but not intrusive.** AI-purple and agent avatars make it clear when the user is talking to an AI teacher, but the AI never blocks the interface with unnecessary confirmation dialogs or interrupts the learning flow.
- **Gamification reinforces learning, never replaces feedback quality.** XP and streaks are motivational scaffolding around genuinely useful corrective feedback — a correct-looking green checkmark must always be backed by an actually-correct answer; gamification cannot outrun assessment accuracy.
- **Every interaction respects the learner's time.** Given personas like Maria (20–30 min/day), flows default to the shortest path to value; advanced options are available but never required to complete a core loop (assessment, daily lesson, conversation session).
- **Consistency across web, mobile, and admin.** The same design tokens and component contracts apply everywhere (`packages/ui` for web/admin; Flutter theme tokens generated to mirror the same palette/type scale for mobile), so switching devices never feels like switching products.

## 7. Explicitly deferred

- A full illustration/iconography system beyond core UI icons — introduced alongside marketing site design work, not blocking the app-shell foundation.
- Motion/animation choreography spec (beyond "smooth, purposeful transitions" as a stated principle) — detailed easing/duration tokens are defined when the first interactive prototypes are built, informed by real component usage rather than speculatively.
