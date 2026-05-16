import React from 'react'

/**
 * Mobile-responsive wrapper component
 * Helps with consistent mobile-friendly styling across the app
 * Provides utility classes for responsive layouts
 */

interface ResponsiveGridProps {
  children: React.ReactNode
  className?: string
  columns?: 'auto' | 1 | 2 | 3 | 4
}

/**
 * Responsive grid that stacks on mobile and spreads on desktop
 */
export function ResponsiveGrid({ children, className = '', columns = 2 }: ResponsiveGridProps) {
  const colsClass = {
    auto: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  }[columns]

  return <div className={`grid gap-4 ${colsClass} ${className}`}>{children}</div>
}

interface ResponsiveTextProps {
  children: React.ReactNode
  className?: string
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl'
}

/**
 * Responsive text that scales with screen size
 */
export function ResponsiveText({
  children,
  className = '',
  size = 'base',
}: ResponsiveTextProps) {
  const sizeClass = {
    xs: 'text-xs md:text-sm',
    sm: 'text-sm md:text-base',
    base: 'text-base md:text-lg',
    lg: 'text-lg md:text-xl',
    xl: 'text-xl md:text-2xl',
    '2xl': 'text-2xl md:text-3xl',
    '3xl': 'text-3xl md:text-4xl',
  }[size]

  return <p className={`${sizeClass} ${className}`}>{children}</p>
}

interface ResponsiveSpacingProps {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  gap?: 'sm' | 'md' | 'lg'
}

/**
 * Responsive spacing utility
 */
export function ResponsiveSpacing({
  children,
  className = '',
  padding = 'md',
  gap = 'md',
}: ResponsiveSpacingProps) {
  const paddingClass = {
    sm: 'p-2 md:p-3 lg:p-4',
    md: 'p-3 md:p-4 lg:p-6',
    lg: 'p-4 md:p-6 lg:p-8',
  }[padding]

  const gapClass = {
    sm: 'gap-2',
    md: 'gap-3 md:gap-4',
    lg: 'gap-4 md:gap-6',
  }[gap]

  return (
    <div className={`${paddingClass} ${gapClass} ${className}`}>
      {children}
    </div>
  )
}

interface MobileFullscreenProps {
  children: React.ReactNode
  isOpen: boolean
  onClose: () => void
  title?: string
}

/**
 * Mobile fullscreen modal wrapper
 * Expands to fullscreen on mobile, regular modal on desktop
 */
export function MobileFullscreen({
  children,
  isOpen,
  onClose,
  title,
}: MobileFullscreenProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 md:z-[999]">
      {/* Mobile fullscreen */}
      <div className="md:hidden fixed inset-0 bg-surface flex flex-col">
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-primary/20">
            <h2 className="text-lg font-bold text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        )}
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>

      {/* Desktop modal (hidden on mobile) */}
      <div className="hidden md:flex inset-0 bg-black/60 items-center justify-center">
        <div className="bg-surface rounded-lg p-6 max-w-md max-h-[90vh] overflow-y-auto">
          {title && (
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-primary">{title}</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
