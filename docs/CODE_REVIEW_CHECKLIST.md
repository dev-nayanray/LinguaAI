# Code Review Checklist

Status: **v1.0 — Mandatory process** · Last updated: 2026-07-29

Standing checklist for lifecycle phase 17 ([IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) §2). Every PR reviewer runs through this — it doesn't replace judgment, it makes sure judgment doesn't skip something CLAUDE.md and CODING_STANDARDS.md already decided. This is a checklist to *apply*, not a template to copy per feature.

## Correctness

- [ ] Code does what the linked FEATURE_SPEC_TEMPLATE.md's acceptance criteria say it does — verified by reading the criteria, not just skimming the diff.
- [ ] Edge cases from FEATURE_SPEC_TEMPLATE.md §4 are actually handled in code, not just listed in the spec.
- [ ] No dead code, commented-out blocks, or debug logging left in.

## Standards compliance (CODING_STANDARDS.md)

- [ ] TypeScript strict, no unjustified `any`.
- [ ] Correct layering (controller → service → repository); no business logic in controllers.
- [ ] No module reaches into another module's internals — only public exports (ARCHITECTURE.md §2.1).
- [ ] Shared types/validation come from `packages/types` / `packages/validation`, not redefined locally.
- [ ] Errors are typed domain exceptions mapped to the standard error envelope (API_GUIDELINES.md §3) — never a raw string throw reaching the client.
- [ ] No comments explaining *what* — only non-obvious *why*, per CLAUDE.md.

## Gates already passed (verify, don't re-litigate)

- [ ] Architecture Gate evidence linked (if this PR includes a new design)
- [ ] Security Gate evidence linked (if applicable)
- [ ] Database Gate evidence linked (if this PR includes a migration)
- [ ] API Gate evidence linked (if this PR adds/changes an endpoint)
- [ ] Frontend/Accessibility Gate evidence linked (if this PR adds/changes UI)
- [ ] AI Gate evidence linked (if this PR touches `services/ai-engine`)

*A reviewer who finds a gate wasn't actually passed stops the PR — this checklist is not the place to first discover a missing Security Gate.*

## Tests

- [ ] Unit/integration tests exist for the changed behavior, not just for the happy path.
- [ ] Tests actually fail if the implementation is reverted (spot-check at least one).
- [ ] No tests were weakened/deleted to make CI pass.

## Documentation currency (CLAUDE.md, CONTRIBUTING.md)

- [ ] Any `docs/*.md` affected by this change is updated in the same PR — not promised in a follow-up.
- [ ] New domain event added to EVENT_ARCHITECTURE.md §3 catalog if this PR introduces one.
- [ ] New ADR added to DECISIONS.md if this PR makes a significant architectural choice.

## Performance & observability

- [ ] No obvious N+1 query or missing index for a new hot-path query (DATABASE.md §4).
- [ ] Logging follows OBSERVABILITY.md §1 (structured, required fields, no raw PII).
- [ ] New AI-invoking or otherwise expensive path is metered (`AIUsageLog` or equivalent).

## Security (baseline, independent of a full Security Gate review)

- [ ] No secret, API key, or credential committed.
- [ ] User input is validated server-side, not just client-side.
- [ ] No raw SQL string interpolation.

## Sizing

- [ ] The PR is reviewable — if it's doing five unrelated things, it's asked to be split before further review, not reviewed as-is.

**Reviewer sign-off is a named approval on the PR, not a passive "no objection." If any box above is unchecked and unresolved, the PR does not merge.**
