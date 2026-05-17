# Translation Guide for SpotTheShot

## Overview
This guide explains how translations are managed in the SpotTheShot application, covering both client-side and server-side translation approaches.

## Client-Side Translations

### Location
Client-side translations are split into per-language files:
- `client/src/lib/locales/en.ts` — English (source of truth / fallback)
- `client/src/lib/locales/fr.ts` — French
- `client/src/lib/locales/it.ts` — Italian
- `client/src/lib/locales/es.ts` — Spanish
- `client/src/lib/locales/de.ts` — German
- `client/src/lib/locales/ru.ts` — Russian
- `client/src/lib/i18n.ts` — i18next initialisation (English bundled synchronously; others loaded on demand)
- `client/src/contexts/I18nContext.tsx` — React context and `useI18n()` hook

### Supported Languages
- English (en) - default/fallback
- French (fr)
- Italian (it)
- Spanish (es)
- German (de)
- Russian (ru)

### Translation Structure
Each locale file exports a flat `Record<string, string>` object:

```typescript
const en: Record<string, string> = {
  "language.change": "Change language",
  "language.en": "English",
  // ... more translations
};
export default en;
```

### Translation Keys
Keys use dot notation for organization:
- `language.*` - Language selection
- `layout.*` - Layout elements
- `onboarding.*` - Onboarding tutorial
- `lobby.*` - Lobby functionality
- `game.*` - Game mechanics
- `results.*` - Results screens
- `settings.*` - Settings panels
- `uploader.*` - Photo upload interface
- `ach.*` - Achievements
- `highlights.*` - Game highlights (includes `*Template` keys)
- `profile.*` - Player profiles
- `ui.*` - UI elements
- `common.*` - Common actions
- `toast.*` - Toast notifications

### Usage in Components
Components use the `useI18n()` hook to access translations:

```typescript
import { useI18n } from "../contexts/I18nContext";

function MyComponent() {
  const { t } = useI18n();

  return <button>{t("common.cancel")}</button>;
}
```

### Variable Substitution
Translations support variable substitution using `{placeholder}` syntax:

```typescript
// In translations.ts
"results.uploaderPenaltyDesc": "{penalty}% penalty (Example: 1000 pts -> {points} pts)",

// In component - template is rendered with values substituted
t("results.uploaderPenaltyDesc", { penalty: 50, points: 500 })
```

### Fallback Mechanism
If a translation is missing:
1. Falls back to English
2. Falls back to provided fallback text
3. Converts key to human-readable English (e.g., "settings.gameMode" → "Game Mode")

## Server-Side Architecture

### Translation Philosophy
The server follows a **clean separation of concerns** where:

1. **Server** handles raw data and business logic only
2. **Client** handles all user-facing translations and presentation
3. **Vision model** receives language context for AI-generated content

### Server Responsibilities
- Pass raw error codes/messages to client
- Provide language preference context when needed
- Handle vision model language parameters
- Maintain `VALID_LANGUAGES` array for validation

### Error Handling Pattern
The server sends error information to the client, which then translates it:

```javascript
// Server sends raw error information
socket.emit('error_msg', {
  code: 'INVALID_COORDINATES',
  message: 'Invalid coordinates',
  details: { x: 1000, y: 2000 }
});

// Client translates based on user language
const { t } = useI18n();
const errorMessage = t(`errors.${error.code}`, error.details);
```

### Vision Model Language Handling
The server passes the lobby language to vision services for AI-generated content:

```javascript
// server/visionClient.js
function buildCommentaryPrompt(language, region, country, guessedRegion, guessedCountry) {
  const lang = normalizeLanguage(language);
  // AI model generates content in the specified language
}
```

### Language Validation
The server maintains a single source of truth for valid languages:

```javascript
// server/server.js and server/visionClient.js
const VALID_LANGUAGES = ['en', 'fr', 'it', 'es', 'de', 'ru'];
```

## Translation Process

### Adding a New Language
1. Create `client/src/lib/locales/<code>.ts` with all keys from `en.ts`
2. Add the language code to the `Language` type in `client/src/lib/i18n.ts`
3. Register the dynamic import for the new locale in `client/src/lib/i18n.ts`
4. Add language to `VALID_LANGUAGES` arrays in both `server/server.js` and `server/visionClient.js`
5. Add language to `LANGUAGE_OPTIONS` in `client/src/components/LanguageSelector.tsx`
6. Add browser language detection mapping in `client/src/contexts/I18nContext.tsx`

