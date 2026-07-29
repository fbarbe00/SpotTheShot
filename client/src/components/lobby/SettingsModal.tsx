import { useEffect, useState } from 'react'
import { AlertCircle, CalendarDays, Check, Clock, Eye, Lock, Map, MapPin, Settings, Users, Users2, X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { GameSettings, Lobby } from '../../lib/types'
import { useToast } from '../../lib/toast'
import { useI18n } from '../../contexts/I18nContext'
import { getPreviewTileUrl, supportsLanguageVariants, type MapLanguage } from '../../lib/mapConfig'
import { DEFAULT_HINT_THRESHOLD_SEC, DEFAULT_ROUND_DURATION_SEC, OPEN_CONSTRAINTS } from './types'
import { isDateModeNew, isUploaderModeNew } from '../../lib/gameModes'
import type { GameType } from '../../lib/gameModes'

export default function SettingsModal({ lobby, onClose, onSave }: { lobby: Lobby, onClose: () => void, onSave: (settings: GameSettings) => Promise<boolean> }) {
  const { addToast } = useToast()
  const { t } = useI18n()
  const [roundDurationSec, setRoundDurationSec] = useState(lobby.settings.roundDurationSec)
  const [gameType, setGameType] = useState<GameType>(lobby.settings.gameType || 'spot')
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
  const [isSaving, setIsSaving] = useState(false)

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

  const handleSave = async () => {
    if (isHintThresholdInvalid) {
      addToast(t('settings.hintThresholdError'), 'warning', 4000)
      return
    }
    setIsSaving(true)
    // Timeline bounds are server-derived when a DateTheShot game starts.
    // Do not echo bounds from a previous game back as editable settings.
    const editableSettings = { ...lobby.settings }
    delete editableSettings.dateTimelineStart
    delete editableSettings.dateTimelineEnd
    const saved = await onSave({
      ...editableSettings,
      roundDurationSec,
      gameType,
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
    setIsSaving(false)
    if (saved) {
      addToast(t('settings.updated'), 'success', 2000)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lobby-settings-title"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface p-8 rounded-2xl border border-primary/20 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl text-base md:text-sm"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Settings size={28} className="text-primary" />
            <h2 id="lobby-settings-title" className="text-3xl font-bold text-primary">{t('settings.lobbySettings')}</h2>
          </div>
          <button onClick={onClose} aria-label={t('ui.closeModal')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-white/5 rounded-xl p-5 border border-primary/10">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays size={20} className="text-primary" />
              <h3 className="text-lg font-bold text-primary">{t('settings.gameType')}</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setGameType('spot')}
                className={`p-3 rounded-lg border-2 transition-all ${gameType === 'spot' ? 'border-primary bg-primary/20' : 'border-primary/20 bg-white/5 hover:border-primary/40'}`}
              >
                <MapPin size={20} className="mx-auto mb-1" />
                <div className="text-sm font-bold">SpotTheShot</div>
                <div className="text-xs text-text-darker">{t('settings.spotTypeDesc')}</div>
              </button>
              <button
                onClick={() => setGameType('uploader')}
                className={`relative p-3 rounded-lg border-2 transition-all ${gameType === 'uploader' ? 'border-primary bg-primary/20' : 'border-primary/20 bg-white/5 hover:border-primary/40'}`}
              >
                {isUploaderModeNew() && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-black">
                    {t('common.new')}
                  </span>
                )}
                <Users size={20} className="mx-auto mb-1" />
                <div className="text-[11px] font-bold leading-tight tracking-tight">
                  WhoTook<wbr />TheShot
                </div>
                <div className="text-xs text-text-darker">{t('settings.uploaderTypeDesc')}</div>
              </button>
              <button
                onClick={() => setGameType('date')}
                className={`relative p-3 rounded-lg border-2 transition-all ${gameType === 'date' ? 'border-primary bg-primary/20' : 'border-primary/20 bg-white/5 hover:border-primary/40'}`}
              >
                {isDateModeNew() && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-black">
                    {t('common.new')}
                  </span>
                )}
                <CalendarDays size={20} className="mx-auto mb-1" />
                <div className="text-sm font-bold">DateTheShot</div>
                <div className="text-xs text-text-darker">{t('settings.dateTypeDesc')}</div>
              </button>
            </div>
            {gameType !== lobby.settings.gameType && gameType !== 'uploader' && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100">
                <AlertCircle size={15} className="mt-0.5 flex-shrink-0 text-amber-300" />
                <span>{t(gameType === 'date' ? 'settings.switchNeedsDates' : 'settings.switchNeedsLocations')}</span>
              </div>
            )}
          </div>

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
            {gameType !== 'date' && <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors">
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
            </label>}
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
                  max={maxPhotosPerPlayer}
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
                  onChange={e => {
                    const value = Number(e.target.value)
                    setMaxPhotosPerPlayer(value)
                    setMinPhotosPerPlayer(current => Math.min(current, value))
                  }}
                  className="w-full h-2 bg-background rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          </div>

          {/* Map Settings Section */}
          {gameType === 'spot' && <div className="bg-white/5 rounded-xl p-5 border border-primary/10">
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
          </div>}
        </div>

        <div className="mt-6 md:mt-8 flex justify-end gap-2 md:gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-3 md:px-6 py-2 md:py-3 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors text-sm md:text-base"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 md:px-6 py-2 md:py-3 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors flex items-center gap-2 text-sm md:text-base disabled:opacity-50"
          >
            <Check size={16} className="md:!w-[18px] md:!h-[18px]" /> {t('settings.saveSettings')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
