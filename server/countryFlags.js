/**
 * Country flag utilities
 * Converts ISO country codes to flag emojis
 */

/**
 * Convert ISO 3166-1 alpha-2 country code to flag emoji
 * @param {string|null} isoCode - ISO 3166-1 alpha-2 country code (e.g., "US", "FR", "JP")
 * @returns {string} Flag emoji or empty string if invalid
 */
export function isoToFlag(isoCode) {
  if (!isoCode || typeof isoCode !== 'string' || isoCode.length !== 2) {
    return '';
  }

  const upper = isoCode.toUpperCase();

  // Ensure both characters are A–Z
  if (!/^[A-Z]{2}$/.test(upper)) {
    return '';
  }

  return String.fromCodePoint(
    ...upper.split('').map(c => 0x1F1A5 + c.charCodeAt(0))
  );
}