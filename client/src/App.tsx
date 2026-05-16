import Layout from './components/Layout'
import LobbyView from './components/Lobby'
import Game from './components/Game'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AchievementProvider } from './contexts/AchievementContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { I18nProvider } from './contexts/I18nContext'
import { useI18n } from './contexts/I18nContext'
import { AchievementsDialog } from './components/AchievementsDialog'
import { AchievementNotification } from './components/AchievementNotification'
import { useToast } from './lib/toast'
import { ToastProvider, ToastContainer } from './lib/toast.tsx'
import { useEffect, useState, useRef } from 'react'
import { socket, api, getClientSessionId, getStoredToken } from './lib/socket'
import type { Lobby, Player } from './lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { useGameState } from './lib/useGameState'
import { useAchievements } from './lib/useAchievements'
import { logger } from './lib/logger'
import {
  APP_VERSION,
  VERSION_LOG,
  VERSION_STORAGE_KEY,
  getVersionNotesSince,
  isVersionNewer,
  type VersionLogEntry,
} from './lib/version'

// Socket response types
interface SocketResponse { success?: boolean; error?: string; lobby?: Lobby; playerId?: string }

// Lobby settings update type
interface LobbySettingsUpdate {
  timerMode?: 'fixed' | 'progressive';
  roundDurationSec?: number;
  duelRaceTimeSec?: number;
  gameMode?: 'individual' | 'teams';
  hintThresholdSec?: number;
  uploaderPenaltyPercent?: number;
  minPhotosPerPlayer?: number;
  maxPhotosPerPlayer?: number;
  language?: string;
  enableAIGuessing?: boolean;
  visionCommentary?: boolean;
  autoNameImages?: boolean;
  showImageDate?: boolean;
}

type AchievementsApi = ReturnType<typeof useAchievements>

