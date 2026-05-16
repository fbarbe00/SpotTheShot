import { useI18n } from '../contexts/I18nContext'
import { Language } from '../lib/translations'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'

const LANGUAGE_OPTIONS: { code: Language; name: string; flag: string }[] = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
]

/**
 * Language selector component
 * Dropdown for users to change application language
 * Features:
 * - Outside click detection to close dropdown
 * - Keyboard accessibility
 * - Mobile-responsive design
 */
export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const currentLang = LANGUAGE_OPTIONS.find(l => l.code === language)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close dropdown on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1.5 max-w-[120px] sm:max-w-[140px] justify-between"
        title={t('language.change')}
        aria-label={t('language.change')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-xs sm:text-sm font-medium truncate">{currentLang?.flag} {currentLang?.name}</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-44 bg-surface border border-primary/20 rounded-lg shadow-lg z-50"
            role="listbox"
            aria-label={t('language.change')}
          >
            <div className="p-1.5 space-y-0.5">
              {LANGUAGE_OPTIONS.map(lang => (
                <button
                  key={lang.code}
                  role="option"
                  aria-selected={language === lang.code}
                  onClick={() => {
                    setLanguage(lang.code)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md transition-colors ${
                    language === lang.code
                      ? 'bg-primary/20 text-primary font-medium'
                      : 'hover:bg-white/10 text-text'
                  }`}
                >
                  <span className="text-base">{lang.flag}</span>
                  <span className="flex-1 text-left text-xs sm:text-sm font-medium truncate">{lang.name}</span>
                  {language === lang.code && (
                    <span className="text-primary text-base font-bold">✓</span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
