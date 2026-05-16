import { translations, type Language } from './translations';
import { logger } from './logger';

/**
 * Format a translation string with dynamic values
 * Supports {placeholder} syntax and *highlight* syntax
 */
export function formatTranslation(
  key: string,
  language: Language,
  values: Record<string, string | number> = {},
  highlightChar: string = '*'
): string {
  // Get the base translation
  const translation = translations[language]?.[key] ?? translations.en?.[key] ?? key;

  if (!translation) {
    logger.warn(`Missing translation for key: ${key}`);
    return key;
  }
  
  let result = translation;

  // Replace {placeholders} with values
  for (const [placeholder, value] of Object.entries(values)) {
    const regex = new RegExp(`{${placeholder}}`, 'g');
    result = result.replace(regex, String(value));
  }

  // Handle *highlight* syntax by wrapping with span tags
  if (highlightChar) {
    const highlightRegex = new RegExp(`${highlightChar}(.*?)${highlightChar}`, 'g');
    result = result.replace(highlightRegex, '<strong>$1</strong>');
  }
  
  return result;
}

/**
 * Check if all translation keys exist in all languages
 */
export function validateTranslations(): { missingKeys: Record<Language, string[]>; outdatedKeys: Record<Language, string[]> } {
  const languages = Object.keys(translations) as Language[];
  const baseLanguage = 'en' as Language;
  const baseKeys = Object.keys(translations[baseLanguage]);
  
  const missingKeys: Record<Language, string[]> = {} as Record<Language, string[]>;
  const outdatedKeys: Record<Language, string[]> = {} as Record<Language, string[]>;
  
  // Initialize all languages with empty arrays
  for (const lang of languages) {
    missingKeys[lang] = [];
    outdatedKeys[lang] = [];
  }
  
  // Check for missing keys in each language
  for (const lang of languages) {
    if (lang === baseLanguage) continue;
    
    const langKeys = Object.keys(translations[lang]);
    const missing = baseKeys.filter(key => !langKeys.includes(key));
    const outdated = langKeys.filter(key => !baseKeys.includes(key));
    
    if (missing.length > 0) {
      missingKeys[lang] = missing;
    }
    
    if (outdated.length > 0) {
      outdatedKeys[lang] = outdated;
    }
  }
  
  return { missingKeys, outdatedKeys };
}

/**
 * Get all translation keys used in the codebase
 */
export function extractUsedTranslationKeys(): string[] {
  // This would typically be done with a more sophisticated static analysis
  // For now, return all keys from the base language
  return Object.keys(translations.en);
}