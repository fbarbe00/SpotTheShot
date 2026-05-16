// Remove accents, diacritics and spaces from strings (e.g., "Pérù" → "PERU", "NEW YORK" → "NEWYORK")
export function normalizeString(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

export function getOrdinal(n: number): string {
  const v = n % 100;
  const idx = v - 20;

  if (idx >= 11 && idx <= 13) {
    return n + 'th';
  }

  switch (v % 10) {
    case 1: return n + 'st';
    case 2: return n + 'nd';
    case 3: return n + 'rd';
    default: return n + 'th';
  }
}

// Get default map bounding box from environment variables
// Format: [south, west, north, east] (LatLngBoundsExpression)
export function getMapBounds(): [[number, number], [number, number]] {
  // Read from import.meta.env (Vite environment variables)
  const south = parseFloat(import.meta.env.VITE_MAP_BBOX_SOUTH ?? '35');
  const west = parseFloat(import.meta.env.VITE_MAP_BBOX_WEST ?? '-10');
  const north = parseFloat(import.meta.env.VITE_MAP_BBOX_NORTH ?? '70');
  const east = parseFloat(import.meta.env.VITE_MAP_BBOX_EAST ?? '40');

  // Validate bounds
  if (isNaN(south) || isNaN(west) || isNaN(north) || isNaN(east)) {
    return [[35, -10], [70, 40]];
  }

  return [[south, west], [north, east]];
}

// Get initial center and zoom for map based on bounds
export function getMapInitialView(): { center: [number, number]; zoom: number } {
  const bounds = getMapBounds();
  const [south, west] = bounds[0];
  const [north, east] = bounds[1];

  // Calculate center
  const centerLat = (south + north) / 2;
  const centerLon = (west + east) / 2;

  // Estimate zoom level based on bounds span
  const latSpan = north - south;
  const lonSpan = east - west;
  const maxSpan = Math.max(latSpan, lonSpan);

  // Rough heuristic for zoom level
  let zoom = 3;
  if (maxSpan > 120) zoom = 2;
  if (maxSpan < 60) zoom = 4;
  if (maxSpan < 30) zoom = 5;
  if (maxSpan < 15) zoom = 6;

  return {
    center: [centerLat, centerLon] as [number, number],
    zoom,
  };
}
