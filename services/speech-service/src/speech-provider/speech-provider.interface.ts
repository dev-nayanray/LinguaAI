/**
 * The single interface every STT/TTS provider is integrated behind
 * (AI_SYSTEM.md §1/§2, ADR-006: "No application code calls an LLM/STT/TTS
 * SDK directly") — mirrors `services/ai-engine`'s own `ModelProvider`
 * interface pattern exactly, extended here from LLM providers to speech
 * providers (E10 design doc §6.1). Kept as two separate interfaces
 * (`SttProvider`/`TtsProvider`), the same "not every provider need support
 * both" segregation `ModelProvider`/`EmbeddingProvider` already
 * established — even though ADR-043 pins exactly one provider for both
 * roles today, a future STT-only or TTS-only provider swap (e.g. a
 * dedicated low-latency streaming-STT vendor while keeping the same TTS
 * provider) never has to implement a method it structurally can't serve.
 */

export interface TranscriptChunk {
  /** The transcript text known so far — the *full* text accumulated up to this chunk, not an incremental delta (unlike `StreamChunk.delta` in `ai-engine`'s own `ModelProvider`), since a provider's own partial-result revisions (e.g. correcting an earlier word once more context arrives) are naturally expressed as a replacement, not an append. */
  text: string;
  /** True only on the final transcript for a given utterance/session turn. */
  isFinal: boolean;
}

export interface AudioChunk {
  /** Raw encoded audio bytes for this chunk (format is provider-specific — ADR-043's own chosen provider's default format, documented on that provider's own implementation). */
  data: Buffer;
  /** True only on the final chunk of a synthesized utterance. */
  done: boolean;
}

/**
 * `streamTranscribe` takes an async iterable of raw audio chunks (as they
 * arrive from the client's own WebSocket, T3's own scope) and yields
 * transcript chunks as they become available. A provider that can only
 * transcribe a complete utterance at once (§3's own honestly-flagged gap
 * for ADR-043's pinned provider) still satisfies this interface by
 * buffering internally and yielding a single final chunk — the interface
 * itself doesn't change when a future provider swap adds true low-latency
 * incremental partials.
 */
export interface SttProvider {
  readonly name: 'openai';
  streamTranscribe(audioChunks: AsyncIterable<Buffer>): AsyncIterable<TranscriptChunk>;
}

export interface TtsProvider {
  readonly name: 'openai';
  streamSynthesize(text: string): AsyncIterable<AudioChunk>;
}
