import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { api, buildPhotoUrl, socket } from '../lib/socket'
import type { Lobby } from '../lib/types'
import { useToast } from '../lib/toast'
import { Trash2, ChevronDown, ChevronUp, Map, Star, Check } from 'lucide-react'
import LocationPickerDialog from './LocationPickerDialog'
import { AnimatePresence } from 'framer-motion'
import * as exifr from 'exifr'
import { useI18n } from '../contexts/I18nContext'
import { logger } from '../lib/logger'
import {
  getHistory,
  addToHistory,
  togglePin,
  removeFromHistory,
  updateEntryLocation,
  updateEntryLocationById,
  updateEntryServerPhotoId,
  type HistoryEntry,
} from '../lib/photoHistoryDB'

// Upload result types
interface UploadResult { ok?: boolean; error?: string; photo?: { id: string; url: string }; hasGPS?: boolean; max?: number; filename?: string }

// Default upload limit in MB (server may override this)
const DEFAULT_UPLOAD_LIMIT_MB = 20;

async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function extractGPS(file: File): Promise<{ lat: number | null; lon: number | null }> {
  try {
    const exif = await exifr.parse(file, { gps: true })

    if (
      typeof exif?.latitude === 'number' &&
      typeof exif?.longitude === 'number' &&
      !Number.isNaN(exif.latitude) &&
      !Number.isNaN(exif.longitude)
    ) {
      return { lat: exif.latitude, lon: exif.longitude }
    }
  } catch (err) {
    logger.warn(`Failed to extract GPS from ${file.name}`, err)
  }

  return { lat: null, lon: null }
}

async function extractCaptureDate(file: File): Promise<string | null> {
  try {
    const exif = await exifr.parse(file, { exif: true })

    if (exif?.DateTimeOriginal) return exif.DateTimeOriginal.toString()
    if (exif?.CreateDate) return exif.CreateDate.toString()
    if (exif?.ModifyDate) return exif.ModifyDate.toString()
  } catch (err) {
    logger.warn(`Failed to extract capture date from ${file.name}`, err)
  }

  return null
}

