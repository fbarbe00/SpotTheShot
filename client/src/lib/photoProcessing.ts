import * as exifr from 'exifr'
import { logger } from './logger'
import type { GameType } from './gameModes'

export async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await worker(items[index]!)
    }
  })
  await Promise.all(runners)
  return results
}

export type PhotoMetadata = {
  lat: number | null
  lon: number | null
  captureDate: string | null
}

export function resolvePhotoDate(
  metadata: Record<string, unknown> | null | undefined,
  filename: string,
): string | null {
  return parseCaptureDateValue(metadata?.DateTimeOriginal)
    || parseCaptureDateValue(
      metadata?.DateTimeDigitized
      || metadata?.CreateDate
      || metadata?.DateCreated
      || metadata?.DigitalCreationDate
      || metadata?.['Creation Time']
      || metadata?.CreationTime
      || metadata?.ModifyDate
      || metadata?.DateTime
      || metadata?.MetadataDate,
    )
    || extractDateFromFilename(filename)
}

/**
 * Read all metadata from the original file in one pass. Call this before
 * resizing: encoding through canvas intentionally removes EXIF data.
 */
export async function extractPhotoMetadata(file: File): Promise<PhotoMetadata> {
  let lat: number | null = null
  let lon: number | null = null
  let captureDate: string | null = null

  try {
    const metadata = await exifr.parse(file, {
      gps: true,
      exif: true,
      xmp: true,
      iptc: true,
    })
    if (
      typeof metadata?.latitude === 'number'
      && typeof metadata?.longitude === 'number'
      && !Number.isNaN(metadata.latitude)
      && !Number.isNaN(metadata.longitude)
    ) {
      lat = metadata.latitude
      lon = metadata.longitude
    }
    captureDate = resolvePhotoDate(metadata, file.name)
  } catch (error) {
    logger.warn(`Failed to extract metadata from ${file.name}`, error)
    captureDate = extractDateFromFilename(file.name)
  }

  return {
    lat,
    lon,
    captureDate,
  }
}

/**
 * Keep both kinds of metadata in local history, but only submit coordinates
 * to SpotTheShot. A valid date remains useful in either mode (for displaying
 * "captured on" and for switching the lobby to DateTheShot later).
 */
export function selectUploadMetadata(
  gameType: GameType,
  metadata: PhotoMetadata,
): Pick<PhotoMetadata, 'lat' | 'lon' | 'captureDate'> {
  return {
    lat: gameType === 'spot' ? metadata.lat : null,
    lon: gameType === 'spot' ? metadata.lon : null,
    captureDate: normalizeCaptureDate(metadata.captureDate),
  }
}

export function requiredPhotoDetail(
  gameType: GameType,
  photo: { lat?: number | null; lon?: number | null; captureDate?: string | null },
  today = new Date().toISOString().slice(0, 10),
): 'location' | 'date' | null {
  if (gameType === 'spot') return photo.lat == null || photo.lon == null ? 'location' : null
  if (gameType === 'date') {
    const date = normalizeCaptureDate(photo.captureDate)
    return !date || date > today ? 'date' : null
  }
  return null
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function normalizeCaptureDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatLocalDate(value)
  if (typeof value !== 'string') return null
  const exact = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!exact) return null
  const normalized = `${exact[1]}-${exact[2]}-${exact[3]}`
  const parsed = new Date(`${normalized}T12:00:00`)
  return !Number.isNaN(parsed.getTime()) && formatLocalDate(parsed) === normalized ? normalized : null
}

export function parseCaptureDateValue(value: unknown): string | null {
  if (value instanceof Date) return normalizeCaptureDate(value)
  if (typeof value !== 'string') return null

  const numeric = value.match(/\b(\d{4})[:-](\d{2})[:-](\d{2})\b/)
  if (numeric) return normalizeCaptureDate(`${numeric[1]}-${numeric[2]}-${numeric[3]}`)

  const named = value.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i)
  if (!named) return null
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(named[2]!.toLowerCase()) + 1
  return normalizeCaptureDate(`${named[3]}-${String(month).padStart(2, '0')}-${String(Number(named[1])).padStart(2, '0')}`)
}

export function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/(?:^|[^\d])(\d{4})[-_.](\d{2})[-_.](\d{2})(?:[^\d]|$)/)
  return match ? normalizeCaptureDate(`${match[1]}-${match[2]}-${match[3]}`) : null
}

export function resizeImage(file: File, maxSize: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    const releaseUrl = () => URL.revokeObjectURL(objectUrl)
    image.onerror = () => {
      releaseUrl()
      reject(new Error(`Could not decode ${file.name}`))
    }
    image.onload = () => {
      try {
        let { width, height } = image
        if (width > height && width > maxSize) {
          height = (height * maxSize) / width
          width = maxSize
        } else if (height > maxSize) {
          width = (width * maxSize) / height
          height = maxSize
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Image canvas is unavailable')
        context.drawImage(image, 0, 0, width, height)

        canvas.toBlob(blob => {
          releaseUrl()
          if (!blob) {
            reject(new Error('Could not encode image'))
            return
          }
          resolve(new File([blob], file.name, { type: 'image/jpeg' }))
        }, 'image/jpeg', 0.85)
      } catch (error) {
        releaseUrl()
        reject(error)
      }
    }
    image.src = objectUrl
  })
}
