/**
 * GameHighlights Test Suite
 * 
 * Tests for the template-based GameHighlights system.
 */

import { describe, it, expect } from 'vitest';
import { pickRoundMoments, pickGameMoments } from './GameHighlights';
import type { RoundResults } from '../../lib/types';

// Mock translation function
const mockT = (key: string): string => {
  const translations: Record<string, string> = {
    'highlights.closestGuess': 'Closest Guess',
    'highlights.mostAdventurous': 'Most Adventurous',
    'highlights.correctCountry': 'Correct Country',
    'highlights.wrongCountry': 'Wrong Country',
    'highlights.regionExpert': 'Region Expert',
    'highlights.globalConfusion': 'Global Confusion',
    'highlights.perfectScore': 'Perfect Score',
    'highlights.spreadWide': 'Spread Wide',
    'highlights.onFire': 'On Fire',
    'highlights.bestGuessOverall': 'Best Guess Overall',
    'highlights.mostLost': 'Most Lost',
    'highlights.averageDistance': 'Average Distance',
    'highlights.mostGuessedCountry': 'Most Guessed Country',
    'highlights.perfectScores': 'Perfect Scores',
    'highlights.sharpshooter': 'Sharpshooter',
    'highlights.hardestPhoto': 'Hardest Photo',
    'highlights.speedDemon': 'Speed Demon',
    'highlights.overthinker': 'Overthinker',
    // Singular templates (_one)
    'highlights.closestGuessTemplate_one': '{player} was just {distance} away',
    'highlights.mostAdventurousTemplate_one': '{player} went {distance} off course',
    'highlights.correctCountryTemplate_one': '{player} guessed {country} right',
    'highlights.wrongCountryTemplate_one': 'Everyone guessed {wrongCountry} but it was {correctCountry}',
    'highlights.regionExpertTemplate_one': '{player} nailed the region: {region}',
    'highlights.globalConfusionTemplate_one': 'Players guessed {count} different countries, but the answer was {country}',
    'highlights.perfectScoreTemplate_one': '{player} scored a flawless {points}',
    'highlights.spreadWideTemplate_one': 'Guesses ranged {distance} apart',
    'highlights.onFireTemplate_one': '{player} has a {count}-country streak!',
    'highlights.bestGuessOverallTemplate_one': '{player}\'s closest guess was {distance} off',
    'highlights.mostLostTemplate_one': '{player} once went {distance} off',
    'highlights.averageDistanceTemplate_one': 'Humans averaged {distance} off the mark',
    'highlights.mostGuessedCountryTemplate_one': '{country} was guessed {count}×',
    'highlights.perfectScoresTemplate_one': '{count} perfect scores',
    'highlights.sharpshooterTemplate_one': '{player} averaged {distance} away',
    'highlights.hardestPhotoTemplate_one': 'Round {round} averaged {distance} off',
    'highlights.speedDemonTemplate_one': '{player} guessed in {time} on average',
    'highlights.overthinkerTemplate_one': '{player} took {time} on average to guess',
    // Plural templates (_other)
    'highlights.closestGuessTemplate_other': '{player} was just {distance} away',
    'highlights.mostAdventurousTemplate_other': '{player} went {distance} off course',
    'highlights.correctCountryTemplate_other': '{player} guessed {country} right',
    'highlights.wrongCountryTemplate_other': 'Everyone guessed {wrongCountry} but it was {correctCountry}',
    'highlights.regionExpertTemplate_other': '{player} nailed the region: {region}',
    'highlights.globalConfusionTemplate_other': 'Players guessed {count} different countries, but the answer was {country}',
    'highlights.perfectScoreTemplate_other': '{player} scored a flawless {points}',
    'highlights.spreadWideTemplate_other': 'Guesses ranged {distance} apart',
    'highlights.onFireTemplate_other': '{player} has a {count}-country streak!',
    'highlights.bestGuessOverallTemplate_other': '{player}\'s closest guess was {distance} off',
    'highlights.mostLostTemplate_other': '{player} once went {distance} off',
    'highlights.averageDistanceTemplate_other': 'Humans averaged {distance} off the mark',
    'highlights.mostGuessedCountryTemplate_other': '{country} was guessed {count}×',
    'highlights.perfectScoresTemplate_other': '{count} perfect scores',
    'highlights.sharpshooterTemplate_other': '{player} averaged {distance} away',
    'highlights.hardestPhotoTemplate_other': 'Round {round} averaged {distance} off',
    'highlights.speedDemonTemplate_other': '{player} guessed in {time} on average',
    'highlights.overthinkerTemplate_other': '{player} took {time} on average to guess',
  };
  return translations[key] || key;
};