// Photo upload interface - allows players to upload geotagged photos
// Handles batch uploads, EXIF validation, and manual location picking for photos without GPS
export default function Uploader({ lobby, playerId }: { lobby: Lobby; playerId: string }) {
  const { addToast } = useToast()
  const { t } = useI18n()
  const [message, setMessage] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [photosNeedingLocation, setPhotosNeedingLocation] = useState<
    Array<{ photoId: string; url: string; historyEntryId?: string }>
  >([])
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null)
  const [photoTitles, setPhotoTitles] = useState<Record<string, string>>({})
  const [photoHints, setPhotoHints] = useState<Record<string, string>>({})
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null)
  const [locationPickerStep, setLocationPickerStep] = useState(0)
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [reuploadedEntryIds, setReuploadedEntryIds] = useState<Set<string>>(new Set())
  const sessionStart = useRef(Date.now())
  const sessionHashes = useRef(new Set<string>())

  // Detect if on Android
  const isAndroidMobile = /Android/i.test(navigator.userAgent)
  const [useFileBrowser, setUseFileBrowser] = useState(isAndroidMobile)

  useEffect(() => {
    getHistory().then(entries => {
      setHistoryEntries(entries)
      const myLobbyPhotoIds = new Set((lobby.photos || []).filter(p => p.uploaderId === playerId).map(p => p.id))
      entries.forEach(e => {
        if (e.contentHash && e.serverPhotoId && myLobbyPhotoIds.has(e.serverPhotoId)) {
          sessionHashes.current.add(e.contentHash)
        }
      })
    })
    // Seed once at mount; later lobby/playerId changes should not re-seed
    // because sessionHashes is meant to track *this session* only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // History entries saved before this session (shown as "previous photos")
  const previousHistory = historyEntries.filter(e => e.savedAt < sessionStart.current)

  function isAlreadyInLobby(entry: HistoryEntry): boolean {
    if (reuploadedEntryIds.has(entry.id)) return true
    return (lobby.photos || []).some(p => p.uploaderId === playerId && p.id === entry.serverPhotoId)
  }

  async function saveUploadsToHistory(
    prepared: Array<{ file: File; lat: number | null; lon: number | null; captureDate?: string | null; hash?: string }>,
    results: UploadResult[]
  ) {
    const saves = results.map((r, i) => {
      if (!r.ok) return Promise.resolve();
      const p = prepared[i]!;
      return addToHistory({
        filename: p.file.name,
        blob: p.file,
        lat: p.lat,
        lon: p.lon,
        captureDate: p.captureDate ?? null,
        pinned: false,
        serverPhotoId: r.photo?.id,
        contentHash: p.hash,
      });
    });
    await Promise.all(saves);
    getHistory().then(setHistoryEntries);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return

    let files = Array.from(e.target.files)

    // Validate images when using file browser (no accept restriction)
    if (useFileBrowser) {
      const validImages = files.filter(file => file.type.startsWith('image/'))
      const invalidCount = files.length - validImages.length
      if (invalidCount > 0) {
        addToast(t('uploader.nonImageIgnored', { count: invalidCount }), 'warning', 3000)
      }
      files = validImages
      if (files.length === 0) return
    }

    setBusy(true)
    setMessage(t('uploader.processingPhotos', { count: files.length }))

    try {
      const prepared = await Promise.all(
        files.map(async file => {
          const { lat, lon } = await extractGPS(file)
          const captureDate = await extractCaptureDate(file)
          const resized = await resizeImage(file, 1200)
          const hash = await hashBlob(resized)
          return { file: resized, lat, lon, captureDate, hash }
        })
      )

      const uniquePrepared = prepared.filter(p => !sessionHashes.current.has(p.hash))
      const duplicateCount = prepared.length - uniquePrepared.length
      if (duplicateCount > 0) {
        addToast(t('uploader.duplicateIgnored', { count: duplicateCount }), 'warning', 3000)
      }
      if (uniquePrepared.length === 0) {
        setBusy(false)
        setMessage('')
        return
      }

      const BATCH_SIZE = 5
      const allResults: UploadResult[] = []
      const allPhotosNeedingLocation: Array<{ photoId: string; url: string }> = []
      let totalIgnored = 0

      for (let i = 0; i < uniquePrepared.length; i += BATCH_SIZE) {
        const batch = uniquePrepared.slice(i, i + BATCH_SIZE)
        const batchNum = Math.floor(i / BATCH_SIZE) + 1
        const totalBatches = Math.ceil(uniquePrepared.length / BATCH_SIZE)

        setMessage(t('uploader.uploadingBatch', { current: batchNum, total: totalBatches }))

        const resArr = await api.uploadPhoto(lobby.id, playerId, batch)

        allResults.push(...resArr.results)
        totalIgnored += resArr.ignored || 0

        const missingGPS = resArr.results
          .filter((r: UploadResult) => r.ok && !r.hasGPS)
          .map((r: UploadResult) => ({
            photoId: r.photo?.id ?? '',
            url: r.photo?.url ?? ''
          }))

        allPhotosNeedingLocation.push(...missingGPS)
      }

      const successful = allResults.filter((r: UploadResult) => r.ok)
      const failed = allResults.filter((r: UploadResult) => r.error)

      if (successful.length) {
        addToast(t('uploader.uploadSuccess', { count: successful.length }), 'success', 3000)
        allResults.forEach((r, i) => {
          if (r.ok && uniquePrepared[i]?.hash) sessionHashes.current.add(uniquePrepared[i].hash)
        })
        void saveUploadsToHistory(uniquePrepared, allResults)
      }

      failed.forEach((r: UploadResult) => {
        let errorMessage = r.error;
        const maxFromServer = r.max ?? maxPhotos;
        const errorLower = String(r.error || '').toLowerCase();

        if (errorLower === 'upload limit reached' || errorLower.includes('limit')) {
          errorMessage = t('uploader.uploadLimitWithMax', { max: maxFromServer });
        } else if (errorLower === 'failed to process image') {
          errorMessage = t('uploader.failedToProcessImage');
        } else if (errorLower.includes('too large') || errorLower.includes('size') || errorLower.includes('exceed')) {
          errorMessage = t('uploader.fileTooLarge', { max: DEFAULT_UPLOAD_LIMIT_MB });
        } else if (errorLower.includes('invalid') && errorLower.includes('type')) {
          errorMessage = t('uploader.invalidFileType');
        }
        addToast(`${r.filename}: ${errorMessage}`, 'error', 5000)
      })

      if (allPhotosNeedingLocation.length) {
        addToast(t('uploader.needLocationInfo', { count: allPhotosNeedingLocation.length }), 'info', 3000)
        setPhotosNeedingLocation(allPhotosNeedingLocation)
        setLocationPickerStep(0)
      }

      if (totalIgnored > 0) {
        addToast(t('uploader.ignoredLimit', { count: totalIgnored }), 'warning', 4000)
      }

      setMessage('')
    } catch (err) {
      logger.error('Upload failed', err)
      addToast(t('uploader.uploadFailedNetwork'), 'error', 5000)
      setMessage(t('uploader.uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function reuseHistoryPhoto(entry: HistoryEntry) {
    if (busy || hasReachedPhotoLimit) return;
    setBusy(true)
    setMessage(t('uploader.processingPhotos', { count: 1 }))
    try {
      const file = new File([entry.blob], entry.filename, { type: 'image/jpeg' })
      const batch = [{ file, lat: entry.lat, lon: entry.lon, captureDate: entry.captureDate }]
      const resArr = await api.uploadPhoto(lobby.id, playerId, batch)

      const successful = (resArr.results as UploadResult[]).filter(r => r.ok)
      const failed = (resArr.results as UploadResult[]).filter(r => r.error)

      if (successful.length) {
        addToast(t('uploader.uploadSuccess', { count: 1 }), 'success', 3000)
        const newPhotoId = (resArr.results as UploadResult[])[0]?.photo?.id
        if (newPhotoId) await updateEntryServerPhotoId(entry.id, newPhotoId)
        setReuploadedEntryIds(prev => new Set([...prev, entry.id]))
        getHistory().then(setHistoryEntries)
      }

      failed.forEach((r: UploadResult) => {
        const maxFromServer = r.max ?? maxPhotos;
        const errorLower = String(r.error || '').toLowerCase();
        let errorMessage = r.error;
        if (errorLower.includes('limit')) {
          errorMessage = t('uploader.uploadLimitWithMax', { max: maxFromServer });
        }
        addToast(`${r.filename}: ${errorMessage}`, 'error', 5000)
      })

      const missingGPS = (resArr.results as UploadResult[])
        .filter(r => r.ok && !r.hasGPS)
        .map(r => ({ photoId: r.photo?.id ?? '', url: r.photo?.url ?? '', historyEntryId: entry.id }))

      if (missingGPS.length) {
        addToast(t('uploader.needLocationInfo', { count: missingGPS.length }), 'info', 3000)
        setPhotosNeedingLocation(missingGPS)
        setLocationPickerStep(0)
      }
    } catch (err) {
      logger.error('Re-upload from history failed', err)
      addToast(t('uploader.uploadFailedNetwork'), 'error', 5000)
    } finally {
      setBusy(false)
      setMessage('')
    }
  }

  async function handleTogglePin(id: string) {
    await togglePin(id)
    getHistory().then(setHistoryEntries)
  }

  async function handleDeleteHistory(id: string) {
    await removeFromHistory(id)
    getHistory().then(setHistoryEntries)
  }

  function resizeImage(file: File, maxSize: number): Promise<File> {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        const canvas = document.createElement('canvas')

        if (width > height && width > maxSize) {
          height = (height * maxSize) / width
          width = maxSize
        } else if (height > maxSize) {
          width = (width * maxSize) / height
          height = maxSize
        }

        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          blob => resolve(new File([blob!], file.name, { type: 'image/jpeg' })),
          'image/jpeg',
          0.85
        )
      }
      img.src = URL.createObjectURL(file)
    })
  }

  function handleLocationConfirm(photoId: string, lat: number, lon: number) {
    socket.emit('update_photo_location', { lobbyId: lobby.id, playerId, photoId, lat, lon })
    const entry = photosNeedingLocation.find(p => p.photoId === photoId)
    setPhotosNeedingLocation(prev => prev.filter(p => p.photoId !== photoId))
    setLocationPickerStep(prev => prev + 1)
    updateEntryLocation(photoId, lat, lon).then(() => getHistory().then(setHistoryEntries))
    if (entry?.historyEntryId) updateEntryLocationById(entry.historyEntryId, lat, lon)
    addToast(t('uploader.locationSet'), 'success', 2000)
  }

  function handleLocationDelete() {
    const currentPhoto = photosNeedingLocation[0]
    if (currentPhoto) {
      socket.emit('delete_photo', { lobbyId: lobby.id, playerId, photoId: currentPhoto.photoId })
      setPhotosNeedingLocation(prev => prev.slice(1))
      setLocationPickerStep(prev => prev + 1)
      addToast(t('uploader.photoDeleted'), 'info', 2000)
    }
  }

  function deletePhoto(photoId: string) {
    socket.emit('delete_photo', { lobbyId: lobby.id, playerId, photoId })
    addToast(t('uploader.photoDeleted'), 'info', 2000)
  }

  function updatePhotoDetails(photoId: string, title: string | undefined, hint: string | undefined) {
    const truncatedTitle = (title ?? '').slice(0, 50)
    const truncatedHint = (hint ?? '').slice(0, 80)
    setPhotoTitles(prev => ({ ...prev, [photoId]: truncatedTitle }))
    setPhotoHints(prev => ({ ...prev, [photoId]: truncatedHint }))
  }

  function savePhotoDetails(photoId: string, title: string | undefined, hint: string | undefined) {
    const truncatedTitle = (title ?? '').slice(0, 50)
    const truncatedHint = (hint ?? '').slice(0, 80)
    socket.emit('update_photo_details', { lobbyId: lobby.id, playerId, photoId, title: truncatedTitle, hint: truncatedHint })

    if ((title ?? '').length > 50 || (hint ?? '').length > 80) {
      const truncatedMsg = [
        (title ?? '').length > 50 && t('uploader.titleMax'),
        (hint ?? '').length > 80 && t('uploader.hintMax')
      ].filter(Boolean).join(', ')
      addToast(t('uploader.photoDetailsUpdated', { details: truncatedMsg }), 'info', 3000)
    } else {
      addToast(t('uploader.photoDetailsSaved'), 'success', 2000)
    }
  }

  const currentPhotoNeedingLocation = photosNeedingLocation[0]
  const currentPhotoFromLobby = currentPhotoNeedingLocation
    ? (lobby.photos || []).find(p => p.id === currentPhotoNeedingLocation.photoId)
    : null
  const predictionCenter: [number, number] | null =
    currentPhotoFromLobby?.predictionLat != null && currentPhotoFromLobby?.predictionLon != null
      ? [currentPhotoFromLobby.predictionLat, currentPhotoFromLobby.predictionLon]
      : null
  const shouldUsePredictionAssist = locationPickerStep > 0
  const myPhotos = (lobby.photos || []).filter(p => p.uploaderId === playerId)
  const otherPhotos = (lobby.photos || []).filter(p => p.uploaderId !== playerId)
  const editingPhoto = editingPhotoId ? myPhotos.find(p => p.id === editingPhotoId) : null
  const maxPhotos = lobby.settings.maxPhotosPerPlayer || 5
  const hasReachedPhotoLimit = myPhotos.length >= maxPhotos

  return (
    <>
      <AnimatePresence>
        {currentPhotoNeedingLocation && (
          <LocationPickerDialog
            photoId={currentPhotoNeedingLocation.photoId}
            photoUrl={buildPhotoUrl(currentPhotoNeedingLocation.url, lobby.id, playerId)}
            onConfirm={(lat, lon) => handleLocationConfirm(currentPhotoNeedingLocation.photoId, lat, lon)}
            onDelete={handleLocationDelete}
            predictionCenter={predictionCenter}
            predictionEnabled={shouldUsePredictionAssist}
            predictionWaitMs={1500}
          />
        )}
        {editingPhoto && (
          <LocationPickerDialog
            photoId={editingPhoto.id}
            photoUrl={buildPhotoUrl(editingPhoto.url, lobby.id, playerId)}
            onConfirm={(lat, lon) => {
              handleLocationConfirm(editingPhoto.id, lat, lon)
              setEditingPhotoId(null)
            }}
            onCancel={() => setEditingPhotoId(null)}
            isEditing={true}
            hasExistingLocation={true}
          />
        )}
      </AnimatePresence>
      <div className="p-3 rounded-xl bg-surface border border-primary/10 h-full">
        <h3 className="font-bold text-base mb-1.5">{t('uploader.uploadPhotos')}</h3>
        <p className="text-xs text-text-darker mb-3">{t('uploader.uploadDesc', { max: lobby.settings.maxPhotosPerPlayer || 5 })}</p>

        {/* Upload button or limit-reached message */}
        {!hasReachedPhotoLimit ? (
          <div className="flex items-center gap-2 mb-3">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold cursor-pointer transition-colors text-sm">
              <input type="file" accept={useFileBrowser ? '' : 'image/jpeg,image/jpg'} className="hidden" onChange={onFile} disabled={busy} multiple />
              {busy ? t('uploader.uploading') : t('uploader.selectPhotos')}
            </label>
            {isAndroidMobile && (
              <button
                onClick={() => setUseFileBrowser(!useFileBrowser)}
                className="text-xs px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-text-darker transition-colors"
                title={useFileBrowser ? t('uploader.fileBrowserMode') : t('uploader.photoPickerMode')}
              >
                {useFileBrowser ? t('uploader.fileBrowser') : t('uploader.photoPicker')}
              </button>
            )}
          </div>
        ) : (
          <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-sm font-medium text-amber-400">{t('uploader.photoLimitReached', { max: maxPhotos })}</p>
            <p className="text-xs text-text-darker mt-1">{t('uploader.photoLimitReachedDesc')}</p>
          </div>
        )}

        {isAndroidMobile && !useFileBrowser && (
          <p className="text-xs text-yellow-600/70 mb-3">{t('uploader.androidTip')}</p>
        )}
        {message && <div className="mt-2 text-xs text-text-darker">{message}</div>}

        {/* Previous photos from history */}
        {previousHistory.length > 0 && (
          <div className="mb-3">
            <button
              onClick={() => setShowHistory(v => !v)}
              className="flex items-center gap-1.5 text-xs text-text-darker/70 font-medium mb-1.5 hover:text-text-darker transition-colors"
            >
              {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {t('uploader.previousPhotos')} ({previousHistory.length})
            </button>
            {showHistory && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {previousHistory.map(entry => {
                  const inLobby = isAlreadyInLobby(entry)
                  return (
                  <div key={entry.id} className="relative flex-shrink-0 w-20">
                    <button
                      onClick={() => !inLobby && reuseHistoryPhoto(entry)}
                      disabled={busy || hasReachedPhotoLimit || inLobby}
                      className="block w-20 h-20 rounded-lg overflow-hidden border border-primary/20 hover:border-primary/60 transition-colors focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                      title={entry.filename}
                    >
                      <img
                        src={entry.thumbnail}
                        alt={entry.filename}
                        className="w-full h-full object-cover"
                      />
                      {inLobby && (
                        <div className="absolute inset-0 bg-green-500/50 flex items-center justify-center pointer-events-none">
                          <Check size={28} className="text-white drop-shadow" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                    {/* Pin indicator */}
                    {entry.pinned && (
                      <div className="absolute top-0.5 left-0.5 bg-amber-500/80 rounded-full p-0.5 pointer-events-none">
                        <Star size={8} fill="white" className="text-white" />
                      </div>
                    )}
                    {/* Action buttons */}
                    <div className="flex justify-between mt-0.5 px-0.5">
                      <button
                        onClick={() => handleTogglePin(entry.id)}
                        className={`p-1 rounded transition-colors ${entry.pinned ? 'text-amber-400 hover:text-amber-300' : 'text-text-darker/40 hover:text-amber-400'}`}
                        title={entry.pinned ? t('uploader.unpinPhoto') : t('uploader.pinPhoto')}
                      >
                        <Star size={11} fill={entry.pinned ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={() => handleDeleteHistory(entry.id)}
                        className="p-1 rounded text-text-darker/40 hover:text-red-400 transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* My Photos with Edit Details */}
        {myPhotos.length > 0 && (
          <div className="mt-4 border-t border-primary/10 pt-4">
            <h4 className="text-sm font-bold text-text-darker mb-3">{t('uploader.yourPhotos', { count: myPhotos.length })}</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
              {myPhotos.map((p) => (
                <div key={p.id} className={`bg-white/5 rounded-lg border border-primary/10 overflow-hidden ${expandedPhotoId === p.id ? 'col-span-full' : ''}`}>
                  <button
                    onClick={() => setExpandedPhotoId(expandedPhotoId === p.id ? null : p.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-white/10 transition-colors"
                  >
                    <img
                      src={buildPhotoUrl(p.url, lobby.id, playerId)}
                      alt="photo"
                      className={`w-12 h-12 object-cover rounded-lg border border-primary/30 ${p.uploaderId !== playerId ? 'blur-xl' : ''}`}
                    />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{p.title || t('uploader.untitled')}</div>
                      <div className="text-xs text-text-darker">
                        {p.lat != null && p.lon != null
                          ? p.manualLocation
                            ? t('uploader.manuallyEntered')
                            : t('uploader.located')
                          : t('uploader.noLocation')}
                      </div>
                    </div>
                    {expandedPhotoId === p.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  {expandedPhotoId === p.id && (
                    <div className="border-t border-primary/10 p-3 space-y-3 bg-black/20">
                      <div className="w-full">
                        <img
                          src={buildPhotoUrl(p.url, lobby.id, playerId)}
                          alt={p.title || t('uploader.untitled')}
                          className="w-full h-auto max-h-48 object-cover rounded-lg border border-primary/30 bg-black/40"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          value={p.id in photoTitles ? photoTitles[p.id] : (p.title ?? '')}
                          onChange={(e) => updatePhotoDetails(p.id, e.target.value || '', p.id in photoHints ? photoHints[p.id] : (p.hint ?? ''))}
                          onBlur={(e) => savePhotoDetails(p.id, e.target.value || '', p.id in photoHints ? photoHints[p.id] : (p.hint ?? ''))}
                          placeholder={t('uploader.photoTitleOptional')}
                          maxLength={50}
                          className={`w-full bg-background border rounded px-3 py-2 text-sm transition-colors focus:ring-1 focus:ring-primary outline-none ${p.id in photoTitles && photoTitles[p.id] !== (p.title ?? '') ? 'border-primary/50 bg-primary/5' : 'border-primary/20'}`}
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          value={p.id in photoHints ? photoHints[p.id] : (p.hint ?? '')}
                          onChange={(e) => updatePhotoDetails(p.id, p.id in photoTitles ? photoTitles[p.id] : (p.title ?? ''), e.target.value || '')}
                          onBlur={(e) => savePhotoDetails(p.id, p.id in photoTitles ? photoTitles[p.id] : (p.title ?? ''), e.target.value || '')}
                          placeholder={t('uploader.hintOptional')}
                          maxLength={80}
                          className={`w-full bg-background border rounded px-3 py-2 text-sm transition-colors focus:ring-1 focus:ring-primary outline-none ${p.id in photoHints && photoHints[p.id] !== (p.hint ?? '') ? 'border-primary/50 bg-primary/5' : 'border-primary/20'}`}
                        />
                      </div>
                      {p.captureDate && (
                        <div className="text-[10px] text-text-darker/60 flex items-center gap-1 justify-end">
                          <span>📅</span>
                          <span>{t('uploader.capturedOn')} {new Date(p.captureDate).toLocaleDateString()}</span>
                        </div>
                      )}

                      <div className="flex flex-col gap-2 pt-1">
                        {((p.id in photoTitles && photoTitles[p.id] !== (p.title ?? '')) ||
                          (p.id in photoHints && photoHints[p.id] !== (p.hint ?? ''))) && (
                          <button
                            onClick={() => savePhotoDetails(p.id, photoTitles[p.id] ?? p.title ?? '', photoHints[p.id] ?? p.hint ?? '')}
                            className="w-full py-2 rounded-lg bg-primary text-black font-bold text-xs transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/20"
                          >
                            {t('common.save')}
                          </button>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingPhotoId(p.id)}
                            className="flex-1 px-3 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 font-medium text-xs transition-colors flex items-center justify-center gap-2 border border-blue-500/30"
                          >
                            <Map size={14} /> {(p.lat != null && p.lon != null) ? t('uploader.changeLocation') : t('uploader.setLocation')}
                          </button>
                          <button
                            onClick={() => deletePhoto(p.id)}
                            className="px-3 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 font-medium text-xs transition-colors flex items-center justify-center gap-2 border border-red-500/30"
                          >
                            <Trash2 size={14} /> {t('common.delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other Players' Photos Grid View */}
        {otherPhotos.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-bold text-text-darker mb-3">{t('uploader.otherPhotos', { count: otherPhotos.length })}</h4>
            <div className="grid grid-cols-3 gap-2">
              {otherPhotos.map((p) => {
                const uploader = lobby.players.find(pl => pl.id === p.uploaderId)
                return (
                  <div key={p.id} className="relative group border-2 border-primary/30">
                    <img
                      src={buildPhotoUrl(p.url, lobby.id, playerId)}
                      className={`w-full h-24 object-cover rounded-lg transition-all ${p.uploaderId !== playerId ? 'blur-xl' : ''}`}
                    />
                    {uploader && (
                      <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/60 rounded-md px-2 py-1 text-xs overflow-hidden">
                        <span className="text-sm flex-shrink-0">{uploader.icon}</span>
                        <span className="text-white truncate max-w-[120px]">{uploader.nickname}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
