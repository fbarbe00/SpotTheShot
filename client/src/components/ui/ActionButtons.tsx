import { motion } from 'framer-motion'
import { useI18n } from '../../contexts/I18nContext'

interface ActionButtonsProps {
  onConfirm: () => void
  onCancel?: () => void
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'primary' | 'success' | 'danger'
  loading?: boolean
  disabled?: boolean
  layout?: 'horizontal' | 'vertical'
  className?: string
}

/**
 * Reusable action buttons component
 * Provides consistent button pair UI for confirm/cancel actions
 * Used by: Modals, dialogs, forms across the app
 */
export function ActionButtons({
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'primary',
  loading = false,
  disabled = false,
  layout = 'horizontal',
  className = '',
}: ActionButtonsProps) {
  const { t } = useI18n()
  const isVertical = layout === 'vertical'

  // Set default labels if not provided
  confirmLabel = confirmLabel ?? t('common.confirm')
  cancelLabel = cancelLabel ?? t('common.cancel')

  const confirmColors = {
    primary: 'bg-primary hover:bg-primary-dark text-black',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  }

  const buttonClasses =
    'px-6 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const containerClasses = isVertical ? 'flex flex-col gap-3' : 'flex gap-3 flex-row'

  return (
    <div className={`${containerClasses} ${className}`}>
      {onCancel && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onCancel}
          disabled={disabled || loading}
          className={`${buttonClasses} bg-white/10 hover:bg-white/20 text-text ${isVertical ? 'w-full' : 'flex-1'}`}
        >
          {cancelLabel}
        </motion.button>
      )}

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onConfirm}
        disabled={disabled || loading}
        className={`${buttonClasses} ${confirmColors[confirmVariant]} ${isVertical ? 'w-full' : 'flex-1'}`}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {t('common.loading')}
          </span>
        ) : (
          confirmLabel
        )}
      </motion.button>
    </div>
  )
}
