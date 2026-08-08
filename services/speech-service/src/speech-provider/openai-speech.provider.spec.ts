import type OpenAI from 'openai';

import { OpenAiSpeechProvider } from './openai-speech.provider.js';

function fakeClient(
  overrides: {
    transcriptionsCreate?: jest.Mock;
    speechCreate?: jest.Mock;
  } = {},
): OpenAI {
  return {
    audio: {
      transcriptions: { create: overrides.transcriptionsCreate ?? jest.fn() },
      speech: { create: overrides.speechCreate ?? jest.fn() },
    },
  } as unknown as OpenAI;
}

async function* fakeAudioChunks(chunks: Buffer[]): AsyncIterable<Buffer> {
  for (const chunk of chunks) yield chunk;
}

function fakeAudioStream(byteChunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < byteChunks.length) {
        controller.enqueue(byteChunks[i]!);
        i++;
      } else {
        controller.close();
      }
    },
  });
}

describe('OpenAiSpeechProvider', () => {
  it('constructs a real OpenAI SDK client when none is injected', () => {
    expect(() => new OpenAiSpeechProvider('fake-key')).not.toThrow();
  });

  describe('streamTranscribe', () => {
    it('buffers all input audio chunks and yields a single final transcript', async () => {
      const transcriptionsCreate = jest.fn().mockResolvedValue({ text: 'hola, ¿cómo estás?' });
      const provider = new OpenAiSpeechProvider('fake-key', fakeClient({ transcriptionsCreate }));

      const chunks = [];
      for await (const chunk of provider.streamTranscribe(
        fakeAudioChunks([Buffer.from('abc'), Buffer.from('def')]),
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([{ text: 'hola, ¿cómo estás?', isFinal: true }]);
      expect(transcriptionsCreate).toHaveBeenCalledTimes(1);
      expect(transcriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'whisper-1' }),
      );
    });

    it('yields an empty final transcript without calling the API when the input stream is empty', async () => {
      const transcriptionsCreate = jest.fn();
      const provider = new OpenAiSpeechProvider('fake-key', fakeClient({ transcriptionsCreate }));

      const chunks = [];
      for await (const chunk of provider.streamTranscribe(fakeAudioChunks([]))) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([{ text: '', isFinal: true }]);
      expect(transcriptionsCreate).not.toHaveBeenCalled();
    });
  });

  describe('streamSynthesize', () => {
    it('streams real audio byte chunks followed by a final done chunk', async () => {
      const speechCreate = jest.fn().mockResolvedValue({
        body: fakeAudioStream([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]),
      });
      const provider = new OpenAiSpeechProvider('fake-key', fakeClient({ speechCreate }));

      const chunks = [];
      for await (const chunk of provider.streamSynthesize('hola')) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { data: Buffer.from([1, 2, 3]), done: false },
        { data: Buffer.from([4, 5]), done: false },
        { data: Buffer.alloc(0), done: true },
      ]);
      expect(speechCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'tts-1', voice: 'alloy', input: 'hola' }),
      );
    });

    it('throws when the response has no body', async () => {
      const speechCreate = jest.fn().mockResolvedValue({ body: null });
      const provider = new OpenAiSpeechProvider('fake-key', fakeClient({ speechCreate }));

      const drain = async () => {
        const iterator = provider.streamSynthesize('hola')[Symbol.asyncIterator]();
        let result = await iterator.next();
        while (!result.done) {
          result = await iterator.next();
        }
      };

      await expect(drain()).rejects.toThrow('speech synthesis response had no body');
    });
  });
});
