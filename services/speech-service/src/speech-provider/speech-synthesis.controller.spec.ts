import type { AudioStorageProvider } from '../audio-storage/audio-storage.interface.js';
import type { AudioChunk, TtsProvider } from './speech-provider.interface.js';
import { SpeechSynthesisController } from './speech-synthesis.controller.js';

async function* fakeAudioChunks(byteChunks: Buffer[]): AsyncGenerator<AudioChunk> {
  for (const data of byteChunks) {
    yield { data, done: false };
  }
  yield { data: Buffer.alloc(0), done: true };
}

function fakeAudioStorage(): jest.Mocked<AudioStorageProvider> {
  return { upload: jest.fn().mockResolvedValue({ url: 'https://storage.example.com/x.mp3' }) };
}

describe('SpeechSynthesisController', () => {
  it('buffers the provider own streamed chunks and uploads them, returning the real audioUrl', async () => {
    const streamSynthesize = jest
      .fn()
      .mockReturnValue(fakeAudioChunks([Buffer.from('abc'), Buffer.from('def')]));
    const ttsProvider: TtsProvider = { name: 'openai', streamSynthesize };
    const audioStorage = fakeAudioStorage();
    const controller = new SpeechSynthesisController(ttsProvider, audioStorage);

    const result = await controller.synthesize({ text: 'hola amigo' });

    expect(streamSynthesize).toHaveBeenCalledWith('hola amigo');
    expect(audioStorage.upload).toHaveBeenCalledWith({
      key: expect.stringMatching(/^content-authoring\/synthesized\/.+\.mp3$/) as unknown as string,
      body: Buffer.from('abcdef'),
      contentType: 'audio/mpeg',
    });
    expect(result).toEqual({ audioUrl: 'https://storage.example.com/x.mp3' });
  });

  it('never uploads the provider own final done chunk bytes', async () => {
    const streamSynthesize = jest.fn().mockReturnValue(fakeAudioChunks([Buffer.from('abc')]));
    const ttsProvider: TtsProvider = { name: 'openai', streamSynthesize };
    const audioStorage = fakeAudioStorage();
    const controller = new SpeechSynthesisController(ttsProvider, audioStorage);

    await controller.synthesize({ text: 'hola' });

    expect(audioStorage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ body: Buffer.from('abc') }),
    );
  });
});
