import { haversine } from './utils.js';

// World diagonal distance in km (Earth circumference / 2)
// Used as the reference "size" for score normalization
const WORLD_SIZE_KM = 20000; // ~half Earth's circumference

// Calculate score for a single guess in a round
// Score formula: 5000 * e^(-10 * distance_normalized)
// This gives diminishing returns as distance increases
// Uploaders get a penalty to prevent self-guessing advantage
export function computeRoundScore({
  guess, target, timeTakenMs, roundDurationMs, isUploader, settings
}) {
  // Calculate distance using haversine formula
  const distanceKm = haversine(guess.lat, guess.lon, target.lat, target.lon);

  // Apply exponential score formula: score = 5000 * e^(-10 * distance / size)
  const normalizedDistance = distanceKm / WORLD_SIZE_KM;
  const baseScore = Math.round(5000 * Math.exp(-10 * normalizedDistance));

  // Clamp to [0, 5000] range
  const base = Math.max(0, Math.min(5000, baseScore));

  // Apply uploader penalty: 1 - (penaltyPercent/100) multiplier to prevent cheating
  const uploaderPenaltyPercent = settings?.uploaderPenaltyPercent ?? 10;
  const penaltyMultiplier = 1 - (uploaderPenaltyPercent / 100);
  const adjusted = isUploader ? Math.round(base * penaltyMultiplier) : base;

  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    base,
    total: adjusted
  };
}