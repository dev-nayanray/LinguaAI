import type { AgeBracket } from './safety-layer.types.js';

/**
 * Fails closed to `MINOR` for anything other than a confirmed `ADULT` —
 * an absent/unknown age bracket must never be treated as "safe to show
 * adult-appropriate content," the opposite of a typical fail-open default
 * elsewhere in this codebase. Not currently wired into `OrchestratorService`:
 * no differentiated content policy has been specified anywhere (by
 * product or pedagogy) beyond the generic "boundaries exist" requirement
 * to actually apply per bracket — building one would mean inventing
 * policy that doesn't exist, the same discipline that kept T5 from
 * inventing unstated trigger relationships. Whichever epic ships Family
 * plan (Version 2, ADR-013) owns both the real `ageBracket` column this
 * reads from and the real per-bracket content policy this would enforce.
 */
export function resolveAgeBracket(raw: AgeBracket | null | undefined): 'ADULT' | 'MINOR' {
  return raw === 'ADULT' ? 'ADULT' : 'MINOR';
}
