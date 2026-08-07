import { citationFor, formatGroundingContextForPrompt } from './format-grounding-context.js';
import type { GroundingPassage } from './rag-retrieval.types.js';

describe('citationFor', () => {
  it('formats a stable kb:<id> reference', () => {
    expect(citationFor('entry-1')).toBe('kb:entry-1');
  });
});

describe('formatGroundingContextForPrompt', () => {
  it('returns an empty string for no passages, safe to concatenate unconditionally', () => {
    expect(formatGroundingContextForPrompt([])).toBe('');
  });

  it("includes each passage's citation, title, and content", () => {
    const passages: GroundingPassage[] = [
      {
        id: 'e1',
        category: 'GRAMMAR_REFERENCE',
        title: 'Subjunctive mood',
        content: 'Used to express doubt.',
        citation: 'kb:e1',
      },
      {
        id: 'e2',
        category: 'CEFR_DESCRIPTOR',
        title: 'B1 speaking',
        content: 'Can handle most situations.',
        citation: 'kb:e2',
      },
    ];

    const result = formatGroundingContextForPrompt(passages);

    expect(result).toContain('[kb:e1] Subjunctive mood: Used to express doubt.');
    expect(result).toContain('[kb:e2] B1 speaking: Can handle most situations.');
    expect(result).toContain('Grounding context');
    expect(result).toContain('cite the bracketed reference');
  });
});
