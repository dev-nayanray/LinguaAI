import type { MemoryCategory } from '@linguaai/database';

export interface WriteMemoryInput {
  userId: string;
  languageId: string;
  category: MemoryCategory;
  fact: string;
}

export interface WriteMemoryResult {
  id: string;
}

export interface SupersedeMemoryInput {
  oldEntryId: string;
  newEntry: WriteMemoryInput;
}

export interface RetrieveRelevantMemoriesInput {
  userId: string;
  languageId: string;
  queryText: string;
}

export interface RetrievedMemory {
  id: string;
  category: MemoryCategory;
  fact: string;
  /** Decayed at retrieval time (memory-retrieval.util.ts's decayedConfidence) — not the raw stored AIMemoryEntry.confidence value. */
  confidence: number;
}
