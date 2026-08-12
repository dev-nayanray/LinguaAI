/**
 * Buffers streamed text deltas (`ai.token` events, E10 T4) and yields
 * complete sentences as soon as a real boundary is found — the real
 * strategy behind design doc §6.3 step 4's "feeds completed sentences to
 * the TTS adapter": `TtsProvider.streamSynthesize()` (T1) takes a whole
 * string per call, not a token-level stream, so *something* has to decide
 * where one synthesis call ends and the next begins.
 *
 * A sentence boundary is a run of `.`/`!`/`?` immediately followed by
 * whitespace — deliberately *not* bare terminal punctuation with nothing
 * after it yet, so a still-arriving decimal ("3.14") or ellipsis ("...")
 * is never split mid-token. A known, honest heuristic limitation: a real
 * abbreviation ("Mr. Smith") also matches this same boundary and will be
 * synthesized as two short utterances rather than one — an acceptable
 * MVP trade-off (mildly early TTS commit, not incorrect output), not a
 * claim of perfect sentence segmentation.
 */
export class SentenceChunker {
  private buffer = '';

  /** Feeds a new text delta; returns zero or more complete sentences newly found (in order). */
  push(delta: string): string[] {
    this.buffer += delta;
    const sentences: string[] = [];
    const boundary = /[.!?]+\s+/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = boundary.exec(this.buffer)) !== null) {
      const end = match.index + match[0].length;
      sentences.push(this.buffer.slice(lastIndex, end).trim());
      lastIndex = end;
    }
    this.buffer = this.buffer.slice(lastIndex);
    return sentences;
  }

  /** Called once the overall stream is done — returns any trailing text (with or without terminal punctuation), or `null` if nothing remains. */
  flush(): string | null {
    const remainder = this.buffer.trim();
    this.buffer = '';
    return remainder.length > 0 ? remainder : null;
  }
}
