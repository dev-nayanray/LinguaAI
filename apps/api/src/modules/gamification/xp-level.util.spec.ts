import { computeLevel, XP_PER_LEVEL } from './xp-level.util.js';

describe('computeLevel', () => {
  it('starts at level 1 with zero XP', () => {
    expect(computeLevel(0)).toBe(1);
  });

  it('stays at level 1 until XP_PER_LEVEL is reached', () => {
    expect(computeLevel(XP_PER_LEVEL - 1)).toBe(1);
  });

  it('advances to level 2 exactly at XP_PER_LEVEL', () => {
    expect(computeLevel(XP_PER_LEVEL)).toBe(2);
  });

  it('advances multiple levels for a large XP total', () => {
    expect(computeLevel(XP_PER_LEVEL * 5)).toBe(6);
  });
});
