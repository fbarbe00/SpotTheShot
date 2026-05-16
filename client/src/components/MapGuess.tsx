import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import { useState, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { LatLngBoundsExpression, LatLngExpression, Map } from "leaflet";
import { getMapInitialView } from "../lib/utils";
import { useI18n } from "../contexts/I18nContext";
import { getTileUrl, getMapProvider, type MapStyle, type MapLanguage } from "../lib/mapConfig";

/**
 * Interactive map for location guessing
 *
 * Uses OpenStreetMap for map tiles: https://www.openstreetmap.org/copyright
 * Displays geolocation predictions from GeoCLIP: https://github.com/VicenteVivan/geo-clip
 * Image analysis powered by Ministral: https://huggingface.co/unsloth/Ministral-3-3B-Instruct-2512-GGUF
 */

// Component to get map instance and set it in state
function MapSetter({ setMap }: { setMap: (map: Map) => void }) {
  const currentMap = useMap();
  useEffect(() => {
    setMap(currentMap);
  }, [currentMap, setMap]);
  return null;
}

// Map click handler - captures user's location guess when they click the map
// Disabled when isLocked to prevent changing guess after submission
function ClickHandler({
  onPick,
  isLocked,
}: {
  onPick: (lat: number, lon: number) => void;
  isLocked: boolean;
}) {
  useMapEvents({
    click(e) {
      if (!isLocked) {
        // Wrap longitude to be within -180 to 180
        const lon =
          e.latlng.lng > 180
            ? e.latlng.lng - 360
            : e.latlng.lng < -180
              ? e.latlng.lng + 360
              : e.latlng.lng;
        onPick(e.latlng.lat, lon);
      }
    },
  });
  return null;
}

// Props for interactive map where players guess photo location
type MapGuessProps = {
  onConfirm: (p: { lat: number; lon: number }) => void; // Callback when guess is submitted
  isExpanded: boolean; // Full screen vs minimap mode
  isLocked: boolean; // Prevent changing guess after submission
  guess?: { lat: number; lon: number } | null; // Current guess marker position
  miniMap?: boolean; // Render as corner minimap instead of full screen
  savedCenter?: { lat: number; lon: number; zoom: number } | null; // Saved map center/zoom from previous expand
  onMapStateChange?: (center: { lat: number; lon: number; zoom: number }) => void; // Callback to save map center/zoom
  onPinChange?: (pin: { lat: number; lon: number } | null) => void; // Callback when pin position changes
  mapStyle?: MapStyle; // Map visual style
  mapLanguage?: MapLanguage; // Map labels language
};

const worldBounds: LatLngBoundsExpression = [
  [-90, -180], // Southwest
  [90, 180], // Northeast
];

// Interactive map for guessing photo locations
// Supports clicking to place markers, expanding to fullscreen, and locking after guess submission
export default function MapGuess(props: MapGuessProps) {
  const { t } = useI18n();
  const { onConfirm, isExpanded, isLocked, guess, miniMap, savedCenter, onMapStateChange, onPinChange, mapStyle = 'osm', mapLanguage = 'local' } = props;
  const [map, setMap] = useState<Map | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  // Get default center and zoom from environment
  const { center: defaultCenter, zoom: defaultZoom } = getMapInitialView();

  // Determine map center: use saved position if available, otherwise guess or default
  const mapCenter = savedCenter ? [savedCenter.lat, savedCenter.lon] : (guess ? [guess.lat, guess.lon] : defaultCenter);
  const mapZoom = savedCenter ? savedCenter.zoom : (guess ? 5 : defaultZoom);

  // Save map state when it moves (only when expanded to avoid frequent updates in minimap)
  useEffect(() => {
    if (!map || miniMap || !onMapStateChange) return;

    const handleMoveEnd = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      onMapStateChange({ lat: center.lat, lon: center.lng, zoom });
    };

    map.on('moveend', handleMoveEnd);
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, miniMap, onMapStateChange]);

  // This effect uses ResizeObserver to ensure the map invalidates its size
  // whenever the container size changes. This is the most robust way to fix
  // "missing tiles" issues in Leaflet within a dynamic React layout.
  useEffect(() => {
    const mapEl = mapRef.current;
    if (!map || !mapEl) return;

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(mapEl);

    return () => {
      observer.unobserve(mapEl);
    };
  }, [map, mapRef]);

  // Prevent page scroll when mouse is over the map, unless it's a minimap
  useEffect(() => {
    const mapEl = mapRef.current;
    if (!mapEl || miniMap) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    mapEl.addEventListener("wheel", onWheel, { passive: false });
    return () => mapEl.removeEventListener("wheel", onWheel);
  }, [mapRef, miniMap]);

  // Handle space key to lock guess
  useEffect(() => {
    if (isLocked || !guess) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        onConfirm(guess);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [guess, isLocked, onConfirm]);

  const handlePinClick = (lat: number, lon: number) => {
    if (!isLocked && onPinChange) {
      onPinChange({ lat, lon });
    }
  };

  return (
    <div
      ref={mapRef}
      className="relative h-full w-full rounded-xl overflow-hidden border-2 border-primary/20 cursor-crosshair"
    >
      <MapContainer
        key={isExpanded ? "expanded" : "collapsed"}
        center={mapCenter as LatLngExpression}
        zoom={mapZoom}
        style={{
          height: "100%",
          width: "100%",
          background: "#2a2057",
        }}
        whenReady={() => {}}
        scrollWheelZoom={!miniMap}
        dragging={!miniMap}
        zoomControl={!miniMap}
        attributionControl={!miniMap}
        maxBounds={worldBounds}
        maxBoundsViscosity={1.0}
      >
        <TileLayer
          key={`${mapStyle}-${mapLanguage}`}
          url={getTileUrl(mapStyle, mapLanguage)}
          attribution={getMapProvider(mapStyle).attribution}
          noWrap={true}
          maxZoom={getMapProvider(mapStyle).maxZoom}
        />
        <MapSetter setMap={setMap} />
        <ClickHandler
          onPick={handlePinClick}
          isLocked={isLocked}
        />
        {guess && <Marker position={[guess.lat, guess.lon]} />}
      </MapContainer>
      {!isLocked && (
        <div className="absolute bottom-4 right-4 flex gap-2 z-[10000]">
          <button
            disabled={!guess}
            onClick={() => guess && onConfirm(guess)}
            className="px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors disabled:opacity-40"
          >
            {t("game.lockGuess")}
          </button>
        </div>
      )}
    </div>
  );
}
