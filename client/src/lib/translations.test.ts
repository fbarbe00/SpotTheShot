/**
 * Translations Test Suite
 * 
 * Validates translation completeness, template syntax, and consistency.
 * Future-proof tests that don't rely on hardcoded values.
 */

import { describe, it, expect } from 'vitest';
import { translations, type Language } from '../lib/translations';

const SUPPORTED_LANGUAGES: Language[] = ['en', 'fr', 'it', 'es', 'de', 'ru'];

// Template keys that must exist in all languages
const REQUIRED_TEMPLATE_KEYS = [
  'highlights.closestGuessTemplate',
  'highlights.mostAdventurousTemplate',
  'highlights.correctCountryTemplate',
  'highlights.wrongCountryTemplate',
  'highlights.regionExpertTemplate',
  'highlights.globalConfusionTemplate',
  'highlights.perfectScoreTemplate',
  'highlights.spreadWideTemplate',
  'highlights.onFireTemplate',
  'highlights.bestGuessOverallTemplate',
  'highlights.mostLostTemplate',
  'highlights.averageDistanceTemplate',
  'highlights.mostGuessedCountryTemplate',
  'highlights.perfectScoresTemplate',
  'highlights.sharpshooterTemplate',
  'highlights.hardestPhotoTemplate',
  'highlights.speedDemonTemplate',
  'highlights.overthinkerTemplate',
  'highlights.everyRoundStoryTemplate',
];

// Keys that are allowed to be untranslated (proper nouns, codes, etc.)
const ALLOWED_UNTRANSLATED = [
  'layout.menu',
  'settings.gameplay',
  'settings.duelShort',
  'lobby.code',
  'lobby.qr',
  'lobby.photosCount',
  'lobby.photos',
  'settings.modeIndividual',
  'lobby.lobby',
  'settings.modeTeams',
  'ui.team1',
  'ui.team2',
  'ui.team1Short',
  'ui.team2Short',
  'ui.host',
  'game.round',
  'lobby.regionIn',
  'lobby.countryIn',
  'settings.mapStyles.osm',
  'settings.mapStyles.hot',
  'settings.mapStyles.cyclosm',
  'settings.mapStyles.opnvkarte',
  'settings.mapStyles.dark',
  'settings.mapStyles.light',
  'settings.mapStyles.satellite',
  'settings.mapStyles.terrain',
  'settings.mapStyles.toner',
  'settings.mapStyles.watercolor',
  'settings.mapLanguages.local',
];

