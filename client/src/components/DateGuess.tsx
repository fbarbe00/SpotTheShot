import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  X,
} from 'lucide-react'
import { useI18n } from '../contexts/I18nContext'

const DAY_MS = 86_400_000

function toDayNumber(date: string) {
  return Math.floor(Date.parse(`${date}T12:00:00Z`) / DAY_MS)
}

function fromDayNumber(day: number) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

type TimelineLandmark = {
  date: string
  label: string
  position: number
}

function niceStep(ideal: number, steps: number[]) {
  return steps.find(step => step >= ideal) ?? steps[steps.length - 1]!
}

export function buildTimelineLandmarks(
  startDate: string,
  endDate: string,
  language: string,
): TimelineLandmark[] {
  const start = new Date(`${startDate}T12:00:00Z`)
  const end = new Date(`${endDate}T12:00:00Z`)
  const startDay = toDayNumber(startDate)
  const endDay = toDayNumber(endDate)
  const spanDays = Math.max(1, endDay - startDay)
  const spanMonths = Math.max(
    0,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12
      + end.getUTCMonth() - start.getUTCMonth(),
  )
  const dates = new Set([startDate, endDate])

  if (spanMonths <= 24) {
    const step = niceStep(Math.max(1, spanMonths) / 5, [1, 2, 3, 6])
    let monthIndex = start.getUTCFullYear() * 12 + start.getUTCMonth() + 1
    monthIndex += (step - (monthIndex % step)) % step
    const lastMonth = end.getUTCFullYear() * 12 + end.getUTCMonth()
    for (; monthIndex < lastMonth; monthIndex += step) {
      const year = Math.floor(monthIndex / 12)
      const month = monthIndex % 12
      const candidate = new Date(Date.UTC(year, month, 1, 12)).toISOString().slice(0, 10)
      if (candidate > startDate && candidate < endDate) dates.add(candidate)
    }
  } else {
    const spanYears = spanDays / 365.2425
    const step = niceStep(spanYears / 5, [1, 2, 5, 10, 20, 25, 50, 100])
    let year = Math.ceil((start.getUTCFullYear() + 1) / step) * step
    for (; year < end.getUTCFullYear(); year += step) {
      const candidate = `${String(year).padStart(4, '0')}-01-01`
      if (candidate > startDate && candidate < endDate) dates.add(candidate)
    }
  }

  return [...dates].sort().map((date) => {
    const landmark = new Date(`${date}T12:00:00Z`)
    const label = spanMonths <= 24
      ? new Intl.DateTimeFormat(language, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(landmark)
      : new Intl.DateTimeFormat(language, { year: 'numeric', timeZone: 'UTC' }).format(landmark)
    return {
      date,
      label,
      position: ((toDayNumber(date) - startDay) / spanDays) * 100,
    }
  })
}

export default function DateGuess({
  startDate,
  endDate,
  timerMs,
  timerStarted,
  disabled,
  existingDate,
  onConfirm,
  onClose,
}: {
  startDate: string
  endDate: string
  timerMs: number
  timerStarted: boolean
  disabled?: boolean
  existingDate?: string
  onConfirm: (date: string) => Promise<boolean>
  onClose?: () => void
}) {
  const { t, language } = useI18n()
  const minDay = useMemo(() => toDayNumber(startDate), [startDate])
  const maxDay = useMemo(() => toDayNumber(endDate), [endDate])
  const initialDay = existingDate
    ? toDayNumber(existingDate)
    : Math.round(minDay + (maxDay - minDay) / 2)
  const [day, setDay] = useState(initialDay)
  const [locked, setLocked] = useState(!!existingDate)
  const [submitting, setSubmitting] = useState(false)
  const submittedRef = useRef(!!existingDate)
  const date = fromDayNumber(day)
  const formatted = new Intl.DateTimeFormat(language, {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
  const landmarks = useMemo(
    () => buildTimelineLandmarks(startDate, endDate, language),
    [endDate, language, startDate],
  )
  const progress = ((day - minDay) / Math.max(1, maxDay - minDay)) * 100

  const moveMonths = (months: number) => {
    const moved = new Date(`${date}T12:00:00Z`)
    const originalDay = moved.getUTCDate()
    moved.setUTCDate(1)
    moved.setUTCMonth(moved.getUTCMonth() + months)
    const lastDayOfTargetMonth = new Date(Date.UTC(
      moved.getUTCFullYear(),
      moved.getUTCMonth() + 1,
      0,
    )).getUTCDate()
    moved.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth))
    setDay(Math.max(minDay, Math.min(maxDay, toDayNumber(moved.toISOString().slice(0, 10)))))
  }

  const submit = async () => {
    if (disabled || submittedRef.current || submitting) return
    submittedRef.current = true
    setSubmitting(true)
    const accepted = await onConfirm(date)
    setSubmitting(false)
    if (accepted) setLocked(true)
    else submittedRef.current = false
  }

  useEffect(() => {
    if (timerStarted && timerMs < 1000 && !submittedRef.current && !disabled) void submit()
    // submit intentionally reads the current slider day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerMs, timerStarted, disabled])

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-primary/30 bg-surface/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-primary/10 via-transparent to-violet-500/10 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <CalendarDays size={21} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/70">
              {t('game.date.guessPrompt')}
            </div>
            <div className="truncate text-xl font-black text-white sm:text-2xl">{formatted}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {locked && <Lock className="text-primary" size={20} aria-label={t('game.date.guessLocked')} />}
          {onClose && !locked && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-text-darker transition hover:border-primary/30 hover:text-white"
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        <div className="rounded-2xl border border-white/10 bg-background/45 px-3 pb-2 pt-4 sm:px-4">
          <input
            type="range"
            min={minDay}
            max={maxDay}
            step={1}
            value={day}
            disabled={locked || disabled}
            onChange={event => setDay(Number(event.target.value))}
            className="date-timeline-slider w-full cursor-ew-resize appearance-none disabled:cursor-not-allowed disabled:opacity-60"
            style={{ '--timeline-progress': `${progress}%` } as CSSProperties}
            aria-label={t('game.date.timeline')}
          />
          <div className="relative mt-2 h-8" aria-hidden="true">
            {landmarks.map((landmark, index) => (
              <div
                key={landmark.date}
                className="absolute top-0"
                style={{ left: `${landmark.position}%` }}
              >
                <span className="absolute left-0 top-0 h-1.5 w-px -translate-x-1/2 bg-primary/45" />
                <span className={`absolute top-2 whitespace-nowrap text-[9px] font-bold text-text-darker sm:text-[10px] ${
                  index === 0
                    ? 'left-0'
                    : index === landmarks.length - 1
                      ? 'right-0'
                      : 'left-1/2 -translate-x-1/2'
                }`}>
                  {landmark.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {[
            { months: -12, icon: ChevronsLeft, label: `−1 ${t('game.date.year')}` },
            { months: -1, icon: ChevronLeft, label: `−1 ${t('game.date.month')}` },
            { months: 1, icon: ChevronRight, label: `+1 ${t('game.date.month')}` },
            { months: 12, icon: ChevronsRight, label: `+1 ${t('game.date.year')}` },
          ].map(({ months, icon: Icon, label }) => (
            <button
              key={months}
              type="button"
              onClick={() => moveMonths(months)}
              disabled={locked || disabled}
              className="flex min-w-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/5 px-1 py-2 text-[10px] font-bold text-text-darker transition hover:border-primary/30 hover:bg-primary/10 hover:text-white disabled:opacity-40 sm:flex-row sm:gap-1 sm:text-xs"
            >
              <Icon size={15} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary/70" size={17} />
            <input
              aria-label={t('game.date.guessPrompt')}
              type="date"
              value={date}
              min={startDate}
              max={endDate}
              disabled={locked || disabled}
              onChange={event => {
                if (event.target.value) setDay(toDayNumber(event.target.value))
              }}
              className="date-guess-input h-11 w-full min-w-0 rounded-xl border border-primary/20 bg-background/80 py-2 pl-10 pr-3 font-semibold text-white outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={locked || disabled || submitting}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-black text-black shadow-lg shadow-primary/10 transition hover:bg-primary-dark disabled:opacity-50"
          >
            {locked ? <Lock size={18} /> : <CalendarCheck size={18} />}
            {locked ? t('game.date.guessLocked') : submitting ? t('game.date.submitting') : t('game.date.lockGuess')}
          </button>
        </div>
      </div>
    </div>
  )
}
