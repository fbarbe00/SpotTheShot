import { describe, expect, it } from 'vitest'
import {
  extractDateFromFilename,
  normalizeCaptureDate,
  parseCaptureDateValue,
  selectUploadMetadata,
  requiredPhotoDetail,
} from './photoProcessing'

describe('photo capture dates', () => {
  it('detects the date in GNOME screenshot filenames', () => {
    expect(extractDateFromFilename('Screenshot From 2026-07-17 10-17-10.png')).toBe('2026-07-17')
  })

  it('parses PNG Creation Time metadata without relying on timezone parsing', () => {
    expect(parseCaptureDateValue('Fri 17 Jul 2026 10:17:09 AM CEST')).toBe('2026-07-17')
  })

  it('normalizes EXIF-style dates and rejects malformed calendar dates', () => {
    expect(parseCaptureDateValue('2024:03:09 12:30:00')).toBe('2024-03-09')
    expect(normalizeCaptureDate('2024-02-30')).toBeNull()
    expect(normalizeCaptureDate('Fri Mar 09 2024')).toBeNull()
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
