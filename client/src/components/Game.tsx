import { useState, useMemo, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import type { Lobby, Photo, RoundResults } from "../lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { useAchievementContext } from "../contexts/AchievementContext";
import { useI18n } from "../contexts/I18nContext";

// Lazy load heavy components
const GameBoard = lazy(() => import("./game/GameBoard").then(m => ({ default: m.GameBoard })));
const GameEnd = lazy(() => import("./game/GameEnd").then(m => ({ default: m.GameEnd })));
const ResultComponent = lazy(() => import("./Result"));

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    <p className="text-text-darker animate-pulse">Loading...</p>
  </div>
);

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
  onSubmitGuess: (p: { lat: number; lon: number }) => void;
  onExitLobby: () => void;
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

  const trackRoundAchievements = useCallback((roundResults: RoundResults) => {
    if (isSoloHumanGame) {
      return;
    }

    const playerResult = roundResults.results.find(r => r.playerId === props.playerId);
    const photo = roundResults.photo;
    const isOwnPhoto = photo.uploaderId === props.playerId;

    const sortedResults = [...roundResults.results].sort((a, b) => a.distanceKm - b.distanceKm);
    const winner = sortedResults[0];
    const runnerUp = sortedResults[1];
    const didWinRound = winner?.playerId === props.playerId;
    const winMarginKm = winner && runnerUp ? Math.abs(runnerUp.distanceKm - winner.distanceKm) : Number.POSITIVE_INFINITY;

    if (achievements.trackRoundWin) {
      achievements.trackRoundWin(!!didWinRound);
    }

    // Upload-country tracking is uploader-based and intentionally allowed on own photos.
    if (isOwnPhoto && photo.country && achievements.trackPhotoUploadFromCountry) {
      achievements.trackPhotoUploadFromCountry(photo.country);
    }

    // Most round-based achievements only count for photos uploaded by other players.
    if (isOwnPhoto) {
      return;
    }

    if (didWinRound && Number.isFinite(winMarginKm) && achievements.trackPhotoFinish) {
      achievements.trackPhotoFinish(winMarginKm);
    }

    if (playerResult) {
      // Track score and distance achievements
      if (achievements.trackScore) {
        achievements.trackScore(playerResult.points, playerResult.distanceKm);
      }

      // Track fast guesses
      if (achievements.trackFastGuess && playerResult.timeTakenMs) {
        achievements.trackFastGuess(playerResult.timeTakenMs);
      }

      // Track mind-blown guesses (>10,000km off)
      if (achievements.trackMindBlownGuess && playerResult.distanceKm > 10000) {
        achievements.trackMindBlownGuess(playerResult.distanceKm);
      }

      // Track reverse psychology guesses (>18,000km off)
      if (achievements.trackReversePsychologyGuess && playerResult.distanceKm > 18000) {
        achievements.trackReversePsychologyGuess(playerResult.distanceKm);
      }

      // Track water guesses (no country)
      if (achievements.trackWaterGuess && !playerResult.country) {
        achievements.trackWaterGuess();
      }

      // Track correct country/region if applicable
      if (playerResult.country === photo.country && achievements.trackCorrectGuess) {
        achievements.trackCorrectGuess(
          playerResult.country || '',
          playerResult.region || '',
          playerResult.lat,
          playerResult.lon
        );
      }

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
  }, [isSoloHumanGame, props.playerId, achievements]);

  const trackGameCompletionAchievements = useCallback(() => {
    if (!achievements.trackGameCompletion) return;

    // Determine if player won the game
    const leaderboard = lobby.players
      .map(p => ({ id: p.id, score: p.score }))
      .sort((a, b) => b.score - a.score);

    const player = leaderboard.find(p => p.id === props.playerId);
    const isWinner = player && player.score === leaderboard[0]?.score;

    // Check if it was a perfect game (won all rounds)
    const playerWonAllRounds = gameResults.every(round => {
      const roundWinner = [...round.results].sort((a, b) => a.distanceKm - b.distanceKm)[0];
      return roundWinner?.playerId === props.playerId;
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
        const firstRoundResults = [...firstRound.results].sort((a, b) => a.distanceKm - b.distanceKm);
        const wasLastInFirstRound = firstRoundResults[firstRoundResults.length - 1]?.playerId === props.playerId;

        if (wasLastInFirstRound) {
          achievements.trackComebackWin();
        }
      }
    }

    if (achievements.trackPhotoWithMostCorrectGuesses) {
      const playerPhotos = gameResults.filter(round => round.photo.uploaderId === props.playerId);
      const hasHumanInPlayerPhotoRounds = playerPhotos.some(round =>
        round.results.some(r => !r.isAI && !String(r.playerId).startsWith('ai-'))
      );
      if (playerPhotos.length > 0 && hasHumanInPlayerPhotoRounds && isWinner) {
        achievements.trackPhotoWithMostCorrectGuesses();
      }
    }

    // Track game completion - solo games (vs AI) don't count towards achievement progress
    achievements.trackGameCompletion(isWinner ? 'win' : 'loss', playerWonAllRounds, isSoloHumanGame);
  }, [achievements, lobby.players, props.playerId, gameResults, lobby.settings.gameMode, isSoloHumanGame]);

  useEffect(() => {
    if (phase === "results" && results) {
      const roundKey = `${results.photo.id}:${results.roundIndex}`;
      if (processedRoundKeysRef.current.has(roundKey)) {
        return;
      }

      processedRoundKeysRef.current.add(roundKey);
      setGameResults(prev => {
        const existingIndex = prev.findIndex(r => r.photo.id === results.photo.id && r.roundIndex === results.roundIndex);
        if (existingIndex === -1) return [...prev, results];
        const next = [...prev];
        next[existingIndex] = results;
        return next;
      });

      trackRoundAchievements(results);
    }
  }, [phase, results, trackRoundAchievements]);

  useEffect(() => {
    if (phase === "end") {
      // Track game completion achievements only once per game session
      if (!processedGameCompletionRef.current) {
        processedGameCompletionRef.current = true;
        trackGameCompletionAchievements();
      }
    }
    if (phase === "waiting") {
      processedRoundKeysRef.current.clear();
      setGameResults([]);
      processedGameCompletionRef.current = false; // Reset for next game
    }
  }, [phase, trackGameCompletionAchievements]);

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
            />
          </Suspense>
        </motion.div>
      )}

      {phase === "results" && props.results && (
        <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Suspense fallback={<LoadingFallback />}>
            {/* Pass prior rounds so moments can detect streaks, comebacks, etc. */}
            <ResultComponent
              data={props.results}
              timerMs={props.timerMs}
              lobby={props.lobby}
              playerId={props.playerId}
              allPriorRounds={gameResults.slice(0, -1)}
              mapStyle={props.lobby.settings.mapStyle || 'osm'}
              mapLanguage={props.lobby.settings.mapLanguage || 'local'}
            />
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
