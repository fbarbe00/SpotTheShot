/**
 * Map Configuration
 * Provides different map tile providers and styles
 */

export type MapStyle = 'osm' | 'hot' | 'cyclosm' | 'opnvkarte' | 'dark' | 'light' | 'satellite' | 'terrain';
// Map languages for OSM style (other styles don't support language variants)
// French uses osmfr tiles, German uses osm.de tiles, English and local use standard OSM
export type MapLanguage = 'en' | 'fr' | 'de' | 'local';

// Map styles that support language variants (OSM-based only)
export const LANGUAGE_CAPABLE_STYLES: MapStyle[] = ['osm'];

// Base tile URL patterns - centralized to avoid duplication
const TILE_URLS = {
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  osmFr: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
  osmDe: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
  hot: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
  cyclosm: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
  opnvkarte: 'https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png',
  cartoDark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  cartoLight: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  opentopo: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  esriSatellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
} as const;

// Common attributions - centralized to avoid duplication
const ATTR = {
  osm: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  carto: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  esri: '&copy; <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri World Imagery</a>',
};

export interface MapProvider {
  id: MapStyle;
  name: string;
  tileUrl: string;
  attribution: string;
  maxZoom?: number;
  description: string;
}

export const MAP_PROVIDERS: Record<MapStyle, MapProvider> = {
  osm: {
    id: 'osm',
    name: 'OpenStreetMap',
    tileUrl: TILE_URLS.osm,
    attribution: ATTR.osm,
    maxZoom: 19,
    description: 'Standard map with local language labels',
  },
  hot: {
    id: 'hot',
    name: 'Humanitarian',
    tileUrl: TILE_URLS.hot,
    attribution: `${ATTR.osm}, Tiles style by Humanitarian OpenStreetMap Team`,
    maxZoom: 19,
    description: 'Humanitarian map style for disaster response',
  },
  cyclosm: {
    id: 'cyclosm',
    name: 'CyclOSM',
    tileUrl: TILE_URLS.cyclosm,
    attribution: `${ATTR.osm}, Tiles courtesy of CyclOSM`,
    maxZoom: 19,
    description: 'Cycling-focused map with bike infrastructure',
  },
  opnvkarte: {
    id: 'opnvkarte',
    name: 'ÖPNVKarte',
    tileUrl: TILE_URLS.opnvkarte,
    attribution: `${ATTR.osm}, Map style by ÖPNVKarte`,
    maxZoom: 18,
    description: 'Public transport focused map',
  },
  dark: {
    id: 'dark',
    name: 'Dark Matter',
    tileUrl: TILE_URLS.cartoDark,
    attribution: `${ATTR.osm} ${ATTR.carto}`,
    maxZoom: 20,
    description: 'Dark theme map for better photo visibility',
  },
  light: {
    id: 'light',
    name: 'Light Matter',
    tileUrl: TILE_URLS.cartoLight,
    attribution: `${ATTR.osm} ${ATTR.carto}`,
    maxZoom: 20,
    description: 'Light theme map with minimal distractions',
  },
  terrain: {
    id: 'terrain',
    name: 'OpenTopoMap',
    tileUrl: TILE_URLS.opentopo,
    attribution: `${ATTR.osm} &copy; <a href="http://www.opentopomap.org">OpenTopoMap</a>`,
    maxZoom: 17,
    description: 'Topographic map showing elevation and terrain',
  },
  satellite: {
    id: 'satellite',
    name: 'Satellite',
    tileUrl: TILE_URLS.esriSatellite,
    attribution: ATTR.esri,
    maxZoom: 19,
    description: 'Satellite imagery for real-world view',
  },
};

// Common tile URLs shared across all styles (non-language-specific)
const COMMON_TILES: Record<MapStyle, string> = {
  hot: TILE_URLS.hot,
  cyclosm: TILE_URLS.cyclosm,
  opnvkarte: TILE_URLS.opnvkarte,
  dark: TILE_URLS.cartoDark,
  light: TILE_URLS.cartoLight,
  satellite: TILE_URLS.esriSatellite,
  terrain: TILE_URLS.opentopo,
  osm: TILE_URLS.osm,
};

// Language-specific tile URLs for OSM style only
// French uses osmfr, German uses osm.de, English/local use standard OSM
const OSM_LANGUAGE_TILES: Record<MapLanguage, string> = {
  en: TILE_URLS.osm,
  fr: TILE_URLS.osmFr,
  de: TILE_URLS.osmDe,
  local: TILE_URLS.osm,
};

// Language-specific tile providers: OSM uses language variants, others use common tiles
export const LANGUAGE_TILE_URLS: Record<MapLanguage, Record<MapStyle, string>> = {
  en: { ...COMMON_TILES, osm: OSM_LANGUAGE_TILES.en },
  fr: { ...COMMON_TILES, osm: OSM_LANGUAGE_TILES.fr },
  de: { ...COMMON_TILES, osm: OSM_LANGUAGE_TILES.de },
  local: { ...COMMON_TILES, osm: OSM_LANGUAGE_TILES.local },
};

/**
 * Get tile URL for the selected map style and language
 */
export function getTileUrl(style: MapStyle = 'osm', language: MapLanguage = 'local'): string {
  return LANGUAGE_TILE_URLS[language]?.[style] || MAP_PROVIDERS[style]?.tileUrl || MAP_PROVIDERS.osm.tileUrl;
}

/**
 * Get preview tile URL for map style thumbnails (uses zoom 5, centered on Europe)
 */
export function getPreviewTileUrl(style: MapStyle): string {
  const baseUrl = getTileUrl(style, 'local');
  // Use a fixed tile that shows land/features well (zoom 5, tile x=16, y=11 covers Central Europe)
  return baseUrl.replace('{z}', '5').replace('{x}', '16').replace('{y}', '11').replace('{s}', 'a').replace('{r}', '');
}

/**
 * Get map provider by ID
 */
export function getMapProvider(style: MapStyle): MapProvider {
  return MAP_PROVIDERS[style] || MAP_PROVIDERS.osm;
}

/**
 * Check if map style supports language variants
 */
export function supportsLanguageVariants(style: MapStyle): boolean {
  return LANGUAGE_CAPABLE_STYLES.includes(style);
}

/**
 * Default map settings
 */
export const DEFAULT_MAP_SETTINGS = {
  style: 'osm' as MapStyle,
  language: 'local' as MapLanguage,
  upsideDown: false,
};
