import { AI_EMBEDDING_DIMENSIONS, AI_EMBEDDING_MODEL } from './embedding.constants.js';
import type { AiGatewayModuleConfig } from './gateway.config.js';
import type {
  EmbedResponse,
  EmbeddingProvider,
  GenerateResponse,
  ModelProvider,
  StreamChunk,
} from './model-provider.interface.js';
import { RouterService } from './router.service.js';

const config: AiGatewayModuleConfig = {
  defaultProvider: 'anthropic',
  anthropicApiKey: 'test-anthropic-key',
  openAiApiKey: 'test-openai-key',
  teacherModel: 'claude-teacher-model',
  assessmentModel: 'claude-assessment-model',
};

function fakeGenerateResponse(modelId: string): GenerateResponse {
  return { content: 'hello', inputTokens: 10, outputTokens: 5, modelId, latencyMs: 42 };
}

async function* fakeStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk;
}

describe('RouterService', () => {
  let anthropic: jest.Mocked<ModelProvider>;
  let openai: jest.Mocked<ModelProvider & EmbeddingProvider>;
  let router: RouterService;

  beforeEach(() => {
    anthropic = { name: 'anthropic', generate: jest.fn(), stream: jest.fn() };
    openai = { name: 'openai', generate: jest.fn(), stream: jest.fn(), embed: jest.fn() };
    router = new RouterService(config, anthropic, openai);
  });

  describe('generate', () => {
    it('resolves the model per request class from config, not hardcoded', async () => {
      anthropic.generate.mockResolvedValue(fakeGenerateResponse('claude-teacher-model'));

      await router.generate('teacher', { messages: [{ role: 'user', content: 'hi' }] });

      expect(anthropic.generate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-teacher-model' }),
      );
    });

    it('uses the assessment model for the assessment request class', async () => {
      anthropic.generate.mockResolvedValue(fakeGenerateResponse('claude-assessment-model'));

      await router.generate('assessment', { messages: [{ role: 'user', content: 'hi' }] });

      expect(anthropic.generate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-assessment-model' }),
      );
    });

    it('calls the configured default provider first', async () => {
      anthropic.generate.mockResolvedValue(fakeGenerateResponse('claude-teacher-model'));

      await router.generate('teacher', { messages: [] });

      expect(anthropic.generate).toHaveBeenCalledTimes(1);
      expect(openai.generate).not.toHaveBeenCalled();
    });

    it('fails over to the secondary provider when the primary rejects', async () => {
      anthropic.generate.mockRejectedValue(new Error('primary is down'));
      openai.generate.mockResolvedValue(fakeGenerateResponse('gpt-teacher-model'));

      const result = await router.generate('teacher', { messages: [] });

      expect(anthropic.generate).toHaveBeenCalledTimes(1);
      expect(openai.generate).toHaveBeenCalledTimes(1);
      expect(result.modelId).toBe('gpt-teacher-model');
    });

    it('propagates the error when both providers fail', async () => {
      anthropic.generate.mockRejectedValue(new Error('primary is down'));
      openai.generate.mockRejectedValue(new Error('secondary is also down'));

      await expect(router.generate('teacher', { messages: [] })).rejects.toThrow(
        'secondary is also down',
      );
    });
  });

  describe('stream', () => {
    it('yields every chunk from the primary provider when it succeeds', async () => {
      anthropic.stream.mockReturnValue(
        fakeStream([
          { delta: 'hel', done: false },
          { delta: 'lo', done: false },
          {
            delta: '',
            done: true,
            usage: { inputTokens: 1, outputTokens: 1, modelId: 'claude', latencyMs: 1 },
          },
        ]),
      );

      const chunks: StreamChunk[] = [];
      for await (const chunk of router.stream('teacher', { messages: [] })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(openai.stream).not.toHaveBeenCalled();
    });

    it('fails over to the secondary provider if the primary fails before yielding any chunk', async () => {
      // eslint-disable-next-line require-yield -- deliberately throws before any yield, to test the "fails before yielding any chunk" path itself.
      anthropic.stream.mockImplementation(async function* () {
        throw new Error('connection refused');
      });
      openai.stream.mockReturnValue(fakeStream([{ delta: 'from secondary', done: false }]));

      const chunks: StreamChunk[] = [];
      for await (const chunk of router.stream('teacher', { messages: [] })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([{ delta: 'from secondary', done: false }]);
    });

    it('does NOT fail over once the primary has already yielded a real chunk — propagates the error instead, since content already reached the caller and a retry would duplicate it', async () => {
      anthropic.stream.mockImplementation(async function* () {
        yield { delta: 'partial', done: false };
        throw new Error('connection dropped mid-stream');
      });

      const consume = async () => {
        const chunks: StreamChunk[] = [];
        for await (const chunk of router.stream('teacher', { messages: [] })) {
          chunks.push(chunk);
        }
        return chunks;
      };

      await expect(consume()).rejects.toThrow('connection dropped mid-stream');
      expect(openai.stream).not.toHaveBeenCalled();
    });
  });

  describe('misconfiguration', () => {
    it('throws a clear error if AI_GATEWAY_DEFAULT_PROVIDER does not match any registered provider name', async () => {
      const brokenConfig: AiGatewayModuleConfig = {
        ...config,
        defaultProvider: 'nonexistent' as 'anthropic',
      };
      const brokenRouter = new RouterService(brokenConfig, anthropic, openai);

      await expect(brokenRouter.generate('teacher', { messages: [] })).rejects.toThrow(
        'No provider registered for AI_GATEWAY_DEFAULT_PROVIDER="nonexistent"',
      );
    });

    it('throws a clear error on failover if no secondary provider is registered (both injected providers share the same name)', async () => {
      // Object spread copies the `generate` mock function *reference*, not a
      // clone — mocking it here also configures the object passed below,
      // since both point at the same jest.fn().
      const duplicateNameOpenAi = { ...openai, name: 'anthropic' as const };
      duplicateNameOpenAi.generate.mockRejectedValue(new Error('primary is down'));
      const duplicateNameRouter = new RouterService(config, anthropic, duplicateNameOpenAi);

      await expect(duplicateNameRouter.generate('teacher', { messages: [] })).rejects.toThrow(
        'No secondary provider registered',
      );
    });
  });

  describe('embed', () => {
    it('always delegates to the OpenAI provider, pinning the model per ADR-031 — the caller never supplies one', async () => {
      const response: EmbedResponse = {
        embedding: new Array(AI_EMBEDDING_DIMENSIONS).fill(0.1),
        modelId: AI_EMBEDDING_MODEL,
      };
      openai.embed.mockResolvedValue(response);

      const result = await router.embed({ input: 'hola' });

      expect(openai.embed).toHaveBeenCalledWith({ model: AI_EMBEDDING_MODEL, input: 'hola' });
      expect(result).toBe(response);
    });

    it('throws a clear error rather than returning a vector of the wrong dimension', async () => {
      const response: EmbedResponse = { embedding: [0.1, 0.2, 0.3], modelId: AI_EMBEDDING_MODEL };
      openai.embed.mockResolvedValue(response);

      await expect(router.embed({ input: 'hola' })).rejects.toThrow(
        `Embedding provider returned a 3-dimension vector, expected ${AI_EMBEDDING_DIMENSIONS} per ADR-031`,
      );
    });
  });
});