// Helper to create mock round results
const createMockRound = (overrides: Partial<RoundResults> = {}): RoundResults => ({
  roundIndex: 0,
  photo: {
    id: 'photo-1',
    url: 'https://example.com/photo.jpg',
    lat: 48.8566,
    lon: 2.3522,
    country: 'France',
    countryCode: 'FR',
    countryFlag: '🇫🇷',
    region: 'Île-de-France',
    uploaderId: 'player-1',
  },
  results: [
    {
      playerId: 'player-1',
      nickname: 'Alice',
      color: '#ff0000',
      lat: 48.8606,
      lon: 2.3376,
      country: 'France',
      countryCode: 'FR',
      countryFlag: '🇫🇷',
      region: 'Île-de-France',
      distanceKm: 1.2,
      points: 4500,
      timeTakenMs: 15000,
      isAI: false,
    },
    {
      playerId: 'player-2',
      nickname: 'Bob',
      color: '#00ff00',
      lat: 48.8738,
      lon: 2.2950,
      country: 'France',
      countryCode: 'FR',
      countryFlag: '🇫🇷',
      region: 'Île-de-France',
      distanceKm: 5.8,
      points: 2500,
      timeTakenMs: 25000,
      isAI: false,
    },
    {
      playerId: 'player-3',
      nickname: 'Charlie',
      color: '#0000ff',
      lat: 51.5074,
      lon: -0.1278,
      country: 'United Kingdom',
      countryCode: 'GB',
      countryFlag: '🇬🇧',
      region: 'England',
      distanceKm: 344.5,
      points: 100,
      timeTakenMs: 45000,
      isAI: false,
    },
  ],
  leaderboard: [],
  best: { nickname: 'Alice', distanceKm: 1.2, country: 'France', countryFlag: '🇫🇷' },
  worst: { nickname: 'Charlie', distanceKm: 344.5, country: 'United Kingdom', countryFlag: '🇬🇧' },
  totalRounds: 1,
  roundDurationMs: 45000,
  ...overrides,
});

describe('GameHighlights', () => {
  describe('pickRoundMoments', () => {
    it('should return empty array for empty round', () => {
      const emptyRound = createMockRound({ results: [] });
      const moments = pickRoundMoments(emptyRound, [], mockT);
      expect(moments).toEqual([]);
    });

    it('should generate closest guess moment', () => {
      const round = createMockRound();
      const moments = pickRoundMoments(round, [], mockT);
      
      expect(moments.length).toBeGreaterThan(0);
      const closestMoment = moments.find(m => m.label === 'Closest Guess');
      expect(closestMoment).toBeDefined();
      expect(closestMoment?.template).toContain('{player}');
      expect(closestMoment?.template).toContain('{distance}');
    });

    it('should generate correct country moment with highlights', () => {
      const round = createMockRound();
      const moments = pickRoundMoments(round, [], mockT);
      
      const correctCountryMoment = moments.find(m => m.label === 'Correct Country');
      expect(correctCountryMoment).toBeDefined();
      expect(correctCountryMoment?.params.country).toBe('France');
      
      // Verify highlights exist for both player and country
      const highlights = correctCountryMoment?.highlights || [];
      expect(highlights.some(h => h.key === 'player')).toBe(true);
      expect(highlights.some(h => h.key === 'country')).toBe(true);
    });

    it('should handle perfect scores', () => {
      const round = createMockRound({
        results: [
          {
            playerId: 'player-1',
            nickname: 'Alice',
            color: '#ff0000',
            lat: 48.8566,
            lon: 2.3522,
            country: 'France',
            countryCode: 'FR',
            countryFlag: '🇫🇷',
            region: 'Île-de-France',
            distanceKm: 0,
            points: 5000,
            timeTakenMs: 10000,
            isAI: false,
          },
        ],
      });
      
      const moments = pickRoundMoments(round, [], mockT);
      const perfectMoment = moments.find(m => m.label === 'Perfect Score');
      expect(perfectMoment).toBeDefined();
      expect(perfectMoment?.params.points).toBe('5 000 pts');
    });
  });

  describe('pickGameMoments', () => {
    it('should return empty array for empty game', () => {
      const moments = pickGameMoments([], mockT);
      expect(moments).toEqual([]);
    });

    it('should generate best guess overall moment', () => {
      const rounds = [createMockRound()];
      const moments = pickGameMoments(rounds, mockT);
      
      expect(moments.length).toBeGreaterThan(0);
      const bestGuessMoment = moments.find(m => m.label === 'Best Guess Overall');
      expect(bestGuessMoment).toBeDefined();
      expect(bestGuessMoment?.template).toContain('{player}');
    });

    it('should handle AI players correctly', () => {
      const rounds = [createMockRound({
        results: [
          { playerId: 'p1', nickname: 'Human', color: '#f00', lat: 0, lon: 0, country: 'F', countryCode: 'F', countryFlag: '🇫', region: 'R', distanceKm: 100, points: 1000, timeTakenMs: 10000, isAI: false },
          { playerId: 'ai1', nickname: 'AI', color: '#888', lat: 0, lon: 0, country: 'F', countryCode: 'F', countryFlag: '🇫', region: 'R', distanceKm: 1, points: 4900, timeTakenMs: 100, isAI: true },
        ],
      })];
      
      const moments = pickGameMoments(rounds, mockT);
      
      // Speed Demon should exclude AI
      const speedMoment = moments.find(m => m.label === 'Speed Demon');
      if (speedMoment) {
        expect(speedMoment.params.player).toBe('Human');
      }
    });
  });

  describe('Template rendering integrity', () => {
    it('should have matching params for all placeholders in moments', () => {
      const round = createMockRound();
      const roundMoments = pickRoundMoments(round, [], mockT);
      
      for (const moment of roundMoments) {
        const placeholders = moment.template.match(/\{(\w+)\}/g) || [];
        for (const placeholder of placeholders) {
          const key = placeholder.slice(1, -1);
          expect(moment.params).toHaveProperty(key);
        }
      }
    });
  });
});
