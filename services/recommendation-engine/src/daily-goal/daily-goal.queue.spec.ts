import { DAILY_GOAL_QUEUE_NAME } from './daily-goal.constants.js';
import { createDailyGoalQueue } from './daily-goal.queue.js';

describe('createDailyGoalQueue', () => {
  it('constructs a BullMQ Queue named after DAILY_GOAL_QUEUE_NAME, without connecting synchronously (ioredis connects lazily on first use)', async () => {
    const queue = createDailyGoalQueue('redis://localhost:6379');
    try {
      expect(queue.name).toBe(DAILY_GOAL_QUEUE_NAME);
    } finally {
      await queue.close();
    }
  });
});