function AppContent({ achievementsApi }: { achievementsApi: AchievementsApi }) {
  const { t } = useI18n()
  const { addToast } = useToast()
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [playerId, setPlayerId] = useState('')
  const [nickname, setNickname] = useState('')
  const [joinLobbyId, setJoinLobbyId] = useState('')
  const [timerStarted, setTimerStarted] = useState(false)
  const [roundStartAt, setRoundStartAt] = useState<number | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [showAchievements, setShowAchievements] = useState(false)
  const [showAchievementNotification, setShowAchievementNotification] = useState(false)
  const [showVersionLog, setShowVersionLog] = useState(false)
  const [hasUnseenVersionLog, setHasUnseenVersionLog] = useState(false)
  const [versionNotes, setVersionNotes] = useState<VersionLogEntry[]>([])
  const reconnectAttemptedRef = useRef(false)
  const lobbyRef = useRef<Lobby | null>(null)
  const playerIdRef = useRef('')
  const roundStartAtRef = useRef<number | null>(null)
  const timerStartedRef = useRef(false)
  const phaseRefForTimer = useRef<string>('waiting')

  // Use achievements hook
  const {
    achievements,
    getEarnedAchievements,
    getNextAchievements,
    getUnlockedThisGame,
    clearSessionTracking,
    resetAllAchievements
  } = achievementsApi;

  // Use custom hook for game state management
  const {
    phase, setPhase,
    photo, setPhoto,
    roundInfo, setRoundInfo,
    timerMs, setTimerMs,
    results, setResults,
    phaseRef, photoRef, roundInfoRef, timerMsRef, resultsRef,
    resetGameState,
    saveGameState
  } = useGameState()

  const syncClientStateFromLobby = (l: Lobby) => {
    if (l.state === 'waiting') {
      if (phaseRef.current !== 'waiting') {
        setPhase('waiting')
        setPhoto(null)
        setRoundInfo({ roundIndex: 0, totalRounds: 0, duration: 0 })
        setTimerMs(0)
        setRoundStartAt(null)
        setResults(null)
        saveGameState('waiting', null, { roundIndex: 0, totalRounds: 0, duration: 0 }, 0, null)
      }
      return
    }

    if (l.state === 'in_round' && l.currentRoundPhoto) {
      // Client uses user-facing duration (what player sees in settings)
      // Server internally adds +1s buffer, but client doesn't know about it
      const durationMs = (l.settings?.roundDurationSec || 45) * 1000
      const nextRoundInfo = {
        roundIndex: l.roundIndex,
        totalRounds: l.totalRounds,
        duration: durationMs
      }

      // Calculate remaining time using server timestamp for accuracy
      if (l.settings?.timerMode === 'progressive' && l.firstGuessAt) {
        // Progressive mode: use firstGuessAt
        setRoundStartAt(l.firstGuessAt)
        const elapsed = Date.now() - l.firstGuessAt
        const duelRaceTimeMs = (l.settings?.duelRaceTimeSec || 15) * 1000
        const remaining = Math.max(0, duelRaceTimeMs - elapsed)
        setTimerMs(remaining)
        setTimerStarted(remaining > 0)
      } else if (l.roundStartAt) {
        // Fixed mode: use roundStartAt
        setRoundStartAt(l.roundStartAt)
        const elapsed = Date.now() - l.roundStartAt
        const remaining = Math.max(0, durationMs - elapsed)
        setTimerMs(remaining)
        setTimerStarted(remaining > 0)
      }

      setPhase('round')
      setPhoto(l.currentRoundPhoto)
      setRoundInfo(nextRoundInfo)
      saveGameState('round', l.currentRoundPhoto, nextRoundInfo, timerMsRef.current, null)
      return
    }

    if (l.state === 'showing_results' && l.lastRoundResults) {
      setPhase('results')
      setResults(l.lastRoundResults)
      setRoundStartAt(null)
      setTimerMs(0)
      saveGameState('results', photoRef.current, roundInfoRef.current, 0, l.lastRoundResults)
      return
    }

    if (l.state === 'finished') {
      setPhase('end')
      setRoundStartAt(null)
      setTimerMs(0)
      saveGameState('end', photoRef.current, roundInfoRef.current, 0, resultsRef.current)
    }
  }

  const clearSession = () => {
    try {
      window.localStorage.removeItem('geo-snap-lobbyId')
      window.localStorage.removeItem('geo-snap-playerId')
      window.localStorage.removeItem('geo-snap-gameState')
      window.localStorage.removeItem('geo-snap-joinLobbyId')
    } catch (error) {
      logger.error('Could not clear session', error)
    }
  }

  // Update refs whenever state changes (for use in event handlers)
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    phaseRef.current = phase
    photoRef.current = photo
    roundInfoRef.current = roundInfo
    timerMsRef.current = timerMs
    resultsRef.current = results
    lobbyRef.current = lobby
    playerIdRef.current = playerId
    roundStartAtRef.current = roundStartAt
    timerStartedRef.current = timerStarted
    phaseRefForTimer.current = phase
    logger.debug('State updated', { phase, lobby: !!lobby, playerId: !!playerId });
  }, [phase, photo, roundInfo, timerMs, results, lobby, playerId, roundStartAt, timerStarted])
  /* eslint-enable react-hooks/exhaustive-deps */

  // Function declarations (moved to top to avoid "accessed before declaration" errors)
  function exitLobby() {
    if (lobby && playerId) {
      socket.emit('leave_lobby', { lobbyId: lobby.id, playerId }, (response: SocketResponse) => {
        if (!response?.success) {
          handleSocketError('leave lobby')({ message: response?.error || 'Unknown error' });
          return; // Don't clear session if error occurred
        }
        // Clear session after successful server response
        clearSession();
        window.localStorage.removeItem('geo-snap-joinLobbyId');
        setLobby(null);
        setPlayerId('');
        setJoinLobbyId('');
        resetGameState();
      });
    } else {
      // Already not in a lobby, just clear state
      clearSession();
      window.localStorage.removeItem('geo-snap-joinLobbyId');
      setLobby(null);
      setPlayerId('');
      setJoinLobbyId('');
      resetGameState();
    }
  }

  function handleSocketError(actionName: string) {
    return (error: unknown) => {
      logger.error(`${actionName} failed`, error);
      addToast(t('toast.lobbyActionFailed', { action: actionName }), 'error', 5000);
      // Reset to main page
      clearSession();
      setLobby(null);
      setPlayerId('');
      setJoinLobbyId('');
      resetGameState();
    };
  }

  useEffect(() => {
    // Handle URL join parameter
    const params = new URLSearchParams(window.location.search)
    const joinId = params.get('join')
    if (joinId && joinId.length >= 3 && joinId.length <= 12) {
      setJoinLobbyId(joinId)
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    // Restore playerId from localStorage for session persistence
    try {
      const savedPlayerId = window.localStorage.getItem('geo-snap-playerId')
      const savedLobbyId = window.localStorage.getItem('geo-snap-lobbyId')
      const savedJoinLobbyId = window.localStorage.getItem('geo-snap-joinLobbyId')

      // If we have a joinId from URL, prioritize it and don't restore from cache
      if (joinId) {
        // Clear any cached session when joining via URL to ensure clean join
        clearSession();
      } else {
        // Only restore from cache if no URL join parameter
        if (savedPlayerId) setPlayerId(savedPlayerId)
        if (savedLobbyId) {
          setJoinLobbyId(savedLobbyId)
        } else if (savedJoinLobbyId) {
          setJoinLobbyId(savedJoinLobbyId)
        }
      }

      const savedNickname = window.localStorage.getItem('geo-snap-last-nickname')
      if (savedNickname) setNickname(savedNickname)

      // Only mark as seen, don't auto-show version log
      const lastSeenVersion = window.localStorage.getItem(VERSION_STORAGE_KEY)
      if (lastSeenVersion && isVersionNewer(APP_VERSION, lastSeenVersion)) {
        const notes = getVersionNotesSince(lastSeenVersion)
        if (notes.length > 0) {
          setVersionNotes(notes)
          setHasUnseenVersionLog(true)
          // Removed: setShowVersionLog(true) - don't auto-show
        }
      }
      window.localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION)
    } catch (error) {
      logger.warn('Could not restore session', error)
    }
  }, [])

  useEffect(() => {
    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) return
    try {
      window.localStorage.setItem('geo-snap-last-nickname', trimmedNickname)
    } catch (error) {
      logger.error('Could not save nickname', error)
    }
  }, [nickname])

  useEffect(() => {
    const handleWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
      }
    }

    const handleKeyboardZoom = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (['+', '-', '=', '0'].includes(event.key)) {
        event.preventDefault()
      }
    }

    document.addEventListener('wheel', handleWheelZoom, { passive: false })
    window.addEventListener('keydown', handleKeyboardZoom)
    return () => {
      document.removeEventListener('wheel', handleWheelZoom)
      window.removeEventListener('keydown', handleKeyboardZoom)
    }
  }, [])

  // Handle joining a different lobby while already in one
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (joinLobbyId && lobby && lobby.id !== joinLobbyId) {
      // User clicked a join link while already in a different lobby
      logger.debug('Switching lobbies', { currentLobby: lobby.id, newLobby: joinLobbyId });
      // Exit current lobby but preserve joinLobbyId for the new join flow
      if (lobby && playerId) {
        socket.emit('leave_lobby', { lobbyId: lobby.id, playerId }, (response: SocketResponse) => {
          if (!response?.success) {
            handleSocketError('leave lobby')({ message: response?.error || 'Unknown error' });
            // Clear joinLobbyId if leave failed to prevent stuck state
            setJoinLobbyId('');
            return;
          }
          // Successfully left, clear session but keep joinLobbyId for join flow
          clearSession();
          setLobby(null);
          setPlayerId('');
          resetGameState();
          // Note: NOT clearing joinLobbyId so the join flow can proceed
        });
      }
    }
  }, [joinLobbyId, lobby])
  /* eslint-enable react-hooks/exhaustive-deps */

  // Set up socket event listeners - runs once on mount
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    // Handle lobby updates - sync client phase with server state
    socket.on('connect', () => {
      try {
        const savedLobbyId = window.localStorage.getItem('geo-snap-lobbyId')
        const savedPlayerId = window.localStorage.getItem('geo-snap-playerId')
        const savedJoinLobbyId = window.localStorage.getItem('geo-snap-joinLobbyId')
        const clientSessionId = getClientSessionId()
        
        // Try full session reconnection first
        if (savedLobbyId && savedPlayerId) {
          socket.emit('join_lobby', {
            lobbyId: savedLobbyId,
            playerId: savedPlayerId,
            nickname: nickname || 'Player',
            clientSessionId,
          })
        }
        // Fallback: try to reconnect using just joinLobbyId if we have one
        else if (savedJoinLobbyId && !lobbyRef.current) {
          socket.emit('join_lobby', {
            lobbyId: savedJoinLobbyId,
            nickname: nickname || 'Player',
            clientSessionId,
          })
        }
      } catch {
        // no-op
      }
    })

    socket.on('lobby_update', (l: Lobby) => {
      logger.debug('lobby_update received', {
        state: l.state,
        currentPhase: phaseRef.current,
        lobbyId: l.id,
        playerCount: l.players.length,
        photosCount: l.photos?.length || 0,
        willReset: l.state === 'waiting' && phaseRef.current !== 'waiting'
      });
      
      // Accept all lobby updates - validation happens at display time
      setLobby(l)
      
      syncClientStateFromLobby(l)
    })

    // Handle reconnection event
    socket.on('reconnected', ({ lobby: l, playerId: pid }) => {
      logger.debug('reconnected event', { state: l.state, playerId: pid });
      reconnectAttemptedRef.current = true
      setLobby(l)
      if (pid) {
        setPlayerId(pid)
        const me = l.players.find((p: Player) => p.id === pid)
        if (me) setNickname(me.nickname)
      }

      syncClientStateFromLobby(l)
    })

    socket.on('reconnection_failed', ({ error }) => {
      logger.debug('reconnection_failed event', { error });
      addToast(t('toast.sessionExpired'), 'info', 5000);
      reconnectAttemptedRef.current = false
      clearSession();
      setLobby(null);
      setPlayerId('');
      setNickname('');
      resetGameState();
    })

    socket.on('joined', ({ lobby: l, playerId: pid }) => {
      logger.debug('joined event', { state: l.state, playerId: pid });
      reconnectAttemptedRef.current = true
      setIsJoining(false) // Join succeeded, clear loading state
      setLobby(l)
      if (pid) {
        setPlayerId(pid)
        // Find our own nickname to display
        const me = l.players.find((p: Player) => p.id === pid)
        if (me) setNickname(me.nickname)
        // Save session with normalized uppercase lobby ID
        try {
          window.localStorage.setItem('geo-snap-lobbyId', l.id.toUpperCase())
          window.localStorage.setItem('geo-snap-playerId', pid)
        } catch (e) { logger.error('Could not save session', e) }
      }

      syncClientStateFromLobby(l)
    })

    socket.on('error_msg', (data) => {
      setIsJoining(false) // Reset loading state on error
      
      // Handle both string messages and error code objects
      let errorCode: string | null = null;
      let errorMsg: string = '';
      
      if (typeof data === 'object' && data !== null) {
        // New format: { code: string, message?: string }
        errorCode = data.code || null;
        errorMsg = data.message || '';
      } else {
        // Legacy format: string message
        errorMsg = String(data || '');
      }
      
      const lower = errorMsg.toLowerCase();
      const isJoinFlowIssue =
        lower.includes('lobby not found') ||
        lower.includes('session not found') ||
        lower.includes('invalid lobby');

      if (isJoinFlowIssue && !lobbyRef.current) {
        addToast(t('toast.invalidLobby'), 'info', 4500);
        clearSession();
        setLobby(null);
        setPlayerId('');
        setJoinLobbyId('');
        resetGameState();
        reconnectAttemptedRef.current = false;
        return;
      }

      if (isJoinFlowIssue && lobbyRef.current) {
        addToast(t('toast.connectionHiccup'), 'warning', 3500)
        socket.emit('request_lobby_sync', { lobbyId: lobbyRef.current.id, playerId: playerIdRef.current }, (response: SocketResponse) => {
          if (response?.success && response?.lobby) {
            setLobby(response.lobby)
            syncClientStateFromLobby(response.lobby)
          }
        })
        return
      }

      // Try to translate error code if available
      if (errorCode && errorCode.startsWith('errors.')) {
        addToast(t(errorCode, { error: errorMsg }), 'error', 5000);
      } else {
        addToast(errorMsg || t('toast.somethingWrong'), 'error', 5000);
      }
    })
    socket.on('kicked', () => {
      addToast(t('toast.kickedFromLobby'), 'warning', 5000)
      exitLobby()
    })

    socket.on('round_start', (payload) => {
      logger.debug('round_start event', payload);
      // Clear session tracking for new game (on first round)
      if (payload.roundIndex === 0) {
        clearSessionTracking();
      }
      setPhase('round')
      setPhoto(payload.photo)
      setRoundInfo({ roundIndex: payload.roundIndex, totalRounds: payload.totalRounds, duration: payload.roundDurationMs })

      const isProgressive = lobbyRef.current?.settings?.timerMode === 'progressive'
      if (isProgressive) {
        if (payload.firstGuessAt) {
          // Timer already running — sync to firstGuessAt
          setRoundStartAt(payload.firstGuessAt)
          const elapsed = Date.now() - payload.firstGuessAt
          setTimerMs(Math.max(0, payload.roundDurationMs - elapsed))
          setTimerStarted(true)
        } else {
          // No guess yet — timer hasn't started
          setRoundStartAt(payload.roundStartAt || Date.now())
          setTimerMs(0)
          setTimerStarted(false)
        }
      } else {
        setRoundStartAt(payload.roundStartAt || Date.now())
        const elapsed = payload.roundStartAt ? Date.now() - payload.roundStartAt : 0
        setTimerMs(Math.max(0, payload.roundDurationMs - elapsed))
        setTimerStarted(true)
      }

      setResults(null)
      saveGameState('round', payload.photo, { roundIndex: payload.roundIndex, totalRounds: payload.totalRounds, duration: payload.roundDurationMs }, 0, null)
    })
    
    socket.on('timer', ({ remainingMs, timerStarted: started }) => {
      // Only use server timer events for progressive mode (when timer starts on first guess)
      // For fixed mode, rely on local calculation using roundStartAt to avoid flickering
      if (lobbyRef.current?.settings?.timerMode === 'progressive') {
        setTimerMs(remainingMs)
        setTimerStarted(started ?? true)
      }
    })

    // Local timer tick - calculates remaining time based on server timestamp for accuracy
    // This runs independently of socket timer events to provide smooth, accurate countdown
    const timerInterval = setInterval(() => {
      if (roundStartAtRef.current !== null && timerStartedRef.current && phaseRefForTimer.current === 'round') {
        if (lobbyRef.current?.settings?.timerMode === 'fixed') {
          const elapsed = Date.now() - roundStartAtRef.current
          // Use roundInfo.duration (user-facing value, e.g., 45s)
          // Server has +1s buffer internally, but client doesn't know about it
          const remaining = Math.max(0, roundInfoRef.current.duration - elapsed)
          setTimerMs(remaining)
          if (remaining <= 0) {
            setTimerStarted(false)
          }
        } else if (lobbyRef.current?.settings?.timerMode === 'progressive' && lobbyRef.current.firstGuessAt) {
          // Progressive mode: countdown from duelRaceTimeMs after first guess
          const elapsed = Date.now() - lobbyRef.current.firstGuessAt
          const remaining = Math.max(0, (lobbyRef.current.settings.duelRaceTimeSec || 15) * 1000 - elapsed)
          setTimerMs(remaining)
          if (remaining <= 0) {
            setTimerStarted(false)
          }
        }
      }
    }, 100) // Update every 100ms for smooth countdown

    socket.on('round_results', (payload) => {
      logger.debug('round_results event', payload);
      setPhase('results')
      setResults(payload)
      setTimerMs(0)
      setRoundStartAt(null) // Reset server timestamp when round ends
      saveGameState('results', photoRef.current, roundInfoRef.current, 0, payload)
    })

    socket.on('game_finished', (l: Lobby) => {
      logger.debug('game_finished event');
      setLobby(l)
      setPhase('end')
      setRoundStartAt(null)
      saveGameState('end', photoRef.current, roundInfoRef.current, 0, resultsRef.current)
    })

    return () => {
      clearInterval(timerInterval)
      socket.off('lobby_update')
      socket.off('connect')
      socket.off('reconnected')
      socket.off('reconnection_failed')
      socket.off('joined')
      socket.off('error_msg')
      socket.off('kicked')
      socket.off('round_start')
      socket.off('timer')
      socket.off('round_results')
      socket.off('game_finished')
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps */

  async function createLobby(p: { nickname: string, roundDuration: number }) {
    if (!p.nickname) return
    if (isJoining) return // Prevent multiple concurrent join attempts
    setIsJoining(true)
    try {
      const language = (window.localStorage.getItem('geo-snap-language') || 'en').toLowerCase()
      const clientSessionId = getClientSessionId()
      const res = await api.createLobby(p.nickname, { roundDurationSec: p.roundDuration, language }, clientSessionId, getStoredToken())
      socket.emit('join_lobby', { lobbyId: res.lobby.id, nickname: p.nickname, playerId: res.playerId, clientSessionId })
    } catch (error) {
      addToast(t('toast.failedCreateLobby'), 'error', 5000);
      logger.error('Create lobby error', error);
      setIsJoining(false)
    }
  }

  async function joinLobby(p: { nickname: string, lobbyId: string }) {
    if (!p.nickname || !p.lobbyId) return
    if (isJoining) return // Prevent multiple concurrent join attempts

    setIsJoining(true)
    try {
      const normalizedLobbyId = p.lobbyId.toUpperCase()
      const savedLobbyId = window.localStorage.getItem('geo-snap-lobbyId')
      const savedPlayerId = window.localStorage.getItem('geo-snap-playerId')

      // Save joinLobbyId immediately for reconnection on refresh
      try {
        window.localStorage.setItem('geo-snap-joinLobbyId', normalizedLobbyId)
      } catch (error) {
        logger.error('Could not save joinLobbyId', error)
      }

      if (savedLobbyId?.toUpperCase() === normalizedLobbyId && savedPlayerId) {
        socket.emit('join_lobby', {
          lobbyId: normalizedLobbyId,
          nickname: p.nickname,
          playerId: savedPlayerId,
          clientSessionId: getClientSessionId(),
        })
        return
      }

      const clientSessionId = getClientSessionId()
      const res = await api.joinLobby(normalizedLobbyId, p.nickname, clientSessionId)
      if (res.playerId) {
        socket.emit('join_lobby', {
          lobbyId: normalizedLobbyId,
          nickname: p.nickname,
          playerId: res.playerId,
          clientSessionId,
        })
      } else if (res.error) {
        // Show toast notification instead of error state
        addToast(`${res.error}. ${t('toast.failedJoinLobby')}`, 'info', 6000);
        // Clear the joinLobbyId to show both buttons
        clearSession();
        setPlayerId('');
        setJoinLobbyId('');
        setIsJoining(false)
      }
    } catch (error) {
      addToast(t('toast.failedJoinLobby'), 'info', 8000);
      setJoinLobbyId(''); // Clear the joinLobbyId to show both buttons
      logger.error('Join lobby error', error);
      setIsJoining(false)
    }
  }
  
  function setReady(ready: boolean) {
    if (!lobby || !playerId) return
    socket.emit('set_ready', { lobbyId: lobby.id, playerId, ready })
  }
  
  function startGame() {
    if (!lobby || !playerId) return
    socket.emit('start_game', { lobbyId: lobby.id, playerId })
  }

  function updateSettings(settings: LobbySettingsUpdate) {
    if (!lobby || !playerId) return
    socket.emit('update_settings', { lobbyId: lobby.id, playerId, settings })
  }

  function kickPlayer(playerIdToKick: string) {
    if (!lobby || !playerId) return
    socket.emit('kick_player', { lobbyId: lobby.id, hostId: playerId, playerIdToKick })
  }

  function setTeam(playerId: string, team: string) {
    if (!lobby) return
    socket.emit('set_team', { lobbyId: lobby.id, playerId, team })
  }

  function submitGuess(p: {lat:number,lon:number}) {
    if (!lobby || !playerId) return
    socket.emit('submit_guess', { lobbyId: lobby.id, playerId, lat: p.lat, lon: p.lon })
  }

  // Show achievement notification when game ends and achievements are unlocked
  useEffect(() => {
    const unlocked = getUnlockedThisGame();
    if (phase === 'end' && unlocked.length > 0) {
      setShowAchievementNotification(true);
    }
  }, [phase, getUnlockedThisGame]);

  function exitGameToLobby() {
    // Reset lobby: clear photos, guesses, and leaderboard but keep track of wins
    logger.debug('exitGameToLobby called', { lobbyId: lobby?.id, playerId, currentPhase: phase });
    if (lobby && playerId) {
      socket.emit('reset_lobby', { lobbyId: lobby.id, playerId }, (response: SocketResponse) => {
        if (!response?.success) {
          handleSocketError('reset lobby')({ message: response?.error || 'Unknown error' });
        }
      });
    }
    // Client will receive lobby_update with state='waiting' and sync automatically
  }

  // Determine which view to show based on lobby state
  // Use lobby.state directly - it's the source of truth from server
  const viewKey = !lobby || lobby.state === 'waiting' ? 'lobby' : 'game'

  // Check if player has any achievements
  const hasAchievements = achievements.some(ach => ach.unlocked);
  const openVersionLog = () => {
    if (versionNotes.length === 0) {
      setVersionNotes(VERSION_LOG.slice(0, 4))
    }
    setShowVersionLog(true)
    setHasUnseenVersionLog(false)
  }

  return (
    <Layout onShowAchievements={() => setShowAchievements(true)} hasAchievements={hasAchievements}>
      <AnimatePresence mode="wait">
        <motion.div
          key={viewKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {viewKey === 'lobby'
            ? <LobbyView
                lobby={lobby}
                playerId={playerId}
                nickname={nickname}
                joinLobbyId={joinLobbyId}
                isJoining={isJoining}
                onSetNickname={setNickname}
                onCreateLobby={createLobby}
                onJoinLobby={joinLobby}
                onSetReady={setReady}
                onStartGame={startGame}
                onExitLobby={exitLobby}
                onUpdateSettings={updateSettings}
                onKickPlayer={kickPlayer}
                onSetTeam={setTeam}
                onOpenVersionLog={openVersionLog}
                hasUnseenVersionLog={hasUnseenVersionLog}
                currentVersion={APP_VERSION}
              />
            : <Game
                phase={phase}
                lobby={lobby!} // lobby is guaranteed not null when viewKey === 'game'
                results={results}
                playerId={playerId}
                onExitLobby={exitGameToLobby}
                photo={photo}
                roundInfo={roundInfo}
                timerMs={timerMs}
                timerStarted={timerStarted}
                onSubmitGuess={submitGuess}
              />}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {showVersionLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-xl rounded-2xl border border-primary/20 bg-surface p-6 shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <h2 className="text-2xl font-bold text-primary mb-2">What&apos;s New</h2>
            <p className="text-sm text-text-darker mb-6">
              Version <span className="font-mono font-semibold text-text">{APP_VERSION}</span>
            </p>

            <div className="space-y-5">
              {versionNotes.map(entry => (
                <div key={entry.version} className="rounded-xl border border-primary/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-primary">{entry.version}</span>
                    <span className="text-xs text-text-darker">{entry.date}</span>
                  </div>
                  <ul className="space-y-2 text-sm text-text-darker">
                    {entry.notes.map(note => (
                      <li key={note}>• {note}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setShowVersionLog(false)
                setHasUnseenVersionLog(false)
              }}
              className="mt-6 w-full rounded-lg bg-primary py-2.5 text-black font-bold hover:bg-primary-dark transition-colors"
            >
              Continue
            </button>
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ToastContainer />
      
      {showAchievementNotification && (
        <AchievementNotification
          achievements={getUnlockedThisGame()}
          onClose={() => {
            setShowAchievementNotification(false);
            clearSessionTracking();
          }}
          type={getUnlockedThisGame().length === 1 ? 'single' : 'batch'}
        />
      )}
      {showAchievements && (
        <AchievementsDialog
          earnedAchievements={getEarnedAchievements()}
          nextAchievements={getNextAchievements()}
          onResetAll={resetAllAchievements}
          onClose={() => setShowAchievements(false)}
        />
      )}
    </Layout>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <ToastProvider>
            <AppContentWrapper />
          </ToastProvider>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  )
}

function AppContentWrapper() {
  const achievements = useAchievements()

  return (
    <AchievementProvider
      value={{
        trackGameCompletion: achievements.trackGameCompletion,
        trackCorrectGuess: achievements.trackCorrectGuess,
        trackScore: achievements.trackScore,
        trackAIBeat: achievements.trackAIBeat,
        trackPhotoUpload: achievements.trackPhotoUpload,
        trackPhotoUsedInGame: achievements.trackPhotoUsedInGame,
        trackContinentCompletion: achievements.trackContinentCompletion,
        trackWaterGuess: achievements.trackWaterGuess,
        trackFastGuess: achievements.trackFastGuess,
        trackMindBlownGuess: achievements.trackMindBlownGuess,
        trackReversePsychologyGuess: achievements.trackReversePsychologyGuess,
        trackTeamGameWin: achievements.trackTeamGameWin,
        trackComebackWin: achievements.trackComebackWin,
        trackPhotoWithMostCorrectGuesses: achievements.trackPhotoWithMostCorrectGuesses,
        trackPhotoUploadFromCountry: achievements.trackPhotoUploadFromCountry,
        trackRoundWin: achievements.trackRoundWin,
        trackPhotoFinish: achievements.trackPhotoFinish,
      }}
    >
      <AppContent achievementsApi={achievements} />
    </AchievementProvider>
  )
}
