import type { AssessmentItem, CefrLevel, Skill } from '@linguaai/database';

import {
  AdaptiveItemSelectionService,
  type SelectionHistoryEntry,
} from './adaptive-item-selection.service.js';

function makeItem(overrides: Partial<AssessmentItem> = {}): AssessmentItem {
  return {
    id: 'item-1',
    languageId: 'lang-1',
    skill: 'READING' as Skill,
    cefrLevel: 'B1' as CefrLevel,
    difficulty: 0.5,
    prompt: 'prompt',
    audioUrl: null,
    correctAnswer: { correctIndex: 0 },
    itemType: 'MULTIPLE_CHOICE',
    isActive: true,
    linguistSignOffBy: null,
    linguistSignOffAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AdaptiveItemSelectionService', () => {
  let service: AdaptiveItemSelectionService;

  beforeEach(() => {
    service = new AdaptiveItemSelectionService();
  });

  it('starts at B1 and picks the candidate closest to the 0.5 starting difficulty target', () => {
    const low = makeItem({ id: 'low', cefrLevel: 'B1', difficulty: 0.3 });
    const high = makeItem({ id: 'high', cefrLevel: 'B1', difficulty: 0.8 });

    const result = service.selectNext([low, high], []);

    expect(result.skillComplete).toBe(false);
    expect(result.item?.id).toBe('low');
  });

  it('steps the difficulty target up within the same band after a correct response', () => {
    const closerTo075 = makeItem({ id: 'closer-to-0.75', cefrLevel: 'B1', difficulty: 0.7 });
    const farther = makeItem({ id: 'farther', cefrLevel: 'B1', difficulty: 0.1 });
    const history: SelectionHistoryEntry[] = [{ isCorrect: true }];

    const result = service.selectNext([closerTo075, farther], history);

    expect(result.item?.id).toBe('closer-to-0.75');
  });

  it('advances to the next CEFR band once three consecutive corrects push the target past 1.0', () => {
    const b2Item = makeItem({ id: 'b2-item', cefrLevel: 'B2', difficulty: 0.25 });
    const b1Item = makeItem({ id: 'b1-item', cefrLevel: 'B1', difficulty: 0.9 });
    const history: SelectionHistoryEntry[] = [
      { isCorrect: true },
      { isCorrect: true },
      { isCorrect: true },
    ];

    const result = service.selectNext([b2Item, b1Item], history);

    expect(result.item?.id).toBe('b2-item');
  });

  it('steps the difficulty target down and, past the floor, retreats to the lower CEFR band', () => {
    const a2Item = makeItem({ id: 'a2-item', cefrLevel: 'A2', difficulty: 0.75 });
    const b1Item = makeItem({ id: 'b1-item', cefrLevel: 'B1', difficulty: 0.0 });
    const history: SelectionHistoryEntry[] = [
      { isCorrect: false },
      { isCorrect: false },
      { isCorrect: false },
    ];

    const result = service.selectNext([a2Item, b1Item], history);

    expect(result.item?.id).toBe('a2-item');
  });

  /**
   * Real bug found and fixed during implementation (see
   * `AdaptiveItemSelectionService.hasStabilized`'s own doc comment): an
   * earlier version compared the *served item's* band instead of the
   * *post-response* band, which made every skill "stabilize" after exactly
   * 2 items regardless of correctness (a single ±0.25 step from the 0.5
   * center can never cross a [0,1] boundary, so items 1 and 2 are always
   * from the same band by construction) — silently defeating the whole
   * adaptive mechanism. This test is the regression guard for that fix.
   */
  it('never stabilizes before at least 3 responses — the first response alone carries no band-change signal', () => {
    const anyItem = makeItem();
    const history: SelectionHistoryEntry[] = [{ isCorrect: true }, { isCorrect: true }];

    const result = service.selectNext([anyItem], history);

    expect(result.skillComplete).toBe(false);
    expect(result.item).not.toBeNull();
  });

  it('stops once the post-response band has repeated for 2 consecutive responses ("stabilized")', () => {
    const anyItem = makeItem();
    // None of these three steps cross a band boundary (0.75 -> 0.5 -> 0.75,
    // all within B1) — the last two post-response bands are therefore both
    // B1, which is exactly the stabilization condition.
    const history: SelectionHistoryEntry[] = [
      { isCorrect: true },
      { isCorrect: false },
      { isCorrect: true },
    ];

    const result = service.selectNext([anyItem], history);

    expect(result).toEqual({ item: null, skillComplete: true });
  });

  it('does not stabilize when the 3rd response crosses into a new band — the last two post-response bands differ', () => {
    // Reuses the same 3-correct history as the "advances to the next CEFR
    // band" test above: post-response bands are [B1, B1, B2] — the last
    // two (B1, B2) differ, so this must NOT stop early.
    const b2Item = makeItem({ id: 'b2-item', cefrLevel: 'B2', difficulty: 0.25 });
    const history: SelectionHistoryEntry[] = [
      { isCorrect: true },
      { isCorrect: true },
      { isCorrect: true },
    ];

    const result = service.selectNext([b2Item], history);

    expect(result.skillComplete).toBe(false);
    expect(result.item?.id).toBe('b2-item');
  });

  it('stops once MAX_ITEMS_PER_SKILL (5) responses have been recorded, even without stabilizing', () => {
    const anyItem = makeItem();
    const history: SelectionHistoryEntry[] = [
      { isCorrect: true },
      { isCorrect: false },
      { isCorrect: true },
      { isCorrect: false },
      { isCorrect: true },
    ];

    const result = service.selectNext([anyItem], history);

    expect(result).toEqual({ item: null, skillComplete: true });
  });

  it('real, load-bearing extension (ADR-038): falls back to the nearest non-empty band when the exact target band has no unserved items — the seed bank only covers A1/B1/C1', () => {
    // Starting state targets B1 (empty pool); A2/B2 (distance 1) are also
    // empty; A1 (distance 2) has the only candidate.
    const a1Item = makeItem({ id: 'a1-only', cefrLevel: 'A1', difficulty: 0.5 });

    const result = service.selectNext([a1Item], []);

    expect(result.item?.id).toBe('a1-only');
  });

  it('returns skillComplete: true with no item when the candidate pool is completely empty', () => {
    const result = service.selectNext([], []);

    expect(result).toEqual({ item: null, skillComplete: true });
  });
});
