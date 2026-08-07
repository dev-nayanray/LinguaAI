/**
 * Generic pgvector/prompt-budget helpers shared by every real similarity
 * search this service performs — `MemoryManagerService` (T6, against
 * `AIMemoryEntry`) and `RagRetrievalService` (T7, against
 * `KnowledgeBaseEntry`). Neither table's own ranking model belongs here:
 * Memory's confidence decay and RAG's citation formatting are each their
 * own module's concern, kept separate on purpose.
 */

/** pgvector's own text input format for a `vector` column — `[v1,v2,...]`, cast with `::vector` at the SQL call site. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * A lightweight, no-tokenizer-dependency approximation (~4 characters per
 * token, a commonly-cited English-text average) — bounding a prompt-context
 * budget only needs to be roughly right, not exact; a real tokenizer
 * dependency isn't justified for this.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
