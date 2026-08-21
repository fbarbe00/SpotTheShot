import { describe, expect, it } from 'vitest';
import type { Achievement } from './achievementTypes';
import { repairLegacyAchievementProgress } from './useAchievements';

const achievement = (id: string, unlocked = true): Achievement => ({
  id,
  name: id,
  description: id,
  emoji: '',
  category: 'test',
  unlocked,
});

describe('legacy achievement repair', () => {
  it('removes upload unlocks created by the old used-photo double count', () => {
    const repaired = repairLegacyAchievementProgress([
      achievement('pro_photographer'),
      achievement('uploader_legend'),
    ], { photosUploaded: 7 });

    expect(repaired.find(item => item.id === 'pro_photographer')).toMatchObject({ progress: 7, unlocked: false });
    expect(repaired.find(item => item.id === 'uploader_legend')).toMatchObject({ progress: 7, unlocked: false });
  });

  it('removes Achievement Hunter when repaired false unlocks put it below its target', () => {
    const achievements = [
      ...Array.from({ length: 29 }, (_, index) => achievement(`earned-${index}`)),
      achievement('pro_photographer'),
      achievement('achievement_hunter'),
    ];
    const repaired = repairLegacyAchievementProgress(achievements, { photosUploaded: 0 });
    expect(repaired.find(item => item.id === 'achievement_hunter')).toMatchObject({ progress: 29, unlocked: false });
  });
});