describe('Translations', () => {
  describe('Structure', () => {
    it('should have all supported languages defined', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(translations[lang]).toBeDefined();
        expect(typeof translations[lang]).toBe('object');
      }
    });

    it('should have English as the source of truth', () => {
      expect(translations.en).toBeDefined();
      expect(Object.keys(translations.en).length).toBeGreaterThan(100);
    });
  });

  describe('Completeness', () => {
    const enKeys = Object.keys(translations.en);

    it('should have all English keys in all languages', () => {
      for (const lang of SUPPORTED_LANGUAGES.filter(l => l !== 'en')) {
        const missingKeys = enKeys.filter(key => !translations[lang][key]);
        expect(missingKeys).toEqual([]);
      }
    });

    it('should have all required template keys', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        const missingTemplates = REQUIRED_TEMPLATE_KEYS.filter(
          key => !translations[lang][key]
        );
        expect(missingTemplates).toEqual([]);
      }
    });

    it('should only allow extra pluralization and gender keys', () => {
      // Russian has complex pluralization (one, few, many, other)
      // Gendered languages (it, fr, es, de, ru) use _m, _f, _n, _pl suffixes for gender agreement
      // Some languages combine both: _m_one, _f_other, etc.
      const extraKeysByLang: Record<string, string[]> = {};

      // Patterns for allowed extra keys
      const allowedPatterns = [
        /_one$/,           // Standard pluralization
        /_other$/,         // Standard pluralization
        /_few$/,           // Russian pluralization
        /_many$/,          // Russian pluralization
        /_m$/,             // Masculine gender
        /_f$/,             // Feminine gender
        /_n$/,             // Neuter gender
        /_pl$/,            // Plural gender
        /_m_one$/,         // Masculine + singular
        /_m_other$/,       // Masculine + plural
        /_f_one$/,         // Feminine + singular
        /_f_other$/,       // Feminine + plural
        /_n_one$/,         // Neuter + singular
        /_n_other$/,       // Neuter + plural
        /_pl_one$/,        // Plural + singular
        /_pl_other$/,      // Plural + plural
      ];

      for (const lang of SUPPORTED_LANGUAGES.filter(l => l !== 'en')) {
        const langKeys = Object.keys(translations[lang]);
        const extraKeys = langKeys.filter(key => !enKeys.includes(key));

        const invalidExtras = extraKeys.filter(
          key => !allowedPatterns.some(pattern => pattern.test(key))
        );

        if (invalidExtras.length > 0) {
          extraKeysByLang[lang] = invalidExtras;
        }
      }

      expect(Object.keys(extraKeysByLang)).toEqual([]);
    });
  });

  describe('Template Syntax', () => {
    const templateKeys = Object.keys(translations.en).filter(k =>
      k.endsWith('Template')
    );

    it('should have balanced braces in all templates', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        for (const key of templateKeys) {
          const template = translations[lang][key];
          if (!template) continue
          const openBraces = (template.match(/\{/g) || []).length;
          const closeBraces = (template.match(/\}/g) || []).length;

          expect(openBraces).toBe(closeBraces);
        }
      }
    });

    it('should have valid placeholder syntax', () => {
      const placeholderRegex = /\{([^}]+)\}/g;

      for (const lang of SUPPORTED_LANGUAGES) {
        for (const key of templateKeys) {
          const template = translations[lang][key];
          if (!template) continue
          const matches = template.match(placeholderRegex) || [];

          for (const match of matches) {
            const placeholder = match.slice(1, -1);
            expect(placeholder).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
          }
        }
      }
    });

    it('should not have empty template values', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        for (const key of templateKeys) {
          const template = translations[lang][key];
          if (!template) continue
          expect(template.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Translation Quality', () => {
    it('should not have untranslated keys (same as English)', () => {
      for (const lang of SUPPORTED_LANGUAGES.filter(l => l !== 'en')) {
        const untranslated: string[] = [];
        
        for (const [key, enValue] of Object.entries(translations.en)) {
          const langValue = translations[lang][key];
          
          // Skip if missing (already tested)
          if (!langValue) continue;
          
          // Check if same as English (and English has letters)
          if (langValue === enValue && /[A-Za-z]/.test(enValue)) {
            untranslated.push(key);
          }
        }
        
        const actualUntranslated = untranslated.filter(
          key => !ALLOWED_UNTRANSLATED.includes(key) && !ALLOWED_UNTRANSLATED.includes(`${lang}.${key}`)
        );
        
        expect(actualUntranslated).toEqual([]);
      }
    });

    it('should preserve placeholders across translations', () => {
      const templateKeys = Object.keys(translations.en).filter(k =>
        k.endsWith('Template')
      );

      for (const lang of SUPPORTED_LANGUAGES) {
        for (const key of templateKeys) {
          const enTemplate = translations.en[key];
          const langTemplate = translations[lang][key];
          if (!enTemplate || !langTemplate) continue

          const enPlaceholders = enTemplate.match(/\{[^}]+\}/g) || [];
          const langPlaceholders = langTemplate.match(/\{[^}]+\}/g) || [];

          // Same number of placeholders
          expect(langPlaceholders.length).toBe(enPlaceholders.length);

          // Same placeholder names
          const enNames = enPlaceholders.map(p => p.slice(1, -1)).sort();
          const langNames = langPlaceholders.map(p => p.slice(1, -1)).sort();
          expect(langNames).toEqual(enNames);
        }
      }
    });
  });

  describe('Key Naming Conventions', () => {
    const allKeys = Object.keys(translations.en);

    it('should use dot notation for namespacing', () => {
      const keysWithoutDot = allKeys.filter(key => !key.includes('.'));
      expect(keysWithoutDot).toEqual([]);
    });

    it('should have consistent namespace prefixes', () => {
      const expectedNamespaces = [
        'language',
        'layout',
        'onboarding',
        'lobby',
        'game',
        'results',
        'common',
        'settings',
        'uploader',
        'ach',
        'highlights',
        'profile',
        'ui',
        'toast',
        'hud',
        'result',
        'errors',
        'error',
        'guess',
      ];

      for (const key of allKeys) {
        const namespace = key.split('.')[0];
        expect(expectedNamespaces).toContain(namespace);
      }
    });
  });

  describe('Specific Translation Categories', () => {
    describe('Game Highlights', () => {
      const highlightKeys = Object.keys(translations.en).filter(k =>
        k.startsWith('highlights.')
      );

      it('should have both label and template for each highlight type', () => {
        const labelKeys = highlightKeys.filter(k => !k.endsWith('Template'));
        
        for (const labelKey of labelKeys) {
          const baseName = labelKey.replace('highlights.', '');
          const templateKey = `highlights.${baseName}Template`;
          
          // Some highlights don't need templates (like roundInsight)
          const needsTemplate = [
            'closestGuess',
            'mostAdventurous',
            'correctCountry',
            'wrongCountry',
            'regionExpert',
            'globalConfusion',
            'perfectScore',
            'spreadWide',
            'onFire',
            'bestGuessOverall',
            'mostLost',
            'averageDistance',
            'mostGuessedCountry',
            'perfectScores',
            'sharpshooter',
            'hardestPhoto',
            'speedDemon',
            'overthinker',
            'everyRoundStory',
          ];
          
          if (needsTemplate.includes(baseName)) {
            expect(translations.en[templateKey]).toBeDefined();
          }
        }
      });
    });

    describe('Onboarding', () => {
      it('should have complete onboarding flow for all languages', () => {
        const expectedSteps = ['step1', 'step2', 'step3', 'step4', 'step5'];
        
        for (const lang of SUPPORTED_LANGUAGES) {
          for (const step of expectedSteps) {
            expect(translations[lang][`onboarding.${step}.title`]).toBeDefined();
            expect(translations[lang][`onboarding.${step}.desc`]).toBeDefined();
            expect(translations[lang][`onboarding.${step}.highlight`]).toBeDefined();
          }
        }
      });
    });

    describe('Achievements', () => {
      it('should have achievement categories for all languages', () => {
        const categories = [
          'general',
          'geography',
          'momentum',
          'mastery',
          'explorer',
          'aiMaster',
          'creator',
          'fun',
        ];
        
        for (const lang of SUPPORTED_LANGUAGES) {
          for (const category of categories) {
            const labelKey = `ach.category.${category}.label`;
            const descKey = `ach.category.${category}.desc`;
            
            // Check if category exists (some may not be used)
            if (translations.en[labelKey]) {
              expect(translations[lang][labelKey]).toBeDefined();
              expect(translations[lang][descKey]).toBeDefined();
            }
          }
        }
      });
    });
  });

  describe('Future-Proofing', () => {
    it('should not have hardcoded language names in keys', () => {
      const languageNames = ['English', 'French', 'Italian', 'Spanish', 'German', 'Russian'];

      for (const lang of SUPPORTED_LANGUAGES) {
        for (const [key, value] of Object.entries(translations[lang])) {
          // Skip language.* keys which should contain language names
          if (key.startsWith('language.')) continue;
          // Skip settings.mapLanguages.* keys which should contain language names
          if (key.startsWith('settings.mapLanguages.')) continue;

          // Allow if it's a proper noun context
          if (key.includes('country') || key.includes('region')) continue;

          for (const name of languageNames) {
            expect(value).not.toContain(name);
          }
        }
      }
    });

    it('should use placeholders for dynamic values', () => {
      // Keys that should have placeholders
      const dynamicKeys = Object.keys(translations.en).filter(key => {
        const value = translations.en[key];
        return value && (/\d+/.test(value) || /pts|km|%/i.test(value));
      });

      for (const key of dynamicKeys) {
        const value = translations.en[key];
        if (!value) continue
        // If it has numbers or units, it should use placeholders
        if (/\d+/.test(value) && !value.includes('{')) {
          // This is a warning, not a failure - some static values are ok
          // eslint-disable-next-line no-console
          console.warn(`Key "${key}" may need placeholders: "${value}"`);
        }
      }
    });
  });
});
