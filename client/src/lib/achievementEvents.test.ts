import { beforeEach, describe, expect, it } from 'vitest';
import { claimAchievementEvent, clearAchievementEvents } from './achievementEvents';

describe('achievement event claims', () => {
  beforeEach(() => clearAchievementEvents());

  it('only accepts a round or game event once across calls', () => {
    expect(claimAchievementEvent('round:game-1:player-1:0')).toBe(true);
    expect(claimAchievementEvent('round:game-1:player-1:0')).toBe(false);
    expect(claimAchievementEvent('round:game-1:player-1:1')).toBe(true);
  });

  it('keeps different players and games independent', () => {
    expect(claimAchievementEvent('game:game-1:player-1')).toBe(true);
    expect(claimAchievementEvent('game:game-1:player-2')).toBe(true);
    expect(claimAchievementEvent('game:game-2:player-1')).toBe(true);
  });
});
