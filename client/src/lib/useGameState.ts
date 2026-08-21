import { useState, useRef, useEffect } from 'react'
import type { Photo, RoundResults } from './types'
import { logger } from './logger'

/**
 * Custom hook for managing game state and persistence
 * Tracks current game phase, photo, round info, timer, and results
 * The server is authoritative and restores state after reconnect.
 */
export function useGameState() {
  const [phase, setPhase] = useState<'waiting'|'round'|'results'|'end'>('waiting')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [roundInfo, setRoundInfo] = useState<{roundIndex:number,totalRounds:number,duration:number}>({roundIndex:0,totalRounds:0,duration:0})
  const [timerMs, setTimerMs] = useState(0)
  const [results, setResults] = useState<RoundResults | null>(null)

  // Refs to track current state for use in event handlers (avoid stale closures)
  const phaseRef = useRef(phase)
  const photoRef = useRef(photo)
  const roundInfoRef = useRef(roundInfo)
  const timerMsRef = useRef(timerMs)
  const resultsRef = useRef(results)

  // Update refs whenever state changes (for use in event handlers)
  useEffect(() => {
    phaseRef.current = phase
    photoRef.current = photo
    roundInfoRef.current = roundInfo
    timerMsRef.current = timerMs
    resultsRef.current = results
  }, [phase, photo, roundInfo, timerMs, results])

  /**
   * Reset all game state to initial values
   */
  const resetGameState = () => {
    setPhase('waiting')
    setPhoto(null)
    setRoundInfo({roundIndex:0,totalRounds:0,duration:0})
    setTimerMs(0)
    setResults(null)
  }

  /**
   * Compatibility shim for existing event handlers. Game state used to be
   * persisted here, but it was never safely replayed and could retain private
   * photo URLs. Reconnection now always hydrates from serialized server state.
   */
  const saveGameState = (
    _phaseToSave: 'waiting'|'round'|'results'|'end',
    _photoToSave: Photo | null,
    _roundInfoToSave: {roundIndex:number,totalRounds:number,duration:number},
    _timerMsToSave: number,
    _resultsToSave: RoundResults | null
  ) => {
    try {
      window.localStorage.removeItem('geo-snap-gameState')
    } catch (error) {
      // Silently fail - localStorage may be unavailable in private browsing
      logger.error('Could not save game state', error)
    }
  }

  return {
    phase, setPhase,
    photo, setPhoto,
    roundInfo, setRoundInfo,
    timerMs, setTimerMs,
    results, setResults,
    phaseRef, photoRef, roundInfoRef, timerMsRef, resultsRef,
    resetGameState,
    saveGameState
  }
}
