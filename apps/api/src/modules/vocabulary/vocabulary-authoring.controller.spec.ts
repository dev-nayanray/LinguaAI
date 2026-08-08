import type {
  DraftVocabularyItemRequest,
  VocabularyItemDraft,
} from '@linguaai/validation/vocabulary';

import { VocabularyAuthoringController } from './vocabulary-authoring.controller.js';
import type { AiEngineClientService } from '../ai-engine/ai-engine-client.service.js';

describe('VocabularyAuthoringController', () => {
  it('draftVocabularyItem delegates to AiEngineClientService.draftVocabularyItem and returns its result unmodified', async () => {
    const draft: VocabularyItemDraft = {
      term: 'hola',
      partOfSpeech: 'INTERJECTION',
      translations: { en: 'hello' },
    };
    const aiEngineClient = { draftVocabularyItem: jest.fn().mockResolvedValue(draft) };
    const controller = new VocabularyAuthoringController(
      aiEngineClient as unknown as AiEngineClientService,
    );
    const dto: DraftVocabularyItemRequest = {
      languageId: 'lang-1',
      targetLanguageName: 'Spanish',
      cefrLevel: 'A2',
      term: 'hola',
    };

    const result = await controller.draftVocabularyItem(dto);

    expect(aiEngineClient.draftVocabularyItem).toHaveBeenCalledWith(dto);
    expect(result).toBe(draft);
  });
});
