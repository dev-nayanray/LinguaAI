/**
 * Runs `task` once per item in `items`, at most `concurrency` in flight at
 * once — a plain worker-pool over `Promise.all`, not a raw
 * `Promise.all(items.map(task))`, which would fire every request at once
 * regardless of the requested concurrency and no longer represent a
 * *sustained* load level.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await task(items[current]!, current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
