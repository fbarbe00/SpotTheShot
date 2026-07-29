export const APP_VERSION = '2.2.0';
export const VERSION_STORAGE_KEY = 'spottheshot-last-seen-version';

export type VersionLogEntry = {
  version: string;
  date: string;
  notes: string[];
};

export const VERSION_LOG: VersionLogEntry[] = [
  {
    version: '2.2.0',
    date: '2026-07-29',
    notes: [
      '👥 WhoTookTheShot adds a third game: vote for the friend who uploaded each photo.',
      '🎲 The AI votes randomly and openly jokes about its random choice after the uploader is revealed.',
      '🧩 Game modes now use shared capability definitions, with safe prompts when an existing lobby changes mode.',
      '🗓️ DateTheShot now opens from a compact launcher and uses automatic photo-aware timeline bounds.',
      '📊 Every mode has a combined round leaderboard with answers, round points, totals, and transparent scoring rules.',
      '↩️ Every player can return a finished game to the shared lobby without losing or replacing their session.',
      '🏆 New translated achievements reward date accuracy, sustained play, uploader identification, and correct streaks.',
      '🔗 Invitation links preview the lobby mode in the logo and mode-specific description.',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-07-29',
    notes: [
      '📅 DateTheShot is here — guess when a photo was taken on a polished, adjustable timeline.',
      '⚙️ Choose SpotTheShot or DateTheShot when creating a lobby, or switch in lobby settings.',
      '🖼️ Capture dates can be corrected before play, with future dates blocked.',
      '🗓️ Missing dates now open a dedicated date dialog, with PNG and screenshot-date detection.',
      '🤖 The local vision AI now estimates photo dates and jokes about the era clues it got right or wrong.',
      '📊 Date results now place every player and score directly on the timeline.',
      '🏆 Date achievements have been added, and First Steps now specifically rewards a location-guessing game.',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-05-17',
    notes: [
      '🤖 The AI now whispers hints while you\'re guessing — a little speech bubble appears with its thoughts on the photo. Click the robot to dismiss it.',
      '⏰ Missed the timer? Round highlights now call out players who ran out of time.',
      '🏅 Credits and achievements are now always visible in the header — no more hunting through the menu on mobile.',
      '📱 Round results scroll properly on mobile — no more cut-off leaderboards or double-scroll weirdness.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-05-01',
    notes: [
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
