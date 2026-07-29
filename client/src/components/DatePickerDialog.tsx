import { useState } from 'react'
import { CalendarCheck, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useI18n } from '../contexts/I18nContext'

export default function DatePickerDialog({
  photoUrl,
  initialDate = '',
  onConfirm,
  onDelete,
  onCancel,
}: {
  photoUrl: string
  initialDate?: string
  onConfirm: (date: string) => Promise<boolean>
  onDelete?: () => void
  onCancel?: () => void
}) {
  const { t } = useI18n()
  const [date, setDate] = useState(initialDate)
  const [saving, setSaving] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const confirm = async () => {
    if (!date || date > today || saving) return
    setSaving(true)
    const saved = await onConfirm(date)
    if (!saved) setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-date-dialog-title"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-primary/25 bg-surface shadow-2xl"
      >
        <img src={photoUrl} alt="" className="h-64 w-full bg-black object-contain" />
        <div className="space-y-4 p-5">
          <div>
            <h2 id="photo-date-dialog-title" className="text-xl font-black text-primary">
              {t('uploader.setPhotoDate')}
            </h2>
            <p className="mt-1 text-sm text-text-darker">{t('uploader.setPhotoDateDesc')}</p>
          </div>
          <input
            type="date"
            value={date}
            max={today}
            onChange={event => setDate(event.target.value)}
            aria-label={t('uploader.captureDate')}
            className="w-full rounded-xl border border-primary/25 bg-background px-4 py-3 text-lg font-bold outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 hover:bg-red-500/20"
              >
                <Trash2 size={17} /> {t('common.delete')}
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl bg-white/10 px-4 py-3 font-semibold hover:bg-white/15"
              >
                {t('common.cancel')}
              </button>
            )}
            <button
              type="button"
              onClick={confirm}
              disabled={!date || date > today || saving}
              className="ml-auto flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-black text-black hover:bg-primary-dark disabled:opacity-40"
            >
              <CalendarCheck size={18} />
              {saving ? t('common.loading') : t('uploader.savePhotoDate')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
