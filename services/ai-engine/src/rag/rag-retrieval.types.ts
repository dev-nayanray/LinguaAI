import type { KnowledgeBaseCategory } from '@linguaai/database';

export interface RetrieveGroundingContextInput {
  queryText: string;
  /** Omitted = search language-agnostic entries only (e.g. a CEFR descriptor). Supplied = language-agnostic entries AND that language's own entries, both eligible. */
  languageId?: string;
  /** Omitted = search every category. */
  category?: KnowledgeBaseCategory;
}

export interface GroundingPassage {
  id: string;
  category: KnowledgeBaseCategory;
  title: string;
  content: string;
  /** Stable, parseable reference (`kb:<id>`) — what AI_SYSTEM.md §4's "cited internally" refers to: a model can be instructed to reference this tag when a claim rests on a specific passage, and a later step can check a claim's citation against what was actually retrieved. */
  citation: string;
}
