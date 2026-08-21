import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award, ChevronRight } from "lucide-react";
import type { Lobby, Photo, Result, LeaderboardItem, RoundResults, IndividualLeaderboardItem, TeamLeaderboardItem } from "../lib/types";
import { getMapInitialView } from "../lib/utils";
import { buildPhotoUrl, socket } from "../lib/socket";
import { useToast } from "../lib/toast";
import { useI18n } from "../contexts/I18nContext";
import { getCountryName } from "../lib/countryNames";
import { MomentCard, pickRoundMoments, pickGameMoments } from "./result/GameHighlights";
import { ScoringInfo } from "./result/ResultLeaderboard";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, Popup } from "react-leaflet";
import L from "leaflet";
import { logger } from "../lib/logger";
import { getTileUrl, getMapProvider, type MapStyle, type MapLanguage } from "../lib/mapConfig";
import { AnimatedLeaderboardRow, type LeaderboardRowData } from "./result/AnimatedLeaderboardRow";

export { MomentCard, pickRoundMoments, pickGameMoments };

/* ─────────────────────────────────────────
   Type Guards
───────────────────────────────────────── */
function isIndividualLeaderboardItem(item: LeaderboardItem): item is IndividualLeaderboardItem {
  return 'id' in item;
}
function isTeamLeaderboardItem(item: LeaderboardItem): item is TeamLeaderboardItem {
  return 'team' in item;
}

// Re-export types for backward compatibility
import type { StatFragment, StatMoment } from '../lib/types';
export type { StatFragment, StatMoment };

/* ─────────────────────────────────────────
   FitBounds
   Fits the map once on mount; ignores user
   interaction after that.
───────────────────────────────────────── */
function FitBounds({ photo, revealedHumans }: { photo: Photo; revealedHumans: Result[] }) {
  const map = useMap();

  useEffect(() => {
    if (revealedHumans.length === 0) return;

    const points = [
      Number.isFinite(photo.lat) && Number.isFinite(photo.lon) ? [photo.lat!, photo.lon!] : null,
      ...revealedHumans.map(r => (Number.isFinite(r.lat) && Number.isFinite(r.lon) ? [r.lat, r.lon] : null)),
    ].filter(Boolean) as [number, number][];

    if (points.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
      } catch (e) {
        logger.error('Failed to fit map bounds', e);
      }
    }
  }, [map, photo.lat, photo.lon, revealedHumans]);

  return null;
}
const REVEAL_INITIAL_DELAY = 450;
const MAX_REVEAL_SEQUENCE_MS = 7000;

