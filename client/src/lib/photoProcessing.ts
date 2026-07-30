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

function firstParsedDate(values: unknown[]): string | null {
  for (const value of values) {
    const parsed = parseCaptureDateValue(value)
    if (parsed) return parsed
  }
  return null
}

export function resolvePhotoDate(
  metadata: Record<string, unknown> | null | undefined,
  filename: string,
): string | null {
  return firstParsedDate([
    metadata?.DateTimeOriginal,
    metadata?.DateTimeDigitized,
    metadata?.CreateDate,
    metadata?.DateCreated,
    metadata?.DigitalCreationDate,
    metadata?.['Creation Time'],
    metadata?.CreationTime,
    metadata?.GPSDateStamp,
    // Edit/export dates are useful fallbacks, but should never outrank an
    // original, created, or GPS date.
    metadata?.ModifyDate,
    metadata?.DateTime,
    metadata?.MetadataDate,
  ])
    || extractDateFromFilename(filename)
}

export function parseMetadataCoordinate(
  value: unknown,
  directionRef: unknown,
  axis: 'latitude' | 'longitude',
): number | null {
  const limit = axis === 'latitude' ? 90 : 180
  const ref = typeof directionRef === 'string' ? directionRef.trim().toUpperCase() : ''
  const signFromRef = ref === 'S' || ref === 'W' ? -1 : 1
  let coordinate: number | null = null

  if (typeof value === 'number' && Number.isFinite(value)) {
    coordinate = value
  } else if (Array.isArray(value)) {
    const parts = value.slice(0, 3).map(Number)
    if (parts.length >= 2 && parts.every(Number.isFinite)) {
      coordinate = Math.abs(parts[0]!) + parts[1]! / 60 + (parts[2] ?? 0) / 3600
      coordinate *= parts[0]! < 0 ? -1 : signFromRef
    }
  } else if (typeof value === 'string') {
    const cardinal = value.match(/[NSEW]\s*$/i)?.[0]?.trim().toUpperCase()
    const sign = cardinal === 'S' || cardinal === 'W' ? -1 : signFromRef
    const parts = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
    if (parts.length === 1 && Number.isFinite(parts[0])) {
      coordinate = Math.abs(parts[0]!) * (parts[0]! < 0 ? -1 : sign)
    } else if (parts.length >= 2 && parts.slice(0, 3).every(Number.isFinite)) {
      coordinate = Math.abs(parts[0]!) + parts[1]! / 60 + (parts[2] ?? 0) / 3600
      coordinate *= parts[0]! < 0 ? -1 : sign
    }
  }

  return coordinate !== null && Number.isFinite(coordinate) && Math.abs(coordinate) <= limit
    ? coordinate
    : null
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const PNG_DATE_KEYWORDS = new Set([
  'creation time',
  'creation date',
  'date created',
  'date:create',
  'date:modify',
])

export function extractDateFromPngText(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < PNG_SIGNATURE.length
    || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null

  const view = new DataView(buffer)
  const decoder = new TextDecoder('utf-8')
  let offset = PNG_SIGNATURE.length

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > bytes.length) break

    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (type === 'tEXt' || type === 'iTXt') {
      const data = bytes.subarray(dataStart, dataEnd)
      const keywordEnd = data.indexOf(0)
      if (keywordEnd > 0) {
        const keyword = decoder.decode(data.subarray(0, keywordEnd)).trim().toLowerCase()
        if (PNG_DATE_KEYWORDS.has(keyword)) {
          let textStart = keywordEnd + 1
          if (type === 'iTXt') {
            const compressionFlag = data[textStart]
            textStart += 2 // compression flag and method
            const languageEnd = data.indexOf(0, textStart)
            if (languageEnd < 0) return null
            const translatedKeywordEnd = data.indexOf(0, languageEnd + 1)
            if (translatedKeywordEnd < 0) return null
            textStart = translatedKeywordEnd + 1
            // Compressed iTXt is uncommon for these tiny values and cannot be
            // decoded synchronously; continue looking for another date source.
            if (compressionFlag === 1) {
              offset = dataEnd + 4
              continue
            }
          }
          const parsed = parseCaptureDateValue(decoder.decode(data.subarray(textStart)))
          if (parsed) return parsed
        }
      }
    }

    if (type === 'IEND') break
    offset = dataEnd + 4
  }
  return null
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
    } else {
      // XMP GPS often remains in decimal or degree/minute strings instead of
      // the normalized latitude/longitude fields produced for EXIF GPS.
      lat = parseMetadataCoordinate(metadata?.GPSLatitude, metadata?.GPSLatitudeRef, 'latitude')
      lon = parseMetadataCoordinate(metadata?.GPSLongitude, metadata?.GPSLongitudeRef, 'longitude')
      if (lat === null || lon === null) {
        lat = null
        lon = null
      }
    }
    captureDate = resolvePhotoDate(metadata, file.name)
    if (!captureDate && (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png'))) {
      captureDate = extractDateFromPngText(await file.arrayBuffer())
    }
    if (Array.isArray(metadata?.errors) && metadata.errors.length > 0) {
      logger.warn(`Some metadata could not be read from ${file.name}`, metadata.errors)
    }
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
  if (Array.isArray(value)) return firstParsedDate(value)
  if (value && typeof value === 'object') {
    const wrapped = value as Record<string, unknown>
    return firstParsedDate([wrapped.value, wrapped.text, wrapped.date])
  }
  if (typeof value !== 'string') return null

  const numeric = value.match(/(?:^|[^\d])(\d{4})[:-](\d{2})[:-](\d{2})(?=[^\d]|$)/)
  if (numeric) return normalizeCaptureDate(`${numeric[1]}-${numeric[2]}-${numeric[3]}`)

  const compact = value.match(/(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?:[^\d]|$)/)
  if (compact) return normalizeCaptureDate(`${compact[1]}-${compact[2]}-${compact[3]}`)

  const named = value.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i)
  if (!named) return null
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    .indexOf(named[2]!.toLowerCase()) + 1
  return normalizeCaptureDate(`${named[3]}-${String(month).padStart(2, '0')}-${String(Number(named[1])).padStart(2, '0')}`)
}

export function extractDateFromFilename(filename: string): string | null {
  const yearFirst = filename.match(/(?:^|[^\d])(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})(?:[^\d]|$)/)
  if (yearFirst) return normalizeCaptureDate(`${yearFirst[1]}-${yearFirst[2]}-${yearFirst[3]}`)

  const dayFirst = filename.match(/(?:^|[^\d])(\d{2})[-_.](\d{2})[-_.](\d{4})(?:[^\d]|$)/)
  return dayFirst ? normalizeCaptureDate(`${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}`) : null
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
