import type { CefrLevel } from '@linguaai/types/learning';

/**
 * AI_GOVERNANCE.md §3's "Golden-set regression" suite, extended to
 * Writing-skill AI scoring (E6 T8, per the epic doc's own T8 row — "interim
 * evaluation suite... mirroring E5 T12's own precedent and its same
 * honestly-stated no-live-model-call limitation"). `AssessmentScoringService`
 * (T4) sits outside `OrchestratorService` entirely (ADR-039), so it isn't
 * covered by `golden-set.fixtures.ts`'s own 5-persona set — this is its own
 * fixture corpus, not an extension of that one.
 *
 * INTERIM SCOPE, honestly stated (see writing-scoring.eval.spec.ts's own
 * header for the full rationale): each fixture's `expectedBand` is a
 * *documentary* label only — what a human rater would plausibly assign this
 * essay — never something this suite verifies a model actually produces.
 * With no live LLM credentials in this environment (RISK_REGISTER R-88,
 * the same constraint E6 T4's own evidence bar already carries), the
 * suite's mock `RouterService` is configured to *return* each fixture's own
 * `expectedBand` as its canned critique; passing therefore proves the real
 * pipeline (grounding retrieval, untrusted-content delimiting, prompt
 * assembly, response parsing/sanitization) threads a critique through
 * *correctly and without cross-fixture contamination* across a realistic
 * breadth of CEFR bands/languages/essay lengths — not that the score
 * itself is accurate.
 */
export interface WritingScoringCase {
  id: string;
  title: string;
  languageId: string;
  targetLanguageName: string;
  prompt: string;
  /** A representative learner essay — plausible length/error-rate/register for its own `expectedBand`, not synthetic placeholder text. */
  learnerResponse: string;
  /** Documentary only — see this file's own header. Never asserted as "the model would produce this." */
  expectedBand: CefrLevel;
  expectedConfidence: number;
  /** A distinctive phrase the mocked critique's own feedback carries — proves the real value threads all the way through `parseAndValidate`/`sanitizeOutput`, not a different fixture's. */
  expectedFeedbackPhrase: string;
  /** The curated `CEFR_DESCRIPTOR` passage `RagRetrievalService` would plausibly return for this fixture's own language — exercises real per-fixture grounding-context folding (`formatGroundingContextForPrompt`), the same discipline `factual-accuracy.fixtures.ts` established. */
  groundingPassage: { id: string; title: string; content: string };
}

export const WRITING_SCORING_CASES: readonly WritingScoringCase[] = [
  {
    id: 'a1-spanish-daily-routine',
    title: 'A1 Spanish — daily routine, short simple sentences',
    languageId: 'lang-es',
    targetLanguageName: 'Spanish',
    prompt: 'Describe tu rutina diaria.',
    learnerResponse: 'Yo levanto a las siete. Yo como pan. Yo va a trabajo.',
    expectedBand: 'A1',
    expectedConfidence: 0.55,
    expectedFeedbackPhrase:
      'Basic vocabulary for daily activities, but verb conjugation needs work.',
    groundingPassage: {
      id: 'kb-cefr-es-a1',
      title: 'CEFR A1 Writing Descriptor (Spanish)',
      content: 'Can write short, simple isolated phrases and sentences with frequent basic errors.',
    },
  },
  {
    id: 'b1-french-weekend-trip',
    title: 'B1 French — weekend trip, connected sentences',
    languageId: 'lang-fr',
    targetLanguageName: 'French',
    prompt: 'Racontez un voyage que vous avez fait récemment.',
    learnerResponse:
      "Le week-end dernier, je suis allé à la montagne avec des amis. Nous avons marché pendant trois heures et le paysage était magnifique. J'ai pris beaucoup de photos.",
    expectedBand: 'B1',
    expectedConfidence: 0.72,
    expectedFeedbackPhrase: 'Connected narrative with correct past-tense forms throughout.',
    groundingPassage: {
      id: 'kb-cefr-fr-b1',
      title: 'CEFR B1 Writing Descriptor (French)',
      content: 'Can write straightforward connected text on familiar topics of personal interest.',
    },
  },
  {
    id: 'c1-japanese-career-goals',
    title: 'C1 Japanese — career goals, nuanced and fluent',
    languageId: 'lang-ja',
    targetLanguageName: 'Japanese',
    prompt: '将来のキャリア目標について書いてください。',
    learnerResponse:
      '私は将来、国際的な環境で働きたいと考えている。そのためには語学力だけでなく、異文化理解や柔軟な思考力も欠かせないと感じている。現在はその準備として、専門知識と実務経験の両方を積むことに力を入れている。',
    expectedBand: 'C1',
    expectedConfidence: 0.68,
    expectedFeedbackPhrase: 'Sophisticated register with nuanced expression of abstract ideas.',
    groundingPassage: {
      id: 'kb-cefr-ja-c1',
      title: 'CEFR C1 Writing Descriptor (Japanese)',
      content:
        'Can write clear, well-structured text on complex subjects with controlled register.',
    },
  },
  {
    id: 'a2-german-favorite-food',
    title: 'A2 German — favorite food, basic but clear',
    languageId: 'lang-de',
    targetLanguageName: 'German',
    prompt: 'Schreiben Sie über Ihr Lieblingsessen.',
    learnerResponse:
      'Mein Lieblingsessen ist Pizza. Ich esse Pizza jeden Freitag mit meiner Familie. Sie schmeckt sehr gut und ist nicht teuer.',
    expectedBand: 'A2',
    expectedConfidence: 0.6,
    expectedFeedbackPhrase: 'Clear and simple, with mostly correct basic sentence structure.',
    groundingPassage: {
      id: 'kb-cefr-de-a2',
      title: 'CEFR A2 Writing Descriptor (German)',
      content: 'Can write a series of simple phrases and sentences linked with simple connectors.',
    },
  },
  {
    id: 'c2-spanish-social-media-essay',
    title: 'C2 Spanish — social media essay, near-native',
    languageId: 'lang-es',
    targetLanguageName: 'Spanish',
    prompt: 'Analiza el impacto de las redes sociales en la sociedad contemporánea.',
    learnerResponse:
      'Las redes sociales han redefinido no solo la manera en que nos comunicamos, sino también los propios mecanismos de construcción de la opinión pública, generando tanto oportunidades inéditas de participación ciudadana como riesgos considerables de polarización y desinformación.',
    expectedBand: 'C2',
    expectedConfidence: 0.81,
    expectedFeedbackPhrase:
      'Near-native command of complex syntax and precise, idiomatic vocabulary.',
    groundingPassage: {
      id: 'kb-cefr-es-c2',
      title: 'CEFR C2 Writing Descriptor (Spanish)',
      content:
        'Can write clear, smoothly flowing, complex text in an appropriate and effective style.',
    },
  },
];
