import { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import type { Lobby, Photo, RoundResults } from "../lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { useAchievementContext } from "../contexts/AchievementContext";
import { useI18n } from "../contexts/I18nContext";
import { claimAchievementEvent } from '../lib/achievementEvents';
import { uniqueLast, uniquePositiveWinner } from '../lib/achievementRules';

// Lazy load heavy components
const GameBoard = lazy(() => import("./game/GameBoard").then(m => ({ default: m.GameBoard })));
const GameEnd = lazy(() => import("./game/GameEnd").then(m => ({ default: m.GameEnd })));
const ResultComponent = lazy(() => import("./Result"));
const DateResult = lazy(() => import("./DateResult"));
const UploaderResult = lazy(() => import("./UploaderResult"));

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    <LoadingLabel />
  </div>
);

function LoadingLabel() {
  const { t } = useI18n();
  return <p className="text-text-darker animate-pulse">{t('common.loading')}</p>;
}

/**
 * Game Component
 * Main orchestration layer for game phases:
 * - round: Photo + map guess
 * - results: Individual round results
 * - end: Final podium + game highlights
 *
 * Delegates UI rendering to GameBoard and GameEnd modules
 * Handles achievement tracking across all phases
 */

type GameProps = {
  lobby: Lobby;
  playerId: string;
  phase: "waiting" | "round" | "results" | "end";
  photo: Photo | null;
  roundInfo: { roundIndex: number; totalRounds: number; duration: number };
  timerMs: number;
  timerStarted?: boolean;
  results: RoundResults | null;
  onSubmitGuess: (p: { lat: number; lon: number } | { date: string } | { uploaderId: string } | { dateChoice: 'before' | 'after' } | { photoOrder: string[] }) => Promise<boolean>;
  onExitLobby: () => void;
  serverAiTipIndex?: number | null;
};

