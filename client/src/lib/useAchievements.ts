import { useState, useEffect, useCallback } from 'react';
import { ALL_ACHIEVEMENTS, getAchievementById } from './achievementsData';
import type { Achievement, PlayerStats } from './achievementTypes';
import { logger } from './logger';

const ACHIEVEMENT_STORAGE_KEY = 'spottheshot-achievements';
const STATS_STORAGE_KEY = 'spottheshot-player-stats';

// --- Module-level helpers (no hook dependencies) ---

const COUNTRY_TO_CONTINENT: Record<string, string> = {
  // North America
  'United States': 'North America', 'Canada': 'North America', 'Mexico': 'North America',
  'Costa Rica': 'North America', 'Panama': 'North America', 'Cuba': 'North America',
  'Jamaica': 'North America', 'Haiti': 'North America', 'Dominican Republic': 'North America',
  'Bahamas': 'North America', 'Puerto Rico': 'North America',
  // South America
  'Brazil': 'South America', 'Argentina': 'South America', 'Chile': 'South America',
  'Peru': 'South America', 'Colombia': 'South America', 'Venezuela': 'South America',
  'Ecuador': 'South America', 'Bolivia': 'South America', 'Paraguay': 'South America',
  'Uruguay': 'South America',
  // Europe
  'United Kingdom': 'Europe', 'France': 'Europe', 'Germany': 'Europe', 'Italy': 'Europe',
  'Spain': 'Europe', 'Portugal': 'Europe', 'Netherlands': 'Europe', 'Belgium': 'Europe',
  'Switzerland': 'Europe', 'Austria': 'Europe', 'Sweden': 'Europe', 'Norway': 'Europe',
  'Denmark': 'Europe', 'Finland': 'Europe', 'Poland': 'Europe', 'Russia': 'Europe',
  'Greece': 'Europe', 'Turkey': 'Europe',
  // Asia
  'China': 'Asia', 'Japan': 'Asia', 'India': 'Asia', 'South Korea': 'Asia',
  'Thailand': 'Asia', 'Vietnam': 'Asia', 'Indonesia': 'Asia', 'Philippines': 'Asia',
  'Malaysia': 'Asia', 'Singapore': 'Asia', 'Saudi Arabia': 'Asia',
  'United Arab Emirates': 'Asia', 'Israel': 'Asia', 'Iran': 'Asia', 'Iraq': 'Asia',
  // Africa
  'South Africa': 'Africa', 'Egypt': 'Africa', 'Nigeria': 'Africa', 'Kenya': 'Africa',
  'Morocco': 'Africa', 'Ethiopia': 'Africa', 'Ghana': 'Africa', 'Tanzania': 'Africa',
  'Algeria': 'Africa', 'Sudan': 'Africa',
  // Oceania
  'Australia': 'Oceania', 'New Zealand': 'Oceania', 'Fiji': 'Oceania',
  'Papua New Guinea': 'Oceania',
  // Antarctica
  'Antarctica': 'Antarctica',
};

function getContinentFromCountry(country: string): string | null {
  return COUNTRY_TO_CONTINENT[country] ?? null;
}

function createInitialStats(): PlayerStats {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    winStreak: 0,
    currentWinStreak: 0,
    perfectGames: 0,
    aiBeatenCount: 0,
    photosUploaded: 0,
    photosWithMetadata: 0,
    photosUsedInGames: 0,
    uniqueCountriesGuessed: new Set<string>(),
    uniqueUploadCountries: new Set<string>(),
    continentsCompleted: new Set<string>(),
    lastGameResult: null,
    currentCorrectCountryStreak: 0,
    maxCorrectCountryStreak: 0,
    hasGuessedNorthernHemisphere: false,
    hasGuessedSouthernHemisphere: false,
    hasGuessedInWater: false,
    hasGuessedCorrectRegion: false,
    closeGuessCount: 0,
    farGuessCount: 0,
    mindBlownCount: 0,
    reversePsychologyCount: 0,
    teamGamesWon: 0,
    photosWithMostCorrectGuesses: 0,
    comebackWins: 0,
    currentRoundWinStreak: 0,
    maxRoundWinStreak: 0,
    fastGuessCount: 0,
    consecutiveHighScoreRounds: 0,
    maxConsecutiveHighScoreRounds: 0,
    consecutiveDaysPlayed: 0,
    maxConsecutiveDaysPlayed: 0,
    lastPlayDate: '',
    earnedAchievementsCount: 0,
    hasPlayedFirstGame: false,
  };
}

