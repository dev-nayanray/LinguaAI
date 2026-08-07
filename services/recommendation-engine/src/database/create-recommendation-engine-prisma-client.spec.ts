import { createRecommendationEnginePrismaClient } from './create-recommendation-engine-prisma-client.js';

describe('createRecommendationEnginePrismaClient', () => {
  it('returns an object exposing the PrismaClient API surface', () => {
    // Not `toBeInstanceOf(PrismaClient)` — Prisma's `$extends()` wraps the
    // client in a Proxy, same documented quirk as packages/database's own
    // getPrismaClient() test and ai-engine's own equivalent spec.
    const client = createRecommendationEnginePrismaClient(
      'postgresql://app_role:pw@localhost:5432/linguaai',
    );

    expect(typeof client.$connect).toBe('function');
    expect(typeof client.$disconnect).toBe('function');
    expect(typeof client.$transaction).toBe('function');
    expect(typeof client.learningPlan.create).toBe('function');
    expect(typeof client.dailyGoal.create).toBe('function');
  });

  it('exposes onModuleDestroy so NestJS graceful shutdown actually disconnects this client', async () => {
    const client = createRecommendationEnginePrismaClient(
      'postgresql://app_role:pw@localhost:5432/linguaai',
    );
    const disconnectSpy = jest.spyOn(client, '$disconnect').mockResolvedValue(undefined);

    await (client as unknown as { onModuleDestroy(): Promise<void> }).onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
