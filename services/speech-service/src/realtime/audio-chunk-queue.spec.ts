import { AudioChunkQueue } from './audio-chunk-queue.js';

async function collect(queue: AudioChunkQueue): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of queue) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('AudioChunkQueue', () => {
  it('yields every pushed chunk in order, then completes once ended', async () => {
    const queue = new AudioChunkQueue();
    queue.push(Buffer.from('a'));
    queue.push(Buffer.from('b'));
    queue.end();

    const chunks = await collect(queue);

    expect(chunks).toEqual([Buffer.from('a'), Buffer.from('b')]);
  });

  it('yields nothing when ended with no chunks ever pushed', async () => {
    const queue = new AudioChunkQueue();
    queue.end();

    const chunks = await collect(queue);

    expect(chunks).toEqual([]);
  });

  it('drops any chunk pushed after end()', async () => {
    const queue = new AudioChunkQueue();
    queue.push(Buffer.from('a'));
    queue.end();
    queue.push(Buffer.from('too-late'));

    const chunks = await collect(queue);

    expect(chunks).toEqual([Buffer.from('a')]);
  });

  it('resolves a pending iteration once a chunk arrives after the consumer is already waiting', async () => {
    const queue = new AudioChunkQueue();
    const collected = collect(queue);

    // Yield to let the async iterator start awaiting the empty queue before
    // anything is pushed, exercising the pendingResolve wake path.
    await new Promise((resolve) => setImmediate(resolve));
    queue.push(Buffer.from('late'));
    queue.end();

    expect(await collected).toEqual([Buffer.from('late')]);
  });
});
