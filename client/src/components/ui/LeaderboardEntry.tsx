import { Trophy, Award } from 'lucide-react'
import { motion } from 'framer-motion'

export type EntryType = 'player' | 'team'

interface LeaderboardEntryProps {
  rank: number
  name: string
  score: number
  icon?: string
  _type?: EntryType // Reserved for future use
  color?: string | null
  delay?: number
  isHighlighted?: boolean
}

/**
 * Reusable leaderboard entry component
 * Displays a single player or team row with rank, name, score, and visual indicators
 * Used by: Game (end screen), Result leaderboard, Stats page
 */
export function LeaderboardEntry({
  rank,
  name,
  score,
  icon,
  _type, // Reserved for future use
  color,
  delay = 0,
  isHighlighted = false,
}: LeaderboardEntryProps) {
  const isWinner = rank === 1
  const isRunnerup = rank === 2
  const isThird = rank === 3

  const rankIcon = isWinner ? '🏆' : isRunnerup ? '🥈' : isThird ? '🥉' : `#${rank}`
  const bgColor = isHighlighted ? 'bg-primary/10' : 'bg-white/5'
  const borderColor = isHighlighted ? 'border-primary/40' : 'border-primary/20'

  const playerColor = color ? color : 'hsl(var(--primary))'
  const rgba = `rgba(${parseInt(playerColor.slice(1, 3), 16)},${parseInt(playerColor.slice(3, 5), 16)},${parseInt(playerColor.slice(5, 7), 16)},0.15)`

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3 }}
      className={`flex items-center gap-4 p-4 rounded-lg border ${borderColor} ${bgColor} hover:border-primary/40 transition-colors`}
      style={color && isHighlighted ? { backgroundColor: rgba } : undefined}
    >
      {/* Rank Badge */}
      <div className="flex items-center justify-center min-w-[3rem]">
        {typeof rankIcon === 'string' && rankIcon.startsWith('🏆') ? (
          <span className="text-2xl">{rankIcon}</span>
        ) : isWinner ? (
          <Trophy className="w-5 h-5 text-amber-400" />
        ) : isRunnerup ? (
          <Award className="w-5 h-5 text-gray-300" />
        ) : (
          <span className="text-sm font-bold text-text-darker">{rankIcon}</span>
        )}
      </div>

      {/* Icon (if provided) */}
      {icon && <span className="text-2xl">{icon}</span>}

      {/* Name */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-text truncate">{name}</div>
      </div>

      {/* Score */}
      <div className="text-right min-w-[4rem]">
        <div className="font-mono font-bold text-lg text-primary">{score.toLocaleString()}</div>
      </div>
    </motion.div>
  )
}

interface LeaderboardProps {
  entries: Array<{
    rank: number
    name: string
    score: number
    icon?: string
    type?: EntryType
    color?: string | null
  }>
  highlightRank?: number
  maxEntries?: number
}

/**
 * Leaderboard component - displays multiple entries
 */
export function Leaderboard({ entries, highlightRank, maxEntries = 10 }: LeaderboardProps) {
  const displayEntries = entries.slice(0, maxEntries)

  return (
    <div className="space-y-2">
      {displayEntries.map((entry) => (
        <LeaderboardEntry
          key={`${entry.type || 'player'}-${entry.name}`}
          {...entry}
          delay={entry.rank * 0.05}
          isHighlighted={highlightRank === entry.rank}
        />
      ))}
    </div>
  )
}
