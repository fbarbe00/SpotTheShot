import { describe, expect, it } from 'vitest'
import {
  extractDateFromFilename,
  extractDateFromPngText,
  normalizeCaptureDate,
  parseCaptureDateValue,
  parseMetadataCoordinate,
  resolvePhotoDate,
  selectUploadMetadata,
  requiredPhotoDetail,
} from './photoProcessing'

describe('photo capture dates', () => {
  it('uses the first available image date when the original capture date is absent', () => {
    expect(resolvePhotoDate({ CreateDate: '2021:06:04 12:30:00' }, 'photo.jpg'))
      .toBe('2021-06-04')
    expect(resolvePhotoDate({
      DateTimeOriginal: '2020:02:03 08:00:00',
      ModifyDate: '2024:05:06 09:00:00',
    }, 'photo.jpg')).toBe('2020-02-03')
  })

  it('continues through malformed fallback fields', () => {
    expect(resolvePhotoDate({
      DateTimeDigitized: 'not a date',
      CreateDate: '2021:06:04 12:30:00',
    }, 'photo.jpg')).toBe('2021-06-04')
  })

  it('reads compact IPTC dates and wrapped XMP values', () => {
    expect(parseCaptureDateValue('20260717')).toBe('2026-07-17')
    expect(parseCaptureDateValue({ value: '2024-03-09T10:17:00+01:00' })).toBe('2024-03-09')
  })

  it('detects the date in GNOME screenshot filenames', () => {
    expect(extractDateFromFilename('Screenshot From 2026-07-17 10-17-10.png')).toBe('2026-07-17')
    expect(extractDateFromFilename('IMG_20260717_101709.jpg')).toBe('2026-07-17')
    expect(extractDateFromFilename('holiday_17-07-2026.jpg')).toBe('2026-07-17')
  })

  it('parses PNG Creation Time metadata without relying on timezone parsing', () => {
    expect(parseCaptureDateValue('Fri 17 Jul 2026 10:17:09 AM CEST')).toBe('2026-07-17')

    const encoder = new TextEncoder()
    const text = encoder.encode('Creation Time\0Fri 17 Jul 2026 10:17:09 AM CEST')
    const chunk = new Uint8Array(8 + 12 + text.length)
    chunk.set([137, 80, 78, 71, 13, 10, 26, 10])
    new DataView(chunk.buffer).setUint32(8, text.length)
    chunk.set(encoder.encode('tEXt'), 12)
    chunk.set(text, 16)
    expect(extractDateFromPngText(chunk.buffer)).toBe('2026-07-17')
  })

  it('normalizes EXIF-style dates and rejects malformed calendar dates', () => {
    expect(parseCaptureDateValue('2024:03:09 12:30:00')).toBe('2024-03-09')
    expect(normalizeCaptureDate('2024-02-30')).toBeNull()
    expect(normalizeCaptureDate('Fri Mar 09 2024')).toBeNull()
  })

  it('normalizes XMP GPS coordinate formats', () => {
    expect(parseMetadataCoordinate('48,51.396N', undefined, 'latitude')).toBeCloseTo(48.8566)
    expect(parseMetadataCoordinate('2 21 7.92', 'E', 'longitude')).toBeCloseTo(2.3522)
    expect(parseMetadataCoordinate([33, 51, 31], 'S', 'latitude')).toBeCloseTo(-33.858611)
    expect(parseMetadataCoordinate('181.5', 'E', 'longitude')).toBeNull()
  })

  it('keeps Spot metadata independent from Date mode requirements', () => {
    expect(selectUploadMetadata('spot', {
      lat: 48.8566,
      lon: 2.3522,
      captureDate: '2024-03-09',
    })).toEqual({
      lat: 48.8566,
      lon: 2.3522,
      captureDate: '2024-03-09',
    })
  })

  it('never submits GPS in Date mode while retaining its capture date', () => {
    expect(selectUploadMetadata('date', {
      lat: 48.8566,
      lon: 2.3522,
      captureDate: '2024-03-09',
    })).toEqual({
      lat: null,
      lon: null,
      captureDate: '2024-03-09',
    })
  })

  it('requests only the metadata required after each game-mode switch', () => {
    const barePhoto = { lat: null, lon: null, captureDate: null }
    expect(requiredPhotoDetail('spot', barePhoto, '2026-07-29')).toBe('location')
    expect(requiredPhotoDetail('date', barePhoto, '2026-07-29')).toBe('date')
    expect(requiredPhotoDetail('uploader', barePhoto, '2026-07-29')).toBeNull()
    expect(requiredPhotoDetail('spot', { ...barePhoto, lat: 1, lon: 2 }, '2026-07-29')).toBeNull()
    expect(requiredPhotoDetail('date', { ...barePhoto, captureDate: '2026-07-30' }, '2026-07-29')).toBe('date')
  })
})
