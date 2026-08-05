import { createAppPrismaClient, ServiceRolePrismaClient } from './prisma-clients.js';

// PrismaClient connects lazily (on first query), so constructing an
// instance against a syntactically-valid but unreachable URL is safe here —
// this test only proves the onModuleDestroy lifecycle hook wiring, not
// real connectivity (covered by the e2e suite against the real dev DB).
const FAKE_URL = 'postgresql://fake:fake@localhost:1/fake';

describe('createAppPrismaClient', () => {
  it('disconnects on onModuleDestroy (extension-attached lifecycle hook)', async () => {
    const client = createAppPrismaClient(FAKE_URL);
    const disconnectSpy = jest.spyOn(client, '$disconnect').mockResolvedValue(undefined);

    await client.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ServiceRolePrismaClient', () => {
  it('disconnects on onModuleDestroy', async () => {
    const client = new ServiceRolePrismaClient(FAKE_URL);
    const disconnectSpy = jest.spyOn(client, '$disconnect').mockResolvedValue(undefined);

    await client.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
