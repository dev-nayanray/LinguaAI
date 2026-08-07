import { Injectable, Logger } from '@nestjs/common';

import { resolveAgeBracket } from './age-bracket.util.js';
import { shouldSampleForReview } from './human-review-sampling.js';
import { delimitUntrustedContent } from './input-delimiter.js';
import { sanitizeOutput } from './output-sanitizer.js';
import type { AgeBracket } from './safety-layer.types.js';

export interface SampleForReviewInput {
  sessionId: string;
  messageId: string;
}

/**
 * AI_SYSTEM.md §2's "Safety Layer" — a mandatory pass for AI input/output
 * (AI_SYSTEM.md §10), not an optional per-agent integration. Wraps the
 * module's pure functions with the one piece that genuinely needs a
 * service (structured logging for the human-review sample).
 *
 * Bounded tool surface (AI_GOVERNANCE.md §6's fifth Safety Layer
 * requirement) is *not* rebuilt here — `ToolRegistryService` (T5) already
 * is that mechanism (every tool an Orchestrator persona may invoke is
 * explicitly declared, per persona, in a versioned registry; a persona
 * with no entry throws rather than silently permitting an undeclared
 * call). T8 depends on T5 for exactly this reason.
 */
@Injectable()
export class SafetyLayerService {
  private readonly logger = new Logger(SafetyLayerService.name);

  delimitUntrustedContent(label: string, text: string): string {
    return delimitUntrustedContent(label, text);
  }

  sanitizeOutput(text: string): string {
    return sanitizeOutput(text);
  }

  resolveAgeBracket(raw: AgeBracket | null | undefined): 'ADULT' | 'MINOR' {
    return resolveAgeBracket(raw);
  }

  /**
   * Logs a structured event only — deliberately does not duplicate
   * message content into logs (data-minimization; `AIMessage` rows are
   * already the durable, encrypted-at-rest source of truth, T4/E4 T5). A
   * future human-review tool looks up `sessionId`/`messageId` there
   * directly rather than reading content out of less-protected log
   * storage. No dedicated review-queue table exists yet — a real,
   * flagged gap (RISK_REGISTER.md), not one this task invents a
   * migration for.
   */
  recordSampleForReviewIfDue(input: SampleForReviewInput): void {
    if (shouldSampleForReview()) {
      this.logger.log({
        message: 'AI output sampled for human quality/safety review',
        sessionId: input.sessionId,
        messageId: input.messageId,
      });
    }
  }
}
