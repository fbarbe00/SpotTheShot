// Check if coordinates are valid (within Earth's bounds, proper types, not NaN)
export function isValidCoordinate(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  )
}

// Calculate great-circle distance between two geographic points
// Returns distance in kilometers using Haversine formula
export function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Generate consistent avatar color based on seed string
// Returns hex color from predefined palette
export function pickAvatarColor(seed) {
  const palette = [
    "#7C3AED", "#2563EB", "#059669", "#D97706", "#DB2777",
    "#0EA5E9", "#10B981", "#F59E0B", "#E11D48", "#7DD3FC"
  ];
  return palette[Math.abs(hashCode(seed)) % palette.length];
}

// Keep in sync with client/src/lib/avatarIcons.ts.
// Server validates submitted icons against this list; divergence causes silent rejection.
export const AVATAR_ICONS = [
  "🦁", "🐯", "🐻", "🐼", "🐨",
  "🐶", "🐱", "🦊", "🐻‍❄️", "🦋",
  "🐝", "🦅", "🦉", "🦆", "🐢",
  "🐘", "🦏", "🦒", "🦓", "🦔",
  "🧙", "🧚", "🦚", "🧜", "🦖",
  "🐿️", "🦘", "🦄", "🐉", "🐲"
];

// Generate consistent avatar icon/emoji based on seed string
export function pickAvatarIcon(seed) {
  return AVATAR_ICONS[Math.abs(hashCode(seed)) % AVATAR_ICONS.length];
}

// Simple hash function for consistent seed-to-value mapping
// Ensures same seed always maps to same color/icon
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return h | 0;
}