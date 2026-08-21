import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useI18n } from '../../contexts/I18nContext'
import { getCountryName } from '../../lib/countryNames'
import { AnimatedCounter } from '../ui/AnimatedCounter'

const animation = {
  HYPE: { delay: 0.1, stagger: 0.05, stiffness: 300, damping: 25 },
  ROUND_POINTS: { delay: 0.3, stiffness: 180, damping: 20 },
  LAYOUT: { stiffness: 150, damping: 25, duration: 0.4 },
}

export type LeaderboardRowData = {
  id: string
  rank: number
  prevRank: number
  icon: string
  nickname: string
  color: string
  totalScore: number
  prevScore: number
  roundPoints: number
  isPlayer: boolean
  isUploader: boolean
  distanceKm?: string
  countryFlag?: string
  country?: string
  countryCode?: string
  visionCommentary?: string
  isAI?: boolean
  meta?: ReactNode
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 0) return <div className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-400/60 bg-amber-400/20 text-xs font-black text-amber-400">1</div>
  if (rank === 1) return <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-400/60 bg-gray-400/20 text-xs font-black text-gray-300">2</div>
  if (rank === 2) return <div className="flex h-7 w-7 items-center justify-center rounded-full border border-orange-600/50 bg-orange-600/20 text-xs font-black text-orange-500">3</div>
  return <div className="flex h-7 w-7 items-center justify-center rounded-full border border-primary/20 bg-surface text-xs font-bold text-text-darker">{rank + 1}</div>
}

function RankDelta({ delta }: { delta: number }) {
  if (delta === 0) return <Minus size={12} className="text-text-darker/40" />
  if (delta > 0) return <div className="flex items-center gap-0.5 text-emerald-400"><TrendingUp size={12} /><span className="text-[10px] font-bold">{delta}</span></div>
  return <div className="flex items-center gap-0.5 text-red-400"><TrendingDown size={12} /><span className="text-[10px] font-bold">{Math.abs(delta)}</span></div>
}

export function AnimatedLeaderboardRow({ row, index, phase }: {
  row: LeaderboardRowData
  index: number
  phase: 'before' | 'after'
}) {
  const { t, language } = useI18n()
  const displayScore = phase === 'before' ? row.prevScore : row.totalScore
  const delta = row.prevRank - row.rank
  const [showHype, setShowHype] = useState(true)
  const distance = row.distanceKm ? Number.parseFloat(row.distanceKm) : Number.NaN
  const hype = distance < 1
    ? { label: t('guess.perfect'), color: 'text-amber-400', emoji: '🎯' }
    : distance < 100
      ? { label: t('guess.amazing'), color: 'text-purple-400', emoji: '🌟' }
      : null
  const shouldShowHype = phase === 'after' && hype !== null

  useEffect(() => {
    if (!shouldShowHype) return
    setShowHype(true)
    const timeout = setTimeout(() => setShowHype(false), 2500)
    return () => clearTimeout(timeout)
  }, [phase, shouldShowHype])

  return (
    <motion.div
      layout
      layoutId={`leaderboard-row-${row.id}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        layout: { type: 'spring', stiffness: animation.LAYOUT.stiffness, damping: animation.LAYOUT.damping, delay: index * 0.05 },
        opacity: { duration: animation.LAYOUT.duration, delay: index * 0.05 },
        x: { duration: animation.LAYOUT.duration, delay: index * 0.05 },
      }}
      className={`relative flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
        row.isPlayer ? 'border-primary/50 bg-primary/10' : row.rank < 3 ? 'border-primary/20 bg-surface/80' : 'border-primary/10 bg-surface/50'
      } ${phase === 'after' && delta > 0 ? 'ring-1 ring-emerald-400/30' : ''} ${phase === 'after' && delta < 0 ? 'ring-1 ring-red-400/20' : ''}`}
    >
      <div className="flex w-8 shrink-0 flex-col items-center gap-0.5">
        <RankBadge rank={row.rank} />
        {phase === 'after' && <RankDelta delta={delta} />}
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-lg" style={{ borderColor: `${row.color}66`, background: `${row.color}22` }}>
        {row.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`truncate text-sm font-semibold ${row.isPlayer ? 'text-primary' : 'text-text'}`}>{row.nickname}</span>
          {row.isUploader && <span className="shrink-0 rounded border border-primary/20 px-1 text-[10px] text-text-darker/60">📸</span>}
          {row.countryFlag && <span className="shrink-0 text-sm" title={getCountryName(row.countryCode, language, row.country)}>{row.countryFlag}</span>}
        </div>
        <AnimatePresence>
          {phase === 'after' && (row.meta || row.distanceKm) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-0.5 text-[11px] text-text-darker">
              {row.meta || `📍 ${row.distanceKm}`}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <AnimatePresence mode="wait">
          {shouldShowHype && showHype && hype ? (
            <motion.div key="hype" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }} className={`flex items-center gap-1 text-[10px] font-black ${hype.color}`}>
              <span className="text-sm">{hype.emoji}</span>{hype.label}
            </motion.div>
          ) : (
            <motion.div key="score" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`font-mono text-base font-black tabular-nums ${row.isPlayer ? 'text-primary' : 'text-text'}`}>
              <AnimatedCounter value={displayScore} delay={0} />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {phase === 'after' && row.roundPoints > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.7, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: animation.ROUND_POINTS.delay + index * animation.HYPE.stagger, type: 'spring', stiffness: animation.ROUND_POINTS.stiffness, damping: animation.ROUND_POINTS.damping }} className="font-mono text-[11px] font-bold text-emerald-400">
              +{row.roundPoints}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
