/**
 * Parses a `text/event-stream` response body (one JSON value per
 * `data: ...\n\n` line — API_GUIDELINES.md §13) into the raw, not-yet-
 * validated payloads it carries. Shared between `apps/api`'s and
 * `services/speech-service`'s own typed `ai-engine` HTTP clients (E5 T10,
 * extended to a second consumer at E10 T4) — moved here rather than
 * duplicated a second time, per this monorepo's own "code used by more
 * than one app/service belongs in packages/" rule.
 */
export async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '));
        if (dataLine) {
          yield JSON.parse(dataLine.slice('data: '.length)) as unknown;
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}
