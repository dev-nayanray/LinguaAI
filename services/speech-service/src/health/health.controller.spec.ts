import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns { status: "ok" }', () => {
    const controller = new HealthController();
    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
