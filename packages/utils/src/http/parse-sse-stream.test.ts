import { describe, expect, it } from 'vitest';

import { parseSseStream } from './parse-sse-stream.js';

function sseStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of parseSseStream(body)) {
    events.push(event);
  }
  return events;
}

describe('parseSseStream', () => {
  it('yields one parsed JSON value per complete "data: ...\\n\\n" event', async () => {
    const events = await collect(
      sseStreamFromChunks([
        `data: ${JSON.stringify({ type: 'token', delta: 'hel' })}\n\n`,
        `data: ${JSON.stringify({ type: 'done', text: 'hello' })}\n\n`,
      ]),
    );

    expect(events).toEqual([
      { type: 'token', delta: 'hel' },
      { type: 'done', text: 'hello' },
    ]);
  });

  it('reassembles an event whose bytes arrive split across multiple stream chunks', async () => {
    const payload = JSON.stringify({ type: 'token', delta: 'hi' });
    const events = await collect(
      sseStreamFromChunks([`data: ${payload.slice(0, 5)}`, `${payload.slice(5)}\n\n`]),
    );

    expect(events).toEqual([{ type: 'token', delta: 'hi' }]);
  });

  it('yields nothing for an empty stream', async () => {
    expect(await collect(sseStreamFromChunks([]))).toEqual([]);
  });

  it('ignores a non-"data:" line within an event block', async () => {
    const events = await collect(
      sseStreamFromChunks([`: a comment line\ndata: ${JSON.stringify({ ok: true })}\n\n`]),
    );

    expect(events).toEqual([{ ok: true }]);
  });
});
