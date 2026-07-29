import { useEffect, useRef, useState } from 'react'
import { Check, Users } from 'lucide-react'
import type { Player } from '../lib/types'
import { useI18n } from '../contexts/I18nContext'

export default function UploaderGuess({
  players,
  existingUploaderId,
  disabled,
  timerMs,
  timerStarted,
  onConfirm,
}: {
  players: Player[]
  existingUploaderId?: string
  disabled?: boolean
  timerMs: number
  timerStarted: boolean
  onConfirm: (uploaderId: string) => Promise<boolean>
}) {
  const { t } = useI18n()
  const [selected, setSelected] = useState(existingUploaderId || '')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(!!existingUploaderId)
  const submittedRef = useRef(!!existingUploaderId)

  const submit = async () => {
    if (!selected || disabled || submittedRef.current || submitting) return
    submittedRef.current = true
    setSubmitted(true)
    setSubmitting(true)
    const accepted = await onConfirm(selected)
    setSubmitting(false)
    if (!accepted) {
      submittedRef.current = false
      setSubmitted(false)
    }
  }

  useEffect(() => {
    if (timerStarted && timerMs < 1000 && selected && !submittedRef.current && !disabled) void submit()
    // Submit intentionally uses the latest selected player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerMs, timerStarted, selected, disabled])

  return (
    <div className="absolute bottom-3 left-1/2 z-[1003] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 rounded-2xl border border-primary/30 bg-surface/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <Users size={19} className="text-primary" />
        <h2 className="font-black text-white">{t('game.uploader.guessPrompt')}</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {players.map(player => (
          <button
            key={player.id}
            type="button"
            disabled={disabled || submitted}
            onClick={() => setSelected(player.id)}
            className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition ${
              selected === player.id
                ? 'border-primary bg-primary/20 text-white'
                : 'border-white/10 bg-white/5 text-text-darker hover:border-primary/40'
            }`}
          >
            <span className="text-xl">{player.icon || '👤'}</span>
            <span className="truncate text-sm font-bold">{player.nickname}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!selected || disabled || submitting || submitted}
        onClick={submit}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-black text-black disabled:opacity-40"
      >
        <Check size={18} />
        {submitting ? t('common.loading') : t('game.uploader.lockVote')}
      </button>
    </div>
  )
}
