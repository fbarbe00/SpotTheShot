import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, Popup } from "react-leaflet";
import L from "leaflet";
import { Award, Medal, ThumbsUp } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { Photo, Result } from "../../lib/types";
import { getMapInitialView } from "../../lib/utils";
import { useI18n } from "../../contexts/I18nContext";
import { getCountryName } from "../../lib/countryNames";
import { logger } from "../../lib/logger";
import { getTileUrl, getMapProvider, type MapStyle, type MapLanguage } from "../../lib/mapConfig";

/**
 * ResultRound Module
 * Components and utilities for displaying individual round results
 */

/* ─────────────────────────────────────────
   Animated Score Counter
───────────────────────────────────────── */

export function AnimatedCounter({
  value,
  previousValue = 0,
  delay = 0,
  msPerUnit = 30,
  minDuration = 300,
  maxDuration = 3000,
}: {
  value: number;
  previousValue?: number;
  delay?: number;
  msPerUnit?: number;
  minDuration?: number;
  maxDuration?: number;
}) {
  const [displayValue, setDisplayValue] = useState(previousValue);
  const animationStarted = useRef(false);

  useEffect(() => {
    animationStarted.current = false;
  }, [value, previousValue]);

  useEffect(() => {
    if (animationStarted.current) return;
    animationStarted.current = true;
    const difference = value - previousValue;
    const duration = Math.min(maxDuration, Math.max(minDuration, Math.abs(difference) * msPerUnit));
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setDisplayValue(Math.floor(previousValue + progress * difference));
      if (progress < 1) requestAnimationFrame(animate);
      else setDisplayValue(value);
    };
    const timeout = setTimeout(() => requestAnimationFrame(animate), delay);
    return () => clearTimeout(timeout);
  }, [value, previousValue, delay, msPerUnit, minDuration, maxDuration]);

  return <span>{displayValue}</span>;
}

/* ─────────────────────────────────────────
   Map Bounds Fitter Component
───────────────────────────────────────── */

function FitBounds({ photo, results }: { photo: Photo; results: Result[] }) {
  const map = useMap();

  // Only fit bounds once on mount, not on every render
  // This allows users to zoom/pan without the map resetting
  useEffect(() => {
    const points = [
      photo.lat && photo.lon ? [photo.lat, photo.lon] : null,
      ...results.map(r => r.lat && r.lon ? [r.lat, r.lon] : null),
    ].filter(Boolean) as [number, number][];

    if (points.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
      } catch (e) {
        logger.error('Failed to fit map bounds', e);
      }
    }
  }, [map, photo.lat, photo.lon, results]);

  return null;
}

/* ─────────────────────────────────────────
   Score Feedback Styling
───────────────────────────────────────── */

const getScoreFeedback = (rank: number) => {
  if (rank === 0) return { icon: Award, color: "text-amber-400", bg: "bg-amber-500/20" };
  if (rank === 1) return { icon: Medal, color: "text-gray-400", bg: "bg-gray-500/20" };
  if (rank === 2) return { icon: Medal, color: "text-orange-600", bg: "bg-orange-600/20" };
  return { icon: ThumbsUp, color: "text-green-500", bg: "" };
};

/* ─────────────────────────────────────────
   Round Map Display Component
───────────────────────────────────────── */

