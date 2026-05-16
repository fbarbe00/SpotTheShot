import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Lobby, Photo, Result, LeaderboardItem, RoundResults, IndividualLeaderboardItem, TeamLeaderboardItem } from "../lib/types";
import { getMapInitialView } from "../lib/utils";
import { buildPhotoUrl, socket } from "../lib/socket";
import { useToast } from "../lib/toast";
import { useI18n } from "../contexts/I18nContext";
import { getCountryName } from "../lib/countryNames";
import { MomentCard, pickRoundMoments, pickGameMoments } from "./result/GameHighlights";
import { AnimatedCounter } from "./result/ResultRound";
import { ScoringInfo } from "./result/ResultLeaderboard";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, Popup } from "react-leaflet";
import L from "leaflet";
import { logger } from "../lib/logger";
import { getTileUrl, getMapProvider, type MapStyle, type MapLanguage } from "../lib/mapConfig";

export { MomentCard, pickRoundMoments, pickGameMoments };

/* ─────────────────────────────────────────
   Animation Constants
───────────────────────────────────────── */
const LEADERBOARD_ANIMATION = {
  HYPE:         { delay: 0.1, stagger: 0.05, stiffness: 300, damping: 25 },
  SCORE:        { delay: 0.2, stiffness: 200, damping: 20 },
  ROUND_POINTS: { delay: 0.3, stiffness: 180, damping: 20 },
  LAYOUT:       { stiffness: 150, damping: 25, duration: 0.4 },
};

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
function FitBounds({ photo, results }: { photo: Photo; results: Result[] }) {
  const map = useMap();
  const hasFitted = useRef(false);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (hasFitted.current) return;

    const points = [
      photo.lat && photo.lon ? [photo.lat, photo.lon] : null,
      ...results.map(r => (r.lat && r.lon ? [r.lat, r.lon] : null)),
    ].filter(Boolean) as [number, number][];

    if (points.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
        hasFitted.current = true;
      } catch (e) {
        logger.error('Failed to fit map bounds', e);
      }
    }
  }, [map]); // deliberately omit points — only fit once on mount
  /* eslint-enable react-hooks/exhaustive-deps */

  return null;
}

/* ─────────────────────────────────────────
   Rank badge helpers
───────────────────────────────────────── */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 0) return <div className="w-7 h-7 rounded-full bg-amber-400/20 border border-amber-400/60 flex items-center justify-center text-amber-400 font-black text-xs">1</div>;
  if (rank === 1) return <div className="w-7 h-7 rounded-full bg-gray-400/20 border border-gray-400/60 flex items-center justify-center text-gray-300 font-black text-xs">2</div>;
  if (rank === 2) return <div className="w-7 h-7 rounded-full bg-orange-600/20 border border-orange-600/50 flex items-center justify-center text-orange-500 font-black text-xs">3</div>;
  return <div className="w-7 h-7 rounded-full bg-surface border border-primary/20 flex items-center justify-center text-text-darker font-bold text-xs">{rank + 1}</div>;
}

function RankDelta({ delta }: { delta: number }) {
  if (delta === 0) return <Minus size={12} className="text-text-darker/40" />;
  if (delta > 0) return (
    <div className="flex items-center gap-0.5 text-emerald-400">
      <TrendingUp size={12} />
      <span className="text-[10px] font-bold">{delta}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-0.5 text-red-400">
      <TrendingDown size={12} />
      <span className="text-[10px] font-bold">{Math.abs(delta)}</span>
    </div>
  );
}

/* ─────────────────────────────────────────
   Unified Animated Leaderboard Row
───────────────────────────────────────── */
type LeaderboardRowData = {
  id: string;
  rank: number;
  prevRank: number;
  icon: string;
  nickname: string;
  color: string;
  totalScore: number;
  prevScore: number;
  roundPoints: number;
  isPlayer: boolean;
  isUploader: boolean;
  // distanceKm is stored as a pre-formatted string including the unit, e.g. "123 km"
  distanceKm?: string;
  countryFlag?: string;
  country?: string;
  countryCode?: string;
  visionCommentary?: string;
  isAI?: boolean;
};

