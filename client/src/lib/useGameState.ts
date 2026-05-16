import { useState, useRef, useEffect } from 'react'
import type { Photo, RoundResults } from './types'
import { logger } from './logger'

/**
 * Custom hook for managing game state and persistence
 * Tracks current game phase, photo, round info, timer, and results
 * Persists state to localStorage for recovery on page refresh
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
   * Save current game state to localStorage for recovery
   * @param phaseToSave - Current game phase
   * @param photoToSave - Current photo data
   * @param roundInfoToSave - Current round information
   * @param timerMsToSave - Current timer value
   * @param resultsToSave - Current round results
   */
  const saveGameState = (
    phaseToSave: 'waiting'|'round'|'results'|'end',
    photoToSave: Photo | null,
    roundInfoToSave: {roundIndex:number,totalRounds:number,duration:number},
    timerMsToSave: number,
    resultsToSave: RoundResults | null
  ) => {
    try {
      if (phaseToSave === 'waiting') {
        window.localStorage.removeItem('geo-snap-gameState')
      } else {
        window.localStorage.setItem('geo-snap-gameState', JSON.stringify({
          phase: phaseToSave,
          photo: photoToSave,
          roundInfo: roundInfoToSave,
          timerMs: timerMsToSave,
          results: resultsToSave,
          timestamp: Date.now()
        }))
      }
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