export default function Game(props: GameProps) {
  const { phase, lobby, results, onExitLobby } = props;
  const { t } = useI18n();
  const achievements = useAchievementContext();
  const [gameResults, setGameResults] = useState<RoundResults[]>([]);
  const processedRoundKeysRef = useRef<Set<string>>(new Set());
  const processedGameCompletionRef = useRef(false);
  const humanPlayersCount = useMemo(
    () => lobby.players.filter(p => !p.isAI && !String(p.id).startsWith('ai-')).length,
    [lobby.players]
  );
  const isSoloHumanGame = humanPlayersCount <= 1;

  useEffect(() => {
    if (lobby.roundHistory?.length) {
      setGameResults(lobby.roundHistory);
    }
  }, [lobby.roundHistory]);

  const trackRoundAchievements = useCallback((roundResults: RoundResults) => {
    if (isSoloHumanGame) {
      const playerResult = roundResults.results.find(result => result.playerId === props.playerId);
      const aiResult = roundResults.results.find(result => result.isAI || String(result.playerId).startsWith('ai-'));
      if (lobby.settings.gameType === 'spot' && playerResult && aiResult) {
        const distanceDifference = aiResult.distanceKm - playerResult.distanceKm;
        if (distanceDifference > 0) achievements.trackAIBeat(distanceDifference);
      }
      return;
    }

    const playerResult = roundResults.results.find(r => r.playerId === props.playerId);
    const photo = roundResults.photo;
    const isOwnPhoto = photo.uploaderId === props.playerId;

    // Round wins follow awarded points (including uploader penalties), matching
    // the server leaderboard rather than merely choosing the nearest pin.
    const sortedResults = [...roundResults.results].sort((a, b) => b.points - a.points);
    const winner = sortedResults[0];
    const runnerUp = sortedResults[1];
    const didWinRound = uniquePositiveWinner(
      roundResults.results.map(result => ({ id: result.playerId, score: result.points })),
    ) === props.playerId;
    const winMarginKm = winner && runnerUp ? Math.abs(runnerUp.distanceKm - winner.distanceKm) : Number.POSITIVE_INFINITY;

    // Upload-country tracking is uploader-based and intentionally allowed on own photos.
    if (isOwnPhoto && photo.country && achievements.trackPhotoUploadFromCountry) {
      achievements.trackPhotoUploadFromCountry(photo.country);
    }
    if (isOwnPhoto && achievements.trackPhotoUsedInGame) {
      achievements.trackPhotoUsedInGame();
    }

    // Most round-based achievements only count for photos uploaded by other players.
    if (isOwnPhoto) {
      // An ineligible own-photo round cannot advance a streak, but it still
      // separates eligible successes and therefore must break streaks.
      achievements.trackRoundWin(false);
      achievements.trackScore(null);
      if (lobby.settings.gameType === 'uploader') achievements.trackUploaderGuess(false);
      if (lobby.settings.gameType === 'spot') {
        achievements.trackCorrectGuess('', '', photo.country || '', photo.region || '', Number.NaN, Number.NaN);
      }
      return;
    }

    achievements.trackRoundWin(didWinRound);
    achievements.trackScore(
      playerResult?.points ?? null,
      lobby.settings.gameType === 'spot' ? playerResult?.distanceKm : undefined,
    );
    if (playerResult?.timeTakenMs) achievements.trackFastGuess(playerResult.timeTakenMs);

    if (playerResult) {
      achievements.trackModeRound(lobby.settings.dateSubmode, playerResult.basePoints);
    }

    if (lobby.settings.gameType === 'date') {
      if (playerResult?.distanceDays != null && photo.captureDate && achievements.trackDateGuess) {
        achievements.trackDateGuess(playerResult.distanceDays, photo.captureDate);
      }
      return;
    }

    if (lobby.settings.gameType === 'uploader') {
      achievements.trackUploaderGuess(!!playerResult?.correctUploader);
      return;
    }

    if (!playerResult) {
      achievements.trackCorrectGuess('', '', photo.country || '', photo.region || '', Number.NaN, Number.NaN);
    }

    if (didWinRound && Number.isFinite(winMarginKm) && achievements.trackPhotoFinish) {
      achievements.trackPhotoFinish(winMarginKm);
    }

    if (playerResult) {
      // Track mind-blown guesses (>10,000km off)
      if (achievements.trackMindBlownGuess && playerResult.distanceKm >= 10000) {
        achievements.trackMindBlownGuess(playerResult.distanceKm);
      }

      // Track reverse psychology guesses (>18,000km off)
      if (achievements.trackReversePsychologyGuess && playerResult.distanceKm > 18000) {
        achievements.trackReversePsychologyGuess(playerResult.distanceKm);
      }

      // Track water guesses (no country)
      if (achievements.trackWaterGuess && playerResult.locationLookupSucceeded && !playerResult.country) {
        achievements.trackWaterGuess();
      }

      achievements.trackCorrectGuess(
        playerResult.country || '',
        playerResult.region || '',
        photo.country || '',
        photo.region || '',
        playerResult.lat ?? Number.NaN,
        playerResult.lon ?? Number.NaN,
      );

      // Track continent completion for correct guesses
      if (playerResult.country === photo.country && photo.country && achievements.trackContinentCompletion) {
        achievements.trackContinentCompletion(photo.country);
      }
    }

    // Track AI-related achievements
    const aiResult = roundResults.results.find(r => r.isAI);
    if (aiResult && playerResult) {
      const distanceDiff = aiResult.distanceKm - playerResult.distanceKm;
      if (distanceDiff > 0 && achievements.trackAIBeat) { // Player beat AI
        achievements.trackAIBeat(distanceDiff);
      }
    }
  }, [isSoloHumanGame, props.playerId, achievements, lobby.settings.gameType, lobby.settings.dateSubmode]);

  const trackGameCompletionAchievements = useCallback(() => {
    if (!achievements.trackGameCompletion) return;

    let isWinner = false;
    if (lobby.settings.gameMode === 'teams') {
      const playerTeam = lobby.players.find(p => p.id === props.playerId)?.team;
      const teamScores = new Map<string, number>();
      for (const round of gameResults) {
        const bestByTeam = new Map<string, number>();
        for (const result of round.results) {
          const team = lobby.players.find(p => p.id === result.playerId)?.team;
          if (!team) continue;
          bestByTeam.set(team, Math.max(bestByTeam.get(team) ?? 0, result.points));
        }
        for (const [team, score] of bestByTeam) teamScores.set(team, (teamScores.get(team) ?? 0) + score);
      }
      isWinner = !!playerTeam && uniquePositiveWinner(
        [...teamScores].map(([id, score]) => ({ id, score })),
      ) === playerTeam;
    } else {
      isWinner = uniquePositiveWinner(
        lobby.players.map(player => ({ id: player.id, score: player.score })),
      ) === props.playerId;
    }

    const playerTeam = lobby.players.find(p => p.id === props.playerId)?.team;
    // In team games, a perfect game means the player's team won every round.
    const playerWonAllRounds = gameResults.length > 0 && gameResults.every(round => {
      if (lobby.settings.gameMode !== 'teams') {
        return uniquePositiveWinner(
          round.results.map(result => ({ id: result.playerId, score: result.points })),
        ) === props.playerId;
      }
      const bestByTeam = new Map<string, number>();
      for (const result of round.results) {
        const team = lobby.players.find(p => p.id === result.playerId)?.team;
        if (team) bestByTeam.set(team, Math.max(bestByTeam.get(team) ?? 0, result.points));
      }
      return !!playerTeam && uniquePositiveWinner(
        [...bestByTeam].map(([id, score]) => ({ id, score })),
      ) === playerTeam;
    });

    // Check for team game wins
    if (lobby.settings.gameMode === 'teams' && isWinner && achievements.trackTeamGameWin) {
      achievements.trackTeamGameWin();
    }

    // Check for comeback wins (need to track round 1 position)
    if (gameResults.length > 1 && isWinner && achievements.trackComebackWin) {
      // Check if player was last in first round
      const firstRound = gameResults[0];
      if (firstRound) {
        let wasLastInFirstRound = false;
        if (lobby.settings.gameMode === 'teams') {
          const firstScores = new Map<string, number>();
          for (const result of firstRound.results) {
            const team = lobby.players.find(p => p.id === result.playerId)?.team;
            if (team) firstScores.set(team, Math.max(firstScores.get(team) ?? 0, result.points));
          }
          wasLastInFirstRound = !!playerTeam && uniqueLast(
            [...firstScores].map(([id, score]) => ({ id, score })),
          ) === playerTeam;
        } else {
          wasLastInFirstRound = uniqueLast(
            firstRound.results.map(result => ({ id: result.playerId, score: result.points })),
          ) === props.playerId;
        }

        if (wasLastInFirstRound) {
          achievements.trackComebackWin();
        }
      }
    }

    if (achievements.trackPhotoWithMostCorrectGuesses) {
      const correctCounts = gameResults.map(round => ({
        uploaderId: round.photo.uploaderId,
        count: round.results.filter(result => {
          if (result.isAI || String(result.playerId).startsWith('ai-')) return false;
          return lobby.settings.gameType === 'date'
            ? result.distanceDays != null && result.distanceDays <= 30
            : lobby.settings.gameType === 'uploader'
              ? !!result.correctUploader
              : !!round.photo.country && result.country === round.photo.country;
        }).length,
      }));
      const bestCount = Math.max(...correctCounts.map(entry => entry.count), 0);
      const bestPhotos = correctCounts.filter(entry => entry.count === bestCount);
      if (bestCount > 0 && bestPhotos.length === 1 && bestPhotos[0]?.uploaderId === props.playerId) {
        achievements.trackPhotoWithMostCorrectGuesses();
      }
    }

    // Track game completion - solo games (vs AI) don't count towards achievement progress
    achievements.trackGameCompletion(
      isWinner ? 'win' : 'loss',
      playerWonAllRounds,
      isSoloHumanGame,
      lobby.settings.gameType || 'spot',
    );
  }, [achievements, lobby.players, props.playerId, gameResults, lobby.settings.gameMode, lobby.settings.gameType, isSoloHumanGame]);

  useEffect(() => {
    if (phase === "results" && results) {
      const roundKey = `${results.photo.id}:${results.roundIndex}`;
      if (processedRoundKeysRef.current.has(roundKey)) {
        return;
      }

      processedRoundKeysRef.current.add(roundKey);
      const gameId = results.gameId || lobby.gameId;
      if (gameId && !claimAchievementEvent(`round:${gameId}:${props.playerId}:${results.roundIndex}`)) return;
      setGameResults(prev => {
        const existingIndex = prev.findIndex(r => r.photo.id === results.photo.id && r.roundIndex === results.roundIndex);
        if (existingIndex === -1) return [...prev, results];
        const next = [...prev];
        next[existingIndex] = results;
        return next;
      });

      trackRoundAchievements(results);
    }
  }, [phase, results, trackRoundAchievements, lobby.gameId, props.playerId]);

  useEffect(() => {
    if (phase === "end") {
      if (lobby.roundHistory?.length && gameResults.length !== lobby.roundHistory.length) return;
      // Track game completion achievements only once per game session
      if (!processedGameCompletionRef.current) {
        processedGameCompletionRef.current = true;
        const gameId = lobby.gameId || gameResults[0]?.gameId;
        if (gameId && !claimAchievementEvent(`game:${gameId}:${props.playerId}`)) return;
        trackGameCompletionAchievements();
      }
    }
    if (phase === "waiting") {
      processedRoundKeysRef.current.clear();
      setGameResults([]);
      processedGameCompletionRef.current = false; // Reset for next game
    }
  }, [phase, trackGameCompletionAchievements, gameResults, lobby.gameId, lobby.roundHistory?.length, props.playerId]);

  return (
    <AnimatePresence mode="wait">
      {phase === "round" && props.photo && (
        <motion.div key="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Suspense fallback={<LoadingFallback />}>
            <GameBoard
              lobby={lobby}
              photo={props.photo}
              roundInfo={props.roundInfo}
              timerMs={props.timerMs}
              timerStarted={props.timerStarted}
              playerId={props.playerId}
              onSubmitGuess={props.onSubmitGuess}
              serverAiTipIndex={props.serverAiTipIndex}
            />
          </Suspense>
        </motion.div>
      )}

      {phase === "results" && props.results && (
        <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Suspense fallback={<LoadingFallback />}>
            {/* Pass prior rounds so moments can detect streaks, comebacks, etc. */}
            {lobby.settings.gameType === 'date' ? (
              <DateResult data={props.results} lobby={props.lobby} playerId={props.playerId} />
            ) : lobby.settings.gameType === 'uploader' ? (
              <UploaderResult data={props.results} lobby={props.lobby} playerId={props.playerId} />
            ) : (
              <ResultComponent
                data={props.results}
                timerMs={props.timerMs}
                lobby={props.lobby}
                playerId={props.playerId}
                allPriorRounds={gameResults.slice(0, -1)}
                mapStyle={props.lobby.settings.mapStyle || 'osm'}
                mapLanguage={props.lobby.settings.mapLanguage || 'local'}
              />
            )}
          </Suspense>
        </motion.div>
      )}

      {phase === "end" && (
        <motion.div key="end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Suspense fallback={<LoadingFallback />}>
            <GameEnd
              lobby={lobby}
              gameResults={gameResults}
              onExitLobby={onExitLobby}
              mapStyle={lobby.settings.mapStyle || 'osm'}
              mapLanguage={lobby.settings.mapLanguage || 'local'}
            />
          </Suspense>
        </motion.div>
      )}

      {phase === "waiting" && (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex flex-col items-center justify-center min-h-[60vh] gap-4"
        >
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-text-darker animate-pulse">{t('common.loading')}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
