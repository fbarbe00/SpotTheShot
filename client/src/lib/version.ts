export const APP_VERSION = '1.7.0';
export const VERSION_STORAGE_KEY = 'spottheshot-last-seen-version';

export type VersionLogEntry = {
  version: string;
  date: string;
  notes: string[];
};

export const VERSION_LOG: VersionLogEntry[] = [
  {
    version: '1.7.0',
    date: '2026-05-01',
    notes: [
      '🔒 Photos are now better protected.',
      '🤖 AI-generated titles, hints, and comments should be more consistent and less likely to trail off.',
      '🌍 Improved Russian text throughout the game.',
      '⚙️ Setup is more reliable for self-hosted games.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-03-31',
    notes: [
      '🗺️ New end-of-game map showing all photo locations and player guesses from the entire game.',
      '⏱️ Fixed timer display issues - countdown now runs smoothly without flickering.',
      '🎯 Game highlights are now smarter - no longer showing redundant moments when you score perfectly.',
      '🔗 Fixed lobby sharing to properly handle special characters in lobby IDs.',
      '📚 You can view the tutorial at any time on the join/create lobby screen.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-03-23',
    notes: [
      '🚀 Significantly improved loading times and performance through smart resource management.',
      '🌍 Better translation coverage and accuracy across all supported languages.',
      '✨ Refined user interface and clearer game feedback.',
      '🎨 Fixed various visual glitches and improved mobile responsiveness.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-17',
    notes: [
      '🌍 Added Russian language support - game now available in 6 languages.',
      '🎨 Improved language selector - better mobile support and cleaner design.',
      '📝 Enhanced translations across the entire game experience.',
      '🌟 Game highlights now feature color-coded statistics for easier reading.',
      '📱 Better responsive design across mobile and desktop views.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-17',
    notes: [
      '🐛 Fixed round highlights display errors.',
      '🔢 Fixed distance and number formatting in game highlights.',
      '🌍 Fixed translations in notifications and map tooltips.',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-03-09',
    notes: [
      '🐛 Fixed translations and connection issues that were causing crashes.',
      '🔧 Optimized cache management - disabled cache size limits since caches are naturally bounded by photo lifetime.',
      '🎨 Various UI improvements, component refactoring, and removed redundant code.',
      '📊 Single leaderboard implementation for round results.',
      '📅 Added image capture date display - when enabled in settings, shows when photos were taken (from EXIF metadata).',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-03-02',
    notes: [
      '🐛 Bug fixes and stability improvements.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-03-02',
    notes: [
      '🌍 Full multi-language support: Game now speaks English, French, Italian, Spanish, and German - including all UI, game highlights, and achievements.',
      '🏆 Enhanced achievements system with better tracking, notifications, and progress display.',
      'New confetti effects and visual improvements for a more celebratory experience.',
      'Better mobile support with responsive design improvements.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-02-22',
    notes: [
      'The photo now has tiny zoom buttons so you can inspect clues like a detective with a magnifying glass.',
      'Your nickname remembers you, so you can jump in without typing it every time.',
      'A fresh "what changed" now shows what new features have been added.'
    ],
  },
  {
    version: '1.0.2',
    date: '2026-02-21',
    notes: [
      'Improved AI auto-naming hints.',
      'Lobby names are now random region or country names in the world.'
    ],
  },
  {
    version: '1.0.1',
    date: '2026-02-19',
    notes: [
      'Achievements arrived: shiny milestones to celebrate your wild guesses and clutch rounds.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-02-17',
    notes: [
      'SpotTheShot was born. The first map pin hit the globe.',
    ],
  },
];

function parseVersion(value: string): number[] {
  return value
    .split('.')
    .map(part => Number(part))
    .filter(part => Number.isFinite(part));
}

export function isVersionNewer(current: string, previous: string): boolean {
  const currentParts = parseVersion(current);
  const previousParts = parseVersion(previous);
  const length = Math.max(currentParts.length, previousParts.length);

  for (let i = 0; i < length; i++) {
    const a = currentParts[i] ?? 0;
    const b = previousParts[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

export function getVersionNotesSince(previousVersion: string): VersionLogEntry[] {
  return VERSION_LOG.filter(entry => isVersionNewer(entry.version, previousVersion));
}
