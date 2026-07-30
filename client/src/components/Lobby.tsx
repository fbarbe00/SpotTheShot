import { useMemo, useState, useEffect, useRef } from 'react'
import type { Player } from '../lib/types'
import Uploader from './Uploader'
import LobbyMap from './LobbyMap'
import Onboarding, { useOnboarding } from './Onboarding'
import { socket } from '../lib/socket'
import { useToast } from '../lib/toast'
import { getCountryName } from '../lib/countryNames'
import JoinOrCreateView from './lobby/JoinOrCreateView'
import SettingsModal from './lobby/SettingsModal'
import { OPEN_CONSTRAINTS, type LobbyProps } from './lobby/types'
import {
  Crown,
  Users,
  Copy,
  Check,
  Swords,
  Settings,
  Image as ImageIcon,
  X,
  UserX,
  LogOut,
  Map,
  QrCode,
  Info,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '../contexts/I18nContext';
import { QRCodeSVG } from 'qrcode.react';
import { AVATAR_ICONS } from '../lib/avatarIcons';
import { normalizeCaptureDate } from '../lib/photoProcessing';
import { gameModeDefinition } from '../lib/gameModes';

// AI processing status type
interface AIProcessingStatus {
  processed: number;
  total: number;
  details: Array<{ name: string; total: number; processed: number }>;
  isReady: boolean;
  stage: string;
}

function InLobbyView({ lobby, playerId, onSetReady, onStartGame, onExitLobby, onUpdateSettings, onKickPlayer, onSetTeam, onOpenVersionLog, hasUnseenVersionLog, currentVersion }: LobbyProps) {
  const { addToast } = useToast()
  const { t, language } = useI18n()
  const [isSettingsOpen, setSettingsOpen] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const iconPickerRef = useRef<HTMLDivElement>(null)
  const [aiProcessingStatus, setAiProcessingStatus] = useState<{
    processed: number;
    total: number;
    details?: Array<{ name: string; processed: number; total: number }>;
    isReady?: boolean;
    stage?: string;
  } | null>(null)
  const isHost = lobby && playerId && lobby.hostId === playerId
  const me = useMemo(() => lobby?.players.find(p => p.id === playerId), [lobby, playerId])
  const isTeamMode = lobby?.settings.gameMode === 'teams'
  const myPhotos = lobby?.photos.filter(p => p.uploaderId === playerId) || []
  const myPhotosLocated = myPhotos.filter(p => p.lat !== null && p.lon !== null).length
  // Only count an explicit server-side completeness result. An absent date can
  // also mean private metadata belonging to another player.
  const photosMissingDates = lobby?.photos.filter(photo => photo.hasCaptureDate === false).length ?? 0
  const photosInvalidDates = lobby?.settings.gameType === 'date'
    ? lobby.photos.filter(photo => photo.hasCaptureDate !== false && photo.captureDate && (
      !normalizeCaptureDate(photo.captureDate)
      || photo.captureDate > new Date().toISOString().slice(0, 10)
    )).length
    : 0
  const hasAIPlayer = !!lobby?.players.some(p => p.id.startsWith('ai-'))
  const aiFeaturesEnabled = !!(lobby?.settings.enableAIGuessing || lobby?.settings.visionCommentary || lobby?.settings.autoNameImages)
  const humanPlayerCount = lobby?.players.filter(p => !p.isAI && !p.id.startsWith('ai-')).length ?? 0
  const hasEnoughPlayers = lobby?.settings.gameType !== 'uploader' || humanPlayerCount >= 3
  // AI preparation may continue after the game begins. The server remains
  // authoritative for all start requirements beyond having an uploaded photo.
  const canStart = (lobby?.photos.length ?? 0) > 0 && hasEnoughPlayers

  // Get tooltip text for lobby name
  const lobbyNameTooltip = useMemo(() => {
    const metadata = lobby?.nameMetadata
    if (!metadata) return undefined

    if (metadata.isRegion && metadata.country) {
      // For regions: "Region in {Country}"
      return t('lobby.regionIn', { country: getCountryName(metadata.isoCode, language, metadata.country) })
    } else if (!metadata.isRegion && metadata.continent) {
      // For countries: "Country in {Continent}"
      return t('lobby.countryIn', { continent: metadata.continent })
    }
    return undefined
  }, [lobby?.nameMetadata, language, t])

  const photosByPlayer = useMemo(() => {
    if (!lobby) return {}
    return lobby.photos.reduce((acc, photo) => {
      const player = lobby.players.find(p => p.id === photo.uploaderId)
      if (player?.id) {
        const playerId = player.id;
        if (!acc[playerId]) acc[playerId] = 0
        acc[playerId]++
      }
      return acc
    }, {} as Record<string, number>)
  }, [lobby])

  // Listen for pushed AI processing updates
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!lobby) return;

    const handleAIStatus = (status: {
      processed: number;
      total: number;
      details?: Array<{ name: string; processed: number; total: number }>;
      isReady?: boolean;
      stage?: string;
    }) => {
      setAiProcessingStatus(status);
    };

    socket.on('ai_processing_status', handleAIStatus);

    return () => {
      socket.off('ai_processing_status', handleAIStatus);
    };
  }, [lobby?.id]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Poll AI status as fallback and for initial state
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!lobby || !hasAIPlayer || !aiFeaturesEnabled) {
      setAiProcessingStatus(null);
      return;
    }

    const fetchStatus = () => {
      socket.emit('get_ai_processing_status', { lobbyId: lobby.id }, (status: AIProcessingStatus) => {
        if (!status) return;
        setAiProcessingStatus(status);
        if (status.isReady && (status.total ?? 0) > 0) clearInterval(intervalId);
      });
    };

    const intervalId = setInterval(fetchStatus, 15000);
    fetchStatus();
    return () => clearInterval(intervalId);
  }, [lobby?.id, hasAIPlayer, aiFeaturesEnabled]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const aiProgressPercent = useMemo(() => {
    if (!aiProcessingStatus || aiProcessingStatus.total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((aiProcessingStatus.processed / aiProcessingStatus.total) * 100)));
  }, [aiProcessingStatus]);

  const aiStatusLabel = useMemo(() => {
    if (!hasAIPlayer) return t('lobby.aiDisabled');
    if (!aiFeaturesEnabled) return t('lobby.aiReady');
    if (!aiProcessingStatus) return t('lobby.aiPreparing');
    if (aiProcessingStatus.stage === 'waiting_for_photos') return t('lobby.aiWaitingPhotos');
    if (aiProcessingStatus.isReady) return t('lobby.aiReady');
    const stageMap: Record<string, string> = {
      predictions: t(lobby?.settings.gameType === 'date'
        ? 'lobby.aiEstimatingDates'
        : 'lobby.aiGeneratingGuesses'),
      commentary: t('lobby.aiCreatingCommentary'),
      'auto-naming': t('lobby.aiGeneratingTitles')
    };
    return stageMap[aiProcessingStatus.stage || ''] || t('lobby.aiProcessingTasks');
  }, [hasAIPlayer, aiFeaturesEnabled, aiProcessingStatus, lobby?.settings.gameType, t]);

  useEffect(() => {
    if (lobby?.settings.gameType !== 'spot') setShowMap(false)
  }, [lobby?.settings.gameType])

  const aiPlayerStatusLabel = useMemo(() => {
    if (!hasAIPlayer || !aiFeaturesEnabled) return t('lobby.notReady');
    if (aiProgressPercent >= 100) return t('lobby.ready');
    return `${aiStatusLabel}`;
  }, [hasAIPlayer, aiFeaturesEnabled, aiProgressPercent, aiStatusLabel, t]);

  /* eslint-disable react-hooks/exhaustive-deps */
  const [showRegionTooltip, setShowRegionTooltip] = useState(false)

  // Auto-hide region tooltip after 4 seconds on mobile
  useEffect(() => {
    if (showRegionTooltip) {
      const timer = setTimeout(() => setShowRegionTooltip(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [showRegionTooltip])

  useEffect(() => {
    if (!lobby || !isHost) return;
    if (lobby.settings.language === language) return;
    onUpdateSettings({ ...lobby.settings, language });
  }, [lobby?.id, lobby?.settings?.language, language, isHost, onUpdateSettings]);

  useEffect(() => {
    if (!showIconPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setShowIconPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showIconPicker]);
  /* eslint-enable react-hooks/exhaustive-deps */

  if (!lobby) return null

  const requestStartGame = () => {
    // Not-all-ready is informational only (shown under the button); the
    // host can still start the game without a blocking confirm dialog.
    onStartGame()
  }

  return (
    <>
      <AnimatePresence>
        {isSettingsOpen && <SettingsModal lobby={lobby} onClose={() => setSettingsOpen(false)} onSave={onUpdateSettings} />}
        {showQR && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={() => setShowQR(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-surface p-8 rounded-xl border border-primary/30 max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold mb-4 text-center">{t('lobby.scanToJoin')}</h3>
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG
                  value={`${window.location.origin}?join=${lobby.id}`}
                  size={256}
                  level="H"
                />
              </div>
              <div className="text-center mt-4 text-sm text-text-darker">
                {t('lobby.code')}: <span className="font-mono font-bold text-primary">{lobby.id}</span>
              </div>
              <button
                onClick={() => setShowQR(false)}
                className="w-full mt-4 px-4 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary font-bold transition-colors"
              >
                {t('common.close')}
              </button>
            </motion.div>
          </motion.div>
        )}
        {showPrivacy && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={() => setShowPrivacy(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-surface p-8 rounded-xl border border-primary/30 max-w-lg max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-primary">{t('lobby.privacyPolicy')}</h3>
                <button onClick={() => setShowPrivacy(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4 text-sm text-text-darker">
                <b>{t('lobby.tldr')}:</b> {t('lobby.privacyTldr')}
                <p>
                  <strong className="text-text">{t('lobby.photoStorage')}:</strong> {t('lobby.photoStorageDesc')}
                </p>
                <p>
                  <strong className="text-text">{t('lobby.photoUsage')}:</strong> {t('lobby.photoUsageDesc')}
                </p>
                <p>
                  <strong className="text-text">{t('lobby.aiGuessing')}:</strong> {t('lobby.aiGuessingDesc')}
                </p>
                {lobby.settings.gameType === 'spot' && <p>
                  <strong className="text-text">{t('lobby.locationSearch')}:</strong> {t('lobby.locationSearchDesc')}
                </p>}
              </div>

              <button
                onClick={() => setShowPrivacy(false)}
                className="w-full mt-6 px-4 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary font-bold transition-colors"
              >
                {t('common.close')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile: Game mode + lobby info first */}
      <div className="md:hidden w-full px-2 mb-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 relative group">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}?join=${lobby.id}`)
                addToast(t('common.copied'), 'success', 1500)
                if (lobbyNameTooltip) setShowRegionTooltip(true)
              }}
              className="text-xs text-text-darker tracking-wide hover:text-primary transition-colors text-left block"
              aria-label={t('lobby.copyShareLink')}
            >
              <div className="flex items-center gap-1 flex-wrap">
                <span>{t('lobby.lobby')} <span className="font-bold text-primary font-mono">{lobby.id}</span></span>
                {lobbyNameTooltip && (showRegionTooltip ? (
                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded whitespace-nowrap">
                    {lobbyNameTooltip}
                  </span>
                ) : (
                  <span className="hidden md:inline-block md:opacity-0 md:group-hover:opacity-100 md:transition-opacity text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded whitespace-nowrap">
                    {lobbyNameTooltip}
                  </span>
                ))}
              </div>
            </button>
            <div className="text-xs text-text-darker">{gameModeDefinition(lobby.settings.gameType).name} • {lobby.settings.gameMode === 'teams' ? t('settings.modeTeams') : t('settings.modeIndividual')} • {lobby.settings.timerMode === 'progressive' ? t('settings.duelShort') : t('settings.fixedShort')}</div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}?join=${lobby.id}`)
                addToast(t('common.copied'), 'success', 1500)
              }}
              className="p-1.5 rounded bg-primary/10 hover:bg-primary/20 text-primary"
              title={t('common.copy')}
            >
              <Copy size={14} />
            </button>
            <button onClick={() => setShowQR(true)} className="p-2 rounded bg-primary/10 hover:bg-primary/20 text-primary" title={t('lobby.qr')}>
              <QrCode size={16} />
            </button>
            {isHost && (
              <button onClick={() => setSettingsOpen(true)} className="p-2 rounded bg-primary/10 hover:bg-primary/20 text-primary ml-2" title={t('common.settings')}>
                <Settings size={16} />
              </button>
            )}
            <button onClick={onExitLobby} className="p-2 rounded bg-red-500/20 hover:bg-red-500/30 text-red-400 ml-2" title={t('lobby.leaveLobby')}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: Uploader - Made larger with better padding */}
      <div className="md:hidden w-full px-2 mb-3">
        <Uploader lobby={lobby} playerId={playerId} />
      </div>

      {/* Main content - hidden on mobile, grid on desktop */}
      <div className="hidden md:grid md:grid-cols-2 gap-4 lg:gap-8 w-full overflow-hidden px-0 auto-rows-max">
        {/* Left Column */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* Game Mode & Share */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 relative group">
                <div className="text-xs text-text-darker uppercase tracking-wide mb-1">{t('lobby.shareLink')}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}?join=${lobby.id}`)
                      addToast(t('lobby.linkCopied'), 'success', 2000)
                    }}
                    className="text-xl font-bold font-mono text-primary hover:text-primary/80 transition-colors cursor-pointer"
                    title={t('lobby.copyShareLink')}
                  >
                    {lobby.id}
                  </button>
                  {lobbyNameTooltip && (
                    <div className="absolute left-full top-1/2 -translate-y-1/2 z-50 ml-2 px-2.5 py-1.5 text-xs bg-surface/80 backdrop-blur-sm rounded text-text-darker whitespace-nowrap shadow-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200">
                      {lobbyNameTooltip}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    const shareUrl = `${window.location.origin}?join=${encodeURIComponent(lobby.id)}`
                    navigator.clipboard.writeText(shareUrl)
                    addToast(t('lobby.linkCopied'), 'success', 2000)
                  }}
                  className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                  title={t('lobby.copyShareLink')}
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={() => setShowQR(true)}
                  className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                  title={t('lobby.showQrCode')}
                >
                  <QrCode size={16} />
                </button>
                {isHost && (
                  <button onClick={() => setSettingsOpen(true)} className="p-3 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors" title={t('common.settings')}>
                    <Settings size={18} />
                  </button>
                )}
                <button onClick={onExitLobby} className="p-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors ml-3" title={t('lobby.leaveLobby')}>
                  <LogOut size={18} />
                </button>
              </div>
            </div>

            {/* Game Mode */}
            <motion.div
              key={`${lobby.settings.roundDurationSec}-${lobby.settings.gameMode}-${lobby.settings.timerMode}`}
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="p-2.5 md:p-3 rounded-xl bg-white/5 border border-primary/10 min-w-0"
            >
              <h4 className="font-bold text-sm text-primary mb-2 flex items-center gap-2">
                <Settings size={16} /> {t('settings.gameSettings')}
              </h4>
              <div className="grid grid-cols-2 gap-2 md:gap-3 text-xs">
                <div>
                  <div className="text-text-darker">{t('settings.timerMode')}</div>
                  <div className="font-bold text-primary">{lobby.settings.timerMode === 'progressive' ? t('settings.duelShort') : t('settings.fixedShort')}</div>
                </div>
                {lobby.settings.timerMode === 'fixed' && (
                  <div>
                    <div className="text-text-darker">{t('settings.roundTime')}</div>
                    <div className="font-bold text-primary">{lobby.settings.roundDurationSec}s</div>
                  </div>
                )}
                {lobby.settings.timerMode === 'progressive' && (
                  <div>
                    <div className="text-text-darker">{t('settings.raceTime')}</div>
                    <div className="font-bold text-primary">{lobby.settings.duelRaceTimeSec}s</div>
                  </div>
                )}
                <div>
                  <div className="text-text-darker">{t('settings.gameMode')}</div>
                  <div className="font-bold text-primary capitalize">{lobby.settings.gameMode === 'teams' ? t('settings.modeTeams') : t('settings.modeIndividual')}</div>
                </div>
                <div>
                  <div className="text-text-darker">{t('settings.hints')}</div>
                  <div className="font-bold text-primary">{lobby.settings.hintThresholdSec}s</div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Players List */}
          <div className="mt-6 min-w-0">
            <h3 className="font-bold text-lg mb-3 text-text-darker flex items-center gap-2"><Users size={20} /> {t('lobby.players', { count: lobby.players.length })}</h3>
            <div className="space-y-2">
              <AnimatePresence>
                {lobby.players.map((p: Player) => {
                  // Calculate AI progress for background
                  const isAI = p.id.startsWith('ai-');
                  const aiProgress = isAI ? aiProgressPercent : 0;

                  return (
                    <motion.div
                      layout
                      key={p.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="group rounded-lg p-3 flex items-center gap-2 md:gap-3 border border-transparent hover:border-primary/20 transition-colors min-w-0 relative"
                      style={{ zIndex: showIconPicker && p.id === playerId ? 50 : undefined }}
                    >
                      {/* Background layers clipped to rounded corners */}
                      <div className="absolute inset-0 rounded-lg overflow-hidden">
                        <div className="absolute inset-0 bg-white/5" />
                        {!isAI && p.ready && (
                          <div className="absolute inset-0 bg-green-500/10" />
                        )}
                        {isAI && aiProgress > 0 && (
                          <motion.div
                            className="absolute inset-0 bg-primary/10"
                            initial={{ width: 0 }}
                            animate={{ width: `${aiProgress}%` }}
                            transition={{ duration: 0.3 }}
                            style={{ left: 0, top: 0, bottom: 0 }}
                          />
                        )}
                      </div>

                      {/* Content layer */}
                      <div className="relative flex items-center gap-2 md:gap-3 w-full">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }}></div>
                        {p.id === playerId ? (
                          <div className="relative flex-shrink-0" ref={iconPickerRef}>
                            <button
                              onClick={() => setShowIconPicker(v => !v)}
                              className="text-lg hover:scale-125 transition-transform leading-none"
                              title={t('lobby.changeIcon')}
                            >
                              {p.icon}
                            </button>
                            {showIconPicker && (
                              <div className="absolute left-0 top-full mt-1 z-50 bg-surface border border-primary/30 rounded-xl p-2 shadow-xl grid grid-cols-6 gap-1 w-52">
                                {AVATAR_ICONS.map(icon => (
                                  <button
                                    key={icon}
                                    onClick={() => {
                                      socket.emit('update_icon', { lobbyId: lobby.id, playerId, icon });
                                      setShowIconPicker(false);
                                    }}
                                    className={`text-xl p-1 rounded hover:bg-white/10 transition-colors ${icon === p.icon ? 'bg-primary/20 ring-1 ring-primary' : ''}`}
                                  >
                                    {icon}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-lg flex-shrink-0">{p.icon}</span>
                        )}
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{p.nickname}</span>
                          {p.wins !== undefined && p.wins > 0 && (
                            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full font-semibold flex items-center gap-1 flex-shrink-0">
                              <span>🏆</span>
                              <span>{p.wins}</span>
                            </span>
                          )}
                        </div>
                        {p.id === lobby.hostId && <Crown size={16} className="text-amber-400 flex-shrink-0" />}
                        {p.id === playerId && <span className="text-xs text-primary/70 flex-shrink-0">({t('lobby.you')})</span>}
                        <div className="ml-auto flex items-center gap-2 text-sm flex-shrink-0">
                          {!p.id.startsWith('ai-') && (
                            <div className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded-full border border-primary/10">
                              <div className="w-10 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(100, ((photosByPlayer[p.id] || 0) / (lobby.settings.maxPhotosPerPlayer || 5)) * 100)}%` }}
                                  className={`h-full ${(photosByPlayer[p.id] || 0) >= (lobby.settings.maxPhotosPerPlayer || 5) ? 'bg-amber-400' : 'bg-primary'}`}
                                />
                              </div>
                              <span className={`text-[10px] font-mono font-bold ${(photosByPlayer[p.id] || 0) >= (lobby.settings.maxPhotosPerPlayer || 5) ? 'text-amber-400' : 'text-text-darker'}`}>
                                {photosByPlayer[p.id] || 0}/{lobby.settings.maxPhotosPerPlayer || 5}
                              </span>
                            </div>
                          )}
                          {isAI && aiProgress > 0 && aiProgress < 100 && (
                            <span className="text-xs text-primary/80 font-mono">
                              {aiProgress}%
                            </span>
                          )}
                          {isTeamMode && onSetTeam && (isHost || p.id === playerId) && (
                            <div className="flex gap-1">
                              <button onClick={() => onSetTeam(p.id, 'Team 1')} className={`px-1.5 md:px-2 py-0.5 md:py-1 text-xs rounded ${p.team === 'Team 1' ? 'bg-red-500 text-white' : 'bg-red-500/20 text-red-300'}`}>{t('ui.team1Short')}</button>
                              <button onClick={() => onSetTeam(p.id, 'Team 2')} className={`px-1.5 md:px-2 py-0.5 md:py-1 text-xs rounded ${p.team === 'Team 2' ? 'bg-blue-500 text-white' : 'bg-blue-500/20 text-blue-300'}`}>{t('ui.team2Short')}</button>
                            </div>
                          )}
                          {p.ready ? <Check size={18} className="text-green-500" /> : <span className="text-text-darker text-xs">{isAI ? aiPlayerStatusLabel : t('lobby.notReady')}</span>}
                        </div>
                        {isHost && p.id !== playerId && !p.id.startsWith('ai-') && (
                          <button onClick={() => onKickPlayer(p.id)} className="p-1 rounded-full bg-red-600/80 text-white md:opacity-0 md:group-hover:opacity-100 opacity-100 flex-shrink-0 transition-opacity">
                            <UserX size={16} />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            {isHost && (
              <button
                onClick={() => {
                  const hasAI = lobby.players.some(p => p.id.startsWith('ai-'));
                  if (hasAI) {
                    socket.emit('remove_ai_player', { lobbyId: lobby.id, playerId });
                  } else {
                    socket.emit('add_ai_player', { lobbyId: lobby.id, playerId });
                    // Automatically enable AI guessing when AI is added
                    onUpdateSettings({ ...lobby.settings, enableAIGuessing: true });
                  }
                }}
                disabled={!lobby.players.some(p => p.id.startsWith('ai-')) && !(lobby.constraints ?? OPEN_CONSTRAINTS).allowAIGuessing}
                className="mt-2 w-full px-3 py-1 text-xs rounded-lg font-semibold transition-colors bg-white/5 hover:bg-white/10 text-text-darker hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                title={lobby.players.some(p => p.id.startsWith('ai-')) ? t('lobby.removeAiTitle') : t('lobby.addAiTitle')}
              >
                {lobby.players.some(p => p.id.startsWith('ai-')) ? t('lobby.removeAi') : t('lobby.addAi')}
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 pt-6 border-t border-primary/10 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
            <button
              onClick={() => onSetReady(!me?.ready)}
              className={`px-4 py-3 rounded-lg font-bold transition-colors md:w-auto text-base md:text-sm ${me?.ready ? 'bg-red-500/80 hover:bg-red-500 text-white' : 'bg-green-500/80 hover:bg-green-500 text-black'}`}
            >
              {me?.ready ? t('lobby.unready') : t('lobby.ready')}
            </button>
            {isHost ? (
              <button disabled={!canStart} onClick={requestStartGame} className="md:ml-auto px-4 py-3 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base md:text-sm">
                <Swords size={20} className="md:!w-[18px] md:!h-[18px]" /> {t('lobby.startGame')}
              </button>
            ) : (
              <div className="text-base md:text-sm text-text-darker md:ml-auto text-center md:text-left">{t('lobby.waitingHostStart')}</div>
            )}
          </div>
          {isHost && (
            <div className="mt-2 text-xs text-text-darker text-right">
              {lobby.photos.length === 0 && t('lobby.minOnePhoto')}
              {lobby.settings.gameType === 'uploader' && !hasEnoughPlayers && t('lobby.minThreePlayers')}
              {lobby.settings.gameType === 'date' && photosMissingDates > 0 && t('lobby.missingPhotoDates', { count: photosMissingDates })}
              {lobby.settings.gameType === 'date' && photosInvalidDates > 0 && t('lobby.invalidPhotoDates', { count: photosInvalidDates })}
              {lobby.photos.length > 0 && lobby.players.some(p => !p.ready) && t('lobby.notAllReadyCanStart')}
            </div>
          )}
        </div>

        {/* Right Column: Uploader or Map View */}
        <div className="flex flex-col gap-3 min-h-0 min-w-0">
          {myPhotos.length > 0 && (
            <div className="flex gap-2 flex-shrink-0 flex-wrap">
              <button
                onClick={() => setShowMap(false)}
                className={`flex-1 md:flex-none px-3 md:px-4 py-2.5 md:py-2 rounded-lg font-bold transition-colors flex items-center justify-center md:justify-start gap-2 text-sm md:text-base ${!showMap
                  ? 'bg-primary text-black'
                  : 'bg-white/10 hover:bg-white/20 text-text'
                  }`}
              >
                <ImageIcon size={18} className="flex-shrink-0" /> {t('lobby.photos')}
              </button>
              {lobby.settings.gameType === 'spot' && <button
                onClick={() => setShowMap(true)}
                className={`flex-1 md:flex-none px-3 md:px-4 py-2.5 md:py-2 rounded-lg font-bold transition-colors flex items-center justify-center md:justify-start gap-2 text-sm md:text-base ${showMap
                  ? 'bg-primary text-black'
                  : 'bg-white/10 hover:bg-white/20 text-text'
                  }`}
              >
                <Map size={18} className="flex-shrink-0" /> {t('lobby.map')} ({myPhotosLocated}/{myPhotos.length})
              </button>}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {showMap && lobby.settings.gameType === 'spot' && myPhotos.length > 0 ? (
              <div className="h-full">
                <LobbyMap
                  lobby={lobby}
                  playerId={playerId}
                  onUpdateLocation={(photoId, lat, lon) => {
                    socket.emit('update_photo_location', { lobbyId: lobby.id, playerId, photoId, lat, lon })
                  }}
                />
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto pr-2">
                <Uploader lobby={lobby} playerId={playerId} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Players list and controls below uploader */}
      <div className="md:hidden w-full px-2 flex flex-col gap-3">
        {/* Players - With ready status visible */}
        <div>
          <h3 className="font-bold text-sm mb-1.5 flex items-center gap-1"><Users size={14} /> {t('lobby.players', { count: lobby.players.length })}</h3>
          <div className="space-y-1">
            <AnimatePresence>
              {lobby.players.map((p: Player) => {
                // Calculate AI progress for background
                const isAI = p.id.startsWith('ai-');
                const aiProgress = isAI ? aiProgressPercent : 0;

                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="rounded p-2 flex items-center gap-1.5 text-xs border border-transparent relative"
                    style={{
                      borderColor: p.ready ? 'rgba(34,197,94,.4)' : 'transparent',
                      zIndex: showIconPicker && p.id === playerId ? 50 : undefined,
                    }}
                  >
                    {/* Background layers clipped to rounded corners */}
                    <div className="absolute inset-0 rounded overflow-hidden">
                      <div className="absolute inset-0 bg-white/5" />
                      {!isAI && p.ready && (
                        <div className="absolute inset-0 bg-green-500/10" />
                      )}
                      {isAI && aiProgress > 0 && (
                        <motion.div
                          className="absolute inset-0 bg-primary/10"
                          initial={{ width: 0 }}
                          animate={{ width: `${aiProgress}%` }}
                          transition={{ duration: 0.3 }}
                          style={{ left: 0, top: 0, bottom: 0 }}
                        />
                      )}
                    </div>

                    {/* Content layer */}
                    <div className="relative flex items-center gap-1.5 w-full">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: p.color }}></div>
                      {p.id === playerId ? (
                        <div className="relative flex-shrink-0" ref={iconPickerRef}>
                          <button
                            onClick={() => setShowIconPicker(v => !v)}
                            className="text-sm hover:scale-125 transition-transform leading-none"
                            title={t('lobby.changeIcon')}
                          >
                            {p.icon}
                          </button>
                          {showIconPicker && (
                            <div className="absolute left-0 top-full mt-1 z-50 bg-surface border border-primary/30 rounded-xl p-2 shadow-xl grid grid-cols-6 gap-1 w-48">
                              {AVATAR_ICONS.map(icon => (
                                <button
                                  key={icon}
                                  onClick={() => {
                                    socket.emit('update_icon', { lobbyId: lobby.id, playerId, icon });
                                    setShowIconPicker(false);
                                  }}
                                  className={`text-xl p-1 rounded hover:bg-white/10 transition-colors ${icon === p.icon ? 'bg-primary/20 ring-1 ring-primary' : ''}`}
                                >
                                  {icon}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm flex-shrink-0">{p.icon}</span>
                      )}
                      <span className="truncate flex-1">{p.nickname}</span>
                      {p.id === playerId && <span className="text-primary/70 text-xs flex-shrink-0">({t('lobby.you')})</span>}

                      {/* Photo progress for non-AI players */}
                      {!p.id.startsWith('ai-') && (
                        <div className="flex items-center gap-1 mx-2 bg-white/5 px-1.5 py-0.5 rounded-full border border-primary/10">
                          <div className="w-6 h-1 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, ((photosByPlayer[p.id] || 0) / (lobby.settings.maxPhotosPerPlayer || 5)) * 100)}%` }}
                              className={`h-full ${(photosByPlayer[p.id] || 0) >= (lobby.settings.maxPhotosPerPlayer || 5) ? 'bg-amber-400' : 'bg-primary'}`}
                            />
                          </div>
                          <span className={`text-[8px] font-mono font-bold ${(photosByPlayer[p.id] || 0) >= (lobby.settings.maxPhotosPerPlayer || 5) ? 'text-amber-400' : 'text-text-darker'}`}>
                            {photosByPlayer[p.id] || 0}/{lobby.settings.maxPhotosPerPlayer || 5}
                          </span>
                        </div>
                      )}
                      {isAI && aiProgress > 0 && aiProgress < 100 && (
                        <span className="text-xs text-primary/80 font-mono flex-shrink-0">
                          {aiProgress}%
                        </span>
                      )}

                      {/* Team selection buttons */}
                      {isTeamMode && onSetTeam && (isHost || p.id === playerId) && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => onSetTeam(p.id, 'Team 1')} className={`px-1.5 py-0.5 text-xs rounded ${p.team === 'Team 1' ? 'bg-red-500 text-white' : 'bg-red-500/20 text-red-300'}`}>{t('ui.team1Short')}</button>
                          <button onClick={() => onSetTeam(p.id, 'Team 2')} className={`px-1.5 py-0.5 text-xs rounded ${p.team === 'Team 2' ? 'bg-blue-500 text-white' : 'bg-blue-500/20 text-blue-300'}`}>{t('ui.team2Short')}</button>
                        </div>
                      )}

                      {/* Ready status */}
                      {p.ready ? <Check size={14} className="text-green-500 flex-shrink-0" /> : <span className="text-text-darker text-xs flex-shrink-0">{isAI ? aiPlayerStatusLabel : t('lobby.notReady')}</span>}

                      {/* Kick button for host */}
                      {isHost && p.id !== playerId && !p.id.startsWith('ai-') && (
                        <button onClick={() => onKickPlayer(p.id)} className="p-1 rounded-full bg-red-600/80 hover:bg-red-600 text-white flex-shrink-0 transition-colors ml-1">
                          <UserX size={14} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          {isHost && (
            <button
              onClick={() => {
                const hasAI = lobby.players.some(p => p.id.startsWith('ai-'));
                if (hasAI) {
                  socket.emit('remove_ai_player', { lobbyId: lobby.id, playerId });
                  onUpdateSettings({ ...lobby.settings, enableAIGuessing: false, visionCommentary: false, autoNameImages: false });
                } else {
                  socket.emit('add_ai_player', { lobbyId: lobby.id, playerId });
                  onUpdateSettings({ ...lobby.settings, enableAIGuessing: true });
                }
              }}
              disabled={!lobby.players.some(p => p.id.startsWith('ai-')) && !(lobby.constraints ?? OPEN_CONSTRAINTS).allowAIGuessing}
              className="mt-1.5 w-full px-2 py-1 text-xs rounded font-semibold bg-white/5 hover:bg-white/10 text-text-darker hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {lobby.players.some(p => p.id.startsWith('ai-')) ? t('lobby.removeAi') : t('lobby.addAi')}
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-2 z-20 flex gap-2 p-2 border border-primary/20 rounded-xl bg-surface/95 backdrop-blur shadow-lg">
          <button onClick={() => onSetReady(!me?.ready)} className={`flex-1 px-3 py-2 rounded font-bold text-xs transition-colors ${me?.ready ? 'bg-red-500/80 text-white' : 'bg-green-500/80 text-black'}`}>
            {me?.ready ? t('lobby.unready') : t('lobby.ready')}
          </button>
          {isHost && <button disabled={!canStart} onClick={requestStartGame} className="flex-1 px-3 py-2 rounded bg-primary hover:bg-primary-dark text-black font-bold text-xs disabled:opacity-40">{t('lobby.start')}</button>}
        </div>
        {isHost && lobby.settings.gameType === 'uploader' && !hasEnoughPlayers && (
          <div className="text-center text-xs text-amber-300">
            {t('lobby.minThreePlayers')}
          </div>
        )}
        {isHost && lobby.settings.gameType === 'date' && (photosMissingDates > 0 || photosInvalidDates > 0) && (
          <div className="text-center text-xs text-amber-300">
            {photosMissingDates > 0
              ? t('lobby.missingPhotoDates', { count: photosMissingDates })
              : t('lobby.invalidPhotoDates', { count: photosInvalidDates })}
          </div>
        )}
        {!isHost && <div className="text-xs text-text-darker text-center py-1">{t('lobby.waitingHost')}</div>}
      </div>

      {/* Privacy and News - moved to bottom of lobby page */}
      <div className="flex items-center justify-center gap-3 py-1 mt-4">
        <button onClick={() => setShowPrivacy(true)} className="flex items-center gap-1 text-xs text-text-darker hover:text-primary">
          <Info size={14} />
          {t('lobby.privacyPolicy')}
        </button>
        <button
          onClick={() => onOpenVersionLog?.()}
          className={`text-xs ${hasUnseenVersionLog ? 'text-primary' : 'text-text-darker hover:text-primary'}`}
        >
          {t('lobby.whatsNew')} {currentVersion ? `(${currentVersion})` : ''}
        </button>
      </div>
    </>
  )
}

export default function LobbyView(props: LobbyProps) {
  const { hasCompletedOnboarding, completeOnboarding, resetOnboarding } = useOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(false);

  const handleCompleteOnboarding = () => {
    completeOnboarding();
    setShowOnboarding(false);
  };

  const handleViewTutorial = () => {
    resetOnboarding();
    setShowOnboarding(true);
  };

  // Don't show onboarding if:
  // 1. Joining a specific lobby (invited via URL)
  // 2. Already in a lobby (reconnecting)
  // 3. Has saved session (attempting reconnection)
  const isJoiningLobby = props.joinLobbyId && props.joinLobbyId.length > 0;
  const hasSession = props.playerId && props.playerId.length > 0; // This indicates reconnection attempt

  return (
    <>
      {props.lobby ? <InLobbyView {...props} /> : <JoinOrCreateView {...props} onViewTutorial={handleViewTutorial} />}
      {(!hasCompletedOnboarding || showOnboarding) && !isJoiningLobby && !hasSession && (
        <Onboarding onComplete={handleCompleteOnboarding} />
      )}
    </>
  );
}
