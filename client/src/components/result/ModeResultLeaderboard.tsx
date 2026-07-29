import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Info, Trophy } from 'lucide-react'
import type { LeaderboardItem, Lobby, Result, TeamLeaderboardItem } from '../../lib/types'
import { useI18n } from '../../contexts/I18nContext'

export function roundPointsForEntry(entry: LeaderboardItem, results: Result[]) {
  if ('id' in entry) return results.find(result => result.playerId === entry.id)?.points ?? 0
  return Math.max(0, ...entry.players.map(player =>
    results.find(result => result.playerId === player.id)?.points ?? 0))
}

function RankBadge({ rank }: { rank: number }) {
  const colors = rank === 0
    ? 'border-amber-400/60 bg-amber-400/20 text-amber-300'
    : rank === 1
      ? 'border-slate-300/50 bg-slate-300/15 text-slate-200'
      : rank === 2
        ? 'border-orange-500/50 bg-orange-500/15 text-orange-400'
        : 'border-primary/20 bg-black/20 text-text-darker'
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-black ${colors}`}>
      {rank + 1}
    </span>
  )
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
  const { t, language } = useI18n()
  const isTeams = lobby.settings.gameMode === 'teams'
  const penalty = lobby.settings.uploaderPenaltyPercent ?? 10
  const [showScoring, setShowScoring] = useState(false)

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/20 bg-surface">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Trophy size={20} className="text-primary" />
        <h2 className="text-lg font-black text-primary">{t('results.leaderboard')}</h2>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-text-darker">
          {t('results.roundAndTotal')}
        </span>
      </div>

      <div className="space-y-2 p-3">
        {data.leaderboard.map((entry, index) => {
          const result = 'id' in entry
            ? data.results.find(item => item.playerId === entry.id)
            : undefined
          const current = 'id' in entry
            ? entry.id === playerId
            : entry.players.some(player => player.id === playerId)
          const icon = 'id' in entry ? entry.icon : '👥'
          const name = 'id' in entry ? entry.nickname : entry.team
          return (
            <motion.div
              key={'id' in entry ? entry.id : entry.team}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className={`rounded-xl border p-3 ${
                current ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <RankBadge rank={index} />
                <span className="text-xl">{icon || '👤'}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-white">{name}</div>
                  {result && <PlayerAnswer result={result} renderAnswer={renderAnswer} />}
                  {isTeams && (
                    <div className="mt-0.5 text-[10px] text-text-darker">
                      {t('results.bestTeamScoreCounts')}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-start gap-3">
                  {!isTeams && result
                    ? <PointsBreakdown result={result} />
                    : (
                      <div className="text-right">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-text-darker">{t('results.roundPoints')}</div>
                        <div className="font-mono text-base font-black text-primary">
                          +{roundPointsForEntry(entry, data.results).toLocaleString(language)}
                        </div>
                      </div>
                    )}
                  <div className="min-w-16 text-right">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-text-darker">{t('results.totalScore')}</div>
                    <div className="font-mono text-base font-black text-white">{entry.score.toLocaleString(language)}</div>
                  </div>
                </div>
              </div>
              {'team' in entry && (
                <TeamDetails entry={entry} results={data.results} renderAnswer={renderAnswer} />
              )}
            </motion.div>
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
              {penalty > 0 && <p className="mt-1">{t('results.modeUploaderPenalty', { penalty })}</p>}
              {isTeams && <p className="mt-1">{t('results.teamScoringRule')}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
