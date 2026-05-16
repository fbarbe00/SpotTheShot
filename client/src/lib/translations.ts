export type Language = "en" | "fr" | "it" | "es" | "de" | "ru";
export type TranslationKey = string;

export const SUPPORTED_LANGUAGES: Language[] = ["en", "fr", "it", "es", "de", "ru"];

// Re-export all locales as a combined object.
// Used by tests and translationUtils. Production code imports locales individually
// via i18n.ts dynamic imports so this object is tree-shaken from the prod bundle.
import en from './locales/en';
import fr from './locales/fr';
import it from './locales/it';
import es from './locales/es';
import de from './locales/de';
import ru from './locales/ru';

export const translations: Record<Language, Record<string, string>> = { en, fr, it, es, de, ru };
