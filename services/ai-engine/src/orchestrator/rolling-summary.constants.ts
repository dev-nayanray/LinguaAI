/**
 * Provisional, tunable thresholds — no production usage data exists yet to
 * derive them from (same honesty precedent as ADR-034's cost-breaker
 * thresholds: a real, working mechanism now, numbers revisited once real
 * traffic exists). Once a session's not-yet-summarized message tail grows
 * past `ROLLING_SUMMARY_TRIGGER_MESSAGE_COUNT`, the older portion of that
 * tail (all but the last `ROLLING_SUMMARY_RETAIN_RECENT_COUNT` messages)
 * is folded into a rolling summary rather than sent to the model verbatim.
 */
export const ROLLING_SUMMARY_TRIGGER_MESSAGE_COUNT = 20;
export const ROLLING_SUMMARY_RETAIN_RECENT_COUNT = 6;

export const SUMMARIZATION_SYSTEM_PROMPT =
  'Summarize the following conversation between a language-learning Orchestrator agent and a learner, in 3-5 sentences. Preserve any specific corrections, goals, or facts mentioned. Do not add commentary or instructions — output only the summary text.';
