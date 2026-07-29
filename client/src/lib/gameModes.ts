export const GAME_TYPES = ['spot', 'date', 'uploader'] as const
export type GameType = typeof GAME_TYPES[number]

export type GuessKind = 'location' | 'date' | 'player'

export const GAME_MODE_DEFINITIONS: Record<GameType, {
  name: string
  guessKind: GuessKind
  requiresLocation: boolean
  requiresDate: boolean
  hidesUploaderDuringRound: boolean
}> = {
  spot: { name: 'SpotTheShot', guessKind: 'location', requiresLocation: true, requiresDate: false, hidesUploaderDuringRound: false },
  date: { name: 'DateTheShot', guessKind: 'date', requiresLocation: false, requiresDate: true, hidesUploaderDuringRound: false },
  uploader: { name: 'WhoTookTheShot', guessKind: 'player', requiresLocation: false, requiresDate: false, hidesUploaderDuringRound: true },
}

export function isGameType(value: unknown): value is GameType {
  return typeof value === 'string' && GAME_TYPES.includes(value as GameType)
}

export function gameModeDefinition(gameType: GameType) {
  return GAME_MODE_DEFINITIONS[gameType]
}

export const DATE_MODE_NEW_UNTIL = Date.UTC(2027, 4, 29, 23, 59, 59)
export const UPLOADER_MODE_NEW_UNTIL = Date.UTC(2027, 4, 29, 23, 59, 59)

export function isDateModeNew(now = Date.now()) {
  return now <= DATE_MODE_NEW_UNTIL
}

export function isUploaderModeNew(now = Date.now()) {
  return now <= UPLOADER_MODE_NEW_UNTIL
}