function cloneStats(prev: PlayerStats): PlayerStats {
  return {
    ...prev,
    uniqueCountriesGuessed: new Set(prev.uniqueCountriesGuessed),
    uniqueUploadCountries: new Set(prev.uniqueUploadCountries),
    continentsCompleted: new Set(prev.continentsCompleted),
  };
}

/** Returns today's date as YYYY-MM-DD using local time (avoids UTC midnight drift). */
function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns the difference in calendar days between two YYYY-MM-DD strings.
 * Avoids DST issues by comparing strings directly rather than using getTime().
 */
function daysBetween(a: string, b: string): number {
  const msA = Date.parse(`${a}T12:00:00Z`);
  const msB = Date.parse(`${b}T12:00:00Z`);
  return Math.round((msB - msA) / 86_400_000);
}

// --- Atomic update helper ---

/**
 * Applies achievement unlocks to an achievements array and returns the updated
 * array plus the new earned count.
 */
function applyUnlocks(
  achievements: Achievement[],
  idsToUnlock: string[],
): { updated: Achievement[]; newEarnedCount: number } {
  const now = new Date().toISOString();
  const updated = achievements.map(ach => {
    if (idsToUnlock.includes(ach.id) && !ach.unlocked) {
      return { ...ach, unlocked: true, unlockedAt: now };
    }
    return ach;
  });
  const newEarnedCount = updated.filter(a => a.unlocked).length;
  return { updated, newEarnedCount };
}

// ---------------------------------------------------------------------------

