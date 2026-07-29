import { describe, expect, it } from 'vitest'
import type { LeaderboardItem, Result } from '../../lib/types'
import { roundPointsForEntry } from './ModeResultLeaderboard'

const results = [
  { playerId: 'a', points: 4200 },
  { playerId: 'b', points: 3100 },
] as Result[]

describe('combined mode leaderboard scoring', () => {
  it('shows an individual player round score', () => {
    const entry = { id: 'a', score: 9000 } as LeaderboardItem
    expect(roundPointsForEntry(entry, results)).toBe(4200)
  })

  it('adds only the best team member score for the round', () => {
    const entry = {
      team: 'Blue',
      score: 12000,
      players: [{ id: 'a' }, { id: 'b' }],
    } as LeaderboardItem
    expect(roundPointsForEntry(entry, results)).toBe(4200)
  })
})
