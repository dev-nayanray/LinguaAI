import type { PrismaClient } from '@linguaai/database';

import { PartitionMaintenanceService } from './partition-maintenance.service.js';

function fakePrisma() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(0),
  } as unknown as PrismaClient & { $executeRaw: jest.Mock };
}

describe('PartitionMaintenanceService', () => {
  describe('runMaintenance', () => {
    it("CALLs partman.run_maintenance_proc() — a stored PROCEDURE, not a function, confirmed against the live database (see this file's own service.ts doc comment)", async () => {
      const prisma = fakePrisma();
      const service = new PartitionMaintenanceService(prisma);

      await service.runMaintenance();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const [strings] = prisma.$executeRaw.mock.calls[0] as [TemplateStringsArray];
      expect(strings.join('')).toContain('CALL partman.run_maintenance_proc()');
    });

    it('propagates a failure (e.g. the grant gap this task itself found and fixed) rather than swallowing it', async () => {
      const prisma = fakePrisma();
      prisma.$executeRaw.mockRejectedValue(new Error('permission denied for schema partman'));
      const service = new PartitionMaintenanceService(prisma);

      await expect(service.runMaintenance()).rejects.toThrow(
        'permission denied for schema partman',
      );
    });
  });
});
