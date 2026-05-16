import { useMemo, useState, useEffect, Fragment } from "react";
import type { Lobby, Player, RoundResults } from "../../lib/types";
import { MomentCard, pickGameMoments } from "../result/GameHighlights";
import { Crown, LogOut, Map as MapIcon } from "lucide-react";
import { motion } from "framer-motion";
import { getOrdinal } from "../../lib/utils";
import { useI18n } from "../../contexts/I18nContext";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { logger } from "../../lib/logger";
import { getTileUrl, getMapProvider, type MapStyle, type MapLanguage } from "../../lib/mapConfig";

/**
 * GameEnd Module
 * Final podium + game highlights display
 */

/* ─────────────────────────────────────────
   Types
───────────────────────────────────────── */

type PlayerEntry = {
  kind: 'player';
  id: string;
  nickname: string;
  score: number;
  color: string | null;
  icon: string | null;
};

type TeamEntry = {
  kind: 'team';
  team: string;
  score: number;
  players: Player[];
};

type LeaderboardEntry = PlayerEntry | TeamEntry;

/* ─────────────────────────────────────────
   Utilities
───────────────────────────────────────── */

function entryKey(e: LeaderboardEntry): string {
  return e.kind === 'team' ? e.team : e.id;
}

function buildLeaderboard(
  players: Player[],
  isTeamMode: boolean,
  gameResults: RoundResults[],
  t: (key: string) => string,
): LeaderboardEntry[] {
  if (!isTeamMode) {
    return [...players]
      .sort((a, b) => b.score - a.score)
      .map((p): PlayerEntry => ({
        kind: 'player',
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        color: p.color ?? null,
        icon: p.icon ?? null,
      }));
  }

  // Team mode: score = sum of the best individual score per round for that team.
  // We compute from gameResults rather than player.score because player.score is
  // individual, not the team aggregate.
  const teams = new Map<string, TeamEntry>();
  const playerTeamById = new Map<string, string>();

  for (const p of players) {
    const teamName = p.team || t('ui.unassigned');
    if (!teams.has(teamName)) {
      teams.set(teamName, { kind: 'team', team: teamName, score: 0, players: [] });
    }
    teams.get(teamName)!.players.push(p);
    playerTeamById.set(p.id, teamName);
  }

  for (const round of gameResults) {
    const bestByTeam = new Map<string, number>();
    for (const guess of round.results) {
      const teamName = playerTeamById.get(guess.playerId) ?? t('ui.unassigned');
      const prev = bestByTeam.get(teamName) ?? 0;
      if (guess.points > prev) bestByTeam.set(teamName, guess.points);
    }
    for (const [teamName, best] of bestByTeam) {
      const entry = teams.get(teamName);
      if (entry) entry.score += best;
    }
  }

  return [...teams.values()].sort((a, b) => b.score - a.score);
}

/* ─────────────────────────────────────────
   Podium Components
───────────────────────────────────────── */

type PodiumMeta = { color: string; size: string; height: string };

const PLAYER_PODIUM_META: Record<number, PodiumMeta> = {
  1: { color: 'text-amber-400',   size: 'text-5xl', height: 'h-40' },
  2: { color: 'text-slate-400',   size: 'text-4xl', height: 'h-32' },
  3: { color: 'text-orange-600',  size: 'text-3xl', height: 'h-24' },
};

const PLAYER_PODIUM_BORDER: Record<number, string> = {
  1: '#f59e0b', 2: '#94a3b8', 3: '#ea580c',
};

