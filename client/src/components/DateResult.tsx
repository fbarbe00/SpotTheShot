import { CalendarDays, ChevronRight, Clock3 } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Lobby, RoundResults } from '../lib/types'
import { buildPhotoUrl, socket } from '../lib/socket'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../lib/toast'
import ModeResultLeaderboard from './result/ModeResultLeaderboard'

function formatDistance(days = 0, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (days === 0) return t('game.date.exact')
  if (days < 365) return t('game.date.daysAway', { count: days })
  const years = Math.round((days / 365.25) * 10) / 10
  return t('game.date.yearsAway', { count: years })
}

function dayNumber(date: string) {
  return Date.parse(`${date}T12:00:00Z`) / 86_400_000
}

export default function DateResult({
  data,
  lobby,
  playerId,
}: {
  data: RoundResults
  lobby: Lobby
  playerId: string
}) {
  const { t, language } = useI18n()
  const { addToast } = useToast()
  const isHost = lobby.hostId === playerId
  const isLastRound = data.roundIndex === data.totalRounds - 1
  const actual = data.photo.captureDate || ''
  const actualLabel = actual
    ? new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${actual}T12:00:00`))
    : t('game.date.unknown')
  const results = [...data.results].sort((a, b) => b.points - a.points)
  const submittedDays = [actual, ...results.map(result => result.guessedDate)]
    .filter((value): value is string => !!value)
    .map(dayNumber)
  const lowestDay = Math.min(...submittedDays)
  const highestDay = Math.max(...submittedDays)
  const contentSpan = Math.max(1, highestDay - lowestDay)
  const paddingDays = Math.max(30, Math.ceil(contentSpan * 0.12))
  const configuredMin = dayNumber(lobby.settings.dateTimelineStart || actual)
  const todayDay = dayNumber(lobby.settings.dateTimelineEnd || new Date().toISOString().slice(0, 10))
  const startDay = Math.max(configuredMin, lowestDay - paddingDays)
  const endDay = Math.min(todayDay, highestDay + paddingDays)
  const timelineStart = new Date(startDay * 86_400_000).toISOString().slice(0, 10)
  const timelineEnd = new Date(endDay * 86_400_000).toISOString().slice(0, 10)
  const timelineSpan = Math.max(1, endDay - startDay)
  const positionForDate = (date?: string) => {
    if (!date) return 0
    return Math.max(0, Math.min(100, ((dayNumber(date) - startDay) / timelineSpan) * 100))
  }
  const actualPosition = positionForDate(actual)

  const next = () => {
    socket.emit('next_round', { lobbyId: lobby.id, playerId }, (response: { success?: boolean; error?: string }) => {
      if (!response?.success) addToast(response?.error || t('toast.connectionHiccup'), 'error', 5000)
    })
  }

  return (
    <div className="mx-auto grid max-h-[calc(100svh-80px)] max-w-6xl gap-5 overflow-y-auto px-2 md:grid-cols-[1.1fr_0.9fr]">
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
        className="overflow-hidden rounded-2xl border border-primary/20 bg-surface">
        <img src={buildPhotoUrl(data.photo.url, lobby.id, playerId)} alt="" className="h-64 w-full bg-black object-contain md:h-[28rem]" />
        <div className="bg-gradient-to-r from-amber-500/10 via-primary/10 to-violet-500/10 p-5 text-center">
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-primary/70">{t('game.date.takenOn')}</div>
          <div className="mt-1 text-3xl font-black text-white">{actualLabel}</div>
          <div className="mt-6 text-left">
            <div className="mb-2 flex justify-between text-[10px] font-semibold text-text-darker">
              <span>{timelineStart}</span>
              <span>{timelineEnd}</span>
            </div>
            <div className="relative min-h-24">
              <div className="absolute left-0 right-0 top-5 h-1 rounded-full bg-gradient-to-r from-amber-900/80 via-violet-700/80 to-primary/80" />
              <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${actualPosition}%` }}>
                <span className="block whitespace-nowrap rounded bg-white px-1.5 py-0.5 text-[9px] font-black text-black">{t('game.date.actual')} · {actual}</span>
                <span className="mx-auto block h-8 w-px bg-white" />
              </div>
              {results.map((result, index) => (
                <div
                  key={result.playerId}
                  className="absolute flex -translate-x-1/2 flex-col items-center"
                  style={{ left: `${positionForDate(result.guessedDate)}%`, top: `${42 + (index % 2) * 30}px` }}
                  title={`${result.nickname}: ${result.guessedDate || ''}`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 bg-surface text-base shadow-lg"
                    style={{ borderColor: result.color || '#a78bfa' }}>
                    {result.icon || '👤'}
                  </span>
                  <span className="max-w-24 truncate whitespace-nowrap text-[9px] font-bold text-white">
                    {result.guessedDate}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
      <div className="flex flex-col gap-3">
        {isHost ? (
          <button onClick={next} className="flex items-center justify-center gap-2 rounded-xl bg-primary p-3 font-black text-black hover:bg-primary-dark">
            {isLastRound ? t('game.viewResults') : t('game.nextRound')} <ChevronRight size={18} />
          </button>
        ) : (
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-center text-sm text-text-darker">
            {t('results.waitingNextRound')}
          </div>
        )}
        <ModeResultLeaderboard
          data={data}
          lobby={lobby}
          playerId={playerId}
          renderAnswer={result => (
            <span className="flex flex-wrap items-center gap-1">
              <CalendarDays size={12} /> {result.guessedDate || '—'}
              <span>·</span>
              <Clock3 size={12} /> {formatDistance(result.distanceDays, t)}
              {result.isUploader && <span className="ml-1 text-amber-400">{t('results.uploader')}</span>}
            </span>
          )}
        />
      </div>
    </div>
  )
}
