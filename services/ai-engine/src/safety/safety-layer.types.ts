/**
 * SECURITY.md §5 / AI_GOVERNANCE.md §6: age-appropriate content boundaries
 * are "enforced at the gateway level via account-age-bracket metadata."
 * No such metadata exists anywhere in the schema today — `User`/
 * `UserProfile` (E2/E4) carry no birthdate or age-bracket column at all,
 * confirmed by direct search — because no product flow collects it yet
 * (Family plan, the only flow that would, is descoped to Version 2,
 * ADR-013). `UNKNOWN` is the only value any real caller can produce right
 * now; `resolveAgeBracket()` (this module) fails closed to `MINOR` for it,
 * never `ADULT` — a real, deliberate fail-safe default on a child-safety
 * boundary, not an oversight.
 */
export type AgeBracket = 'ADULT' | 'MINOR' | 'UNKNOWN';
