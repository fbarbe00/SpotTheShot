/* @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DateSubmodeGuess from './DateSubmodeGuess'

vi.mock('../contexts/I18nContext', () => ({
  useI18n: () => ({ language: 'en', t: (key: string) => key }),
}))
vi.mock('../lib/socket', () => ({ buildPhotoUrl: (url: string) => url }))

describe('Date submode controls', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('shows equal photo panels and submits a Before or After choice', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    await act(async () => root.render(<DateSubmodeGuess
      photo={{ id: 'current', url: '/current.jpg', dateReference: { id: 'reference', url: '/reference.jpg' } }}
      lobbyId="LOBBY"
      playerId="player"
      mode="before_after"
      disabled={false}
      onConfirm={onConfirm}
    />))

    const images = [...container.querySelectorAll('img')]
    expect(images.map(image => image.getAttribute('src'))).toEqual(['/current.jpg', '/reference.jpg'])
    expect(images[0]?.className).toBe(images[1]?.className)
    // The reference date must not be rendered during the round.
    expect(container.textContent).not.toMatch(/2000|referenceTaken/)
    const beforeButton = [...container.querySelectorAll('button')]
      .find(button => button.textContent === 'game.date.beforeChoice')
    await act(async () => beforeButton?.click())
    expect(onConfirm).toHaveBeenCalledWith({ dateChoice: 'before' })
  })

  it('reorders all three timeline cards and submits the visible order', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    await act(async () => root.render(<DateSubmodeGuess
      photo={{
        id: 'a', url: '/a.jpg',
        timelinePhotos: [
          { id: 'a', url: '/a.jpg' },
          { id: 'b', url: '/b.jpg' },
          { id: 'c', url: '/c.jpg' },
        ],
      }}
      lobbyId="LOBBY"
      playerId="player"
      mode="timeline"
      disabled={false}
      onConfirm={onConfirm}
    />))

    const moveLater = [...container.querySelectorAll('button')]
      .find(button => button.getAttribute('aria-label') === 'game.date.moveLater' && !button.hasAttribute('disabled'))
    await act(async () => moveLater?.click())
    expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['/b.jpg', '/a.jpg', '/c.jpg'])

    const confirm = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.includes('common.confirm'))
    await act(async () => confirm?.click())
    expect(onConfirm).toHaveBeenCalledWith({ photoOrder: ['b', 'a', 'c'] })
  })
})
