import type { Request } from 'express';
import type {
  DueDeckListResponse,
  UserVocabularyEntryResponse,
} from '@linguaai/validation/vocabulary';

import type { RequestUser } from '../auth/strategies/jwt.strategy.js';
import { SrsDeckController } from './srs-deck.controller.js';
import type { SrsDeckService } from './srs-deck.service.js';

const CALLER: RequestUser = {
  userId: 'user-1',
  role: 'USER',
  organizationId: null,
  orgRole: null,
};

const ENTRY: UserVocabularyEntryResponse = {
  id: 'entry-1',
  userId: 'user-1',
  vocabularyItemId: 'item-1',
  easeFactor: 2.5,
  intervalDays: 1,
  repetitions: 1,
  nextReviewAt: '2026-01-02T00:00:00.000Z',
  lastReviewedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const LIST_RESPONSE: DueDeckListResponse = { data: [ENTRY], meta: { nextCursor: null } };

function fakeReq(): Request & { user: RequestUser } {
  return { user: CALLER } as unknown as Request & { user: RequestUser };
}

function fakeService(): jest.Mocked<SrsDeckService> {
  return {
    addToDeck: jest.fn().mockResolvedValue(ENTRY),
    listDue: jest.fn().mockResolvedValue(LIST_RESPONSE),
    submitReview: jest.fn().mockResolvedValue(ENTRY),
  } as unknown as jest.Mocked<SrsDeckService>;
}

describe('SrsDeckController', () => {
  it('addToDeck delegates to SrsDeckService.addToDeck with the caller', async () => {
    const service = fakeService();
    const controller = new SrsDeckController(service);

    const dto = { vocabularyItemId: 'item-1' };
    const result = await controller.addToDeck(fakeReq(), dto);

    expect(service.addToDeck).toHaveBeenCalledWith(CALLER, dto);
    expect(result).toBe(ENTRY);
  });

  it('listDue delegates to SrsDeckService.listDue with the caller', async () => {
    const service = fakeService();
    const controller = new SrsDeckController(service);

    const query = { limit: 20 };
    const result = await controller.listDue(fakeReq(), query);

    expect(service.listDue).toHaveBeenCalledWith(CALLER, query);
    expect(result).toBe(LIST_RESPONSE);
  });

  it('submitReview delegates to SrsDeckService.submitReview with the caller, entry id, and quality', async () => {
    const service = fakeService();
    const controller = new SrsDeckController(service);

    const result = await controller.submitReview(fakeReq(), 'entry-1', { quality: 4 });

    expect(service.submitReview).toHaveBeenCalledWith(CALLER, 'entry-1', 4);
    expect(result).toBe(ENTRY);
  });
});
