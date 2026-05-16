import React, { Component, ReactNode } from 'react'
import { logger } from '../lib/logger'
import { useI18n } from '../contexts/I18nContext'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary component that catches React component errors
 * Displays a user-friendly error UI with a reload button
 * Prevents entire app from crashing due to component errors
 *
 * Security: Stack traces are only shown in development mode
 */

// Inner functional component to access i18n context
function ErrorBoundaryInner({ error, isDev, onReload }: { error: Error | null, isDev: boolean, onReload: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-center min-h-screen bg-surface">
      <div className="max-w-md w-full p-6 rounded-2xl border border-primary/20 bg-white/5 shadow-2xl">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 mb-6">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-text mb-2">{t('error.boundary.title')}</h1>
          <p className="text-text-darker mb-4">
            {t('error.boundary.message')}
          </p>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400 font-mono text-left break-words">
                {error.message}
              </p>
              {/* Security: Only show stack trace in development mode */}
              {isDev && (
                <p className="text-xs text-red-300 font-mono text-left break-words mt-1 whitespace-pre-wrap">
                  {error.stack}
                </p>
              )}
            </div>
          )}

          <button
            onClick={onReload}
            className="w-full px-4 py-3 rounded-lg bg-primary hover:bg-primary-dark text-black font-semibold transition-colors"
          >
            {t('common.reload')}
          </button>
        </div>
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    // Always log error details for debugging
    logger.error('Error caught by boundary', error)
  }

  handleReload = () => {
    // Reset error boundary state
    this.setState({ hasError: false, error: null })
    // Reload the entire page
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      const isDev = import.meta.env.DEV

      return <ErrorBoundaryInner error={this.state.error} isDev={isDev} onReload={this.handleReload} />
    }

    return this.props.children
  }
}