### Adding New Translation Keys
1. Add the key to `client/src/lib/locales/en.ts` first
2. Add the same key to all other locale files (`fr.ts`, `it.ts`, `es.ts`, `de.ts`, `ru.ts`)
3. Use the key in components via `t("key.path")`
4. Run `npm run check-translations` from the `client/` directory to validate

### Adding Template Keys
For dynamic content (like GameHighlights), use template keys ending in `Template`:

1. Add template with placeholders: `"highlights.exampleTemplate": "{player} did {action}"`
2. In component, use `createMoment()` with template and params
3. Add highlights array for styled elements (players, countries)

### Updating Translations
1. Modify the appropriate locale file in `client/src/lib/locales/`
2. Test in the UI with that language selected
3. Run `npm run check-translations` from `client/` to validate
4. Verify fallback works if translation is missing

## Best Practices

### Key Naming
- Use consistent naming conventions (`category.feature`)
- Use descriptive keys that indicate context
- Template keys should end with `Template` suffix

### Translation Quality
- Ensure all keys exist in all languages
- Use `{variable}` syntax for dynamic content
- Test with missing translations to verify fallback behavior
- Avoid concatenating translated strings

### Code Organization
- Keep `VALID_LANGUAGES` synchronized between server files
- Use TypeScript types for language codes (type safety)
- Document translation patterns for new contributors
- Avoid hardcoded language counts in code

## Template-Based System

### GameHighlights Component
The `client/src/components/result/GameHighlights.tsx` component uses a **pure template-based translation system**:

```typescript
// Create a stat moment with template
createMoment(
  "🎯",
  t("highlights.closestGuess"),
  t("highlights.closestGuessTemplate"),  // Template string
  { player: "Alice", distance: "5 km" },  // Parameters
  [{ key: 'player', type: 'player', value: "Alice", color: "#ff0000" }]  // Styled highlights
)
```

**Benefits:**
- Complete sentence templates preserve grammar structure
- Proper handling of player names, countries, and numbers
- Language-specific word order and grammatical cases
- No fragment concatenation issues

### Template Syntax
Templates use `{placeholder}` syntax for variable substitution:

```typescript
// English
"highlights.exampleTemplate": "{player} guessed {country} correctly"

// Russian (different word order)
"highlights.exampleTemplate": "{country} был угадан игроком {player}"

// German (compound structures)
"highlights.exampleTemplate": "{player} hat {country} richtig geraten"
```

## Project Structure

```
client/
├── src/
│   ├── lib/
│   │   ├── locales/
│   │   │   ├── en.ts                # English (source of truth)
│   │   │   ├── fr.ts                # French
│   │   │   ├── it.ts                # Italian
│   │   │   ├── es.ts                # Spanish
│   │   │   ├── de.ts                # German
│   │   │   └── ru.ts                # Russian
│   │   └── i18n.ts                  # i18next initialisation
│   ├── contexts/
│   │   └── I18nContext.tsx          # Translation context provider + useI18n()
│   └── components/
│       ├── LanguageSelector.tsx     # Language dropdown
│       └── result/
│           └── GameHighlights.tsx   # Template-based stats
├── scripts/
│   └── check-translations.cjs       # Translation audit script
└── package.json                     # npm run check-translations

server/
├── server.js                        # VALID_LANGUAGES for API
└── visionClient.js                  # VALID_LANGUAGES for AI
```

## Validation & Testing

### Automated Checks
Run the translation audit script:

```bash
cd client
npm run check-translations
```

This validates:
- All languages have the same keys as English
- No untranslated keys (same value as English)
- Template syntax consistency
- Required template keys exist

### Manual Testing
1. Switch to each language in the UI
2. Navigate through all screens
3. Verify GameHighlights display correctly
4. Check error messages and notifications

## Troubleshooting

### Missing Translation Warning
If you see a key displayed instead of translated text:
1. Check if key exists in `translations.ts` for all languages
2. Run `npm run check-translations` to identify missing keys
3. Add the missing translation to all language objects

### Template Not Rendering
If template placeholders aren't being replaced:
1. Verify placeholder syntax: `{placeholder}` (no spaces)
2. Check that params object has matching keys
3. Ensure highlights array has correct `key` values

### Build Errors
If TypeScript complains about missing keys:
1. Add key to all language objects in `translations.ts`
2. Update type definitions if adding new language
3. Run `npm run check-translations` to validate
