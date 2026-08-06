/**
 * ADR-031: the platform's one pinned embedding model, matching the
 * already-shipped `vector(1536)` columns on `AIMemoryEntry`/
 * `KnowledgeBaseEntry` (E4 T5) exactly. Not a per-call parameter — a
 * different model or dimension is a real, tracked re-embedding migration
 * (DATABASE.md §4), never a caller's choice to make ad hoc.
 */
export const AI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const AI_EMBEDDING_DIMENSIONS = 1536;
