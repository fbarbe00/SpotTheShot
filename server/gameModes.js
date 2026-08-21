export const GAME_TYPES = Object.freeze(['spot', 'date', 'uploader']);

export const GAME_MODE_DEFINITIONS = Object.freeze({
  spot: Object.freeze({ guessKind: 'location', requiresLocation: true, requiresDate: false, hidesUploaderDuringRound: false }),
  date: Object.freeze({ guessKind: 'date', requiresLocation: false, requiresDate: true, hidesUploaderDuringRound: false }),
  uploader: Object.freeze({ guessKind: 'player', requiresLocation: false, requiresDate: false, hidesUploaderDuringRound: true }),
});

export function normalizeGameType(value) {
  return GAME_TYPES.includes(value) ? value : 'spot';
}

export function gameModeDefinition(gameType) {
  return GAME_MODE_DEFINITIONS[normalizeGameType(gameType)];
}

export function guessPayloadForMode(gameType, dateSubmode, payload = {}) {
  const guessKind = gameModeDefinition(gameType).guessKind;
  if (guessKind === 'date') {
    if (dateSubmode === 'before_after') return { dateChoice: payload.dateChoice };
    if (dateSubmode === 'timeline') return { photoOrder: payload.photoOrder };
    return { date: payload.date };
  }
  if (guessKind === 'player') return { uploaderId: payload.uploaderId };
  return { lat: payload.lat, lon: payload.lon };
}

export function aiTipCountForMode(gameType, dateSubmode) {
  if (gameType === 'spot') return 50;
  if (gameType === 'date' && ['before_after', 'timeline'].includes(dateSubmode)) return 8;
  return 12;
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function buildBeforeAfterChallenge(currentPhoto, photos, random = Math.random) {
  const references = photos.filter(photo =>
    photo.id !== currentPhoto.id && photo.captureDate !== currentPhoto.captureDate
  );
  const reference = references[Math.floor(random() * references.length)];
  if (!reference) return null;
  return {
    kind: 'before_after',
    reference,
    answer: currentPhoto.captureDate < reference.captureDate ? 'before' : 'after',
  };
}

export function buildTimelineChallenge(currentPhoto, photos, random = Math.random) {
  const candidatesByDate = new Map();
  for (const photo of photos) {
    if (photo.id === currentPhoto.id || photo.captureDate === currentPhoto.captureDate) continue;
    const group = candidatesByDate.get(photo.captureDate) || [];
    group.push(photo);
    candidatesByDate.set(photo.captureDate, group);
  }
  const selectedDates = shuffled([...candidatesByDate.keys()], random).slice(0, 2);
  if (selectedDates.length !== 2) return null;
  const selected = selectedDates.map(date => {
    const group = candidatesByDate.get(date);
    return group[Math.floor(random() * group.length)];
  });
  const challengePhotos = [currentPhoto, ...selected];
  const answer = [...challengePhotos]
    .sort((a, b) => a.captureDate.localeCompare(b.captureDate))
    .map(photo => photo.id);
  return { kind: 'timeline', photos: shuffled(challengePhotos, random), answer };
}

/**
 * Build all card-based date rounds at once so an uploaded photo can only
 * appear in a single challenge. Photos left over after making complete,
 * playable groups are intentionally not used.
 */
export function buildDateChallengePlan(submode, photos, random = Math.random) {
  const groupSize = submode === 'before_after' ? 2 : submode === 'timeline' ? 3 : 0;
  if (!groupSize) return [];

  const buckets = new Map();
  for (const photo of shuffled(photos, random)) {
    const bucket = buckets.get(photo.captureDate) || [];
    bucket.push(photo);
    buckets.set(photo.captureDate, bucket);
  }

  const groups = [];
  while (true) {
    // Shuffle before sorting so equally sized date buckets do not always win
    // ties in insertion order. Taking the largest buckets preserves the best
    // chance of forming further groups with distinct dates.
    const available = shuffled(
      [...buckets.values()].filter(bucket => bucket.length > 0),
      random,
    ).sort((a, b) => b.length - a.length);
    if (available.length < groupSize) break;
    groups.push(available.slice(0, groupSize).map(bucket => bucket.pop()));
  }

  return groups.map(group => {
    const roundPhotos = shuffled(group, random);
    const currentPhoto = roundPhotos[0];
    if (submode === 'before_after') {
      const reference = roundPhotos[1];
      return {
        currentPhoto,
        challenge: {
          kind: 'before_after',
          reference,
          answer: currentPhoto.captureDate < reference.captureDate ? 'before' : 'after',
        },
      };
    }

    const answer = [...roundPhotos]
      .sort((a, b) => a.captureDate.localeCompare(b.captureDate))
      .map(photo => photo.id);
    return {
      currentPhoto,
      challenge: { kind: 'timeline', photos: roundPhotos, answer },
    };
  });
}