/* ─────────────────────────────────────────
   Main Result Component
───────────────────────────────────────── */
export default function ResultComponent({
  data,
  timerMs: _timerMs,
  lobby,
  playerId,
  allPriorRounds = [],
  mapStyle = 'osm',
  mapLanguage = 'local',
}: {
  data: RoundResults;
  timerMs: number;
  lobby: Lobby;
  playerId: string;
  allPriorRounds?: RoundResults[];
  mapStyle?: MapStyle;
  mapLanguage?: MapLanguage;
}) {
  const { addToast } = useToast();
  const { t, language } = useI18n();
  const { photo, results, leaderboard, roundIndex, totalRounds } = data;
  const { zoom: defaultZoom } = getMapInitialView();

  const [showScoringInfo, setShowScoringInfo] = useState(false);
  const photoMarkerRef = useRef<L.Marker>(null);
  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // Sort: human players worst-first (most distance → last is the best guess),
  // then AI players at the very end as the final "reveal"
  const sortedForReveal = useMemo(() => {
    const humans = results.filter(r => !r.isAI).sort((a, b) => b.distanceKm - a.distanceKm);
    const ais    = results.filter(r => r.isAI);
    return [...humans, ...ais];
  }, [results]);

  // Track { photoId, count } together so count resets synchronously at render
  // time when photo.id changes — avoids a flash where all results show at once
  // for one frame before the effect can call setRevealedCount(0).
  const [revealState, setRevealState] = useState<{ photoId: string; count: number }>({
    photoId: '', count: 0,
  });
  const effectiveCount  = revealState.photoId === photo.id ? revealState.count : 0;
  const revealedResults = sortedForReveal.slice(0, effectiveCount);
  // All human results — used for initial map framing so the zoom is correct before any pin drops
  const allHumans = useMemo(() => results.filter(r => !r.isAI), [results]);

  // Staggered reveal — reset on each new round
  useEffect(() => {
    setRevealState({ photoId: photo.id, count: 0 });
    const len = sortedForReveal.length;
    if (prefersReducedMotion) {
      setRevealState({ photoId: photo.id, count: len });
      return;
    }
    const stepDelay = len > 1
      ? Math.min(1000, Math.floor((MAX_REVEAL_SEQUENCE_MS - REVEAL_INITIAL_DELAY) / (len - 1)))
      : 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < len; i++) {
      timers.push(setTimeout(
        () => setRevealState({ photoId: photo.id, count: i + 1 }),
        REVEAL_INITIAL_DELAY + i * stepDelay,
      ));
    }
    return () => timers.forEach(clearTimeout);
  }, [photo.id, sortedForReveal.length, prefersReducedMotion]);

  // Open photo popup after all player guesses have been revealed
  const revealStepMs = sortedForReveal.length > 1
    ? Math.min(1000, Math.floor((MAX_REVEAL_SEQUENCE_MS - REVEAL_INITIAL_DELAY) / (sortedForReveal.length - 1)))
    : 0;
  const popupDelayMs = prefersReducedMotion
    ? 0
    : REVEAL_INITIAL_DELAY + Math.max(0, sortedForReveal.length - 1) * revealStepMs + 1200;
  useEffect(() => {
    const timeout = setTimeout(() => {
      photoMarkerRef.current?.openPopup();
    }, popupDelayMs);
    return () => clearTimeout(timeout);
  }, [photo.id, popupDelayMs]);

  // Memoize player icons so react-leaflet doesn't recreate them on every render
  // (stable references prevent react-leaflet from re-triggering the drop animation)
  const playerIcons = useMemo(() => {
    const icons: Record<string, L.DivIcon> = {};
    results.forEach(r => {
      const color = r.color || '#7c3aed';
      const dist  = `${Math.round(r.distanceKm)} km`;
      icons[r.playerId] = new L.DivIcon({
        className: 'leaflet-div-icon',
        html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
          <div style="font-size:28px;line-height:1;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.7))">${r.icon || '👤'}</div>
          <div style="
            background:${color};color:#fff;
            font-size:9px;font-weight:700;line-height:1;
            padding:2px 5px;border-radius:8px;
            white-space:nowrap;
            box-shadow:0 1px 4px rgba(0,0,0,0.4);
            animation:chipIn 0.25s ease 0.5s both;
          ">${dist}</div>
        </div>`,
        iconSize:    [52, 44],
        iconAnchor:  [26, 28],
        tooltipAnchor: [0, -28],
      });
    });
    return icons;
  }, [results]);

  const [phase, setPhase] = useState<'before' | 'after'>('before');

  // Trigger leaderboard transition shortly after mount
  useEffect(() => {
    const timeout = setTimeout(() => setPhase('after'), 900);
    return () => clearTimeout(timeout);
  }, []);

  const isHost = lobby.hostId === playerId;
  const isLastRound = roundIndex !== undefined && totalRounds !== undefined && roundIndex === totalRounds - 1;
  const hostName = lobby.players.find(p => p.id === lobby.hostId)?.nickname ?? t('ui.host');
  const moments = useMemo(
    () => pickRoundMoments(data, allPriorRounds, t, language, lobby.settings.gameType),
    [data, allPriorRounds, t, language, lobby.settings.gameType],
  );

  /* Build previous rank map from the last prior round */
  const prevRankById = useMemo<Record<string, number>>(() => {
    const previousRound = allPriorRounds[allPriorRounds.length - 1];
    if (!previousRound?.leaderboard) return {};
    const map: Record<string, number> = {};
    previousRound.leaderboard.forEach((item, idx) => {
      const id = isIndividualLeaderboardItem(item) ? item.id : item.team;
      map[id] = idx;
    });
    return map;
  }, [allPriorRounds]);

  /* Build unified row data */
  const rows: LeaderboardRowData[] = useMemo(() => {
    return leaderboard.map((item, newRank) => {
      const isTeam = isTeamLeaderboardItem(item);
      const id = isTeam ? (item as TeamLeaderboardItem).team : (item as IndividualLeaderboardItem).id;

      let roundPoints = 0;
      let roundResult: Result | undefined;
      if (isTeam) {
        const teamResults = results.filter(r =>
          lobby.players.find(p => p.id === r.playerId)?.team === id
        );
        roundPoints = Math.max(0, ...teamResults.map(result => result.points));
        roundResult = teamResults[0];
      } else {
        roundResult = results.find(r => r.playerId === id);
        roundPoints = roundResult?.points ?? 0;
      }

      const prevScore = Math.max(0, item.score - roundPoints);
      const prevRank = prevRankById[id] ?? newRank;

      const player = lobby.players.find(p => p.id === id);
      const icon = roundResult?.icon ?? player?.icon ?? '👤';
      const color = roundResult?.color ?? '#888';
      const nickname = isTeam
        ? id
        : (roundResult?.nickname ?? player?.nickname ?? id);

      // Format distanceKm once here as "X km" so child components don't add a second "km"
      const distanceKm = roundResult?.distanceKm != null
        ? `${Math.round(roundResult.distanceKm)} km`
        : undefined;

      return {
        id,
        rank: newRank,
        prevRank,
        icon,
        nickname,
        color,
        totalScore: item.score,
        prevScore,
        roundPoints,
        isPlayer: id === playerId,
        isUploader: roundResult?.isUploader ?? false,
        distanceKm,
        countryFlag: roundResult?.countryFlag,
        country: roundResult?.country,
        countryCode: roundResult?.countryCode,
        visionCommentary: roundResult?.visionCommentary,
        isAI: id.startsWith('ai-'),
      };
    });
  }, [leaderboard, results, lobby, playerId, prevRankById]);

  /* Sort rows by phase */
  const displayRows = useMemo(() =>
    [...rows].sort((a, b) => phase === 'before'
      ? a.prevRank - b.prevRank
      : a.rank - b.rank
    ),
    [rows, phase],
  );

  if (!photo || typeof photo.lat !== 'number' || typeof photo.lon !== 'number') {
    return (
      <div className="text-center py-10">
        <p className="text-red-400">{t('errors.invalidPhotoData')}</p>
      </div>
    );
  }

  const center: [number, number] = [photo.lat, photo.lon];

  const handleNextRound = () => {
    socket.emit('next_round', { lobbyId: lobby.id, playerId }, (response: { success?: boolean; error?: string }) => {
      if (!response?.success) {
        addToast(t('toast.failedStartNextRound', { error: response?.error || t('toast.invalidLobby') }), 'error', 5000);
      }
    });
  };

  const photoMarker = new L.DivIcon({
    className: 'leaflet-div-icon',
    html: `<div style="font-size:24px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">📍</div>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32],
  });

  const aiCommentaries = rows.filter(r => r.isAI && r.visionCommentary);

  return (
    <div className="flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6 max-h-[calc(100svh-80px)] px-2 md:px-0 overflow-y-auto md:overflow-hidden">

      {/* ── LEFT: Map ── */}
      <div className="flex flex-col gap-4">
        {!isHost && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-3 md:hidden bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/20 text-center text-sm"
          >
            <div className="text-text-darker">{isLastRound ? `✨ ${t('results.gameEnded')}` : `⏳ ${t('results.waiting')}`}</div>
            <div className="font-bold text-primary">{t('results.hostWillProceed', { host: hostName })}</div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
          className="rounded-xl overflow-hidden h-[250px] md:h-full border-2 border-primary/20 relative"
        >
          <MapContainer
            center={center}
            zoom={defaultZoom}
            style={{
              height: '100%',
              width: '100%',
              background: '#2a2057',
            }}
            scrollWheelZoom
          >
            <TileLayer
              key={`${mapStyle}-${mapLanguage}`}
              url={getTileUrl(mapStyle, mapLanguage)}
              attribution={getMapProvider(mapStyle).attribution}
              maxZoom={getMapProvider(mapStyle).maxZoom}
            />
            <Marker position={center} icon={photoMarker} ref={photoMarkerRef}>
              <Popup autoPan>
                <div className="w-40">
                  <img src={buildPhotoUrl(photo.url, lobby.id, playerId)} alt={photo.title || t('results.photoLocation')} className="w-full h-32 object-cover rounded-lg mb-2" />
                  <div className="text-sm font-bold border-b border-primary/20 mb-1 pb-1">
                    {photo.title || t('results.photoLocation')}
                  </div>
                  {photo.country && (
                    <div className="text-xs text-text-darker">
                      {photo.region ? `${photo.region}, ` : ''}{getCountryName(photo.countryCode, language, photo.country)}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
            {revealedResults.map(r => (
              <Marker
                key={r.playerId}
                position={[r.lat!, r.lon!]}
                icon={playerIcons[r.playerId]}
                eventHandlers={{
                  add: (e) => {
                    // Animate the INNER div — Leaflet positions markers via
                    // transform on the outer element; animating that breaks placement.
                    const outer = (e.target as L.Marker).getElement();
                    const inner = outer?.firstElementChild as HTMLElement | null;
                    if (inner) inner.style.animation = 'markerDrop 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
                  },
                }}
              >
                <Tooltip direction="top" offset={[0, -28]} className="!font-bold !bg-surface !text-text !border-primary/20">
                  {r.nickname}: {Math.round(r.distanceKm)} km
                </Tooltip>
              </Marker>
            ))}
            {revealedResults.map(r => (
              <Polyline
                key={r.playerId}
                positions={[[r.lat!, r.lon!], center]}
                color={r.color} weight={2} opacity={0.6} dashArray="5, 10"
                eventHandlers={{
                  add: (e) => {
                    const path = (e.target as L.Path).getElement() as SVGElement | null;
                    if (path) path.style.animation = 'lineReveal 0.5s ease 0.3s both';
                  },
                }}
              />
            ))}
            <FitBounds photo={photo} revealedHumans={allHumans} />
          </MapContainer>
        </motion.div>
      </div>

      {/* ── RIGHT: Controls + Leaderboard ── */}
      <div className="flex flex-col gap-3 md:overflow-y-auto">

        {isHost ? (
          <motion.button
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={handleNextRound}
            className="w-full p-3 rounded-xl bg-primary hover:bg-primary-dark text-black font-bold transition-colors flex items-center justify-center gap-2 text-base"
          >
            {isLastRound ? t('game.viewResults') : t('game.nextRound')} <ChevronRight size={18} />
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-3 bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/20 text-center hidden md:block"
          >
            <div className="text-text-darker text-sm">{isLastRound ? `✨ ${t('results.gameEnded')}` : `⏳ ${t('results.waitingNextRound')}`}</div>
            <div className="text-sm font-bold text-primary">{t('results.hostWillProceed', { host: hostName })}</div>
          </motion.div>
        )}

        {moments.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="grid grid-cols-2 gap-2"
          >
            {moments.map((m, i) => <MomentCard key={m.label} moment={m} index={i} delay={0.3} />)}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-xl bg-surface border border-primary/10 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-primary/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award size={16} className="text-primary" />
              <span className="font-bold text-sm text-primary">
                {t('results.leaderboard')}
                {photo.countryFlag && (
                  <span className="ml-1 opacity-70" title={getCountryName(photo.countryCode, language, photo.country)}>
                    {photo.countryFlag}
                  </span>
                )}
              </span>
            </div>
            <motion.div
              animate={phase === 'before' ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
              transition={{ duration: 1, repeat: phase === 'before' ? Infinity : 0 }}
              className="text-[11px] text-text-darker"
            >
              {phase === 'before' ? '↻ updating…' : ''}
            </motion.div>
          </div>

          <div className="p-2 flex flex-col gap-1.5">
            <AnimatePresence mode="popLayout">
              {displayRows.map((row, i) => (
                <AnimatedLeaderboardRow key={row.id} row={row} index={i} phase={phase} />
              ))}
            </AnimatePresence>
          </div>
        </motion.div>

        <AnimatePresence>
          {phase === 'after' && aiCommentaries.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ delay: 1.2 }}
              className="flex flex-col gap-1.5"
            >
              {aiCommentaries.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.3 + i * 0.12 }}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5"
                    style={{ background: r.color + '33' }}
                  >
                    {r.icon}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-primary/60 uppercase tracking-wide">{r.nickname} </span>
                    <span className="text-xs text-text-darker/80 italic">{r.visionCommentary}</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <ScoringInfo
          isOpen={showScoringInfo}
          onToggle={() => setShowScoringInfo(!showScoringInfo)}
          uploaderPenaltyPercent={lobby.settings.uploaderPenaltyPercent}
          gameMode={lobby.settings.gameMode}
        />
      </div>
    </div>
  );
}
