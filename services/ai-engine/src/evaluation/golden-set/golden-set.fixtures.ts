import type { OrchestratorAgentPersona } from '@linguaai/database';

/**
 * AI_GOVERNANCE.md §3's "Golden-set regression" suite — representative
 * learner inputs per Orchestrator-capable persona (the 5 `OrchestratorAgentPersona`
 * values; the 2 specialist-only personas, Grammar/Pronunciation Coach,
 * never speak to the learner directly per T5's tool-registry design and
 * have no session-level system prompt to regress here).
 *
 * INTERIM SCOPE, honestly stated (see golden-set.eval.spec.ts's own header
 * for the full rationale): this fixture set exists to catch a regression
 * in the real, deterministic pipeline (prompt assembly, memory/summary
 * injection, safety delimiting) — it deliberately does not attempt to
 * score actual model-generated tone/structure/helpfulness, since that
 * needs either a live model call (no API credentials are available in
 * this environment or, per repo-wide precedent, in CI) or a recorded
 * corpus of real past model outputs to replay against (neither exists
 * yet). A later epic that budgets for live-model evaluation runs is the
 * real owner of that half of this suite's name.
 */
export interface GoldenSetCase {
  persona: OrchestratorAgentPersona;
  /** A phrase the rendered system prompt must contain — the persona's own stated identity, transcribed from its template. Regresses if a template edit drops the persona's own framing. */
  expectedIdentityPhrase: string;
  userMessage: string;
  variables: { targetLanguageName: string; proficiencyLevel: string };
  /** A learner fact Memory Manager would plausibly have retrieved for this turn — exercises the real safety-delimiting path memory content goes through. */
  priorMemoryFact: string;
}

export const GOLDEN_SET_CASES: readonly GoldenSetCase[] = [
  {
    persona: 'PERSONAL_LANGUAGE_TEACHER',
    expectedIdentityPhrase: "learner's Personal Language Teacher",
    userMessage: 'How do I use the subjunctive mood in Spanish?',
    variables: { targetLanguageName: 'Spanish', proficiencyLevel: 'B1' },
    priorMemoryFact: 'confuses ser and estar in past-tense constructions',
  },
  {
    persona: 'CONVERSATION_PARTNER',
    expectedIdentityPhrase: "learner's Conversation Partner",
    userMessage: 'Can we talk about what I did last weekend?',
    variables: { targetLanguageName: 'French', proficiencyLevel: 'A2' },
    priorMemoryFact: 'interested in discussing travel and food topics',
  },
  {
    persona: 'VOCABULARY_COACH',
    expectedIdentityPhrase: "learner's Vocabulary Coach",
    userMessage: 'Can you quiz me on kitchen-related vocabulary?',
    variables: { targetLanguageName: 'German', proficiencyLevel: 'A1' },
    priorMemoryFact: 'frequently mixes up "der/die/das" articles for food nouns',
  },
  {
    persona: 'WRITING_COACH',
    expectedIdentityPhrase: "learner's Writing Coach",
    userMessage: 'Can you review this paragraph I wrote about my hometown?',
    variables: { targetLanguageName: 'Japanese', proficiencyLevel: 'B2' },
    priorMemoryFact: 'goal is passing the JLPT N2 writing section',
  },
  {
    persona: 'EXAM_COACH',
    expectedIdentityPhrase: "learner's Exam Coach",
    userMessage: 'What should I expect in the IELTS speaking section?',
    variables: { targetLanguageName: 'English', proficiencyLevel: 'C1' },
    priorMemoryFact: 'exam date is in six weeks, targeting an overall band of 7',
  },
];
