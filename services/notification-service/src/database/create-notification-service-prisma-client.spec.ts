import { createNotificationServicePrismaClient } from './create-notification-service-prisma-client.js';

describe('createNotificationServicePrismaClient', () => {
  it('returns an object exposing the PrismaClient API surface', () => {
    // Not `toBeInstanceOf(PrismaClient)` — Prisma's `$extends()` wraps the
    // client in a Proxy, same documented quirk `recommendation-engine`'s
    // own equivalent spec already established.
    const client = createNotificationServicePrismaClient(
      'postgresql://app_service_role:pw@localhost:5432/linguaai',
    );

    expect(typeof client.$connect).toBe('function');
    expect(typeof client.$disconnect).toBe('function');
    expect(typeof client.$transaction).toBe('function');
    expect(typeof client.user.findUnique).toBe('function');
    expect(typeof client.notificationLog.create).toBe('function');
    expect(typeof client.notificationPreference.findUnique).toBe('function');
  });

  it('exposes onModuleDestroy so NestJS graceful shutdown actually disconnects this client', async () => {
    const client = createNotificationServicePrismaClient(
      'postgresql://app_service_role:pw@localhost:5432/linguaai',
    );
    const disconnectSpy = jest.spyOn(client, '$disconnect').mockResolvedValue(undefined);

    await (client as unknown as { onModuleDestroy(): Promise<void> }).onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
