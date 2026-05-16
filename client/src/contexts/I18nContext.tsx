import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { type Language, type TranslationKey, SUPPORTED_LANGUAGES } from '../lib/translations'
import { loadLocale } from '../lib/i18n'
import { logger } from '../lib/logger'

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>, fallback?: string) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

const LANGUAGE_STORAGE_KEY = 'geo-snap-language'

function toHumanReadableEnglish(key: string): string {
  const raw = key.includes('.') ? key.split('.').pop() || key : key
  return raw
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { t: i18n_t, i18n } = useTranslation()
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null
    if (saved && (SUPPORTED_LANGUAGES as string[]).includes(saved)) return saved
    const detected = i18n.language?.split('-')[0] as Language
    return (SUPPORTED_LANGUAGES as string[]).includes(detected) ? detected : 'en'
  })

  // On mount: ensure the initial language's locale is loaded then apply it.
  useEffect(() => {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null
    const target: Language =
      saved && (SUPPORTED_LANGUAGES as string[]).includes(saved)
        ? (saved as Language)
        : (() => {
            const detected = i18n.language?.split('-')[0] as Language
            return (SUPPORTED_LANGUAGES as string[]).includes(detected) ? detected : 'en'
          })()

    if (target === 'en') {
      i18n.changeLanguage('en')
      setLanguageState('en')
    } else {
      loadLocale(target).then(() => {
        i18n.changeLanguage(target)
        setLanguageState(target)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback((lang: Language) => {
    if (!(SUPPORTED_LANGUAGES as string[]).includes(lang)) return
    loadLocale(lang).then(() => {
      i18n.changeLanguage(lang)
      setLanguageState(lang)
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
      } catch (e) {
        logger.error('Failed to save language preference', e)
      }
    })
  }, [i18n])

  const t = useCallback((key: TranslationKey, vars?: Record<string, string | number>, fallback?: string): string => {
    let templateKey = key
    if (vars?.gender && ['it', 'fr', 'es', 'de', 'ru'].includes(language)) {
      const genderSuffix = `_${vars.gender}`
      const pluralMatch = key.match(/^(.+?)(_one|_other|_many|_zero|_two|_few)?$/)
      if (pluralMatch) {
        const base = pluralMatch[1]!
        const pluralSuffix = pluralMatch[2] || ''
        const genderKey = `${base}${genderSuffix}${pluralSuffix}`
        const genderTemplate = i18n_t(genderKey, vars)
        if (genderTemplate !== genderKey) templateKey = genderKey as TranslationKey
      }
    }

    const translated = i18n_t(templateKey, vars)
    if (translated === templateKey) return fallback || toHumanReadableEnglish(templateKey)
    return translated
  }, [i18n_t, language])

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