function PlayerPodium({ player, rank, delay }: { player: PlayerEntry; rank: number; delay: number }) {
  const meta = PLAYER_PODIUM_META[rank] ?? { color: 'text-text', size: 'text-2xl', height: 'h-20' };
  const borderColor = PLAYER_PODIUM_BORDER[rank] ?? '#ffffff';
  const playerColor = player.color || '#ffffff';
  const r16 = parseInt(playerColor.slice(1, 3), 16);
  const g16 = parseInt(playerColor.slice(3, 5), 16);
  const b16 = parseInt(playerColor.slice(5, 7), 16);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="flex flex-col items-center"
    >
      <div className={`font-bold ${meta.size} ${meta.color} mb-4`}>{getOrdinal(rank)}</div>
      <div
        className="w-24 h-24 rounded-full border-4 flex items-center justify-center text-5xl mb-4"
        style={{ borderColor: playerColor, background: `rgba(${r16},${g16},${b16},0.3)` }}
      >
        {player.icon}
      </div>
      <div className="font-bold text-lg text-center">{player.nickname}</div>
      <div
        className={`${meta.height} w-20 rounded-t-lg mt-3 flex items-end justify-center pb-2`}
        style={{
          background: `linear-gradient(180deg,${playerColor}40 0%,${playerColor}10 100%)`,
          border: `2px solid ${borderColor}`,
        }}
      >
        <span className="font-mono font-bold text-primary text-lg">{player.score}</span>
      </div>
    </motion.div>
  );
}

type TeamPodiumProps = { entry: TeamEntry; rank: number; delay: number };

