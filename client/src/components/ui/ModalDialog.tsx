import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { ReactNode } from 'react'
import { useI18n } from '../../contexts/I18nContext'

interface ModalDialogProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closeButton?: boolean
  className?: string
}

/**
 * Reusable modal dialog component
 * Used by: Achievements, Settings, Location Picker, Onboarding, etc.
 * Provides consistent styling, animations, and behavior across the app
 */
export function ModalDialog({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeButton = true,
  className = '',
}: ModalDialogProps) {
  const { t } = useI18n()
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${sizeClasses[size]} rounded-2xl border border-primary/20 bg-surface p-6 shadow-2xl max-h-[85vh] overflow-y-auto ${className}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              {title && <h2 className="text-2xl font-bold text-primary">{title}</h2>}
              {closeButton && (
                <button
                  onClick={onClose}
                  className="ml-auto p-2 hover:bg-white/10 rounded-lg transition-colors"
                  aria-label={t('ui.closeModal')}
                >
                  <X className="w-5 h-5 text-text-darker" />
                </button>
              )}
            </div>

            {/* Content */}
            <div>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
