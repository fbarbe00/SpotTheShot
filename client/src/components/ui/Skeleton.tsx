/**
 * Skeleton component for loading placeholders
 * Displays an animated pulse effect to indicate content is loading
 */

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circle' | 'rect'
}

export function Skeleton({ className = 'h-4 w-full', variant = 'rect' }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-white/10 dark:bg-white/5'

  let variantClasses = ''
  switch (variant) {
    case 'circle':
      variantClasses = 'rounded-full'
      break
    case 'text':
      variantClasses = 'rounded'
      break
    default:
      variantClasses = 'rounded-lg'
  }

  return <div className={`${baseClasses} ${variantClasses} ${className}`} />
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={i === lines - 1 ? 'h-4 w-4/5' : 'h-4 w-full'}
          variant="text"
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="p-4 rounded-lg border border-primary/10 bg-white/5 space-y-3">
      <Skeleton className="h-8 w-32" variant="text" />
      <SkeletonText lines={lines} />
    </div>
  )
}
