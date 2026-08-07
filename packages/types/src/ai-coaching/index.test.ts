import { describe, expect, it } from 'vitest';

// Relative import (not the self-referencing @linguaai/types/ai-coaching
// path the root src/index.test.ts uses) — same reasoning as
// identity/index.test.ts: this file exercises the real source directly so
// coverage instruments it.
import { AGENT_SESSION_STATUSES, ORCHESTRATOR_AGENT_PERSONAS } from './index.js';

// Runtime enum arrays are consumed directly by @linguaai/validation/ai-coaching
// (z.enum(...)) — a typo or dropped value here would silently change what
// the Zod schema built from it accepts, so the exact contents are asserted
// against ai.prisma's own enums, not just "is an array."
describe('ai-coaching enum arrays match ai.prisma exactly', () => {
  it('ORCHESTRATOR_AGENT_PERSONAS', () => {
    expect(ORCHESTRATOR_AGENT_PERSONAS).toEqual([
      'PERSONAL_LANGUAGE_TEACHER',
      'CONVERSATION_PARTNER',
      'VOCABULARY_COACH',
      'WRITING_COACH',
      'EXAM_COACH',
    ]);
  });

  it('AGENT_SESSION_STATUSES', () => {
    expect(AGENT_SESSION_STATUSES).toEqual(['ACTIVE', 'ENDED', 'ABANDONED']);
  });
});
