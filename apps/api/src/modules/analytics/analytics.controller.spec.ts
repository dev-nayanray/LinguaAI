import type { AiCostResponse, CefrProgressionResponse } from '@linguaai/validation/analytics';

import { AnalyticsController } from './analytics.controller.js';
import type { AnalyticsService } from './analytics.service.js';

describe('AnalyticsController', () => {
  it('getCefrProgression delegates to AnalyticsService with the query params', async () => {
    const response: CefrProgressionResponse = {
      languageId: '11111111-1111-4111-8111-111111111111',
      from: null,
      to: null,
      bySkill: [],
    };
    const service = { getCefrProgression: jest.fn().mockResolvedValue(response) };
    const controller = new AnalyticsController(service as unknown as AnalyticsService);
    const query = { languageId: '11111111-1111-4111-8111-111111111111' };

    const result = await controller.getCefrProgression(query);

    expect(service.getCefrProgression).toHaveBeenCalledWith(query);
    expect(result).toBe(response);
  });

  it('getAiCost delegates to AnalyticsService with the query params', async () => {
    const response: AiCostResponse = {
      from: null,
      to: null,
      totalCostUsdMicros: 0,
      totalRequests: 0,
      byAgentPersona: [],
      byModelId: [],
    };
    const service = { getAiCost: jest.fn().mockResolvedValue(response) };
    const controller = new AnalyticsController(service as unknown as AnalyticsService);
    const query = {};

    const result = await controller.getAiCost(query);

    expect(service.getAiCost).toHaveBeenCalledWith(query);
    expect(result).toBe(response);
  });
});
