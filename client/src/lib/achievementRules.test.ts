import { describe, expect, it } from 'vitest';
import { nextStreak, sameRegion, uniqueLast, uniquePositiveWinner } from './achievementRules';

describe('achievement rules', () => {
  it('does not award wins for ties, zero scores, or single-player rounds', () => {
    expect(uniquePositiveWinner([{ id: 'a', score: 0 }, { id: 'b', score: 0 }])).toBeNull();
    expect(uniquePositiveWinner([{ id: 'a', score: 10 }, { id: 'b', score: 10 }])).toBeNull();
    expect(uniquePositiveWinner([{ id: 'a', score: 10 }])).toBeNull();
    expect(uniquePositiveWinner([{ id: 'a', score: 11 }, { id: 'b', score: 10 }])).toBe('a');
  });

  it('only treats an undisputed bottom score as last place', () => {
    expect(uniqueLast([{ id: 'a', score: 0 }, { id: 'b', score: 0 }])).toBeNull();
    expect(uniqueLast([{ id: 'a', score: 0 }, { id: 'b', score: 1 }])).toBe('a');
  });

  it('requires a real matching target region', () => {
    expect(sameRegion(' Bavaria ', 'bavaria')).toBe(true);
    expect(sameRegion('Berlin', 'Bavaria')).toBe(false);
    expect(sameRegion('Berlin', null)).toBe(false);
  });

  it('resets streaks instead of accumulating non-consecutive successes', () => {
    expect(nextStreak(5, false)).toBe(0);
    expect(nextStreak(5, true)).toBe(6);
  });
});
