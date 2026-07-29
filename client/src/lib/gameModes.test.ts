import { describe, expect, it } from 'vitest'
import { gameModeDefinition, isDateModeNew, isUploaderModeNew } from './gameModes'

describe('DateTheShot launch badge', () => {
  it('stays visible for ten months after the 2026-07-29 launch', () => {
    expect(isDateModeNew(Date.UTC(2027, 4, 29, 23, 59, 59))).toBe(true)
    expect(isDateModeNew(Date.UTC(2027, 4, 30))).toBe(false)
  })
})

describe('extensible game-mode definitions', () => {
  it('keeps both new modes badged for the launch window', () => {
    expect(isUploaderModeNew(Date.UTC(2027, 4, 29, 23, 59, 59))).toBe(true)
    expect(isUploaderModeNew(Date.UTC(2027, 4, 30))).toBe(false)
  })

  it('defines independent requirements and guess kinds', () => {
    expect(gameModeDefinition('spot')).toMatchObject({ guessKind: 'location', requiresLocation: true })
    expect(gameModeDefinition('date')).toMatchObject({ guessKind: 'date', requiresDate: true })
    expect(gameModeDefinition('uploader')).toMatchObject({ guessKind: 'player', requiresLocation: false, requiresDate: false })
  })
})
