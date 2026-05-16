import React, { createContext, useContext, ReactNode } from 'react'

/**
 * Achievement tracking context
 * Provides all achievement tracking functions to child components
 * Eliminates prop drilling of 16+ achievement callback functions
 */

interface AchievementContextType {
  // Core tracking functions - passed directly to the context provider
  trackGameCompletion: (result: 'win' | 'loss', isPerfectGame?: boolean, onlyFirstGame?: boolean) => void
  trackCorrectGuess: (country: string, region: string, lat: number, lon: number) => void
  trackScore: (score: number, distanceKm: number) => void
  trackAIBeat: (distanceDifferenceKm: number) => void
  trackPhotoUpload: (hasMetadata: boolean) => void
  trackPhotoUsedInGame: () => void
  trackContinentCompletion: (country: string) => void
  trackWaterGuess: () => void
  trackFastGuess: (timeTakenMs: number) => void
  trackMindBlownGuess: (distanceKm: number) => void
  trackReversePsychologyGuess: (distanceKm: number) => void
  trackTeamGameWin: () => void
  trackComebackWin: () => void
  trackPhotoWithMostCorrectGuesses: () => void
  trackPhotoUploadFromCountry: (country: string) => void
  trackRoundWin: (wonRound: boolean) => void
  trackPhotoFinish: (marginKm: number) => void
}

const AchievementContext = createContext<AchievementContextType | undefined>(undefined)

interface AchievementProviderProps {
  children: ReactNode
  value: AchievementContextType
}

/**
 * Provider component that wraps the app and provides achievement tracking functions
 */
export function AchievementProvider({ children, value }: AchievementProviderProps) {
  return (
    <AchievementContext.Provider value={value}>
      {children}
    </AchievementContext.Provider>
  )
}

/**
 * Hook to use achievement tracking functions anywhere in the app
 * Usage: const achievements = useAchievementContext()
 */
export function useAchievementContext(): AchievementContextType {
  const context = useContext(AchievementContext)
  if (!context) {
    throw new Error('useAchievementContext must be used within AchievementProvider')
  }
  return context
}
