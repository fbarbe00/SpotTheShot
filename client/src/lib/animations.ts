/**
 * Lightweight Animation Utilities
 * CSS-based animations to reduce framer-motion dependency
 */

export interface AnimationClasses {
  fadeIn: string;
  fadeOut: string;
  slideIn: string;
  slideOut: string;
  scaleIn: string;
  scaleOut: string;
}

/**
 * CSS animation classes for common transitions
 * Use these instead of framer-motion for simple animations
 */
export const animations: AnimationClasses = {
  fadeIn: 'animate-fade-in',
  fadeOut: 'animate-fade-out',
  slideIn: 'animate-slide-in',
  slideOut: 'animate-slide-out',
  scaleIn: 'animate-scale-in',
  scaleOut: 'animate-scale-out',
};

/**
 * Transition classes for AnimatePresence-like behavior
 */
export const transitionClasses = {
  enter: 'transition-all duration-200 ease-out',
  enterFrom: 'opacity-0 scale-95',
  enterTo: 'opacity-100 scale-100',
  leave: 'transition-all duration-150 ease-in',
  leaveFrom: 'opacity-100 scale-100',
  leaveTo: 'opacity-0 scale-95',
};

/**
 * Get animation delay class
 */
export function getDelayClass(delay: number): string {
  const delays = ['delay-75', 'delay-100', 'delay-150', 'delay-200', 'delay-300', 'delay-500', 'delay-700', 'delay-1000'];
  const index = Math.min(Math.floor(delay / 100), delays.length - 1);
  return delays[index] || '';
}

/**
 * Get animation duration class
 */
export function getDurationClass(duration: number): string {
  const durations = ['duration-75', 'duration-100', 'duration-150', 'duration-200', 'duration-300', 'duration-500', 'duration-700', 'duration-1000'];
  const index = Math.min(Math.floor(duration / 100), durations.length - 1);
  return durations[index] || 'duration-300';
}
