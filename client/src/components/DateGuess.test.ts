import { describe, expect, it } from 'vitest'
import { buildTimelineLandmarks } from './DateGuess'

describe('date guess timeline landmarks', () => {
  it('uses readable aligned years for long timelines', () => {
    const landmarks = buildTimelineLandmarks('1977-06-15', '2026-07-29', 'en')

    expect(landmarks[0]).toMatchObject({ date: '1977-06-15', label: '1977', position: 0 })
    expect(landmarks.at(-1)).toMatchObject({ date: '2026-07-29', label: '2026', position: 100 })
    expect(landmarks.map(landmark => landmark.date)).toEqual([
      '1977-06-15',
      '1980-01-01',
      '1990-01-01',
      '2000-01-01',
      '2010-01-01',
      '2020-01-01',
      '2026-07-29',
    ])
  })

  it('uses month and year labels for shorter timelines', () => {
    const landmarks = buildTimelineLandmarks('2025-11-15', '2026-07-29', 'en')

    expect(landmarks.map(landmark => landmark.label)).toEqual([
      'Nov 25',
      'Jan 26',
      'Mar 26',
      'May 26',
      'Jul 26',
    ])
  })
})
