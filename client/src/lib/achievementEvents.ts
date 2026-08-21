const ACHIEVEMENT_EVENTS_STORAGE_KEY = 'spottheshot-achievement-events';
const MAX_STORED_EVENTS = 2000;
const memoryEvents = new Set<string>();

function readEvents(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACHIEVEMENT_EVENTS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

/** Atomically claims a client-side achievement event across remounts/reloads. */
export function claimAchievementEvent(eventId: string): boolean {
  if (!eventId) return false;
  if (memoryEvents.has(eventId)) return false;
  const events = readEvents();
  if (events.includes(eventId)) return false;
  memoryEvents.add(eventId);
  try {
    localStorage.setItem(
      ACHIEVEMENT_EVENTS_STORAGE_KEY,
      JSON.stringify([...events, eventId].slice(-MAX_STORED_EVENTS)),
    );
  } catch {
    // In private/restricted storage, in-memory component guards still apply.
  }
  return true;
}

export function clearAchievementEvents(): void {
  memoryEvents.clear();
  try {
    localStorage.removeItem(ACHIEVEMENT_EVENTS_STORAGE_KEY);
  } catch {
    // No-op when storage is unavailable.
  }
}
