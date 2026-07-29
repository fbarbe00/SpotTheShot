import * as exifr from 'exifr'
import { logger } from './logger'

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

export async function extractGPS(file: File): Promise<{ lat: number | null; lon: number | null }> {
  try {
    const exif = await exifr.parse(file, { gps: true })
    if (
      typeof exif?.latitude === 'number'
      && typeof exif?.longitude === 'number'
      && !Number.isNaN(exif.latitude)
      && !Number.isNaN(exif.longitude)
    ) {
      return { lat: exif.latitude, lon: exif.longitude }
    }
  } catch (error) {
    logger.warn(`Failed to extract GPS from ${file.name}`, error)
  }
  return { lat: null, lon: null }
}

export async function extractCaptureDate(file: File): Promise<string | null> {
  try {
    const exif = await exifr.parse(file, { exif: true })
    if (exif?.DateTimeOriginal) return exif.DateTimeOriginal.toString()
    if (exif?.CreateDate) return exif.CreateDate.toString()
    if (exif?.ModifyDate) return exif.ModifyDate.toString()
  } catch (error) {
    logger.warn(`Failed to extract capture date from ${file.name}`, error)
  }
  return null
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
