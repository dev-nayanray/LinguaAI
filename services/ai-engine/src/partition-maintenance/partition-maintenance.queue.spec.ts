import { PARTITION_MAINTENANCE_QUEUE_NAME } from './partition-maintenance.constants.js';
import { createPartitionMaintenanceQueue } from './partition-maintenance.queue.js';

describe('createPartitionMaintenanceQueue', () => {
  it('constructs a BullMQ Queue named after PARTITION_MAINTENANCE_QUEUE_NAME, without connecting synchronously (ioredis connects lazily on first use)', async () => {
    const queue = createPartitionMaintenanceQueue('redis://localhost:6379');
    try {
      expect(queue.name).toBe(PARTITION_MAINTENANCE_QUEUE_NAME);
    } finally {
      await queue.close();
    }
  });
});
