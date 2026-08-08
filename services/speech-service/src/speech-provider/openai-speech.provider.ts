import OpenAI, { toFile } from 'openai';

import type {
  AudioChunk,
  SttProvider,
  TranscriptChunk,
  TtsProvider,
} from './speech-provider.interface.js';

const STT_MODEL = 'whisper-1';
const TTS_MODEL = 'tts-1';
const TTS_VOICE = 'alloy';

/**
 * ADR-043's own pinned provider — reuses this platform's already-integrated
 * `OPENAI_API_KEY` credential/subprocessor relationship (E5's own
 * `OpenAiProvider`, `services/ai-engine/src/gateway/providers/`), rather
 * than onboarding a new STT/TTS-specific vendor for zero real benefit at
 * this epic's own scope.
 *
 * **A real, honestly-flagged gap (E10 design doc §3.7/§6.1), not silently
 * claimed solved:** `streamTranscribe` below buffers the *entire* input
 * audio stream before calling OpenAI's own batch transcription endpoint —
 * it is not true low-latency incremental partial transcription. OpenAI's
 * REST Whisper endpoint has no streaming-partial-results mode; genuine
 * incremental STT would need either OpenAI's own Realtime API (a
 * materially different, persistent-WebSocket integration) or a swap to a
 * dedicated streaming-STT vendor (e.g. Deepgram) — real, separately-scoped
 * future work, tracked alongside RISK_REGISTER R-04's own already-flagged
 * "provider spike" precondition. The `SttProvider` interface itself is
 * shaped to support true partials from a future provider without any
 * caller-side change, so this is a real, working T1 implementation behind
 * a durable interface, not a design compromise baked into the contract.
 *
 * `streamSynthesize`, by contrast, *is* genuinely streamed — OpenAI's own
 * speech endpoint returns a real byte stream as audio is generated, read
 * here chunk-by-chunk exactly as `AiEngineClientService`'s own SSE-parsing
 * precedent already reads a `Response.body` stream elsewhere in this
 * platform.
 */
export class OpenAiSpeechProvider implements SttProvider, TtsProvider {
  readonly name = 'openai' as const;

  private readonly client: OpenAI;

  constructor(apiKey: string, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey });
  }

  async *streamTranscribe(audioChunks: AsyncIterable<Buffer>): AsyncIterable<TranscriptChunk> {
    const buffered: Buffer[] = [];
    for await (const chunk of audioChunks) {
      buffered.push(chunk);
    }
    const audio = Buffer.concat(buffered);
    if (audio.length === 0) {
      yield { text: '', isFinal: true };
      return;
    }

    const file = await toFile(audio, 'audio.webm');
    const transcription = await this.client.audio.transcriptions.create({
      file,
      model: STT_MODEL,
    });

    yield { text: transcription.text, isFinal: true };
  }

  async *streamSynthesize(text: string): AsyncIterable<AudioChunk> {
    const response = await this.client.audio.speech.create({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text,
    });

    const body = response.body;
    if (!body) {
      throw new Error('OpenAiSpeechProvider: speech synthesis response had no body');
    }

    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        yield { data: Buffer.from(value), done: false };
      }
    } finally {
      reader.releaseLock();
    }
    yield { data: Buffer.alloc(0), done: true };
  }
}