type HypeLevel = {
  level: 'perfect' | 'amazing' | 'great' | 'good' | 'decent';
  label: string;
  desc: string;
  color: string;
  emoji: string;
};

function LeaderboardRow({
  row,
  index,
  phase,
}: {
  row: LeaderboardRowData;
  index: number;
  phase: 'before' | 'after';
}) {
  const { t, language } = useI18n();
  const displayScore = phase === 'before' ? row.prevScore : row.totalScore;
  const delta = row.prevRank - row.rank; // positive = moved up

  const [showHype, setShowHype] = useState(true);

  // Parse numeric km value from the pre-formatted "X km" string.
  const getHypeLevel = (distanceKm?: string): HypeLevel | null => {
    if (!distanceKm) return null;
    const dist = parseFloat(distanceKm.replace(/\s*km\s*$/i, '').trim());
    if (isNaN(dist)) return null;

    if (dist < 1)    return { level: 'perfect', label: t('guess.perfect'), desc: t('guess.perfectDesc'), color: 'text-amber-400',   emoji: '🎯' };
    if (dist < 100)  return { level: 'amazing', label: t('guess.amazing'), desc: t('guess.amazingDesc'), color: 'text-purple-400',  emoji: '🌟' };
    if (dist < 500)  return { level: 'great',   label: t('guess.great'),   desc: t('guess.greatDesc'),   color: 'text-blue-400',    emoji: '✨' };
    if (dist < 1000) return { level: 'good',    label: t('guess.good'),    desc: t('guess.goodDesc'),    color: 'text-emerald-400', emoji: '👍' };
    if (dist < 5000) return { level: 'decent',  label: t('guess.decent'),  desc: t('guess.decentDesc'),  color: 'text-text-darker', emoji: ''  };
    return null;
  };

  const hype = getHypeLevel(row.distanceKm);
  // Only show hype animation for the two highest-excitement tiers
  const shouldShowHype = phase === 'after' && hype !== null && (hype.level === 'perfect' || hype.level === 'amazing');

  useEffect(() => {
    if (!shouldShowHype) return;
    setShowHype(true);
    const timeout = setTimeout(() => setShowHype(false), 2500);
    return () => clearTimeout(timeout);
  }, [phase, shouldShowHype]);

  const isPodium = row.rank < 3;
  const isMe = row.isPlayer;

  return (
    <motion.div
      layout
      layoutId={`leaderboard-row-${row.id}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        layout:   { type: 'spring', stiffness: LEADERBOARD_ANIMATION.LAYOUT.stiffness, damping: LEADERBOARD_ANIMATION.LAYOUT.damping, delay: index * 0.05 },
        opacity:  { duration: LEADERBOARD_ANIMATION.LAYOUT.duration, delay: index * 0.05 },
        x:        { duration: LEADERBOARD_ANIMATION.LAYOUT.duration, delay: index * 0.05 },
      }}
      className={`
        relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-colors
        ${isMe    ? 'border-primary/50 bg-primary/10'  : isPodium ? 'border-primary/20 bg-surface/80' : 'border-primary/10 bg-surface/50'}
        ${phase === 'after' && delta > 0 ? 'ring-1 ring-emerald-400/30' : ''}
        ${phase === 'after' && delta < 0 ? 'ring-1 ring-red-400/20'     : ''}
      `}
    >
      {/* Rank */}
      <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-8">
        <RankBadge rank={row.rank} />
        {phase === 'after' && <RankDelta delta={delta} />}
      </div>

      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0 border-2"
        style={{ borderColor: row.color + '66', background: row.color + '22' }}
      >
        {row.icon}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`font-semibold text-sm truncate ${isMe ? 'text-primary' : 'text-text'}`}>
            {row.nickname}
          </span>
          {row.isUploader && (
            <span className="text-[10px] text-text-darker/60 flex-shrink-0 border border-primary/20 rounded px-1">📸</span>
          )}
          {row.countryFlag && (
            <span
              className="text-sm flex-shrink-0"
              title={getCountryName(row.countryCode, language, row.country)}
            >
              {row.countryFlag}
            </span>
          )}
        </div>
        {/* Distance shown only after reveal — already includes the "km" unit */}
        <AnimatePresence>
          {phase === 'after' && row.distanceKm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="text-[11px] text-text-darker mt-0.5"
            >
              📍 {row.distanceKm}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Score + round points */}
      <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
        <AnimatePresence mode="wait">
          {shouldShowHype && showHype && hype ? (
            <motion.div
              key="hype"
              initial={{ opacity: 0, scale: 0, y: -5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0, y: 5 }}
              transition={{
                delay: LEADERBOARD_ANIMATION.HYPE.delay + index * LEADERBOARD_ANIMATION.HYPE.stagger,
                type: 'spring',
                stiffness: LEADERBOARD_ANIMATION.HYPE.stiffness,
                damping: LEADERBOARD_ANIMATION.HYPE.damping,
              }}
              className={`text-[10px] font-black ${hype.color} flex items-center gap-1`}
            >
              {hype.emoji && <span className="text-sm">{hype.emoji}</span>}
              <span>{hype.label}</span>
            </motion.div>
          ) : (
            <motion.div
              key="score"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className={`font-mono font-black text-base tabular-nums ${isMe ? 'text-primary' : 'text-text'}`}
            >
              <AnimatedCounter value={displayScore} delay={0} />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {phase === 'after' && row.roundPoints > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                delay: LEADERBOARD_ANIMATION.ROUND_POINTS.delay + index * LEADERBOARD_ANIMATION.HYPE.stagger,
                type: 'spring',
                stiffness: LEADERBOARD_ANIMATION.ROUND_POINTS.stiffness,
                damping: LEADERBOARD_ANIMATION.ROUND_POINTS.damping,
              }}
              className="text-[11px] font-bold text-emerald-400 font-mono"
            >
              +{row.roundPoints}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

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

  useEffect(() => {
    const timeout = setTimeout(() => {
      photoMarkerRef.current?.openPopup();
    }, 5000);
    return () => clearTimeout(timeout);
  }, [photo.id]);

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
    () => pickRoundMoments(data, allPriorRounds, t, language),
    [data, allPriorRounds, t, language],
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
        roundPoints = teamResults.reduce((sum, r) => sum + r.points, 0);
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
        ? `Team ${id}`
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
        <p className="text-red-400">Error: Invalid photo data. Unable to display results.</p>
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
    <div className="flex flex-col md:grid md:grid-cols-2 gap-4 md:gap-6 h-screen md:h-auto px-2 md:px-0 overflow-y-auto md:overflow-hidden">

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
            scrollWheelZoom={false}
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
                  <img src={buildPhotoUrl(photo.url, lobby.id, playerId)} alt="Photo location" className="w-full h-32 object-cover rounded-lg mb-2" />
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
            {results.map(r => (
              <Marker
                key={r.playerId}
                position={[r.lat, r.lon]}
                icon={new L.DivIcon({
                  className: 'leaflet-div-icon',
                  html: `<div style="font-size:28px;line-height:1;filter:drop-shadow(0 0 2px rgba(0,0,0,.8))">${r.icon}</div>`,
                  iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32],
                })}
              >
                <Tooltip direction="top" offset={[0, -5]} className="!font-bold !bg-surface !text-text !border-primary/20">
                  {r.nickname}: {Math.round(r.distanceKm)} km
                </Tooltip>
              </Marker>
            ))}
            {results.map(r => (
              <Polyline
                key={r.playerId}
                positions={[[r.lat, r.lon], center]}
                color={r.color} weight={2} opacity={0.6} dashArray="5, 10"
              />
            ))}
            <FitBounds photo={photo} results={results} />
          </MapContainer>
        </motion.div>
      </div>

      {/* ── RIGHT: Controls + Leaderboard ── */}
      <div className="flex flex-col gap-3 overflow-y-auto md:overflow-hidden">

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

          <div className="p-2 flex flex-col gap-1.5 max-h-[300px] md:max-h-[500px] overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {displayRows.map((row, i) => (
                <LeaderboardRow key={row.id} row={row} index={i} phase={phase} />
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
