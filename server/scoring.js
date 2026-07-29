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

const DAY_MS = 86_400_000;
const DATE_SCORE_SCALE_DAYS = 10 * 365.25;

export function normalizePhotoDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const normalized = `${match[1]}-${match[2]}-${match[3]}`;
  const timestamp = Date.parse(`${normalized}T12:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== normalized) return null;
  return normalized;
}

export function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

export function defaultTimelineStart() {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 100);
  return date.toISOString().slice(0, 10);
}

export function deriveDateTimelineBounds(captureDates, random = Math.random) {
  const normalized = captureDates.map(normalizePhotoDate).filter(Boolean).sort();
  if (!normalized.length) return { start: defaultTimelineStart(), end: todayUtcDate() };
  const beforeYears = 1 + Math.floor(random() * 20);
  const afterYears = 1 + Math.floor(random() * 20);
  const startDate = new Date(`${normalized[0]}T12:00:00Z`);
  const endDate = new Date(`${normalized[normalized.length - 1]}T12:00:00Z`);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - beforeYears);
  endDate.setUTCFullYear(endDate.getUTCFullYear() + afterYears);
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10) > todayUtcDate()
      ? todayUtcDate()
      : endDate.toISOString().slice(0, 10),
  };
}

export function deriveDatePromptBounds(captureDates, today = todayUtcDate()) {
  const normalized = captureDates.map(normalizePhotoDate).filter(Boolean).sort();
  if (!normalized.length) return null;
  const startDate = new Date(`${normalized[0]}T12:00:00Z`);
  const endDate = new Date(`${normalized[normalized.length - 1]}T12:00:00Z`);
  startDate.setUTCFullYear(Math.max(1, startDate.getUTCFullYear() - 10));
  endDate.setUTCFullYear(endDate.getUTCFullYear() + 10);
  const end = endDate.toISOString().slice(0, 10);
  return {
    start: startDate.toISOString().slice(0, 10),
    end: end > today ? today : end,
  };
}

export function computeDateRoundScore({ guessDate, targetDate, isUploader, settings }) {
  const guess = normalizePhotoDate(guessDate);
  const target = normalizePhotoDate(targetDate);
  if (!guess || !target) throw new Error('Invalid date guess');

  const distanceDays = Math.abs(
    Date.parse(`${guess}T12:00:00Z`) - Date.parse(`${target}T12:00:00Z`)
  ) / DAY_MS;
  const base = Math.max(0, Math.min(5000,
    Math.round(5000 * Math.exp(-distanceDays / DATE_SCORE_SCALE_DAYS))
  ));
  const uploaderPenaltyPercent = settings?.uploaderPenaltyPercent ?? 10;
  const total = isUploader ? Math.round(base * (1 - uploaderPenaltyPercent / 100)) : base;

  return { distanceDays: Math.round(distanceDays), base, total };
}

export function computeUploaderRoundScore({ guessedUploaderId, targetUploaderId, isUploader, settings }) {
  const correct = guessedUploaderId === targetUploaderId;
  const base = correct ? 5000 : 0;
  const uploaderPenaltyPercent = settings?.uploaderPenaltyPercent ?? 10;
  const total = isUploader ? Math.round(base * (1 - uploaderPenaltyPercent / 100)) : base;
  return { correct, base, total };
}
