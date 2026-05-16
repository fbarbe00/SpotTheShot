import React, { useState, useCallback, useContext } from 'react'
import { ToastContext, type Toast, type ToastType } from './toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, AlertCircle, AlertTriangle, Info, X, Trophy } from 'lucide-react'
import { createPortal } from 'react-dom'

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const removeToastRef = React.useRef<(id: string) => void>(() => {})

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Store removeToast in ref for use in setTimeout
  React.useEffect(() => {
    removeToastRef.current = removeToast
  }, [removeToast])

  const addToast = useCallback((
    message: string,
    type: ToastType = 'info',
    duration: number = 3000,
    customComponent?: React.ReactNode
  ) => {
    const id = Math.random().toString(36).substr(2, 9)
    const toast: Toast = { id, message, type, duration, customComponent }

    setToasts(prev => [...prev, toast])

    if (duration > 0) {
      setTimeout(() => {
        removeToastRef.current(id)
      }, duration)
    }

    return id
  }, [])

  const clearAll = useCallback(() => {
    setToasts([])
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAll }}>
      {children}
    </ToastContext.Provider>
  )
}

const toastConfig: Record<ToastType, { bg: string; text: string; icon: React.ReactNode; border: string }> = {
  success: {
    bg: 'bg-green-900/80',
    text: 'text-green-100',
    icon: <Check size={20} className="text-green-400" />,
    border: 'border-green-700/50'
  },
  error: {
    bg: 'bg-red-900/80',
    text: 'text-red-100',
    icon: <AlertCircle size={20} className="text-red-400" />,
    border: 'border-red-700/50'
  },
  warning: {
    bg: 'bg-amber-900/80',
    text: 'text-amber-100',
    icon: <AlertTriangle size={20} className="text-amber-400" />,
    border: 'border-amber-700/50'
  },
  info: {
    bg: 'bg-blue-900/80',
    text: 'text-blue-100',
    icon: <Info size={20} className="text-blue-400" />,
    border: 'border-blue-700/50'
  },
  achievement: {
    bg: 'bg-amber-900/80',
    text: 'text-amber-100',
    icon: <Trophy size={20} className="text-amber-400" />,
    border: 'border-amber-700/50'
  }
}

function ToastItem({ id, message, type, _duration, action, onRemove, customComponent }: {
  id: string
  message: string
  type: ToastType
  _duration?: number
  action?: { label: string; onClick: () => void }
  onRemove: (id: string) => void
  customComponent?: React.ReactNode
}) {
  const config = toastConfig[type]

  // Handle custom achievement toast
  if (type === 'achievement' && customComponent) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 100, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        transition={{ 
          type: 'spring', 
          damping: 15, 
          stiffness: 300,
          duration: 0.5
        }}
        className="w-80"
      >
        {customComponent}
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 400, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 400, scale: 0.8 }}
      transition={{ duration: 0.2 }}
      className={`${config.bg} ${config.text} backdrop-blur-sm px-4 py-3 rounded-lg border ${config.border} shadow-lg flex items-center gap-3 max-w-sm`}
    >
      {config.icon}
      <div className="flex-1">
        <p className="text-sm font-medium">{message}</p>
      </div>
      {action && (
        <button
          onClick={() => {
            action.onClick()
            onRemove(id)
          }}
          className="text-xs font-bold underline hover:opacity-80 transition-opacity"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={() => onRemove(id)}
        className="p-1 hover:opacity-70 transition-opacity"
      >
        <X size={16} />
      </button>
    </motion.div>
  )
}

export function ToastContainer() {
  const context = useContext(ToastContext)
  if (!context) {
    return null
  }
  const { toasts, removeToast } = context

  // Show max 3 toasts, queue the rest
  const MAX_VISIBLE_TOASTS = 3
  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TOASTS)
  const queuedToastCount = Math.max(0, toasts.length - MAX_VISIBLE_TOASTS)

  const content = (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {visibleToasts.map((toast, _index) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem {...toast} onRemove={removeToast} />
          </div>
        ))}
      </AnimatePresence>

      {/* Queue indicator */}
      {queuedToastCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="text-xs text-text-darker bg-white/10 px-3 py-2 rounded-lg text-center pointer-events-auto"
        >
          +{queuedToastCount} more notification{queuedToastCount !== 1 ? 's' : ''} queued
        </motion.div>
      )}
    </div>
  )

  if (typeof document === 'undefined') {
    return content
  }

  return createPortal(content, document.body)
}
