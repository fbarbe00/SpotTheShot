import { describe, expect, it } from 'vitest'
import { ALL_ACHIEVEMENTS } from './achievementsData'
import { getAchievementLocalized } from './achievementI18n'
import type { Language } from './translations'

describe('game-mode achievements', () => {
  const ids = [
    'first_date_game',
    'date_bullseye',
    'date_detective',
    'calendar_regular',
    'date_marathon',
    'archive_explorer',
    'first_uploader_game',
    'uploader_detective',
    'uploader_expert',
    'identity_streak',
  ]

  it('defines every Date and uploader achievement', () => {
    const defined = new Set(ALL_ACHIEVEMENTS.map(achievement => achievement.id))
    for (const id of ids) expect(defined.has(id), id).toBe(true)
  })

  it('provides localized text in every non-English language', () => {
    const languages: Language[] = ['fr', 'it', 'es', 'de', 'ru']
    for (const language of languages) {
      for (const id of ids) {
        const localized = getAchievementLocalized(id, language, '__fallback__', '__fallback__')
        expect(localized.name, `${language}:${id}:name`).not.toBe('__fallback__')
        expect(localized.description, `${language}:${id}:description`).not.toBe('__fallback__')
      }
    }
  })
})
