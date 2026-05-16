import { useMemo, useState, useEffect, useRef, type FormEvent } from 'react'
import type { Lobby, Player, GameSettings, LobbyConstraints } from '../lib/types'
import Uploader from './Uploader'
import LobbyMap from './LobbyMap'
import Onboarding, { useOnboarding } from './Onboarding'
import { socket, api, getStoredToken, setStoredToken, clearStoredToken } from '../lib/socket'
import { useToast } from '../lib/toast'
import { normalizeString } from '../lib/utils'
import { getCountryName } from '../lib/countryNames'
import {
  Crown,
  DoorOpen,
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
  HelpCircle,
  Clock,
  Users2,
  Eye,
  AlertCircle,
  QrCode,
  Info,
  Lock,
  Key,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '../contexts/I18nContext';
import { QRCodeSVG } from 'qrcode.react';
import { supportsLanguageVariants, getPreviewTileUrl, type MapLanguage } from '../lib/mapConfig';
import { AVATAR_ICONS } from '../lib/avatarIcons';

// AI processing status type
interface AIProcessingStatus {
  processed: number;
  total: number;
  details: Array<{ name: string; total: number; processed: number }>;
  isReady: boolean;
  stage: string;
}

// Configuration constants for default game settings
const DEFAULT_ROUND_DURATION_SEC = 45;
const DEFAULT_HINT_THRESHOLD_SEC = 25;

// Generous fallback used client-side before lobby data arrives
const OPEN_CONSTRAINTS: LobbyConstraints = {
  maxPlayersPerLobby: 20,
  maxPhotosPerPlayer: 10,
  allowAllMaps: true,
  allowAIGuessing: true,
  allowAutoNaming: true,
  allowVisionCommentary: true,
};

// Props for Lobby component - manages player joining, settings, and photo uploads
type LobbyProps = {
  lobby: Lobby | null
  playerId: string
  nickname: string
  joinLobbyId?: string
  isJoining?: boolean
  onSetNickname: (name: string) => void
  onCreateLobby: (p: { nickname: string, roundDuration: number }) => void
  onJoinLobby: (p: { nickname: string, lobbyId: string }) => void
  onSetReady: (ready: boolean) => void
  onStartGame: () => void
  onExitLobby: () => void
  onUpdateSettings: (settings: GameSettings) => void
  onKickPlayer: (playerIdToKick: string) => void
  onSetTeam?: (playerId: string, team: string) => void
  onOpenVersionLog?: () => void
  hasUnseenVersionLog?: boolean
  currentVersion?: string
}

// Modal dialog for host to configure game settings
// Allows changing round duration, game mode, timer mode, hints, and AI guessing
function SettingsModal({ lobby, onClose, onSave }: { lobby: Lobby, onClose: () => void, onSave: (settings: GameSettings) => void }) {
  const { addToast } = useToast()
  const { t } = useI18n()
  const [roundDurationSec, setRoundDurationSec] = useState(lobby.settings.roundDurationSec)
  const [gameMode, setGameMode] = useState<'individual' | 'teams'>(lobby.settings.gameMode || 'individual')
  const [timerMode, setTimerMode] = useState<'fixed' | 'progressive'>(lobby.settings.timerMode || 'fixed')
  const [hintThresholdSec, setHintThresholdSec] = useState(lobby.settings.hintThresholdSec || DEFAULT_HINT_THRESHOLD_SEC)
  const [uploaderPenaltyPercent, setUploaderPenaltyPercent] = useState(lobby.settings.uploaderPenaltyPercent ?? 10)
  const [minPhotosPerPlayer, setMinPhotosPerPlayer] = useState(lobby.settings.minPhotosPerPlayer ?? 0)
  const [maxPhotosPerPlayer, setMaxPhotosPerPlayer] = useState(lobby.settings.maxPhotosPerPlayer ?? 5)
  const [duelRaceTimeSec, setDuelRaceTimeSec] = useState(lobby.settings.duelRaceTimeSec ?? 15)
  const [visionCommentary, setVisionCommentary] = useState(lobby.settings.visionCommentary || false)
  const [autoNameImages, setAutoNameImages] = useState(lobby.settings.autoNameImages || false)
  const [showImageDate, setShowImageDate] = useState(lobby.settings.showImageDate || false)
  const [mapStyle, setMapStyle] = useState(lobby.settings.mapStyle || 'osm')
  const [mapLanguage, setMapLanguage] = useState(lobby.settings.mapLanguage || 'local')

  const c = lobby.constraints ?? OPEN_CONSTRAINTS;

  // Auto-set unlimited round duration when switching to progressive (Duel) mode
  useEffect(() => {
    if (timerMode === 'progressive' && roundDurationSec !== 0) {
      setRoundDurationSec(0)
    } else if (timerMode === 'fixed' && roundDurationSec === 0) {
      setRoundDurationSec(DEFAULT_ROUND_DURATION_SEC)
    }
  }, [timerMode, roundDurationSec])

  // Check if hint threshold is valid for fixed mode
  const isHintThresholdInvalid = timerMode === 'fixed' && roundDurationSec > 0 && hintThresholdSec > roundDurationSec

  const handleSave = () => {
    if (isHintThresholdInvalid) {
      addToast(t('settings.hintThresholdError'), 'warning', 4000)
      return
    }
    onSave({
      ...lobby.settings,
      roundDurationSec,
      gameMode,
      timerMode,
      hintThresholdSec,
      uploaderPenaltyPercent,
      minPhotosPerPlayer,
      maxPhotosPerPlayer,
      duelRaceTimeSec,
      visionCommentary,
      autoNameImages,
      showImageDate,
      mapStyle,
      mapLanguage
    })
    addToast(t('settings.updated'), 'success', 2000)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface p-8 rounded-2xl border border-primary/20 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl text-base md:text-sm"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Settings size={28} className="text-primary" />
            <h2 className="text-3xl font-bold text-primary">{t('settings.lobbySettings')}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Timer Mode Selection */}
          <div className="bg-white/5 rounded-xl p-5 border border-primary/10">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={20} className="text-primary" />
              <h3 className="text-lg font-bold text-primary">{t('settings.timerMode')}</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <button
                onClick={() => setTimerMode('progressive')}
                className={`p-2 md:p-3 rounded-lg border-2 transition-all ${timerMode === 'progressive' ? 'border-primary bg-primary/20' : 'border-primary/20 bg-white/5 hover:border-primary/40'}`}
              >
                <div className="text-sm font-bold">{t('settings.duelMode')}</div>
                <div className="text-xs text-text-darker">{t('settings.duelModeDesc')}</div>
              </button>
              <button
                onClick={() => setTimerMode('fixed')}
                className={`p-2 md:p-3 rounded-lg border-2 transition-all ${timerMode === 'fixed' ? 'border-primary bg-primary/20' : 'border-primary/20 bg-white/5 hover:border-primary/40'}`}
              >
                <div className="text-sm font-bold">{t('settings.fixedDuration')}</div>
                <div className="text-xs text-text-darker">{t('settings.fixedDurationDesc')}</div>
              </button>
            </div>
          </div>

          {/* Timing Section */}
          <div className="bg-white/5 rounded-xl p-5 border border-primary/10">
            <div className="space-y-4">
              {timerMode === 'fixed' && (
                <div>
                  <label className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-text-darker">{t('settings.timePerRound')}</span>
                    <span className="text-lg font-bold text-primary">{roundDurationSec}s</span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="300"
                    step="5"
                    value={roundDurationSec}
                    onChange={e => setRoundDurationSec(Number(e.target.value))}
                    className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <p className="text-xs text-text-darker mt-2">{t('settings.timePerRoundHelp')}</p>
                </div>
              )}
              {timerMode === 'progressive' && (
                <div>
                  <label className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-text-darker">{t('settings.raceDuration')}</span>
                    <span className="text-lg font-bold text-primary">{duelRaceTimeSec}s</span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="1"
                    value={duelRaceTimeSec}
                    onChange={e => setDuelRaceTimeSec(Number(e.target.value))}
                    className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <p className="text-xs text-text-darker mt-2">{t('settings.raceDurationHelp')}</p>
                </div>
              )}
              <div>
                <label className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-text-darker">{t('settings.showHintWhen')}</span>
                  <span className={`text-lg font-bold ${isHintThresholdInvalid ? 'text-red-400' : 'text-primary'}`}>{t('settings.secondsLeft', { seconds: hintThresholdSec })}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="60"
                  value={hintThresholdSec}
                  onChange={e => setHintThresholdSec(Number(e.target.value))}
                  className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className={`text-xs mt-2 ${isHintThresholdInvalid ? 'text-red-400 flex items-center gap-1' : 'text-text-darker'}`}>
                  {isHintThresholdInvalid && <AlertCircle size={14} />}
                  {isHintThresholdInvalid
                    ? t('settings.hintThresholdInlineError', { hint: hintThresholdSec, round: roundDurationSec })
                    : t('settings.hintAppearsHelp')}
                </p>
              </div>
            </div>
          </div>

          {/* Game Mode Section */}
          <div className="bg-white/5 rounded-xl p-5 border border-primary/10">
            <div className="flex items-center gap-2 mb-4">
              <Users2 size={20} className="text-primary" />
              <h3 className="text-lg font-bold text-primary">{t('settings.gameMode')}</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <button
                onClick={() => setGameMode('individual')}
                className={`p-2 md:p-3 rounded-lg border-2 transition-all ${gameMode === 'individual' ? 'border-primary bg-primary/20' : 'border-primary/20 bg-white/5 hover:border-primary/40'}`}
              >
                <div className="text-xs md:text-sm font-bold">{t('settings.modeIndividual')}</div>
                <div className="text-[10px] md:text-xs text-text-darker">{t('settings.modeIndividualDesc')}</div>
              </button>
              <button
                onClick={() => setGameMode('teams')}
                className={`p-2 md:p-3 rounded-lg border-2 transition-all ${gameMode === 'teams' ? 'border-primary bg-primary/20' : 'border-primary/20 bg-white/5 hover:border-primary/40'}`}
              >
                <div className="text-xs md:text-sm font-bold">{t('settings.modeTeams')}</div>
                <div className="text-[10px] md:text-xs text-text-darker">{t('settings.modeTeamsDesc')}</div>
              </button>
            </div>
          </div>

          {/* Gameplay Section */}
          <div className="bg-white/5 rounded-xl p-5 border border-primary/10">
            <div className="flex items-center gap-2 mb-4">
              <Eye size={20} className="text-primary" />
              <h3 className="text-lg font-bold text-primary">{t('settings.gameplay')}</h3>
            </div>
            {lobby.settings.enableAIGuessing && (
              <label className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${c.allowVisionCommentary ? 'cursor-pointer hover:bg-white/5' : 'opacity-50 cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  checked={visionCommentary}
                  onChange={e => c.allowVisionCommentary && setVisionCommentary(e.target.checked)}
                  disabled={!c.allowVisionCommentary}
                  className="w-5 h-5 rounded accent-primary mt-0.5 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {t('settings.aiVisionCommentary')}
                    {!c.allowVisionCommentary && <Lock size={12} className="text-text-darker/50 flex-shrink-0" />}
                  </div>
                  <div className="text-xs text-text-darker">{t('settings.aiVisionCommentaryDesc')}</div>
                </div>
              </label>
            )}
            {lobby.settings.enableAIGuessing ? (
              <label className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${c.allowAutoNaming ? 'cursor-pointer hover:bg-white/5' : 'opacity-50 cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  checked={autoNameImages}
                  onChange={e => c.allowAutoNaming && setAutoNameImages(e.target.checked)}
                  disabled={!c.allowAutoNaming}
                  className="w-5 h-5 rounded accent-primary mt-0.5 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {t('settings.autoNameImages')}
                    {!c.allowAutoNaming && <Lock size={12} className="text-text-darker/50 flex-shrink-0" />}
                  </div>
                  <div className="text-xs text-text-darker">{t('settings.autoNameImagesDesc')}</div>
                </div>
              </label>
            ) : (
              <div className="text-xs text-text-darker/70 italic p-3">{t('settings.enableAIGuessingForMore')}</div>
            )}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors">
              <input
                type="checkbox"
                checked={showImageDate}
                onChange={e => setShowImageDate(e.target.checked)}
                className="w-5 h-5 rounded accent-primary mt-0.5 flex-shrink-0"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium">{t('settings.showImageDate')}</div>
                <div className="text-xs text-text-darker">{t('settings.showImageDateHelp')}</div>
              </div>
            </label>
            <div className="space-y-4">
              <div>
                <label className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-text-darker">{t('settings.uploaderPenalty')}</span>
                  <span className="text-lg font-bold text-primary">{uploaderPenaltyPercent}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={uploaderPenaltyPercent}
                  onChange={e => setUploaderPenaltyPercent(Number(e.target.value))}
                  className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-xs text-text-darker mt-2">{t('settings.uploaderPenaltyHelp')}</p>
              </div>

              <div>
                <label className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-text-darker">{t('settings.minPhotosPerPlayer')}</span>
                  <span className="text-lg font-bold text-primary">{minPhotosPerPlayer}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={minPhotosPerPlayer}
                  onChange={e => setMinPhotosPerPlayer(Number(e.target.value))}
                  className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
              <div>
                <label className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-text-darker">{t('settings.maxPhotosPerPlayer')}</span>
                  <span className="text-lg font-bold text-primary">{maxPhotosPerPlayer}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max={c.maxPhotosPerPlayer}
                  value={maxPhotosPerPlayer}
                  onChange={e => setMaxPhotosPerPlayer(Number(e.target.value))}
                  className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          </div>

          {/* Map Settings Section */}
          <div className="bg-white/5 rounded-xl p-5 border border-primary/10">
            <div className="flex items-center gap-2 mb-4">
              <Map size={20} className="text-primary" />
              <h3 className="text-lg font-bold text-primary">{t('settings.mapStyle')}</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-darker mb-2 block">{t('settings.mapStyle')}</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(['osm', 'hot', 'cyclosm', 'opnvkarte', 'dark', 'light', 'satellite', 'terrain'] as const).map((style) => {
                    const locked = !c.allowAllMaps && style !== 'osm';
                    return (
                      <button
                        key={style}
                        onClick={() => !locked && setMapStyle(style)}
                        disabled={locked}
                        className={`relative p-1.5 md:p-2 rounded-lg border-2 text-xs font-medium transition-all min-w-0 ${locked ? 'opacity-40 cursor-not-allowed border-primary/10' : mapStyle === style ? 'border-primary bg-primary/20 text-primary' : 'border-primary/20 bg-white/5 hover:border-primary/40'}`}
                      >
                        {locked && <Lock size={10} className="absolute top-1 right-1 text-text-darker/60" />}
                        <div className="mb-1 rounded overflow-hidden border border-white/10">
                          <img
                            src={getPreviewTileUrl(style)}
                            alt={t(`settings.mapStyles.${style}`)}
                            className="w-full h-12 md:h-16 object-cover"
                            loading="lazy"
                          />
                        </div>
                        <span className="text-[10px] md:text-xs block truncate">{t(`settings.mapStyles.${style}`)}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-text-darker mt-2">{t('settings.mapStyleHelp')}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-text-darker mb-2 block">{t('settings.mapLanguage')}</label>
                {supportsLanguageVariants(mapStyle) ? (
                  <>
                    <p className="text-xs text-text-darker mt-2">{t('settings.mapLanguageHelp')}</p>
                    <select
                      value={mapLanguage}
                      onChange={(e) => setMapLanguage(e.target.value as MapLanguage)}
                      className="w-full bg-background border border-primary/20 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    >
                      {(['en', 'fr', "de", 'local'] as const).map((lang) => (
                        <option key={lang} value={lang}>{t(`settings.mapLanguages.${lang}`)}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p className="text-xs text-text-darker italic">{t('settings.mapLanguageNotSupported')}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 md:mt-8 flex justify-end gap-2 md:gap-3">
          <button
            onClick={onClose}
            className="px-3 md:px-6 py-2 md:py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors text-sm md:text-base"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-3 md:px-6 py-2 md:py-3 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors flex items-center gap-2 text-sm md:text-base"
          >
            <Check size={16} className="md:!w-[18px] md:!h-[18px]" /> {t('settings.saveSettings')}
          </button>
        </div>
      </motion.div>
    </div>
  )
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
  const hasAIPlayer = !!lobby?.players.some(p => p.id.startsWith('ai-'))
  const aiFeaturesEnabled = !!(lobby?.settings.enableAIGuessing || lobby?.settings.visionCommentary || lobby?.settings.autoNameImages)

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

    const intervalId = setInterval(fetchStatus, 3500);
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
      predictions: t('lobby.aiGeneratingGuesses'),
      commentary: t('lobby.aiCreatingCommentary'),
      'auto-naming': t('lobby.aiGeneratingTitles')
    };
    return stageMap[aiProcessingStatus.stage || ''] || t('lobby.aiProcessingTasks');
  }, [hasAIPlayer, aiFeaturesEnabled, aiProcessingStatus, t]);

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

  return (
    <>
      <AnimatePresence>
        {isSettingsOpen && <SettingsModal lobby={lobby} onClose={() => setSettingsOpen(false)} onSave={(settings) => { onUpdateSettings(settings); }} />}
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
                <p>
                  <strong className="text-text">{t('lobby.locationSearch')}:</strong> {t('lobby.locationSearchDesc')}
                </p>
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
            <div className="text-xs text-text-darker">{lobby.settings.gameMode === 'teams' ? t('settings.modeTeams') : t('settings.modeIndividual')} • {lobby.settings.timerMode === 'progressive' ? t('settings.duelShort') : t('settings.fixedShort')}</div>
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
      <div className="md:hidden w-full px-2 mb-3 max-h-[60vh] overflow-y-auto">
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
                          {isTeamMode && onSetTeam && (
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
              <button disabled={lobby.photos.length === 0} onClick={onStartGame} className="md:ml-auto px-4 py-3 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base md:text-sm">
                <Swords size={20} className="md:!w-[18px] md:!h-[18px]" /> {t('lobby.startGame')}
              </button>
            ) : (
              <div className="text-base md:text-sm text-text-darker md:ml-auto text-center md:text-left">{t('lobby.waitingHostStart')}</div>
            )}
          </div>
          {isHost && (
            <div className="mt-2 text-xs text-text-darker text-right">
              {lobby.photos.length === 0 && t('lobby.minOnePhoto')}
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
              <button
                onClick={() => setShowMap(true)}
                className={`flex-1 md:flex-none px-3 md:px-4 py-2.5 md:py-2 rounded-lg font-bold transition-colors flex items-center justify-center md:justify-start gap-2 text-sm md:text-base ${showMap
                  ? 'bg-primary text-black'
                  : 'bg-white/10 hover:bg-white/20 text-text'
                  }`}
              >
                <Map size={18} className="flex-shrink-0" /> {t('lobby.map')} ({myPhotosLocated}/{myPhotos.length})
              </button>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {showMap && myPhotos.length > 0 ? (
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
                      {isTeamMode && onSetTeam && (
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
        <div className="flex gap-2 pt-1 border-t border-primary/10">
          <button onClick={() => onSetReady(!me?.ready)} className={`flex-1 px-3 py-2 rounded font-bold text-xs transition-colors ${me?.ready ? 'bg-red-500/80 text-white' : 'bg-green-500/80 text-black'}`}>
            {me?.ready ? t('lobby.unready') : t('lobby.ready')}
          </button>
          {isHost && <button disabled={lobby.photos.length === 0} onClick={onStartGame} className="flex-1 px-3 py-2 rounded bg-primary hover:bg-primary-dark text-black font-bold text-xs disabled:opacity-40">{t('lobby.start')}</button>}
        </div>
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

function JoinOrCreateView({
  nickname,
  joinLobbyId,
  isJoining = false,
  onSetNickname,
  onCreateLobby,
  onJoinLobby,
  onViewTutorial,
}: LobbyProps & { onViewTutorial?: () => void }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [lobbyIdInput, setLobbyIdInput] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInput, setTokenInput] = useState(getStoredToken() || '');
  const [tokenSaved, setTokenSaved] = useState(!!getStoredToken());

  // Sync lobby ID input with joinLobbyId prop (for clearing on failure)
  useEffect(() => {
    setLobbyIdInput(joinLobbyId || '');
  }, [joinLobbyId]);

  const canSubmit = nickname.trim().length >= 2;
  const isJoiningViaLink = !!joinLobbyId && lobbyIdInput === joinLobbyId;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    if (isJoiningViaLink || lobbyIdInput.trim().length > 0) {
      onJoinLobby({ nickname, lobbyId: lobbyIdInput });
    } else {
      onCreateLobby({ nickname, roundDuration: DEFAULT_ROUND_DURATION_SEC });
    }
  };

  return (
    <div className="flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1">{t('lobby.welcomeTitle')}</h2>

          <p className="text-sm text-text-darker mb-6 px-2">
            {t('lobby.welcomeDesc')}
          </p>

          <p className="text-text-darker mb-2">
            {isJoiningViaLink
              ? t('lobby.enterNicknameJoin')
              : t('lobby.enterNicknameBegin')}
          </p>

          <form onSubmit={handleSubmit}>
            <input
              className="w-full rounded-lg bg-white/5 border border-primary/20 p-3 text-center text-lg font-bold tracking-wider"
              placeholder={t('lobby.yourNickname')}
              value={nickname}
              onChange={e => onSetNickname(e.target.value)}
              maxLength={20}
              autoFocus
            />

            {isJoiningViaLink ? (
              // Join via link flow
              canSubmit && (
                <div className="mt-6 bg-white/5 rounded-xl p-4 border border-primary/10">
                  <p className="text-sm text-text-darker mb-4">
                    {t('lobby.joiningLobby')}{' '}
                    <span className="font-mono font-bold text-primary">
                      {lobbyIdInput}
                    </span>
                  </p>

                  <button
                    type="submit"
                    disabled={isJoining}
                    className="w-full px-4 py-3 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <DoorOpen size={20} /> {isJoining ? t('lobby.joining') : t('lobby.joinLobby')}
                  </button>
                </div>
              )
            ) : (
              // Normal create/join flow
              canSubmit && (
                <div className="mt-6 grid sm:grid-cols-2 gap-4 text-left">
                  {/* Create Lobby */}
                  <div className="bg-white/5 rounded-xl p-4 border border-primary/10 flex flex-col">
                    <h3 className="font-bold text-lg flex items-center gap-2 mb-3">
                      <Crown size={20} /> {t('lobby.createLobby')}
                    </h3>
                    <p className="text-sm text-text-darker mb-4">
                      {t('lobby.createLobbyDesc')}
                    </p>

                    <button
                      type="submit"
                      disabled={isJoining}
                      className="w-full mt-auto px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isJoining ? t('lobby.creating') : t('lobby.createAndJoin')}
                    </button>
                  </div>

                  {/* Join Lobby */}
                  <div className="bg-white/5 rounded-xl p-4 border border-primary/10 flex flex-col">
                    <h3 className="font-bold text-lg flex items-center gap-2 mb-3">
                      <DoorOpen size={20} /> {t('lobby.joinLobbyTitle')}
                    </h3>

                    <input
                      className="w-full rounded-lg bg-surface border border-primary/20 p-3 text-center font-mono tracking-widest"
                      placeholder={t('lobby.lobbyIdPlaceholder')}
                      value={normalizeString(lobbyIdInput).toUpperCase()}
                      onChange={e => setLobbyIdInput(normalizeString(e.target.value).toUpperCase().slice(0, 12))}
                      onKeyDown={e => {
                        const normalizedId = normalizeString(lobbyIdInput).toUpperCase();
                        if (e.key === 'Enter' && normalizedId.length >= 3 && normalizedId.length <= 12) {
                          onJoinLobby({ nickname, lobbyId: normalizedId })
                        }
                      }}
                      maxLength={12}
                    />

                    <button
                      type="button"
                      onClick={() => {
                        const normalizedId = normalizeString(lobbyIdInput).toUpperCase();
                        onJoinLobby({ nickname, lobbyId: normalizedId })
                      }}
                      disabled={isJoining || normalizeString(lobbyIdInput).length < 3 || normalizeString(lobbyIdInput).length > 12}
                      className="w-full mt-auto px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isJoining ? t('lobby.joining') : t('lobby.join')}
                    </button>
                  </div>
                </div>
              )
            )}
          </form>
        </div>

        {/* Access token */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowTokenInput(v => !v)}
            className="flex items-center gap-1.5 text-xs text-text-darker/50 hover:text-text-darker/80 transition-colors mx-auto"
          >
            <Key size={11} />
            {tokenSaved ? t('lobby.tokenActive') : t('lobby.haveToken')}
            {tokenSaved && <Check size={11} className="text-green-400" />}
          </button>
          {showTokenInput && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={tokenInput}
                onChange={e => { setTokenInput(e.target.value); setTokenSaved(false); }}
                placeholder={t('lobby.tokenPlaceholder')}
                className="flex-1 rounded-lg bg-white/5 border border-primary/20 p-2 text-xs font-mono"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!tokenInput.trim()) {
                    clearStoredToken();
                    setTokenSaved(false);
                    addToast(t('lobby.tokenCleared'), 'info', 2000);
                    return;
                  }
                  const res = await api.validateToken(tokenInput.trim());
                  if (res.valid) {
                    setStoredToken(tokenInput.trim());
                    setTokenSaved(true);
                    addToast(t('lobby.tokenSaved', { name: res.name || tokenInput.slice(0, 8) + '…' }), 'success', 3000);
                  } else {
                    addToast(t('lobby.tokenInvalid'), 'error', 3000);
                  }
                }}
                className="px-3 py-2 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold text-xs"
              >
                {t('common.save')}
              </button>
              {tokenSaved && (
                <button
                  type="button"
                  onClick={() => { clearStoredToken(); setTokenInput(''); setTokenSaved(false); addToast(t('lobby.tokenCleared'), 'info', 2000); }}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer with tutorial link */}
        {onViewTutorial && (
          <div className="mt-6 flex items-center justify-center gap-3 py-1">
            <button
              onClick={onViewTutorial}
              className="flex items-center gap-1 text-xs text-text-darker hover:text-primary"
            >
              <HelpCircle size={14} />
              {t('onboarding.viewTutorial')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
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
