export type Achievement = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: string;
  target?: number; // For achievements that require multiple completions
  progress?: number; // Current progress toward target
  unlocked?: boolean;
  unlockedAt?: string; // ISO date string
};

export type AchievementProgress = {
  [achievementId: string]: {
    progress: number;
    unlocked: boolean;
    unlockedAt: string;
  };
};

export type PlayerStats = {
  gamesPlayed: number;
  gamesWon: number;
  winStreak: number;
  currentWinStreak: number;
  perfectGames: number;
  aiBeatenCount: number;
  photosUploaded: number;
  photosWithMetadata: number;
  photosUsedInGames: number;
  uniqueCountriesGuessed: Set<string>;
  uniqueUploadCountries: Set<string>;
  continentsCompleted: Set<string>;
  lastGameResult: 'win' | 'loss' | null;
  
  // Streak tracking
  currentCorrectCountryStreak: number;
  maxCorrectCountryStreak: number;
  
  // Geography tracking
  hasGuessedNorthernHemisphere: boolean;
  hasGuessedSouthernHemisphere: boolean;
  hasGuessedInWater: boolean;
  
  // Distance tracking
  closeGuessCount: number; // <10km
  farGuessCount: number; // >10,000km
  mindBlownCount: number; // >10,000km off
  reversePsychologyCount: number; // >18,000km off
  
  // Team game tracking
  teamGamesWon: number;
  
  // Photo performance tracking
  photosWithMostCorrectGuesses: number;
  
  // Round position tracking
  comebackWins: number;
  currentRoundWinStreak: number;
  maxRoundWinStreak: number;
  
  // Time-based tracking
  fastGuessCount: number; // <10 seconds

  // Score consistency tracking
  consecutiveHighScoreRounds: number; // Consecutive rounds with 3000+ points (streak)
  maxConsecutiveHighScoreRounds: number;
  
  // Daily play tracking
  consecutiveDaysPlayed: number; // Consecutive days played
  maxConsecutiveDaysPlayed: number;
  lastPlayDate: string; // Last play date (YYYY-MM-DD)

  // Achievement progress tracking
  earnedAchievementsCount: number;

  // Track if correct region was guessed (for correct_region achievement)
  hasGuessedCorrectRegion: boolean;

  // Track if player has played their first game
  hasPlayedFirstGame: boolean;
};
