import { RollingSummaryCache } from './rolling-summary.cache.js';

describe('RollingSummaryCache', () => {
  it('returns undefined for a session with no cached entry', () => {
    const cache = new RollingSummaryCache();

    expect(cache.get('session-1')).toBeUndefined();
  });

  it('returns exactly what was set for a session', () => {
    const cache = new RollingSummaryCache();
    const entry = { summary: 'a summary', summarizedThroughCreatedAt: new Date('2026-01-01') };

    cache.set('session-1', entry);

    expect(cache.get('session-1')).toBe(entry);
  });

  it('keeps entries for different sessions independent', () => {
    const cache = new RollingSummaryCache();
    cache.set('session-1', { summary: 'one', summarizedThroughCreatedAt: new Date() });
    cache.set('session-2', { summary: 'two', summarizedThroughCreatedAt: new Date() });

    expect(cache.get('session-1')?.summary).toBe('one');
    expect(cache.get('session-2')?.summary).toBe('two');
  });

  it('clear removes only the named session', () => {
    const cache = new RollingSummaryCache();
    cache.set('session-1', { summary: 'one', summarizedThroughCreatedAt: new Date() });
    cache.set('session-2', { summary: 'two', summarizedThroughCreatedAt: new Date() });

    cache.clear('session-1');

    expect(cache.get('session-1')).toBeUndefined();
    expect(cache.get('session-2')?.summary).toBe('two');
  });
});
