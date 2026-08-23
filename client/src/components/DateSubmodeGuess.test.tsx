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

  it('moves the mystery photo and only submits a Before or After choice when locked', async () => {
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
    const confirm = [...container.querySelectorAll('button')]
      .find(button => button.textContent?.includes('game.lockGuess'))
    expect(confirm?.hasAttribute('disabled')).toBe(true)

    const moveLater = [...container.querySelectorAll('button')]
      .find(button => button.getAttribute('aria-label') === 'game.date.moveLater')
    await act(async () => moveLater?.click())
    expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['/reference.jpg', '/current.jpg'])
    expect(onConfirm).not.toHaveBeenCalled()

    await act(async () => confirm?.click())
    expect(onConfirm).toHaveBeenCalledWith({ dateChoice: 'after' })
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

  it('keeps an in-progress arrangement across identical lobby updates', async () => {
    const makePhotos = () => [
      { id: 'a', url: '/a.jpg' },
      { id: 'b', url: '/b.jpg' },
      { id: 'c', url: '/c.jpg' },
    ]
    const onConfirm = vi.fn().mockResolvedValue(true)
    const render = (timelinePhotos: ReturnType<typeof makePhotos>) => act(async () => root.render(<DateSubmodeGuess
      photo={{ id: 'a', url: '/a.jpg', timelinePhotos }}
      lobbyId="LOBBY"
      playerId="player"
      mode="timeline"
      disabled={false}
      onConfirm={onConfirm}
    />))

    await render(makePhotos())
    const moveLater = [...container.querySelectorAll('button')]
      .find(button => button.getAttribute('aria-label') === 'game.date.moveLater' && !button.hasAttribute('disabled'))
    await act(async () => moveLater?.click())
    expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['/b.jpg', '/a.jpg', '/c.jpg'])

    // A lobby_update rebuilds the photo object with a fresh array identity
    // but the same challenge; the arrangement must survive.
    await render(makePhotos())
    expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['/b.jpg', '/a.jpg', '/c.jpg'])
  })

  it('resets the arrangement when the challenge changes and restores a submitted order', async () => {
    const firstChallenge = [
      { id: 'a', url: '/a.jpg' },
      { id: 'b', url: '/b.jpg' },
      { id: 'c', url: '/c.jpg' },
    ]
    const nextChallenge = [
      { id: 'd', url: '/d.jpg' },
      { id: 'e', url: '/e.jpg' },
      { id: 'f', url: '/f.jpg' },
    ]
    const onConfirm = vi.fn().mockResolvedValue(true)
    const render = (photoId: string, timelinePhotos: typeof firstChallenge, existingOrder?: string[]) => act(async () => root.render(<DateSubmodeGuess
      photo={{ id: photoId, url: `${photoId}.jpg`, timelinePhotos }}
      lobbyId="LOBBY"
      playerId="player"
      mode="timeline"
      disabled={false}
      existingOrder={existingOrder}
      onConfirm={onConfirm}
    />))

    await render('a', firstChallenge)
    const moveLater = [...container.querySelectorAll('button')]
      .find(button => button.getAttribute('aria-label') === 'game.date.moveLater' && !button.hasAttribute('disabled'))
    await act(async () => moveLater?.click())
    expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['/b.jpg', '/a.jpg', '/c.jpg'])

    // A different set of cards is a new challenge: start from the dealt order.
    await render('d', nextChallenge)
    expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['/d.jpg', '/e.jpg', '/f.jpg'])

    // A reconnect restores the order the server already recorded.
    await render('a', firstChallenge, ['c', 'a', 'b'])
    expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['/c.jpg', '/a.jpg', '/b.jpg'])
  })
})
