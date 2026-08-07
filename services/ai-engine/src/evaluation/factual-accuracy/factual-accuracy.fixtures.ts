import type { KnowledgeBaseCategory } from '@linguaai/database';

/**
 * AI_GOVERNANCE.md §3's "Factual-accuracy set" — INTERIM version.
 *
 * Real curated-content fixtures (grammar-rule/exam-rubric style entries,
 * the two categories AI_GOVERNANCE.md §3's own table names) paired with a
 * query that should retrieve each one first. `distanceIfQueried` values
 * are fixture pgvector cosine-distances (0 = identical, 2 = maximally
 * dissimilar) chosen to encode "this entry is the closest match for this
 * fixture's own query, and further from every other fixture's query" —
 * this suite does not compute a real embedding (no live provider call is
 * made anywhere in this repo's test suite, see this directory's own eval
 * spec header for why), so ranking is fixture data, not a real semantic
 * search result.
 */
export interface FactualAccuracyFixture {
  id: string;
  category: KnowledgeBaseCategory;
  title: string;
  content: string;
  query: string;
  /** This fixture's own distance when its own query is issued — the smallest among all fixtures for that query, so it ranks first. */
  distanceForOwnQuery: number;
  /** This fixture's distance when a DIFFERENT fixture's query is issued — deliberately far, so it never outranks the correct match. */
  distanceForOtherQueries: number;
}

export const FACTUAL_ACCURACY_FIXTURES: readonly FactualAccuracyFixture[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    category: 'GRAMMAR_REFERENCE',
    title: 'Spanish subjunctive after expressions of doubt',
    content:
      'Use the subjunctive mood after verbs/expressions of doubt, denial, or negation (e.g. "dudo que", "no creo que") — the indicative is used when the speaker asserts certainty.',
    query: 'When do I use the subjunctive after dudo que in Spanish?',
    distanceForOwnQuery: 0.05,
    distanceForOtherQueries: 0.95,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    category: 'CEFR_DESCRIPTOR',
    title: 'CEFR B1 — spoken production',
    content:
      'Can connect phrases in a simple way in order to describe experiences and events, dreams, hopes and ambitions. Can briefly give reasons and explanations for opinions and plans.',
    query: 'What can a B1-level learner do in spoken production per the CEFR?',
    distanceForOwnQuery: 0.05,
    distanceForOtherQueries: 0.95,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    category: 'EXAM_RUBRIC',
    title: 'IELTS Writing Task 2 — Band 7 coherence and cohesion',
    content:
      'Logically organises information and ideas; there is clear progression throughout. Uses a range of cohesive devices appropriately although there may be some under-/over-use.',
    query: 'What does Band 7 coherence and cohesion look like for IELTS Writing Task 2?',
    distanceForOwnQuery: 0.05,
    distanceForOtherQueries: 0.95,
  },
];
