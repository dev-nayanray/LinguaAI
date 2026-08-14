# MOBILE_DESIGN.md — LinguaAI Mobile (Flutter) Design Reference

Status: Living reference, updated alongside `apps/mobile`. Companion to [docs/DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (the cross-platform source of truth for tokens/brand) — this document is the mobile-specific application of that system: navigation architecture, screen inventory, shared widget catalog, and the states every screen must support. It does not duplicate token values; see `packages/ui/scripts/generate-tokens.mjs` (ADR-024) for those.

## 1. Scope of this pass

This is a visual/UX redesign of the screens `apps/mobile` already ships (E21 T1–T5) — it does not add any feature that requires new backend work. Two concrete navigation/structure changes were in scope and made:

- Replaced the old button-list `HomeScreen` with `HomeShell` (§3), a real bottom-navigation shell.
- Every screen now consumes shared, token-driven component themes and widgets (§4) instead of hand-rolled `ListTile`/`Column` layouts, so a visual change (e.g. a new radius or semantic color) only has to happen in one place.

Explicitly out of scope for this pass (tracked separately, not silently added): OAuth/social login, push-notification UI (E21 T4 already covers the backend/registration plumbing — `UnavailablePushTokenProvider` until a real Firebase project exists, RISK_REGISTER R-105), a settings/preferences screen, and animated micro-interactions beyond what Material 3's own widgets provide for free (ripples, `AnimatedSwitcher`-free reveal, etc.).

## 2. Design tokens → Flutter

`apps/mobile/lib/core/theme/design_tokens.dart` parses the same JSON `packages/ui/scripts/generate-tokens.mjs` emits for web (`assets/design_tokens.json`, regenerated fresh per build by `tool/generate_design_tokens.sh`, never committed). `apps/mobile/lib/core/theme/app_theme.dart` (`AppTheme.light`/`AppTheme.dark`) turns those tokens into a real `ThemeData`:

| Token category                                                                                                                                     | Flutter mechanism                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand/semantic colors (`colorPrimary`, `colorAccent`, `colorSuccess`, `colorWarning`, `colorDangerSolid`, `colorAi`, surface tiers, `colorBorder`) | `ColorScheme` (primary/secondary/tertiary/error/surface/outline) for the four Material-native slots, plus a custom `AppColors` `ThemeExtension` (§2.1) for the rest — `ColorScheme` has no slot for "success" or "AI accent" as a hue distinct from primary/secondary.                                |
| Spacing scale                                                                                                                                      | `AppSpacing` `ThemeExtension` (pre-existing, unchanged).                                                                                                                                                                                                                                              |
| Radius scale                                                                                                                                       | `AppRadius` `ThemeExtension` (pre-existing, unchanged) — now actually consumed by every card/button/chip via `context.radii['md']` etc., not just declared.                                                                                                                                           |
| Typography scale                                                                                                                                   | `TextTheme` (`bodySmall`…`displayLarge`), mapped from `typeBodySm`…`typeDisplayXl`.                                                                                                                                                                                                                   |
| Component defaults                                                                                                                                 | `CardThemeData`, `InputDecorationTheme`, `FilledButtonThemeData`, `OutlinedButtonThemeData`, `NavigationBarThemeData`, `ChipThemeData`, `AppBarTheme`, `ProgressIndicatorThemeData`, `DividerThemeData` — one place each, instead of every screen repeating its own `InputDecoration`/`Card` styling. |

### 2.1 `AppColors` — the semantic-color extension

```dart
context.appColors.success   // colorSuccessSolid — "Easy"/correct/complete
context.appColors.warning   // colorWarningSolid — "Hard"/queued-offline
context.appColors.danger    // colorDangerSolid  — "Again"/incorrect
context.appColors.ai        // colorAiSolid       — AI-attributed surfaces (future AI-tutor screens)
context.appColors.surfaceMuted / .surfaceElevated / .border
```

Accessed via `context.appColors`/`context.radii`/`context.spacing` extension getters (`AppThemeExtensionAccess` in `app_theme.dart`). These fall back to fixed defaults when no themed `MaterialApp` is present in the widget tree — the case in most of this app's own screen tests, which intentionally pump a screen under a bare `MaterialApp(home: ...)` to test behavior, not theming (see §6).

## 3. Navigation architecture

**Before:** `HomeScreen` was a plain `Column` of three `FilledButton`s pushing `CourseListScreen`/`SrsReviewScreen`/`ProgressScreen` via `Navigator.push` — no way to jump between them without returning to the button list, and no persistent place to see account/session state.

**After:** `HomeShell` (`apps/mobile/lib/core/widgets/home_shell.dart`) — a Material 3 `NavigationBar` with four persistent destinations, each screen kept alive in an `IndexedStack` so switching tabs doesn't re-trigger its Riverpod fetch every time:

| Destination | Screen                                                                              | Purpose                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Learn       | `CourseListScreen` → `CourseDetailScreen` → `LessonDetailScreen` → `ExerciseScreen` | Course browsing and exercise attempts (E21 T2).                                                                                    |
| Review      | `SrsReviewScreen`                                                                   | Vocabulary SRS flashcard loop (E21 T3).                                                                                            |
| Progress    | `ProgressScreen`                                                                    | XP/level/streak, missions, badges (E21 T3).                                                                                        |
| Profile     | `_ProfileTab` (new)                                                                 | Account identity, active `AppEnvironment` (dev/staging/prod — a real QA aid for a build with three named targets, T5), and logout. |

`HomeShell` is also the real call site for `DeviceTokenRegistrar.registerIfAvailable()` (E21 T4) — moved here from the old `HomeScreen`'s `initState`, same no-op-until-a-real-Firebase-project behavior.

Below the shell, `Login → Register`/`Login → MFA challenge` and `Course → Lesson → Exercise` remain a plain `Navigator.push` stack — a full router (go_router or similar) was judged unnecessary for four shallow, linearly-nested flows and wasn't part of this pass's scope.

## 4. Shared widget catalog (`apps/mobile/lib/core/widgets/`)

Introduced so every screen's loading/empty/error state, section heading, and selectable option look and behave the same way, instead of each screen hand-rolling its own `Center(child: Column(...))`:

| Widget                             | Replaces                                              | Used by                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoadingView`                      | `Center(child: CircularProgressIndicator())`          | Every async screen.                                                                                                                                             |
| `ErrorView(message, onRetry)`      | Ad hoc error `Column` + `Retry` button                | Course list/detail, lesson detail, progress, SRS review.                                                                                                        |
| `EmptyStateView(message, icon)`    | Bare `Text` centered                                  | Course list, lesson content, SRS deck, progress missions/badges.                                                                                                |
| `SectionHeader(title, {trailing})` | Bare `Text(..., style: headlineMedium)`               | Lesson activities, progress Missions/Badges sections.                                                                                                           |
| `OptionCard`                       | `RadioListTile`/plain `ListTile` for exercise options | `ExerciseScreen` (multiple-choice, listening, matching) — shows a visible selected/correct/incorrect state (border + tint + icon), not only a filled radio dot. |
| `StatPill`                         | Two stacked `Text` widgets                            | Progress screen's level/XP/streak row.                                                                                                                          |
| `HomeShell`                        | `HomeScreen` (deleted)                                | App-level post-login navigation (§3).                                                                                                                           |

Every one of these is a `StatelessWidget` (or `ConsumerStatefulWidget` for `HomeShell`) with no screen-specific logic — they take data and callbacks, same discipline as the rest of this app's presentation layer.

## 5. Screen-by-screen states

Every screen below implements loading/empty/error/success explicitly (CLAUDE.md's "no demo-level work" bar) via the shared widgets in §4 unless noted:

| Screen                      | Loading               | Empty                                                                        | Error                                                                              | Success                                                                                                               |
| --------------------------- | --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `LoginScreen`               | Inline button spinner | n/a                                                                          | Inline text under the form                                                         | Centered branded card (logo + "LinguaAI"), max-width 420 so it doesn't stretch full-width on the web build            |
| `RegisterScreen`            | Inline button spinner | n/a                                                                          | Inline text                                                                        | Scrollable form, ToS checkbox                                                                                         |
| `MfaChallengeScreen`        | Inline button spinner | n/a                                                                          | Inline text                                                                        | Centered 6-digit code field, shield icon                                                                              |
| `HomeShell` / `_ProfileTab` | n/a (synchronous)     | n/a                                                                          | n/a                                                                                | Avatar-initial card, environment chip, logout                                                                         |
| `CourseListScreen`          | `LoadingView`         | `EmptyStateView` ("No courses are published yet.")                           | `ErrorView` + retry                                                                | Card list, book icon avatar per course                                                                                |
| `CourseDetailScreen`        | `LoadingView`         | `EmptyStateView` ("This course has no content yet.")                         | `ErrorView` + retry                                                                | Card-wrapped `ExpansionTile` per level (CEFR-level avatar) → unit → lesson                                            |
| `LessonDetailScreen`        | `LoadingView`         | `EmptyStateView` ("This lesson has no exercises yet.")                       | `ErrorView` + retry                                                                | `SectionHeader` per activity, exercise-type icon per row                                                              |
| `ExerciseScreen`            | Inline button spinner | n/a (exercise always has a prompt)                                           | Inline text + honest "can't be answered yet" notice for unsupported/legacy content | `OptionCard` selection, colored scored/queued outcome banner (success/danger/warning tint)                            |
| `SrsReviewScreen`           | `LoadingView`         | `EmptyStateView` ("No cards are due..." / "All done! You reviewed N cards.") | `ErrorView` + retry                                                                | Flashcard `Card`, reveal button, four colored quality buttons (danger/warning/primary/success = Again/Hard/Good/Easy) |
| `ProgressScreen`            | `LoadingView`         | Per-section `EmptyStateView` (missions/badges independently)                 | `ErrorView` + retry                                                                | `StatPill` row (level/XP/streak), daily-goal card, mission progress bars, badge card `Wrap`                           |

## 6. Testing implications

Existing widget tests (`apps/mobile/test/features/**/presentation/*_test.dart`) intentionally pump individual screens under a bare `MaterialApp(home: ...)`, not the app's own themed `MaterialApp` — they assert on behavior and exact copy (e.g. `find.text('20/50')`, `find.text('Retry')`), not visual styling. All redesigned screens preserve the exact strings and tappable text targets those tests already asserted on. Because `context.appColors`/`context.radii` fall back to fixed defaults (§2.1) instead of null-asserting, screens render correctly under those bare-`MaterialApp` tests too, so no existing test needed its assertions changed — only `AppTheme`/`app_theme.dart` gained the fallback, and `flutter analyze`/`flutter test` (64 tests) both pass clean.

## 7. Known gaps / deliberately deferred

- **No dedicated settings screen.** Environment visibility (dev/staging/prod) lives on the Profile tab; no user-configurable preferences exist yet (locale, notification toggles) — none of the underlying features exist server-side yet either.
- **No router.** `Navigator.push`/`MaterialPageRoute` throughout — fine for the current shallow flows; revisit if deep-linking (e.g. push notification → specific lesson) becomes a real requirement (see RISK_REGISTER R-105).
- **No custom illustration/icon set.** Material Icons only — `packages/ui` has no shared icon/illustration package for Flutter to consume yet; a real gap if brand illustration becomes a requirement, not invented here to look complete.
- **Exercise progress ("Question 3 of 8") not shown.** `LessonDetailScreen` doesn't currently pass total-exercise-count context into `ExerciseScreen`; a real, small follow-up, not done here to avoid changing `ExerciseScreen`'s public API without a driving need.
