import { Injectable } from '@nestjs/common';

export interface RollingSummaryCacheEntry {
  summary: string;
  /** The `createdAt` of the last AIMessage folded into `summary` — messages after this point are sent to the model verbatim, in addition to the summary. */
  summarizedThroughCreatedAt: Date;
}

/**
 * In-process only (AI_SYSTEM.md §5: "short-term (session) memory: full
 * conversation turns held in-process/Redis") — deliberately not the
 * durable `AIAgentSession` column E5 §3.5 names as a real gap (closed by
 * T6's own migration, not this task). A cache miss here (process restart,
 * or the request landing on a different Fargate replica) is always safe:
 * `OrchestratorService` falls back to summarizing from full history again,
 * never to an error — this cache is a pure optimization, not a
 * correctness dependency, unlike `SendMessageInput.variables`.
 */
@Injectable()
export class RollingSummaryCache {
  private readonly entries = new Map<string, RollingSummaryCacheEntry>();

  get(sessionId: string): RollingSummaryCacheEntry | undefined {
    return this.entries.get(sessionId);
  }

  set(sessionId: string, entry: RollingSummaryCacheEntry): void {
    this.entries.set(sessionId, entry);
  }

  clear(sessionId: string): void {
    this.entries.delete(sessionId);
  }
}
