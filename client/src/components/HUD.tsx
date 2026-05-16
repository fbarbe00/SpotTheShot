import { Calendar, Camera, Clock, Hash, Lightbulb } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useI18n } from '../contexts/I18nContext'

// Props for HUD display during game rounds
type HUDProps = {
  timeMs: number  // Remaining time in milliseconds
  timerStarted?: boolean  // Whether timer has started (for progressive mode)
  round: number  // Current round index
  total: number  // Total number of rounds
  uploaderName: string  // Name of player who uploaded current photo
  title?: string  // Optional photo title
  hint?: string  // Optional hint text shown near end of round
  hintThresholdSec?: number  // Seconds remaining before hint is shown
  captureDate?: string  // Optional capture date from EXIF metadata
  showImageDate?: boolean  // Whether to show the image capture date
}

// Display game round information - timer, round progress, photo details, hint
export function HUD({ timeMs, timerStarted = true, round, total, uploaderName, title, hint, hintThresholdSec = 10, captureDate, showImageDate }: HUDProps) {
  const { t } = useI18n()
  const sec = Math.max(0, Math.ceil(timeMs / 1000));
  const timeColor = sec <= hintThresholdSec ? 'text-red-400' : sec <= hintThresholdSec * 2 ? 'text-amber-400' : 'text-text'
  const showHint = hint && timerStarted && sec <= hintThresholdSec

  return (
    <div className="flex flex-col gap-1 w-full max-w-3xl mx-auto px-1">
      {/* Main HUD Row - extremely compact for mobile */}
      <div className="flex flex-nowrap items-stretch gap-1 w-full">
        {/* Info block: round + uploader + optional date + title */}
        <div className="flex flex-nowrap items-center gap-1 md:gap-2 bg-surface/85 backdrop-blur-sm px-1.5 md:px-2 py-1 rounded-lg border border-primary/20 flex-1 min-w-0 shadow-lg">
          {/* Round number */}
          <div className="flex items-center gap-0.5 md:gap-1 flex-shrink-0">
            <Hash size={12} className="text-primary md:w-3.5 md:h-3.5" />
            <div className="font-bold text-[10px] md:text-xs whitespace-nowrap">{round + 1}/{total}</div>
          </div>

          <div className="w-px h-3 bg-primary/20 flex-shrink-0"></div>

          {/* Photo source & Title */}
          <div className="flex flex-col min-w-0 leading-none">
            {title && <div className="text-[10px] md:text-xs font-bold text-primary truncate">{title}</div>}
            <div className="flex items-center gap-1 min-w-0">
              <Camera size={10} className="text-text-darker/60 flex-shrink-0 md:w-3 md:h-3" />
              <div className="text-[9px] md:text-[10px] font-medium text-text-darker truncate">
                {uploaderName}
              </div>
            </div>
          </div>

          {showImageDate && captureDate && (
            <div className="flex items-center gap-1.5 border-l border-primary/20 pl-2 min-w-0">
              <Calendar size={12} className="text-primary flex-shrink-0" />
              <div className="text-[10px] font-bold truncate">{new Date(captureDate).toLocaleDateString()}</div>
            </div>
          )}
        </div>

        {/* Timer block - very compact */}
        <div className="bg-surface/85 backdrop-blur-sm px-2 py-1 rounded-lg border border-primary/20 flex items-center gap-1 flex-shrink-0 shadow-lg min-w-[45px] md:min-w-[60px] justify-center">
          <Clock size={14} className={`${timerStarted ? timeColor : 'text-primary'} md:w-4 md:h-4`} />
          {timerStarted ? (
            <div className={`text-sm md:text-base font-black tabular-nums ${timeColor}`}>{sec}s</div>
          ) : (
            <div className="text-[10px] font-bold text-primary uppercase">{t("hud.inf")}</div>
          )}
        </div>
      </div>

      {/* Waiting for first guess banner (progressive mode only) */}
      <AnimatePresence>
        {!timerStarted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-primary/15 backdrop-blur-sm px-2 py-1 rounded-lg border border-primary/30 flex items-center gap-1.5 shadow-lg mx-4"
          >
            <Clock size={12} className="text-primary flex-shrink-0 animate-pulse" />
            <div className="text-[10px] md:text-xs text-primary font-medium truncate">{t("game.waitingFirstGuess")}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint Row - slim overlay */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-amber-500/25 backdrop-blur-sm px-2 py-1 rounded-lg border border-amber-500/40 flex items-center gap-1.5 shadow-lg mx-4"
          >
            <Lightbulb size={12} className="text-amber-400 flex-shrink-0" />
            <div className="text-[10px] md:text-xs text-amber-100 font-medium truncate italic">"{hint}"</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}