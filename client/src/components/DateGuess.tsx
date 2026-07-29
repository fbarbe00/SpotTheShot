import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck, Lock } from 'lucide-react'
import { useI18n } from '../contexts/I18nContext'

const DAY_MS = 86_400_000

function toDayNumber(date: string) {
  return Math.floor(Date.parse(`${date}T12:00:00Z`) / DAY_MS)
}

function fromDayNumber(day: number) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

export default function DateGuess({
  startDate,
  endDate,
  timerMs,
  timerStarted,
  disabled,
  existingDate,
  onConfirm,
}: {
  startDate: string
  endDate: string
  timerMs: number
  timerStarted: boolean
  disabled?: boolean
  existingDate?: string
  onConfirm: (date: string) => Promise<boolean>
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
  const landmarks = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const landmarkDay = Math.round(minDay + ((maxDay - minDay) * index) / 4)
    const landmarkDate = fromDayNumber(landmarkDay)
    return {
      date: landmarkDate,
      label: new Intl.DateTimeFormat(language, { month: 'short', year: 'numeric' })
        .format(new Date(`${landmarkDate}T12:00:00`)),
    }
  }), [language, minDay, maxDay])
  const moveMonths = (months: number) => {
    const moved = new Date(`${date}T12:00:00Z`)
    moved.setUTCMonth(moved.getUTCMonth() + months)
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
    <div className="w-full rounded-2xl border border-primary/30 bg-surface/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">{t('game.date.guessPrompt')}</div>
          <div className="text-xl font-black text-white sm:text-2xl">{formatted}</div>
        </div>
        {locked && <Lock className="text-primary" size={22} />}
      </div>
      <input
        type="range"
        min={minDay}
        max={maxDay}
        step={1}
        value={day}
        disabled={locked || disabled}
        onChange={event => setDay(Number(event.target.value))}
        className="date-timeline-slider h-3 w-full cursor-ew-resize appearance-none rounded-full bg-gradient-to-r from-amber-900 via-violet-700 to-primary accent-primary disabled:cursor-not-allowed"
        aria-label={t('game.date.timeline')}
      />
      <div className="mt-2 flex justify-between gap-1 text-[9px] font-semibold text-text-darker">
        {landmarks.map(landmark => <span key={landmark.date}>{landmark.label}</span>)}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1">
        <button type="button" onClick={() => moveMonths(-12)} disabled={locked || disabled} className="rounded bg-white/5 py-1 text-xs hover:bg-white/10">−1 {t('game.date.year')}</button>
        <button type="button" onClick={() => moveMonths(-1)} disabled={locked || disabled} className="rounded bg-white/5 py-1 text-xs hover:bg-white/10">−1 {t('game.date.month')}</button>
        <button type="button" onClick={() => moveMonths(1)} disabled={locked || disabled} className="rounded bg-white/5 py-1 text-xs hover:bg-white/10">+1 {t('game.date.month')}</button>
        <button type="button" onClick={() => moveMonths(12)} disabled={locked || disabled} className="rounded bg-white/5 py-1 text-xs hover:bg-white/10">+1 {t('game.date.year')}</button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
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
          className="min-w-0 flex-1 rounded-lg border border-primary/20 bg-background/80 px-3 py-2"
        />
        <button
          onClick={submit}
          disabled={locked || disabled || submitting}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 font-black text-black transition hover:bg-primary-dark disabled:opacity-50"
        >
          <CalendarCheck size={18} />
          {locked ? t('game.date.guessLocked') : submitting ? t('game.date.submitting') : t('game.date.lockGuess')}
        </button>
      </div>
    </div>
  )
}
