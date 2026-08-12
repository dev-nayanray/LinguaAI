/**
 * Tolerates a ```json markdown-fenced model response (a well-known, common
 * real-model quirk — wrapping JSON in markdown despite an explicit "no
 * markdown" instruction), then attempts a real `JSON.parse`, throwing a
 * clear error rather than ever guessing at malformed output. Shared
 * between every structured-JSON-output-consuming service in this package
 * (`ContentDraftingService`, `FluencyScoringService`, E10 T5) — extracted
 * here once a third call site needed the identical logic, rather than
 * duplicated a third time.
 */
export function parseJsonTolerantOfMarkdownFence(rawContent: string, callerName: string): unknown {
  const unfenced = rawContent
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(unfenced);
  } catch {
    throw new Error(`${callerName}: model response was not valid JSON — refusing to guess`);
  }
}
