import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Info, Trophy } from 'lucide-react'
import type { LeaderboardItem, Lobby, Result, TeamLeaderboardItem } from '../../lib/types'
import { useI18n } from '../../contexts/I18nContext'
import { AnimatedLeaderboardRow, type LeaderboardRowData } from './AnimatedLeaderboardRow'

export function roundPointsForEntry(entry: LeaderboardItem, results: Result[]) {
  if ('id' in entry) return results.find(result => result.playerId === entry.id)?.points ?? 0
  return Math.max(0, ...entry.players.map(player =>
    results.find(result => result.playerId === player.id)?.points ?? 0))
}

function PointsBreakdown({ result }: { result: Result }) {
  const { t, language } = useI18n()
  const penalized = result.basePoints != null && result.basePoints !== result.points
  return (
    <div className="shrink-0 text-right">
      <div className="text-[9px] font-bold uppercase tracking-wider text-text-darker">{t('results.roundPoints')}</div>
      <div className="font-mono text-base font-black text-primary">
        {penalized && (
          <span className="mr-1 text-[11px] font-semibold text-text-darker line-through">
            {result.basePoints!.toLocaleString(language)}
          </span>
        )}
        +{result.points.toLocaleString(language)}
      </div>
    </div>
  )
}

function PlayerAnswer({
  result,
  renderAnswer,
}: {
  result: Result
  renderAnswer: (result: Result) => ReactNode
}) {
  return (
    <>
      <div className="mt-1 text-xs text-text-darker">{renderAnswer(result)}</div>
      {result.isAI && result.visionCommentary && (
        <div className="mt-1.5 text-xs italic text-primary/75">“{result.visionCommentary}”</div>
      )}
    </>
  )
}

function TeamDetails({
  entry,
  results,
  renderAnswer,
}: {
  entry: TeamLeaderboardItem
  results: Result[]
  renderAnswer: (result: Result) => ReactNode
}) {
  const { t } = useI18n()
  const memberResults = entry.players
    .map(player => results.find(result => result.playerId === player.id))
    .filter((result): result is Result => !!result)
    .sort((a, b) => b.points - a.points)

  return (
    <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
      {memberResults.map((result, index) => (
        <div key={result.playerId} className="flex items-start gap-2 rounded-lg bg-black/15 px-2.5 py-2">
          <span className="text-base">{result.icon || '👤'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span className="truncate">{result.nickname}</span>
              {index === 0 && (
                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase text-primary">
                  {t('results.teamContribution')}
                </span>
              )}
            </div>
            <PlayerAnswer result={result} renderAnswer={renderAnswer} />
          </div>
          <PointsBreakdown result={result} />
        </div>
      ))}
    </div>
  )
}

export default function ModeResultLeaderboard({
  data,
  lobby,
  playerId,
  renderAnswer,
}: {
  data: { results: Result[]; leaderboard: LeaderboardItem[] }
  lobby: Lobby
  playerId: string
  renderAnswer: (result: Result) => ReactNode
}) {
  const { t } = useI18n()
  const isTeams = lobby.settings.gameMode === 'teams'
  const penalty = lobby.settings.uploaderPenaltyPercent ?? 10
  const [showScoring, setShowScoring] = useState(false)
  const rows: LeaderboardRowData[] = data.leaderboard.map((entry, rank) => {
    const isTeam = 'team' in entry
    const id = isTeam ? entry.team : entry.id
    const memberResults = isTeam
      ? entry.players.map(player => data.results.find(result => result.playerId === player.id)).filter((result): result is Result => !!result)
      : []
    const result = isTeam
      ? [...memberResults].sort((a, b) => b.points - a.points)[0]
      : data.results.find(item => item.playerId === entry.id)
    const roundPoints = roundPointsForEntry(entry, data.results)
    return {
      id,
      rank,
      prevRank: rank,
      icon: isTeam ? '👥' : entry.icon || '👤',
      nickname: isTeam ? entry.team : entry.nickname,
      color: result?.color || (isTeam ? '#a78bfa' : entry.color) || '#888888',
      totalScore: entry.score,
      prevScore: Math.max(0, entry.score - roundPoints),
      roundPoints,
      isPlayer: isTeam ? entry.players.some(player => player.id === playerId) : entry.id === playerId,
      isUploader: result?.isUploader || false,
      meta: result ? (
        <>
          {renderAnswer(result)}
          {result.isAI && result.visionCommentary && (
            <span className="mt-1 block italic text-primary/75">“{result.visionCommentary}”</span>
          )}
        </>
      ) : undefined,
      visionCommentary: result?.visionCommentary,
      isAI: result?.isAI,
    }
  })

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-surface">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Trophy size={20} className="text-primary" />
        <h2 className="text-lg font-black text-primary">{t('results.leaderboard')}</h2>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-text-darker">
          {t('results.roundAndTotal')}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 p-2">
        {rows.map((row, index) => {
          const entry = data.leaderboard[index]
          return (
            <div key={row.id}>
              <AnimatedLeaderboardRow row={row} index={index} phase="after" />
              {entry && 'team' in entry && (
                <div className="ml-12">
                  <TeamDetails entry={entry} results={data.results} renderAnswer={renderAnswer} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        aria-expanded={showScoring}
        onClick={() => setShowScoring(open => !open)}
        className="flex w-full items-center gap-2 border-t border-primary/15 bg-primary/[0.06] px-3 py-2.5 text-left text-xs font-black text-primary transition hover:bg-primary/10"
      >
        <Info size={14} />
        <span>{t('results.howScoringWorks')}</span>
        <ChevronDown size={14} className={`ml-auto transition-transform ${showScoring ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {showScoring && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-primary/10 bg-primary/[0.04] text-xs text-text-darker"
          >
            <div className="p-3">
              <p>{t(lobby.settings.gameType === 'date' ? 'results.dateScoringFormula' : 'results.uploaderScoringFormula')}</p>
              {penalty > 0 && (
                <p className="mt-1">{t(
                  lobby.settings.gameType === 'date' && lobby.settings.dateSubmode === 'before_after'
                    ? 'results.modeUploaderPenaltyBeforeAfter'
                    : 'results.modeUploaderPenalty',
                  { penalty },
                )}</p>
              )}
              {isTeams && <p className="mt-1">{t('results.teamScoringRule')}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
