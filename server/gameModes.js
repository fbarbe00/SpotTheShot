export const GAME_TYPES = Object.freeze(['spot', 'date', 'uploader']);

export const GAME_MODE_DEFINITIONS = Object.freeze({
  spot: Object.freeze({ guessKind: 'location', requiresLocation: true, requiresDate: false, hidesUploaderDuringRound: false, aiTipCount: 50 }),
  date: Object.freeze({ guessKind: 'date', requiresLocation: false, requiresDate: true, hidesUploaderDuringRound: false, aiTipCount: 8 }),
  uploader: Object.freeze({ guessKind: 'player', requiresLocation: false, requiresDate: false, hidesUploaderDuringRound: true, aiTipCount: 8 }),
});

export function normalizeGameType(value) {
  return GAME_TYPES.includes(value) ? value : 'spot';
}

export function gameModeDefinition(gameType) {
  return GAME_MODE_DEFINITIONS[normalizeGameType(gameType)];
}
