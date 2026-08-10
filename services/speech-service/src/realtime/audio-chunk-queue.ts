/**
 * A pushable async iterable of raw audio chunks for exactly one
 * conversational turn (T3, design doc §6.3 step 1). `SttProvider.streamTranscribe()`
 * takes an `AsyncIterable<Buffer>` and only returns once that iterable
 * completes — this class is the bridge between the WebSocket's own
 * push-based binary-frame arrival (`push()`, called from the gateway's
 * `message` handler) and the STT adapter's own pull-based `for await`
 * consumption. `end()` (called once the client sends `speech.end-of-turn`)
 * signals completion; any chunk `push()`ed after `end()` is a client
 * protocol violation and is silently dropped rather than reordering an
 * already-completed turn's transcript.
 */
export class AudioChunkQueue implements AsyncIterable<Buffer> {
  private readonly buffered: Buffer[] = [];
  private ended = false;
  private pendingResolve: (() => void) | null = null;

  push(chunk: Buffer): void {
    if (this.ended) {
      return;
    }
    this.buffered.push(chunk);
    this.wake();
  }

  end(): void {
    this.ended = true;
    this.wake();
  }

  private wake(): void {
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    resolve?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Buffer> {
    for (;;) {
      const next = this.buffered.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.ended) {
        return;
      }
      await new Promise<void>((resolve) => {
        this.pendingResolve = resolve;
      });
    }
  }
}
