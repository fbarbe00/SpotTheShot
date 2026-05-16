import type { ReactNode } from 'react';
import type { MapStyle, MapLanguage } from './mapConfig';

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
  uploaderId: string;
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
  countryFlag?: string;
  countryCode?: string; // ISO 3166-1 alpha-2 code for translation
  color?: string;
};

// Game settings configuration
export type GameSettings = {
  roundDurationSec: number;
  gameMode: 'individual' | 'teams';
  timerMode: 'fixed' | 'progressive';
  hintThresholdSec: number;
  enableAIGuessing?: boolean;
  visionCommentary?: boolean;
  autoNameImages?: boolean;
  showImageDate?: boolean;
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
  lat: number;
  lon: number;
  icon?: string;
  color: string;
  points: number;
  nickname: string;
  distanceKm: number;
  timeTakenMs: number;
  country?: string;
  region?: string;
  countryFlag?: string;
  countryCode?: string; // ISO 3166-1 alpha-2 code for translation
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
  photo: {
    id: string;
    url: string;
    lat: number;
    lon: number;
    uploaderId: string;
    title?: string;
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
  currentGuesses?: Record<string, { lat: number; lon: number; timeTakenMs: number }> | null;
  roundDurationMs?: number;
}