export function useAchievements() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<PlayerStats>(createInitialStats);

  const [unlockedThisGame, setUnlockedThisGame] = useState<string[]>([]);
  const [unlockedThisRound, setUnlockedThisRound] = useState<string[]>([]);

  // ── Persistence ────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const savedAchievements = localStorage.getItem(ACHIEVEMENT_STORAGE_KEY);
      const savedStats = localStorage.getItem(STATS_STORAGE_KEY);

      const loadedAchievements: Achievement[] = savedAchievements
        ? ALL_ACHIEVEMENTS.map(ach => {
            const saved = JSON.parse(savedAchievements).find((a: { id: string }) => a.id === ach.id);
            return saved ? { ...ach, ...saved } : { ...ach };
          })
        : ALL_ACHIEVEMENTS.map(ach => ({ ...ach }));

      setAchievements(loadedAchievements);

      if (savedStats) {
        const p = JSON.parse(savedStats);
        setStats({
          gamesPlayed: p.gamesPlayed ?? 0,
          gamesWon: p.gamesWon ?? 0,
          winStreak: p.winStreak ?? 0,
          currentWinStreak: p.currentWinStreak ?? 0,
          perfectGames: p.perfectGames ?? 0,
          aiBeatenCount: p.aiBeatenCount ?? 0,
          photosUploaded: p.photosUploaded ?? 0,
          photosWithMetadata: p.photosWithMetadata ?? 0,
          photosUsedInGames: p.photosUsedInGames ?? 0,
          uniqueCountriesGuessed: new Set(p.uniqueCountriesGuessed ?? []),
          uniqueUploadCountries: new Set(p.uniqueUploadCountries ?? []),
          continentsCompleted: new Set(p.continentsCompleted ?? []),
          lastGameResult: p.lastGameResult ?? null,
          currentCorrectCountryStreak: p.currentCorrectCountryStreak ?? 0,
          maxCorrectCountryStreak: p.maxCorrectCountryStreak ?? 0,
          hasGuessedNorthernHemisphere: p.hasGuessedNorthernHemisphere ?? false,
          hasGuessedSouthernHemisphere: p.hasGuessedSouthernHemisphere ?? false,
          hasGuessedInWater: p.hasGuessedInWater ?? false,
          hasGuessedCorrectRegion: p.hasGuessedCorrectRegion ?? false,
          closeGuessCount: p.closeGuessCount ?? 0,
          farGuessCount: p.farGuessCount ?? 0,
          mindBlownCount: p.mindBlownCount ?? 0,
          reversePsychologyCount: p.reversePsychologyCount ?? 0,
          teamGamesWon: p.teamGamesWon ?? 0,
          photosWithMostCorrectGuesses: p.photosWithMostCorrectGuesses ?? 0,
          comebackWins: p.comebackWins ?? 0,
          currentRoundWinStreak: p.currentRoundWinStreak ?? 0,
          maxRoundWinStreak: p.maxRoundWinStreak ?? 0,
          fastGuessCount: p.fastGuessCount ?? 0,
          consecutiveHighScoreRounds: p.consecutiveHighScoreRounds ?? 0,
          maxConsecutiveHighScoreRounds: p.maxConsecutiveHighScoreRounds ?? 0,
          consecutiveDaysPlayed: p.consecutiveDaysPlayed ?? 0,
          maxConsecutiveDaysPlayed: p.maxConsecutiveDaysPlayed ?? 0,
          lastPlayDate: p.lastPlayDate ?? '',
          earnedAchievementsCount: p.earnedAchievementsCount ?? 0,
          hasPlayedFirstGame: p.hasPlayedFirstGame ?? false,
        });
      }
    } catch (error) {
      logger.error('Failed to load achievements', error);
    }
  }, []);

  useEffect(() => {
    if (achievements.length === 0) return;
    try {
      localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(achievements));
    } catch (error) {
      logger.error('Failed to save achievements', error);
    }
  }, [achievements]);

  useEffect(() => {
    try {
      localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify({
        ...stats,
        uniqueCountriesGuessed: Array.from(stats.uniqueCountriesGuessed),
        uniqueUploadCountries: Array.from(stats.uniqueUploadCountries),
        continentsCompleted: Array.from(stats.continentsCompleted),
      }));
    } catch (error) {
      logger.error('Failed to save stats', error);
    }
  }, [stats]);

  // ── Core unlock primitive ──────────────────────────────────────────────────

  /**
   * Unlocks one or more achievements atomically.
   * - Single setAchievements call (no nested setters)
   * - Handles achievement_hunter milestone in the same pass
   * - Updates earned count and batch tracking in one sweep
   */
  const unlockAchievements = useCallback((ids: string | string[]) => {
    const idsArray = Array.isArray(ids) ? ids : [ids];

    setAchievements(prev => {
      const newIds = idsArray.filter(id => !prev.find(a => a.id === id)?.unlocked);
      if (newIds.length === 0) return prev;

      let { updated, newEarnedCount } = applyUnlocks(prev, newIds);

      // Check if achievement_hunter threshold is now met
      const hunterAlreadyUnlocked = updated.find(a => a.id === 'achievement_hunter')?.unlocked;
      if (newEarnedCount >= 30 && !hunterAlreadyUnlocked) {
        ({ updated, newEarnedCount } = applyUnlocks(updated, ['achievement_hunter']));
        newIds.push('achievement_hunter');
      }

      setUnlockedThisGame(g => {
        const additions = newIds.filter(id => !g.includes(id));
        return additions.length > 0 ? [...g, ...additions] : g;
      });
      setUnlockedThisRound(r => {
        const additions = newIds.filter(id => !r.includes(id));
        return additions.length > 0 ? [...r, ...additions] : r;
      });

      setStats(s =>
        s.earnedAchievementsCount !== newEarnedCount
          ? { ...s, earnedAchievementsCount: newEarnedCount }
          : s
      );

      return updated;
    });
  }, []);

  const unlockAchievement = useCallback((id: string) => {
    unlockAchievements(id);
  }, [unlockAchievements]);

  // ── Progress tracking ──────────────────────────────────────────────────────

  const updateAchievementProgress = useCallback((achievementId: string, increment = 1) => {
    setAchievements(prev => {
      const achievement = getAchievementById(achievementId);
      let shouldUnlock = false;

      const updated = prev.map(ach => {
        if (ach.id !== achievementId) return ach;
        const newProgress = (ach.progress ?? 0) + increment;
        if (achievement?.target && newProgress >= achievement.target && !ach.unlocked) {
          shouldUnlock = true;
          return { ...ach, progress: newProgress, unlocked: true, unlockedAt: new Date().toISOString() };
        }
        return { ...ach, progress: newProgress };
      });

      if (shouldUnlock) {
        const newEarnedCount = updated.filter(a => a.unlocked).length;

        setUnlockedThisGame(g => g.includes(achievementId) ? g : [...g, achievementId]);
        setUnlockedThisRound(r => r.includes(achievementId) ? r : [...r, achievementId]);
        setStats(s =>
          s.earnedAchievementsCount !== newEarnedCount
            ? { ...s, earnedAchievementsCount: newEarnedCount }
            : s
        );

        const hunterUnlocked = updated.find(a => a.id === 'achievement_hunter')?.unlocked;
        if (newEarnedCount >= 30 && !hunterUnlocked) {
          Promise.resolve().then(() => unlockAchievement('achievement_hunter'));
        }
      }

      return updated;
    });
  }, [unlockAchievement]);

  // ── Game tracking ──────────────────────────────────────────────────────────

  /**
   * Track completion of a game.
   * @param gameResult - 'win' or 'loss'
   * @param isPerfectGame - true if player won all rounds
   * @param isSoloGame - true if playing solo (vs AI only). Solo games don't count towards stats.
   */
  const trackGameCompletion = useCallback((
    gameResult: 'win' | 'loss',
    isPerfectGame = false,
    isSoloGame = false,
  ) => {
    setStats(prev => {
      const updated = cloneStats(prev);
      const toUnlock: string[] = [];

      // Solo games don't count towards stats, but do unlock first_game once.
      if (isSoloGame) {
        if (!prev.hasPlayedFirstGame) {
          updated.hasPlayedFirstGame = true;
          toUnlock.push('first_game');
          unlockAchievements(toUnlock);
        }
        return updated;
      }

      updated.gamesPlayed += 1;

      // first_game: unlock exactly once, on the first game ever (solo or multiplayer)
      if (!prev.hasPlayedFirstGame) {
        updated.hasPlayedFirstGame = true;
        toUnlock.push('first_game');
      }

      if (gameResult === 'win') {
        updated.gamesWon += 1;
        updated.currentWinStreak += 1;
        updated.winStreak = Math.max(updated.winStreak, updated.currentWinStreak);
        updated.lastGameResult = 'win';

        if (updated.gamesWon === 1) toUnlock.push('first_win');
        if (isPerfectGame) {
          updated.perfectGames += 1;
          toUnlock.push('perfect_game');
        }
        if (updated.currentWinStreak >= 5) toUnlock.push('win_streak');
        if (updated.currentWinStreak >= 10) toUnlock.push('undefeated');
      } else {
        updated.currentWinStreak = 0;
        updated.lastGameResult = 'loss';
      }

      // Daily streak — string comparison avoids DST issues
      const today = todayString();
      if (updated.lastPlayDate !== today) {
        if (updated.lastPlayDate) {
          const diff = daysBetween(updated.lastPlayDate, today);
          if (diff === 1) {
            updated.consecutiveDaysPlayed += 1;
            updated.maxConsecutiveDaysPlayed = Math.max(
              updated.maxConsecutiveDaysPlayed,
              updated.consecutiveDaysPlayed,
            );
            if (updated.consecutiveDaysPlayed >= 3) toUnlock.push('daily_player');
          } else if (diff > 1) {
            updated.consecutiveDaysPlayed = 1;
          }
        } else {
          updated.consecutiveDaysPlayed = 1;
        }
        updated.lastPlayDate = today;
      }

      if (updated.gamesPlayed >= 20) toUnlock.push('game_night');
      if (updated.gamesPlayed >= 75) toUnlock.push('veteran_player');
      if (updated.gamesWon >= 35) toUnlock.push('games_won_50');

      if (toUnlock.length) unlockAchievements(toUnlock);
      return updated;
    });
  }, [unlockAchievements]);

  // ── Guess tracking ─────────────────────────────────────────────────────────

  const trackCorrectGuess = useCallback((country: string, region: string, lat: number, lon: number) => {
    setStats(prev => {
      const updated = cloneStats(prev);
      const toUnlock: string[] = [];

      if (country) {
        updated.uniqueCountriesGuessed.add(country);
        updateAchievementProgress('correct_country');

        if (updated.uniqueCountriesGuessed.size >= 20) toUnlock.push('around_the_world');

        updated.currentCorrectCountryStreak += 1;
        updated.maxCorrectCountryStreak = Math.max(
          updated.maxCorrectCountryStreak,
          updated.currentCorrectCountryStreak,
        );
        if (updated.currentCorrectCountryStreak >= 5) toUnlock.push('correct_streak');
      } else {
        updated.currentCorrectCountryStreak = 0;
      }

      if (region) {
        updated.hasGuessedCorrectRegion = true;
        updateAchievementProgress('correct_region');
      }

      if (lat !== undefined && lon !== undefined) {
        if (lat >= 0) updated.hasGuessedNorthernHemisphere = true;
        else updated.hasGuessedSouthernHemisphere = true;

        if (
          updated.gamesPlayed >= 3 &&
          updated.hasGuessedNorthernHemisphere &&
          updated.hasGuessedSouthernHemisphere
        ) {
          toUnlock.push('hemisphere_hopper');
        }
      }

      if (toUnlock.length) unlockAchievements(toUnlock);
      return updated;
    });
  }, [unlockAchievements, updateAchievementProgress]);

  // ── Score tracking ─────────────────────────────────────────────────────────

  const trackScore = useCallback((score: number, distanceKm: number) => {
    setStats(prev => {
      const updated = cloneStats(prev);
      const toUnlock: string[] = [];

      if (score === 5000) toUnlock.push('five_k');
      if (score >= 4500) updateAchievementProgress('ten_k_score');
      if (distanceKm <= 0.1) updateAchievementProgress('perfect_guess');
      if (distanceKm < 10) {
        updated.closeGuessCount += 1;
        updateAchievementProgress('close_guesses');
      }
      if (distanceKm < 100) updateAchievementProgress('medium_guesses');
      if (distanceKm > 10000) {
        updated.farGuessCount += 1;
        updateAchievementProgress('far_guesses');
        updateAchievementProgress('global_swing_master');
      }

      // Track consecutive high score rounds (3000+ points)
      // This is a streak counter that persists across games
      if (score >= 3000) {
        updated.consecutiveHighScoreRounds += 1;
        updated.maxConsecutiveHighScoreRounds = Math.max(
          updated.maxConsecutiveHighScoreRounds,
          updated.consecutiveHighScoreRounds,
        );
        if (updated.consecutiveHighScoreRounds >= 10) toUnlock.push('consistent_scoring');
      } else {
        // Reset the streak when a round scores below 3000
        updated.consecutiveHighScoreRounds = 0;
      }

      if (toUnlock.length) unlockAchievements(toUnlock);
      return updated;
    });
  }, [unlockAchievements, updateAchievementProgress]);

  // ── AI tracking ────────────────────────────────────────────────────────────

  const trackAIBeat = useCallback((distanceDifferenceKm: number) => {
    updateAchievementProgress('beat_ai_10x');
    updateAchievementProgress('beat_ai_50x');
    updateAchievementProgress('ai_rival');
    if (distanceDifferenceKm >= 500) updateAchievementProgress('sniper_beat');
  }, [updateAchievementProgress]);

  // ── Photo tracking ─────────────────────────────────────────────────────────

  const trackPhotoUpload = useCallback((hasMetadata = false) => {
    setStats(prev => {
      const updated = cloneStats(prev);
      updated.photosUploaded += 1;
      updateAchievementProgress('pro_photographer');
      updateAchievementProgress('uploader_legend');
      if (hasMetadata) {
        updated.photosWithMetadata += 1;
        updateAchievementProgress('creative_director');
      }
      return updated;
    });
  }, [updateAchievementProgress]);

  const trackPhotoUsedInGame = useCallback(() => {
    setStats(prev => {
      const updated = cloneStats(prev);
      updated.photosUsedInGames += 1;
      updateAchievementProgress('pro_photographer');
      updateAchievementProgress('uploader_legend');
      return updated;
    });
  }, [updateAchievementProgress]);

  const trackPhotoUploadFromCountry = useCallback((country: string) => {
    if (!country) return;
    setStats(prev => {
      const updated = cloneStats(prev);
      if (!updated.uniqueUploadCountries.has(country)) {
        updated.uniqueUploadCountries.add(country);
        updateAchievementProgress('world_builder');
        updateAchievementProgress('world_builder_plus');
        updateAchievementProgress('world_builder_legend');
      }
      return updated;
    });
  }, [updateAchievementProgress]);

  const trackPhotoWithMostCorrectGuesses = useCallback(() => {
    setStats(prev => {
      const updated = cloneStats(prev);
      updated.photosWithMostCorrectGuesses += 1;
      if (updated.photosWithMostCorrectGuesses === 1) unlockAchievement('crowd_favorite');
      return updated;
    });
  }, [unlockAchievement]);

  // ── Round tracking ─────────────────────────────────────────────────────────

  const trackRoundWin = useCallback((wonRound: boolean) => {
    setStats(prev => {
      const updated = cloneStats(prev);
      if (wonRound) {
        updated.currentRoundWinStreak += 1;
        updated.maxRoundWinStreak = Math.max(updated.maxRoundWinStreak, updated.currentRoundWinStreak);
        updateAchievementProgress('perfect_rounds');
      } else {
        updated.currentRoundWinStreak = 0;
      }
      return updated;
    });
  }, [updateAchievementProgress]);

  const trackPhotoFinish = useCallback((marginKm: number) => {
    if (marginKm < 5) updateAchievementProgress('photo_finish');
  }, [updateAchievementProgress]);

  // ── Geography tracking ─────────────────────────────────────────────────────

  const trackContinentCompletion = useCallback((country: string) => {
    setStats(prev => {
      const updated = cloneStats(prev);
      const continent = getContinentFromCountry(country);
      if (continent) {
        updated.continentsCompleted.add(continent);
        if (updated.continentsCompleted.size >= 7) unlockAchievement('all_continents');
      }
      return updated;
    });
  }, [unlockAchievement]);

  const trackWaterGuess = useCallback(() => {
    setStats(prev => {
      const updated = cloneStats(prev);
      updated.hasGuessedInWater = true;
      updateAchievementProgress('water_guess');
      return updated;
    });
  }, [updateAchievementProgress]);

  // ── Time / distance fun tracking ───────────────────────────────────────────

  const trackFastGuess = useCallback((timeTakenMs: number) => {
    if (timeTakenMs >= 10_000) return;
    setStats(prev => {
      const updated = cloneStats(prev);
      updated.fastGuessCount += 1;
      updateAchievementProgress('fast_guesses');
      updateAchievementProgress('lightning_guess_legend');
      return updated;
    });
  }, [updateAchievementProgress]);

  const trackMindBlownGuess = useCallback((distanceKm: number) => {
    if (distanceKm <= 10_000) return;
    setStats(prev => {
      const updated = cloneStats(prev);
      updated.mindBlownCount += 1;
      updateAchievementProgress('mind_blown');
      updateAchievementProgress('mind_blown_chain');
      return updated;
    });
  }, [updateAchievementProgress]);

  const trackReversePsychologyGuess = useCallback((distanceKm: number) => {
    if (distanceKm <= 18_000) return;
    setStats(prev => {
      const updated = cloneStats(prev);
      updated.reversePsychologyCount += 1;
      updateAchievementProgress('reverse_psychology');
      updateAchievementProgress('opposite_day');
      return updated;
    });
  }, [updateAchievementProgress]);

  // ── Team / comeback tracking ───────────────────────────────────────────────

  const trackTeamGameWin = useCallback(() => {
    setStats(prev => {
      const updated = cloneStats(prev);
      updated.teamGamesWon += 1;
      updateAchievementProgress('team_player');
      return updated;
    });
  }, [updateAchievementProgress]);

  const trackComebackWin = useCallback(() => {
    setStats(prev => {
      const updated = cloneStats(prev);
      updated.comebackWins += 1;
      if (updated.comebackWins === 1) unlockAchievement('comeback_win');
      return updated;
    });
  }, [unlockAchievement]);

  // ── Read helpers ───────────────────────────────────────────────────────────

  const getEarnedAchievements = useCallback((): Achievement[] =>
    achievements.filter(a => a.unlocked), [achievements]);

  const getNextAchievements = useCallback((): Achievement[] =>
    achievements
      .filter(a => !a.unlocked)
      .sort((a, b) => {
        const pA = a.target ? (a.progress ?? 0) / a.target : 0;
        const pB = b.target ? (b.progress ?? 0) / b.target : 0;
        return pB - pA;
      })
      .slice(0, 3),
  [achievements]);

  const getUnlockedThisGame = useCallback((): Achievement[] =>
    unlockedThisGame
      .map(id => achievements.find(a => a.id === id))
      .filter(Boolean) as Achievement[],
  [unlockedThisGame, achievements]);

  const getUnlockedThisRound = useCallback((): Achievement[] =>
    unlockedThisRound
      .map(id => achievements.find(a => a.id === id))
      .filter(Boolean) as Achievement[],
  [unlockedThisRound, achievements]);

  // ── Session lifecycle ──────────────────────────────────────────────────────

  const startGame = useCallback(() => {
    setUnlockedThisGame([]);
    setUnlockedThisRound([]);
  }, []);

  const startRound = useCallback(() => {
    setUnlockedThisRound([]);
  }, []);

  const clearSessionTracking = useCallback(() => {
    setUnlockedThisGame([]);
    setUnlockedThisRound([]);
  }, []);

  const resetAllAchievements = useCallback(() => {
    try {
      localStorage.removeItem(ACHIEVEMENT_STORAGE_KEY);
      localStorage.removeItem(STATS_STORAGE_KEY);
    } catch (error) {
      logger.error('Failed to clear achievement cache', error);
    }
    setAchievements(ALL_ACHIEVEMENTS.map(ach => ({ ...ach })));
    setStats(createInitialStats());
    setUnlockedThisGame([]);
    setUnlockedThisRound([]);
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    achievements,
    stats,
    unlockAchievement,
    updateAchievementProgress,
    trackGameCompletion,
    trackCorrectGuess,
    trackScore,
    trackAIBeat,
    trackPhotoUpload,
    trackPhotoUsedInGame,
    trackContinentCompletion,
    trackWaterGuess,
    trackFastGuess,
    trackMindBlownGuess,
    trackReversePsychologyGuess,
    trackTeamGameWin,
    trackComebackWin,
    trackPhotoWithMostCorrectGuesses,
    trackPhotoUploadFromCountry,
    trackRoundWin,
    trackPhotoFinish,
    getEarnedAchievements,
    getNextAchievements,
    startGame,
    startRound,
    clearSessionTracking,
    resetAllAchievements,
    getUnlockedThisGame,
    getUnlockedThisRound,
  };
}