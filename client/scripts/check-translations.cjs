#!/usr/bin/env node

/**
 * Comprehensive Translation Audit Script
 *
 * Validates translation completeness and consistency across all supported languages.
 * Checks both main translations (translations.ts) and achievement translations (achievementI18n.ts).
 *
 * Checks:
 * 1. All languages have the same keys as English (source of truth)
 * 2. No untranslated keys (same value as English)
 * 3. Template syntax consistency ({placeholder} format)
 * 4. Required template keys exist for all languages
 * 5. Achievement translations are complete for all languages
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.resolve(__dirname, '../src/lib/locales');
const ACHIEVEMENT_I18N_FILE = path.resolve(__dirname, '../src/lib/achievementI18n.ts');
const SUPPORTED_LANGUAGES = ['en', 'fr', 'it', 'es', 'de', 'ru'];

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

console.log('🔍 Translation Audit\n');
console.log(`Locales directory: ${LOCALES_DIR}`);
console.log(`Achievement translations: ${ACHIEVEMENT_I18N_FILE}`);
console.log(`Languages: ${SUPPORTED_LANGUAGES.join(', ')}\n`);

let hasErrors = false;

// ============================================================================
// PART 1: Main Translations Check
// ============================================================================

console.log('═══════════════════════════════════════════════════════════');
console.log('PART 1: Main Translations (translations.ts)');
console.log('═══════════════════════════════════════════════════════════\n');

function readLocaleFile(language) {
  const file = path.join(LOCALES_DIR, `${language}.ts`);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}

function parseTranslationKeys(block) {
  const keys = {};
  const regex = /"([^"]+)"\s*:\s*"((?:\\.|[^"\\])*)"\s*,?/g;
  let match;

  while ((match = regex.exec(block)) !== null) {
    const key = match[1];
    const value = match[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'");
    keys[key] = value;
  }

  return keys;
}

function validateTemplateSyntax(template, key) {
  const issues = [];

  // Check for valid placeholder syntax
  const placeholders = template.match(/\{[^}]+\}/g) || [];
  for (const placeholder of placeholders) {
    const inner = placeholder.slice(1, -1).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(inner)) {
      issues.push(`Invalid placeholder syntax: ${placeholder}`);
    }
  }

  // Check for unclosed braces
  const openBraces = (template.match(/\{/g) || []).length;
  const closeBraces = (template.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    issues.push(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
  }

  return issues;
}

function isAllowedLocalizedVariant(key) {
  return /^highlights\.[A-Za-z0-9]+Template_(m|f|n|pl)(_(one|other|many|zero|two|few))?$/.test(key);
}

// Parse all languages
const translations = {};
for (const lang of SUPPORTED_LANGUAGES) {
  const block = readLocaleFile(lang);
  translations[lang] = parseTranslationKeys(block);
  console.log(`✅ ${lang}: ${Object.keys(translations[lang]).length} keys`);
}

console.log('\n─────────────────────────────────────────\n');

// Check 1: Missing keys per language
console.log('📋 Check 1: Missing Keys\n');
const enKeys = Object.keys(translations.en);
for (const lang of SUPPORTED_LANGUAGES.filter(l => l !== 'en')) {
  const missing = enKeys.filter(key => !translations[lang][key]);
  if (missing.length > 0) {
    hasErrors = true;
    console.log(`❌ ${lang}: ${missing.length} missing keys`);
    missing.slice(0, 10).forEach(key => console.log(`   - ${key}`));
    if (missing.length > 10) {
      console.log(`   ... and ${missing.length - 10} more`);
    }
  } else {
    console.log(`✅ ${lang}: All keys present`);
  }
}

// Check 1b: Extra keys per language
console.log('\n📋 Check 1b: Extra Keys\n');
for (const lang of SUPPORTED_LANGUAGES.filter(l => l !== 'en')) {
  const langKeys = Object.keys(translations[lang]);
  const extra = langKeys.filter(key => !enKeys.includes(key));
  const invalidExtras = extra.filter(key => {
    if (isAllowedLocalizedVariant(key)) return false;
    if (lang === 'ru' && (key.endsWith('_many') || key.endsWith('_few'))) return false;
    return true;
  });

  if (invalidExtras.length > 0) {
    hasErrors = true;
    console.log(`❌ ${lang}: ${invalidExtras.length} unexpected extra keys`);
    invalidExtras.slice(0, 10).forEach(key => console.log(`   - ${key}`));
  } else if (extra.length > 0) {
    console.log(`✅ ${lang}: ${extra.length} expected localized variant keys`);
  } else {
    console.log(`✅ ${lang}: No extra keys`);
  }
}

// Check 2: Untranslated keys (same as English)
console.log('\n📋 Check 2: Untranslated Keys\n');
for (const lang of SUPPORTED_LANGUAGES.filter(l => l !== 'en')) {
  const untranslated = [];
  for (const key of enKeys) {
    const enValue = translations.en[key];
    const langValue = translations[lang][key];

    // Skip if missing (already reported)
    if (!langValue) continue;

    // Skip allowed untranslated keys
    if (ALLOWED_UNTRANSLATED.includes(key)) continue;

    // Check if same as English (and English has letters)
    if (langValue === enValue && /[A-Za-z]/.test(enValue)) {
      untranslated.push(key);
    }
  }

  if (untranslated.length > 0) {
    console.log(`⚠️  ${lang}: ${untranslated.length} untranslated keys`);
    untranslated.slice(0, 5).forEach(key => console.log(`   - ${key}`));
    if (untranslated.length > 5) {
      console.log(`   ... and ${untranslated.length - 5} more`);
    }
  } else {
    console.log(`✅ ${lang}: All keys translated`);
  }
}

// Check 3: Required template keys
console.log('\n📋 Check 3: Required Template Keys\n');
for (const lang of SUPPORTED_LANGUAGES) {
  const missing = REQUIRED_TEMPLATE_KEYS.filter(key => !translations[lang][key]);
  if (missing.length > 0) {
    hasErrors = true;
    console.log(`❌ ${lang}: Missing template keys: ${missing.join(', ')}`);
  } else {
    console.log(`✅ ${lang}: All template keys present`);
  }
}

// Check 4: Template syntax validation
console.log('\n📋 Check 4: Template Syntax Validation\n');
for (const lang of SUPPORTED_LANGUAGES) {
  const templateKeys = Object.keys(translations[lang]).filter(k => k.endsWith('Template'));
  let syntaxErrors = 0;

  for (const key of templateKeys) {
    const issues = validateTemplateSyntax(translations[lang][key], key);
    if (issues.length > 0) {
      syntaxErrors++;
      if (syntaxErrors <= 3) {
        console.log(`⚠️  ${lang}/${key}:`);
        issues.forEach(issue => console.log(`   - ${issue}`));
      }
    }
  }

  if (syntaxErrors === 0) {
    console.log(`✅ ${lang}: All templates have valid syntax`);
  } else {
    hasErrors = true;
    if (syntaxErrors > 3) {
      console.log(`   ... and ${syntaxErrors - 3} more syntax errors`);
    }
  }
}

// ============================================================================
// PART 2: Achievement Translations Check
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════');
console.log('PART 2: Achievement Translations (achievementI18n.ts)');
console.log('═══════════════════════════════════════════════════════════\n');

const achievementContent = fs.readFileSync(ACHIEVEMENT_I18N_FILE, 'utf8');

// Extract achievement IDs from a language block
function extractAchievementIdsFromBlock(block) {
  const ids = new Set();
  // Match lines like:   first_game: { name: '...', description: '...' },
  // Note: achievementI18n.ts uses 4 spaces for achievement entries
  const idRegex = /^    (\w+): \{/gm;
  let match;
  
  while ((match = idRegex.exec(block)) !== null) {
    const id = match[1];
    // Skip the main object keys
    if (!['en', 'fr', 'it', 'es', 'de', 'ru'].includes(id)) {
      ids.add(id);
    }
  }
  
  return ids;
}

// Get achievement IDs for a specific language
function getAchievementIdsForLanguage(lang) {
  // Find the language block: "  lang: {"
  const langStartMatch = achievementContent.match(new RegExp(`^  ${lang}: \\{`, 'm'));
  if (!langStartMatch) return new Set();
  
  const langStart = langStartMatch.index + langStartMatch[0].length;
  
  // Find the next language block or end of the main object
  const remainingContent = achievementContent.substring(langStart);
  const nextLangMatch = remainingContent.match(/^  (en|fr|it|es|de|ru): \{/m);
  
  let langEnd = achievementContent.length;
  if (nextLangMatch && nextLangMatch.index !== null) {
    // Account for the offset
    langEnd = langStart + nextLangMatch.index;
  }
  
  const langBlock = achievementContent.substring(langStart, langEnd);
  return extractAchievementIdsFromBlock(langBlock);
}

// Get achievement IDs from all languages and find the reference (language with most achievements)
const allLangIds = {};
let referenceLang = 'fr'; // French has all achievements
let maxAchievements = 0;

for (const lang of SUPPORTED_LANGUAGES) {
  const ids = getAchievementIdsForLanguage(lang);
  allLangIds[lang] = ids;
  if (ids.size > maxAchievements) {
    maxAchievements = ids.size;
    referenceLang = lang;
  }
}

const referenceAchievementIds = allLangIds[referenceLang];
console.log(`📊 Found ${referenceAchievementIds.size} achievement IDs (using ${referenceLang} as reference)\n`);

// Check each language against the reference (skip English as it uses fallback from achievementsData.ts)
console.log('📋 Check 5: Achievement Translation Completeness\n');
for (const lang of SUPPORTED_LANGUAGES.filter(l => l !== 'en')) {
  if (lang === referenceLang) {
    console.log(`✅ ${lang}: Reference language (${allLangIds[lang].size} achievements)`);
    continue;
  }
  
  const langIds = allLangIds[lang];
  const missing = [...referenceAchievementIds].filter(id => !langIds.has(id));
  const extra = [...langIds].filter(id => !referenceAchievementIds.has(id));
  
  if (missing.length > 0) {
    hasErrors = true;
    console.log(`❌ ${lang}: Missing ${missing.length} achievement translations`);
    missing.slice(0, 10).forEach(id => console.log(`   - ${id}`));
    if (missing.length > 10) {
      console.log(`   ... and ${missing.length - 10} more`);
    }
  } else if (langIds.size === 0) {
    hasErrors = true;
    console.log(`❌ ${lang}: Achievement translations are empty (should have ${referenceAchievementIds.size})`);
  } else {
    console.log(`✅ ${lang}: All ${langIds.size} achievements translated`);
  }
  
  if (extra.length > 0) {
    console.log(`⚠️  ${lang}: Has ${extra.length} extra achievements not in ${referenceLang}`);
  }
}

// English uses fallback from achievementsData.ts, so just report its status
console.log(`ℹ️  en: Uses fallback from achievementsData.ts (${allLangIds['en'].size === 0 ? 'empty' : allLangIds['en'].size + ' custom'})`);

// Check for empty translations (language block with no content)
console.log('\n📋 Check 6: Summary\n');
for (const lang of SUPPORTED_LANGUAGES.filter(l => l !== 'en')) {
  const count = allLangIds[lang].size;
  const status = count === 0 ? '❌ EMPTY' : (count === maxAchievements ? '✅ Complete' : `⚠️  ${count}/${maxAchievements}`);
  console.log(`  ${lang}: ${status}`);
}
console.log(`  en: ℹ️  Uses fallback`);

// ============================================================================
// Summary
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════\n');
if (hasErrors) {
  console.log('❌ Translation audit FAILED. Please fix the issues above.\n');
  process.exit(1);
} else {
  console.log('✅ Translation audit PASSED. All checks successful!\n');
  console.log('Summary:');
  console.log(`  - Main translations: ${enKeys.length} keys across ${SUPPORTED_LANGUAGES.length} languages`);
  console.log(`  - Achievement translations: ${maxAchievements} achievements across ${SUPPORTED_LANGUAGES.length} languages`);
  console.log('');
  process.exit(0);
}