function TeamPodium({ entry, rank, delay }: TeamPodiumProps) {
  const STYLES = [
    { emoji: '🏆', labelColor: 'text-amber-300',  borderColor: 'border-amber-400',  bgColor: 'bg-amber-500/20',  iconSize: 'text-2xl' },
    { emoji: '2️⃣', labelColor: 'text-gray-300',   borderColor: 'border-gray-400',   bgColor: 'bg-gray-500/20',   iconSize: 'text-lg' },
    { emoji: '3️⃣', labelColor: 'text-orange-500', borderColor: 'border-orange-600', bgColor: 'bg-orange-600/20', iconSize: 'text-lg' },
  ] as const;
  const style = STYLES[rank - 1] ?? STYLES[2];

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="flex flex-col items-center text-center"
    >
      <div className={`font-bold mb-3 ${rank === 1 ? 'text-5xl' : 'text-4xl'}`}>{style.emoji}</div>
      <div className={`font-bold mb-3 ${rank === 1 ? 'text-2xl' : 'text-xl'} ${style.labelColor}`}>{entry.team}</div>
      <div className="flex gap-1 mb-4 flex-wrap justify-center">
        {entry.players.map(p => (
          <span key={p.id} title={p.nickname} className={style.iconSize}>{p.icon}</span>
        ))}
      </div>
      <div className={`p-4 rounded-lg w-24 border-2 ${style.borderColor} ${style.bgColor}`}>
        <div className={`font-mono font-bold ${rank === 1 ? 'text-2xl' : 'text-xl'} ${style.labelColor}`}>
          {entry.score}
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────
   End Screen Map Component
───────────────────────────────────────── */

function EndScreenMap({
  gameResults,
  mapStyle = 'osm',
  mapLanguage = 'local',
}: {
  gameResults: RoundResults[];
  mapStyle?: MapStyle;
  mapLanguage?: MapLanguage;
}) {
  const { t } = useI18n();

  // Calculate map bounds to fit all photos and guesses
  const allPoints = useMemo(() => {
    const points: [number, number][] = [];
    for (const round of gameResults) {
      if (round.photo.lat && round.photo.lon) {
        points.push([round.photo.lat, round.photo.lon]);
      }
      for (const result of round.results) {
        if (result.lat && result.lon) {
          points.push([result.lat, result.lon]);
        }
      }
    }
    return points;
  }, [gameResults]);

  const center = useMemo(() => {
    if (allPoints.length === 0) return [0, 0];
    const avgLat = allPoints.reduce((sum, p) => sum + p[0], 0) / allPoints.length;
    const avgLon = allPoints.reduce((sum, p) => sum + p[1], 0) / allPoints.length;
    return [avgLat, avgLon];
  }, [allPoints]);

  // Create custom photo marker icon (location pin emoji)
  const photoMarker = new L.DivIcon({
    className: 'leaflet-div-icon',
    html: `<div style="font-size:24px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">📍</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  // Create custom player marker icon with emoji only (no name label)
  const createPlayerMarker = (result: RoundResults['results'][0]) => {
    const content = `<div style="font-size: 24px; line-height: 1;">${result.isAI ? '🤖' : (result.icon || '👤')}</div>`;
    return new L.DivIcon({
      className: 'leaflet-div-icon',
      html: content,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });
  };

  return (
    <div className="h-80 rounded-lg overflow-hidden border-2 border-primary/20">
      <MapContainer
        center={center as [number, number]}
        zoom={2}
        style={{
          height: '100%',
          width: '100%',
        }}
      >
        <TileLayer
          key={`${mapStyle}-${mapLanguage}`}
          url={getTileUrl(mapStyle, mapLanguage)}
          attribution={getMapProvider(mapStyle).attribution}
          maxZoom={getMapProvider(mapStyle).maxZoom}
        />

        {/* Fit bounds to show all markers */}
        {allPoints.length > 0 && (
          <FitBoundsComponent points={allPoints} />
        )}

        {gameResults.map((round, roundIndex) => {
          const photoPos: [number, number] | null = round.photo.lat && round.photo.lon
            ? [round.photo.lat, round.photo.lon]
            : null;

          return (
            <Fragment key={`round-${roundIndex}`}>
              {/* Photo marker (actual location) */}
              {photoPos && (
                <Marker position={photoPos} icon={photoMarker}>
                  <Popup autoPan={true}>
                    <div className="text-center">
                      {round.photo.title && (
                        <div className="font-bold text-primary border-b border-primary/20 mb-1 pb-1">
                          {round.photo.title}
                        </div>
                      )}
                      <div className="text-sm font-medium">
                        {round.photo.country}
                      </div>
                      {round.photo.region && (
                        <div className="text-xs text-text-darker italic">
                          {round.photo.region}
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Player guesses */}
              {round.results.map((result) => {
                if (!result.lat || !result.lon) return null;
                return (
                  <Marker
                    key={`guess-${roundIndex}-${result.playerId}`}
                    position={[result.lat, result.lon]}
                    icon={createPlayerMarker(result)}
                  >
                    <Tooltip>
                      {result.nickname} - {t('result.distanceAway', { distance: result.distanceKm })}
                    </Tooltip>
                    <Popup>
                      <div>
                        <div className="font-bold">{result.nickname}</div>
                        <div className="text-sm text-text-darker">
                          {t('result.distanceAway', { distance: result.distanceKm })}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Lines from guesses to actual location */}
              {photoPos &&
                round.results.map((result) => {
                  if (!result.lat || !result.lon) return null;
                  return (
                    <Polyline
                      key={`line-${roundIndex}-${result.playerId}`}
                      positions={[[result.lat!, result.lon!], photoPos]}
                      color={result.color || '#9945ff'}
                      weight={2}
                      opacity={0.5}
                      dashArray="5, 5"
                    />
                  );
                })}
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

// Helper component to fit map bounds to all points
function FitBoundsComponent({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
      } catch (e) {
        logger.error('Failed to fit map bounds in EndScreenMap', e);
      }
    }
  }, [map, points]);

  return null;
}

/* ─────────────────────────────────────────
   GameEnd Component
───────────────────────────────────────── */

export interface GameEndProps {
  lobby: Lobby;
  gameResults: RoundResults[];
  onExitLobby: () => void;
  mapStyle?: MapStyle;
  mapLanguage?: MapLanguage;
}

export function GameEnd({ lobby, gameResults, onExitLobby, mapStyle = 'osm', mapLanguage = 'local' }: GameEndProps) {
  const { t, language } = useI18n();
  const isTeamMode = lobby.settings.gameMode === 'teams';
  const sorted = buildLeaderboard(lobby.players, isTeamMode, gameResults, t);
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  const gameMoments = useMemo(() => pickGameMoments(gameResults, t, language), [gameResults, t, language]);
  const [showMap, setShowMap] = useState(false);

  // Podium reveal delays: 2nd place reveals first (left), then 1st (centre), then 3rd (right).
  // We key delays by sorted rank (0-indexed) so they're stable regardless of how many
  // players are in top3.
  const PODIUM_DELAYS: Record<number, number> = { 1: 0.2, 0: 0.4, 2: 0.6 };

  // Visual order: 2nd left, 1st centre, 3rd right (classic podium layout)
  const podiumOrder = ([top3[1], top3[0], top3[2]] as Array<LeaderboardEntry | undefined>)
    .filter((e): e is LeaderboardEntry => e != null);

  return (
    <div className="text-center py-10 space-y-12">
      <div>
        <h2 className="text-4xl font-extrabold mb-2 text-primary flex items-center justify-center gap-3">
          <Crown /> {t('results.gameEnded')}
        </h2>
        <p className="text-text-darker">{t('results.finalLeaderboard')}</p>
      </div>

      {/* Podium */}
      <div className="flex justify-center items-end gap-6 h-80">
        {podiumOrder.map(item => {
          // Use 1-indexed rank from sorted position — sorted.indexOf is safe here since
          // podiumOrder is a filtered slice of the same sorted array.
          const rank = sorted.indexOf(item) + 1;
          const delay = PODIUM_DELAYS[rank - 1] ?? 0.6;
          return item.kind === 'team'
            ? <TeamPodium   key={entryKey(item)} entry={item} rank={rank} delay={delay} />
            : <PlayerPodium key={entryKey(item)} player={item} rank={rank} delay={delay} />;
        })}
      </div>

      {/* 4th place and below */}
      {rest.length > 0 && (
        <div className="max-w-md mx-auto">
          {rest.map((item, i) => (
            <div key={entryKey(item)} className="flex items-center gap-3 p-3 border-b border-primary/10">
              <div className="w-10 text-right font-bold text-lg text-primary/80">{getOrdinal(i + 4)}</div>
              {item.kind === 'team' ? (
                <>
                  <div className="flex-1 font-semibold text-left">{item.team}</div>
                  <div className="font-mono text-lg">{item.score}</div>
                </>
              ) : (
                <>
                  <div className="text-xl">{item.icon}</div>
                  <div className="w-3 h-3 rounded-full" style={{ background: item.color || '#fff' }} />
                  <div className="flex-1 font-semibold text-left">{item.nickname}</div>
                  <div className="font-mono text-lg">{item.score}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Game highlights */}
      {gameMoments.length > 0 && (
        <div className="max-w-2xl mx-auto px-4">
          <motion.h3
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="text-xs uppercase tracking-widest text-text-darker/50 font-semibold mb-4"
          >
            {t('results.gameHighlights')}
          </motion.h3>
          <div className="grid grid-cols-2 gap-3">
            {gameMoments.map((m, i) => <MomentCard key={m.label} moment={m} index={i} />)}
          </div>
        </div>
      )}

      {/* Map toggle and display */}
      <div className="max-w-4xl mx-auto px-4">
        <button
          onClick={() => setShowMap(!showMap)}
          className="w-full px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-text-darker hover:text-primary transition-colors flex items-center justify-center gap-2 font-semibold"
        >
          <MapIcon size={18} />
          {showMap ? t('game.hideMap') : t('game.showAllGuessesMap')}
        </button>
        
        {showMap && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
          >
            <EndScreenMap
              gameResults={gameResults}
              mapStyle={mapStyle}
              mapLanguage={mapLanguage}
            />
          </motion.div>
        )}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onExitLobby}
          className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors flex items-center gap-2"
        >
          <LogOut size={18} /> {t('results.returnToLobby')}
        </button>
      </div>
    </div>
  );
}