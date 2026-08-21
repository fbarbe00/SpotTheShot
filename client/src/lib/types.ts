import type { ReactNode } from 'react';
import type { MapStyle, MapLanguage } from './mapConfig';
import type { GameType } from './gameModes';

export type Player = {
  id: string;
  nickname: string;
  score: number;
  ready: boolean;
  color?: string;
  icon?: string;
  team?: string;
  isAI?: boolean; // whether this player is AI
  wins?: number; // number of games won across sessions
};

export type Photo = {
  id: string;
  url: string;
  uploaderId?: string;
  lat?: number;
  lon?: number;
  title?: string;
  hint?: string;
  manualLocation?: boolean;
  predictionLat?: number;
  predictionLon?: number;
  country?: string;
  region?: string;
  uploaderNickname?: string;
  uploadedAt?: string;
  captureDate?: string;
  hasCaptureDate?: boolean;
  hasLocation?: boolean;
  countryFlag?: string;
  countryCode?: string; // ISO 3166-1 alpha-2 code for translation
  color?: string;
  dateReference?: { id: string; url: string };
  timelinePhotos?: Array<{ id: string; url: string }>;
};

// Game settings configuration
export type GameSettings = {
  roundDurationSec: number;
  gameType: GameType;
  dateSubmode?: 'exact' | 'before_after' | 'timeline';
  dateTimelineStart?: string;
  dateTimelineEnd?: string;
  gameMode: 'individual' | 'teams';
  timerMode: 'fixed' | 'progressive';
  hintThresholdSec: number;
  enableAIGuessing?: boolean;
  visionCommentary?: boolean;
  autoNameImages?: boolean;
  showImageDate?: boolean;
  requireReady?: boolean;
  uploaderPenaltyPercent?: number;
  minPhotosPerPlayer?: number;
  maxPhotosPerPlayer?: number;
  duelRaceTimeSec?: number;
  language?: 'en' | 'fr' | 'it' | 'es' | 'de' | 'ru';
  mapStyle?: MapStyle;
  mapLanguage?: MapLanguage;
};

// Result for a single player's guess
export type Result = {
  playerId: string;
  lat?: number;
  lon?: number;
  guessedDate?: string;
  dateChoice?: 'before' | 'after';
  photoOrder?: string[];
  guessedUploaderId?: string;
  correctUploader?: boolean;
  icon?: string;
  color: string;
  points: number;
  basePoints?: number;
  nickname: string;
  distanceKm: number;
  distanceDays?: number;
  timeTakenMs: number;
  country?: string;
  region?: string;
  countryFlag?: string;
  countryCode?: string; // ISO 3166-1 alpha-2 code for translation
  locationLookupSucceeded?: boolean;
  isAI?: boolean;
  isUploader?: boolean;
  visionCommentary?: string;
};

// Best or worst guess indicator
export type BestWorstGuess = {
  nickname: string;
  distanceKm: number;
  country?: string;
  countryFlag?: string;
};

// Game highlights types
export type StatFragment = {
  label: string;
  value: string | number;
  icon?: ReactNode;
};

export type StatMoment = {
  label: string;
  value: string;
  icon?: ReactNode;
  description?: string;
};

// Individual leaderboard item
export type IndividualLeaderboardItem = {
  id: string;
  nickname: string;
  icon: string;
  color: string;
  score: number;
  countryFlag?: string;
  countryCode?: string;
  country?: string;
};

// Team leaderboard item
export type TeamLeaderboardItem = {
  team: string;
  score: number;
  players: Player[];
};

// Union type for leaderboard items
export type LeaderboardItem = IndividualLeaderboardItem | TeamLeaderboardItem;

// Complete round results
export type RoundResults = {
  gameId?: string;
  photo: {
    id: string;
    url: string;
    lat?: number;
    lon?: number;
    uploaderId: string;
    title?: string;
    captureDate?: string;
    manualLocation?: boolean;
    country?: string;
    region?: string;
    countryFlag?: string;
    countryCode?: string; // ISO 3166-1 alpha-2 code for translation
  };
  results: Result[];
  leaderboard: LeaderboardItem[];
  best: BestWorstGuess;
  worst: BestWorstGuess;
  roundIndex: number;
  totalRounds: number;
  roundDurationMs: number;
  dateChallenge?:
    | { kind: 'before_after'; answer: 'before' | 'after'; reference: { id: string; url: string; captureDate: string } }
    | { kind: 'timeline'; answer: string[]; photos: Array<{ id: string; url: string; captureDate: string }> };
};

// Lobby name metadata for tooltip display
export type LobbyNameMetadata = {
  isRegion: boolean;
  country?: string; // Country name (normalized, uppercase) - only for regions
  isoCode?: string; // ISO 3166-1 alpha-2 code for translation - only for regions
  continent?: string; // Continent name - only for countries
};

export interface LobbyConstraints {
  maxPlayersPerLobby: number;
  maxPhotosPerPlayer: number;
  allowAllMaps: boolean;
  allowAIGuessing: boolean;
  allowAutoNaming: boolean;
  allowVisionCommentary: boolean;
}

// Main lobby state
export interface Lobby {
  id: string; // Display name (country or region) - same as lobby code
  gameId?: string | null;
  nameMetadata?: LobbyNameMetadata; // Metadata for tooltip
  hostId: string;
  state: 'waiting' | 'in_round' | 'showing_results' | 'finished';
  constraints: LobbyConstraints;
  settings: GameSettings;
  roundIndex: number;
  totalRounds: number;
  players: Player[];
  photos: Photo[];

  // Fields for reconnection state restoration
  currentRoundPhoto?: Photo | null;
  roundStartAt?: number | null;
  firstGuessAt?: number | null;
  lastRoundResults?: RoundResults | null;
  roundHistory?: RoundResults[];
  currentGuesses?: Record<string, { lat?: number; lon?: number; date?: string; dateChoice?: 'before' | 'after'; photoOrder?: string[]; uploaderId?: string; timeTakenMs: number }> | null;
  roundDurationMs?: number;
  aiTipIndex?: number | null;
}
