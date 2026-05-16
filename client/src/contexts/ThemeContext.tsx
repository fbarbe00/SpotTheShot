import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { logger } from '../lib/logger'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: ResolvedTheme
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = 'geo-snap-theme-preference'

/**
 * Theme Context Provider - manages light/dark mode
 * Persists preference to localStorage
 * Respects system preferences when 'system' is selected
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Try to load from localStorage
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
      return saved || 'system'
    } catch (error) {
      logger.warn('Could not load theme preference', error)
      return 'system'
    }
  })

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')

  // Update resolved theme when theme or system preference changes
  useEffect(() => {
    const updateResolvedTheme = () => {
      let resolved: ResolvedTheme = 'light'

      if (theme === 'system') {
        // Check system preference
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      } else {
        resolved = theme as ResolvedTheme
      }

      setResolvedTheme(resolved)

      // Apply theme to DOM
      const root = document.documentElement
      if (resolved === 'dark') {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }

    updateResolvedTheme()

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', updateResolvedTheme)

    return () => {
      mediaQuery.removeEventListener('change', updateResolvedTheme)
    }
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    } catch (e) {
      logger.error('Failed to save theme preference', e)
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to use theme context
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
