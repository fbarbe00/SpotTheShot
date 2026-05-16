/**
 * Client for calling geoclip lookup service
 * Fetches country and region info from coordinates
 *
 * Uses the FastGeoCLIP model from the GeoCLIP project:
 * https://github.com/VicenteVivan/geo-clip
 *
 * Map data © OpenStreetMap contributors
 * https://www.openstreetmap.org/copyright
 */

const GEOCLIP_URL = process.env.GEOCLIP_URL || 'http://geoclip:8000';

/**
 * Lookup country and region for coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<{country: string|null, region: string|null, isoCode: string|null}>}
 */
export async function lookupLocation(lat, lon) {
  try {
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      console.warn('Invalid coordinates for geoclip lookup:', lat, lon);
      return { country: null, region: null };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(`${GEOCLIP_URL}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.warn(`Geoclip lookup failed: ${response.status}`);
      return { country: null, region: null };
    }

    const data = await response.json();
    return {
      country: data.country || null,
      region: data.region || null,
      isoCode: data.iso_code || null,
    };
  } catch (error) {
    console.warn('Geoclip lookup error:', error.message);
    return { country: null, region: null, isoCode: null};
  }
}

/**
 * Batch lookup for multiple coordinates
 * @param {Array<{lat: number, lon: number}>} coords - Array of coordinates
 * @returns {Promise<Array<{country: string|null, region: string|null}>>}
 */
export async function batchLookup(coords) {
  const results = await Promise.allSettled(
    coords.map(({ lat, lon }) => lookupLocation(lat, lon))
  );
  return results.map(r => r.status === 'fulfilled' ? r.value : { country: null, region: null, isoCode: null });
}
