import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import type { Language } from './translations';
import enTranslations from './locales/en';

// English is bundled synchronously so it's always available as a fallback.
// All other locales are loaded on demand via loadLocale().
const loadedLocales = new Set<Language>(['en']);

const localeImporters: Record<Language, () => Promise<{ default: Record<string, string> }>> = {
  en: () => import('./locales/en'),
  fr: () => import('./locales/fr'),
  it: () => import('./locales/it'),
  es: () => import('./locales/es'),
  de: () => import('./locales/de'),
  ru: () => import('./locales/ru'),
};

export async function loadLocale(lang: Language): Promise<void> {
  if (loadedLocales.has(lang)) return;
  const { default: dict } = await localeImporters[lang]!();
  i18n.addResourceBundle(lang, 'translation', dict, true, true);
  loadedLocales.add(lang);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: enTranslations } },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'it', 'es', 'de', 'ru'],
    debug: false,
    interpolation: {
      escapeValue: false,
      prefix: '{',
      suffix: '}'
    },
    detection: {
      order: ['navigator', 'htmlTag'],
      caches: []
    }
  });

export default i18n;