export function RoundMap({
  photo,
  results,
  mapStyle = 'osm',
  mapLanguage = 'local',
}: {
  photo: Photo;
  results: Result[];
  mapStyle?: MapStyle;
  mapLanguage?: MapLanguage;
}) {
  const { zoom: defaultZoom } = getMapInitialView();
  const { t } = useI18n();
  const photoMarkerRef = useRef<L.Marker>(null);

  // Auto-open photo popup on mount
  useEffect(() => {
    if (photoMarkerRef.current && photo.lat && photo.lon) {
      const marker = photoMarkerRef.current;
      // Open popup after a 5 second delay to ensure map is ready and results have been viewed
      const timeout = setTimeout(() => {
        marker.openPopup();
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [photo.lat, photo.lon]);

  // Validate photo has valid coordinates before rendering map
  if (!photo.lat || !photo.lon) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl overflow-hidden h-full border-2 border-primary/20 shadow-lg flex items-center justify-center bg-surface/50"
      >
        <p className="text-text-darker">Map location unavailable</p>
      </motion.div>
    );
  }

  const center: [number, number] = [photo.lat, photo.lon];
  const photoMarker = new L.DivIcon({
    className: "leaflet-div-icon",
    html: `<div style="font-size:24px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">📍</div>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32],
  });

  const playerMarker = (r: Result) => {
    const playerLabel = `<div style="font-size: 10px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; color: var(--color-text, #333); font-weight: 500; margin-top: 2px;">${r.nickname}</div>`;
    const content = `<div style="font-size: 20px; line-height: 1;">${r.icon || "👤"}</div>${playerLabel}`;
    return new L.DivIcon({
      className: "leaflet-div-icon",
      html: content,
      iconSize: [40, 56],
      iconAnchor: [20, 28],
      popupAnchor: [0, -28],
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-2xl overflow-hidden h-full border-2 border-primary/20 shadow-lg"
    >
      <MapContainer
        center={center}
        zoom={defaultZoom}
        className="w-full h-full"
      >
        <TileLayer
          key={`${mapStyle}-${mapLanguage}`}
          url={getTileUrl(mapStyle, mapLanguage)}
          attribution={getMapProvider(mapStyle).attribution}
          maxZoom={getMapProvider(mapStyle).maxZoom}
        />
        <FitBounds photo={photo} results={results} />

        {/* Photo marker (actual location) */}
        <Marker position={center} icon={photoMarker} ref={photoMarkerRef}>
          <Popup autoPan={true}>
            <div className="text-center">
              {photo.title && <div className="font-bold text-primary border-b border-primary/20 mb-1 pb-1">{photo.title}</div>}
              <div className="text-sm font-medium">{photo.country}</div>
              {photo.region && <div className="text-xs text-text-darker italic">{photo.region}</div>}
            </div>
          </Popup>
        </Marker>

        {/* Player guesses */}
        {results.map((r) => {
          if (!r.lat || !r.lon) return null;
          return (
            <Marker key={r.playerId} position={[r.lat, r.lon]} icon={playerMarker(r)}>
              <Tooltip>{r.nickname} - {t('result.distanceAway', { distance: r.distanceKm })}</Tooltip>
              <Popup>
                <div>
                  <div className="font-bold">{r.nickname}</div>
                  <div className="text-sm text-text-darker">{t('result.distanceAway', { distance: r.distanceKm })}</div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Lines from guesses to actual location */}
        {results.map((r) => {
          if (!r.lat || !r.lon) return null;
          return (
            <Polyline
              key={`line-${r.playerId}`}
              positions={[[r.lat, r.lon], center]}
              color={r.color || "#9945ff"}
              weight={3}
              opacity={0.75}
            />
          );
        })}
      </MapContainer>
    </motion.div>
  );
}

/* ─────────────────────────────────────────
   Round Scores Display Component
───────────────────────────────────────── */

export function RoundScores({
  photo,
  results,
}: {
  photo: Photo;
  results: Result[];
}) {
  const { language } = useI18n();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-xl p-4 bg-surface border border-primary/10"
    >
      <h3 className="font-bold mb-3 text-lg text-primary truncate" title={photo.title}>
        {photo.title || "Round Scores"}
        {photo.countryFlag && <span className="ml-2" title={getCountryName(photo.countryCode, language, photo.country)}>({photo.countryFlag})</span>}
      </h3>
      {results.sort((a, b) => b.points - a.points).map((r, i) => {
        const feedback = getScoreFeedback(i);
        const isPerfect = r.points === 5000;
        return (
          <div key={r.playerId}>
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className={`flex items-center gap-2 md:gap-3 p-3 rounded-lg mb-2 ${feedback.bg} hover:scale-105 transition-transform min-w-0
                ${isPerfect ? "ring-2 ring-amber-400/50 bg-gradient-to-r from-amber-900/40 to-amber-900/10" : ""}`}
            >
              <feedback.icon size={20} className={`${feedback.color} flex-shrink-0`} />
              <div className="text-lg flex-shrink-0">{r.icon}</div>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: r.color }} />
              <div className="flex-1 font-medium flex items-center gap-1 md:gap-2 min-w-0">
                <span className="truncate">{r.nickname}</span>
                {r.isUploader && <span className="text-xs opacity-60 flex-shrink-0">↑</span>}
              </div>
              <div className="text-xs md:text-sm text-text-darker flex-shrink-0">
                {r.countryFlag && <span className="text-sm" title={getCountryName(r.countryCode, language, r.country)}>({r.countryFlag}) </span>}
                {r.distanceKm}km
              </div>
              <div className="font-mono font-bold text-green-400 flex-shrink-0 text-sm md:text-lg border-2 border-green-400/30 bg-green-900/20 px-2 py-1 rounded-lg">
                +<AnimatedCounter value={r.points} delay={0.3 + i * 0.1} />
              </div>
              {isPerfect && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.1, type: "spring", stiffness: 200, damping: 10 }}
                  className="flex-shrink-0 ml-1"
                >
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], boxShadow: ["0 0 0 0 rgba(251,191,36,.7)", "0 0 0 10px rgba(251,191,36,0)"] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.5 }}
                    className="px-3 py-1 rounded-full font-black text-sm bg-gradient-to-r from-amber-400 to-yellow-400 text-black"
                  >
                    5K
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
            {r.playerId.startsWith("ai-") && r.visionCommentary && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 + 0.05 }}
                className="px-4 py-2 text-sm text-text-darker italic bg-gradient-to-r from-primary/5 to-transparent ml-8 mr-2 rounded-lg border-l-3 border-primary/50 mb-2"
              >
                <span className="text-primary/70">💭 </span>
                <span className="text-primary/90 font-medium">{r.visionCommentary}</span>
              </motion.div>
            )}
          </div>
        );
      })}
    </motion.div>
  );
}
