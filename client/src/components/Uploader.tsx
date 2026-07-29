import { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react'
import { api, buildPhotoUrl, socket } from '../lib/socket'
import type { Lobby } from '../lib/types'
import { useToast } from '../lib/toast'
import { Trash2, ChevronDown, ChevronUp, CalendarDays, Map, Star, Check } from 'lucide-react'
import LocationPickerDialog from './LocationPickerDialog'
import DatePickerDialog from './DatePickerDialog'
import { AnimatePresence } from 'framer-motion'
import { useI18n } from '../contexts/I18nContext'
import { useAchievementContext } from '../contexts/AchievementContext'
import { logger } from '../lib/logger'
import {
  extractPhotoMetadata,
  hashBlob,
  mapWithConcurrency,
  normalizeCaptureDate,
  resizeImage,
  requiredPhotoDetail,
  selectUploadMetadata,
} from '../lib/photoProcessing'
import {
  getHistory,
  addToHistory,
  togglePin,
  removeFromHistory,
  updateEntryLocation,
  updateEntryLocationById,
  updateEntryDate,
  updateEntryDateById,
  updateEntryServerPhotoId,
  type HistoryEntry,
} from '../lib/photoHistoryDB'

// Upload result types
interface UploadResult {
  ok?: boolean
  error?: string
  photo?: { id: string; url: string; captureDate?: string | null }
  hasGPS?: boolean
  max?: number
  filename?: string
}

type PendingPhotoDetail = { photoId: string; url: string; historyEntryId?: string }

// Default upload limit in MB (server may override this)
const DEFAULT_UPLOAD_LIMIT_MB = 20;

// Photo upload interface - allows players to upload geotagged photos
// Handles batch uploads, EXIF validation, and manual location picking for photos without GPS
export default function Uploader({ lobby, playerId }: { lobby: Lobby; playerId: string }) {
  const { addToast } = useToast()
  const { t } = useI18n()
  const achievements = useAchievementContext()
  const [message, setMessage] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [photosNeedingLocation, setPhotosNeedingLocation] = useState<
    PendingPhotoDetail[]
  >([])
  const [photosNeedingDate, setPhotosNeedingDate] = useState<PendingPhotoDetail[]>([])
  const [expandedPhotoId, setExpandedPhotoId] = useState<string | null>(null)
  const [photoTitles, setPhotoTitles] = useState<Record<string, string>>({})
  const [photoHints, setPhotoHints] = useState<Record<string, string>>({})
  const [photoDates, setPhotoDates] = useState<Record<string, string>>({})
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null)
  const [locationPickerStep, setLocationPickerStep] = useState(0)
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [reuploadedEntryIds, setReuploadedEntryIds] = useState<Set<string>>(new Set())
  const sessionStart = useRef(Date.now())
  const sessionHashes = useRef(new Set<string>())
  const metadataTrackedPhotoIds = useRef(new Set<string>())
  const currentGameType = useRef(lobby.settings.gameType)
  currentGameType.current = lobby.settings.gameType

  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const [useFileBrowser, setUseFileBrowser] = useState(
    isMobileDevice && lobby.settings.gameType === 'spot',
  )

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

  const ownPhotos = useMemo(
    () => (lobby.photos || []).filter(photo => photo.uploaderId === playerId),
    [lobby.photos, playerId],
  )
  const ownPhotoRequirementSignature = ownPhotos
    .map(photo => `${photo.id}:${photo.lat ?? ''}:${photo.lon ?? ''}:${photo.captureDate ?? ''}`)
    .sort()
    .join('|')

  useEffect(() => {
    setEditingPhotoId(null)
    setUseFileBrowser(isMobileDevice && lobby.settings.gameType === 'spot')
  }, [lobby.settings.gameType, isMobileDevice])

  useEffect(() => {
    if (lobby.settings.gameType === 'date') {
      setPhotosNeedingLocation([])
      setPhotosNeedingDate(previous => ownPhotos
        .filter(photo => requiredPhotoDetail('date', photo) === 'date')
        .map(photo => ({
          photoId: photo.id,
          url: photo.url,
          historyEntryId: previous.find(item => item.photoId === photo.id)?.historyEntryId,
        })))
    } else if (lobby.settings.gameType === 'spot') {
      setPhotosNeedingDate([])
      setPhotosNeedingLocation(previous => ownPhotos
        .filter(photo => requiredPhotoDetail('spot', photo) === 'location')
        .map(photo => ({
          photoId: photo.id,
          url: photo.url,
          historyEntryId: previous.find(item => item.photoId === photo.id)?.historyEntryId,
        })))
    } else {
      setPhotosNeedingDate([])
      setPhotosNeedingLocation([])
    }
    // Rebuild when the host changes modes or a concurrent upload/update changes
    // which metadata is required. This also closes the modal from the old mode.
  }, [lobby.settings.gameType, lobby.id, ownPhotos, ownPhotoRequirementSignature])

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
      // Limit simultaneous EXIF parsing and canvas resizing to avoid memory
      // spikes on phones when a large batch is selected.
      const prepared = await mapWithConcurrency(files, 2, async file => {
          // Read from the original mobile-picker file before canvas resizing
          // strips EXIF. Preserve both values in local history so switching
          // modes does not make a previously uploaded photo incomplete.
          const metadata = await extractPhotoMetadata(file)
          const captureDate = normalizeCaptureDate(metadata.captureDate)
          const validCaptureDate = captureDate && captureDate <= new Date().toISOString().slice(0, 10)
            ? captureDate
            : null
          const resized = await resizeImage(file, 1200)
          const hash = await hashBlob(resized)
          return {
            file: resized,
            lat: metadata.lat,
            lon: metadata.lon,
            captureDate: validCaptureDate,
            hash,
          }
      })

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
      const allPhotosNeedingDate: Array<{ photoId: string; url: string }> = []
      let totalIgnored = 0

      for (let i = 0; i < uniquePrepared.length; i += BATCH_SIZE) {
        const historyBatch = uniquePrepared.slice(i, i + BATCH_SIZE)
        // The host may switch modes while a large mobile batch is still being
        // resized. Use the latest rendered mode at the request boundary.
        const uploadGameType = currentGameType.current
        const batch = historyBatch.map(photo => ({
          file: photo.file,
          ...selectUploadMetadata(uploadGameType, photo),
        }))
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

        if (uploadGameType === 'spot') allPhotosNeedingLocation.push(...missingGPS)
        if (uploadGameType === 'date') {
          allPhotosNeedingDate.push(...resArr.results
            .filter((result: UploadResult) => result.ok && !result.photo?.captureDate)
            .map((result: UploadResult) => ({
              photoId: result.photo?.id ?? '',
              url: result.photo?.url ?? '',
            })))
        }
      }

      const successful = allResults.filter((r: UploadResult) => r.ok)
      const failed = allResults.filter((r: UploadResult) => r.error)

      if (successful.length) {
        successful.forEach(() => achievements.trackPhotoUpload())
        addToast(t('uploader.uploadSuccess', { count: successful.length }), 'success', 3000)
        allResults.forEach((r, i) => {
          if (r.ok && uniquePrepared[i]?.hash) sessionHashes.current.add(uniquePrepared[i].hash)
        })
        await saveUploadsToHistory(uniquePrepared, allResults)
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
        } else if (errorLower.includes('date') && errorLower.includes('future')) {
          errorMessage = t('uploader.futureDateError');
        } else if (errorLower.includes('date')) {
          errorMessage = t('uploader.invalidDateError');
        }
        addToast(`${r.filename}: ${errorMessage}`, 'error', 5000)
      })

      if (allPhotosNeedingLocation.length) {
        addToast(t('uploader.needLocationInfo', { count: allPhotosNeedingLocation.length }), 'info', 3000)
        setPhotosNeedingLocation(allPhotosNeedingLocation)
        setLocationPickerStep(0)
      }
      if (allPhotosNeedingDate.length) {
        addToast(t('uploader.needDateInfo', { count: allPhotosNeedingDate.length }), 'info', 3000)
        setPhotosNeedingDate(allPhotosNeedingDate)
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
      const historyDate = normalizeCaptureDate(entry.captureDate)
      const uploadGameType = currentGameType.current
      const batch = [{ file, ...selectUploadMetadata(uploadGameType, {
        lat: entry.lat,
        lon: entry.lon,
        captureDate: historyDate,
      }) }]
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
        } else if (errorLower.includes('date') && errorLower.includes('future')) {
          errorMessage = t('uploader.futureDateError');
        } else if (errorLower.includes('date')) {
          errorMessage = t('uploader.invalidDateError');
        }
        addToast(`${r.filename}: ${errorMessage}`, 'error', 5000)
      })

      const missingGPS = (resArr.results as UploadResult[])
        .filter(r => r.ok && !r.hasGPS)
        .map(r => ({ photoId: r.photo?.id ?? '', url: r.photo?.url ?? '', historyEntryId: entry.id }))

      if (missingGPS.length && uploadGameType === 'spot') {
        addToast(t('uploader.needLocationInfo', { count: missingGPS.length }), 'info', 3000)
        setPhotosNeedingLocation(missingGPS)
        setLocationPickerStep(0)
      }
      if (uploadGameType === 'date') {
        const uploaded = (resArr.results as UploadResult[])[0]
        if (uploaded?.ok && !uploaded.photo?.captureDate) {
          addToast(t('uploader.needDateInfo', { count: 1 }), 'info', 3000)
          setPhotosNeedingDate([{
            photoId: uploaded.photo?.id ?? '',
            url: uploaded.photo?.url ?? '',
            historyEntryId: entry.id,
          }])
        }
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
      forgetPhoto(currentPhoto.photoId)
      setPhotosNeedingLocation(prev => prev.slice(1))
      setLocationPickerStep(prev => prev + 1)
      addToast(t('uploader.photoDeleted'), 'info', 2000)
    }
  }

  function handleDateDelete() {
    const currentPhoto = photosNeedingDate[0]
    if (!currentPhoto) return
    socket.emit('delete_photo', { lobbyId: lobby.id, playerId, photoId: currentPhoto.photoId })
    forgetPhoto(currentPhoto.photoId)
    setPhotosNeedingDate(prev => prev.slice(1))
    addToast(t('uploader.photoDeleted'), 'info', 2000)
  }

  // Clear any local bookkeeping tied to a deleted photo so it can be
  // re-uploaded (as a fresh file or from history) without being mistaken
  // for a duplicate of a photo that no longer exists in the lobby.
  function forgetPhoto(photoId: string) {
    const matchingEntries = historyEntries.filter(e => e.serverPhotoId === photoId)
    matchingEntries.forEach(e => {
      if (e.contentHash) sessionHashes.current.delete(e.contentHash)
    })
    if (matchingEntries.length) {
      setReuploadedEntryIds(prev => {
        const next = new Set(prev)
        matchingEntries.forEach(e => next.delete(e.id))
        return next
      })
    }
  }

  function deletePhoto(photoId: string) {
    socket.emit('delete_photo', { lobbyId: lobby.id, playerId, photoId })
    forgetPhoto(photoId)
    addToast(t('uploader.photoDeleted'), 'info', 2000)
  }

  function updatePhotoDetails(photoId: string, title: string | undefined, hint: string | undefined) {
    const truncatedTitle = (title ?? '').slice(0, 50)
    const truncatedHint = (hint ?? '').slice(0, 80)
    setPhotoTitles(prev => ({ ...prev, [photoId]: truncatedTitle }))
    setPhotoHints(prev => ({ ...prev, [photoId]: truncatedHint }))
  }

  async function savePhotoDetails(photoId: string, title: string | undefined, hint: string | undefined) {
    const truncatedTitle = (title ?? '').slice(0, 50)
    const truncatedHint = (hint ?? '').slice(0, 80)
    const saved = await new Promise<boolean>(resolve => {
      socket.timeout(7000).emit(
        'update_photo_details',
        { lobbyId: lobby.id, playerId, photoId, title: truncatedTitle, hint: truncatedHint },
        (error: Error | null, response?: { success?: boolean }) => resolve(!error && !!response?.success),
      )
    })
    if (!saved) {
      addToast(t('toast.connectionHiccup'), 'warning', 5000)
      return
    }

    if ((truncatedTitle || truncatedHint) && !metadataTrackedPhotoIds.current.has(photoId)) {
      metadataTrackedPhotoIds.current.add(photoId)
      achievements.trackPhotoMetadata()
    }

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

  async function savePhotoDate(photoId: string, captureDate: string): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10)
    if (!captureDate || captureDate > today) {
      addToast(t('uploader.futureDateError'), 'error', 4000)
      return false
    }
    const saved = await new Promise<{ success?: boolean; error?: string } | null>(resolve => {
      socket.timeout(7000).emit(
        'update_photo_date',
        { lobbyId: lobby.id, playerId, photoId, captureDate },
        (error: Error | null, response?: { success?: boolean; error?: string }) => resolve(error ? null : response ?? null),
      )
    })
    if (!saved?.success) {
      addToast(saved?.error || t('toast.connectionHiccup'), 'error', 5000)
      return false
    }
    setPhotoDates(prev => ({ ...prev, [photoId]: captureDate }))
    await updateEntryDate(photoId, captureDate)
    const queued = photosNeedingDate.find(photo => photo.photoId === photoId)
    if (queued?.historyEntryId) await updateEntryDateById(queued.historyEntryId, captureDate)
    setPhotosNeedingDate(prev => prev.filter(photo => photo.photoId !== photoId))
    getHistory().then(setHistoryEntries)
    addToast(t('uploader.photoDateSaved'), 'success', 2000)
    return true
  }

  const currentPhotoNeedingLocation = photosNeedingLocation[0]
  const currentPhotoNeedingDate = photosNeedingDate[0]
  const currentPhotoFromLobby = currentPhotoNeedingLocation
    ? (lobby.photos || []).find(p => p.id === currentPhotoNeedingLocation.photoId)
    : null
  const predictionCenter: [number, number] | null =
    currentPhotoFromLobby?.predictionLat != null && currentPhotoFromLobby?.predictionLon != null
      ? [currentPhotoFromLobby.predictionLat, currentPhotoFromLobby.predictionLon]
      : null
  const shouldUsePredictionAssist = locationPickerStep > 0
  const myPhotos = ownPhotos
  const otherPhotos = (lobby.photos || []).filter(p => p.uploaderId !== playerId)
  const editingPhoto = editingPhotoId ? myPhotos.find(p => p.id === editingPhotoId) : null
  const maxPhotos = lobby.settings.maxPhotosPerPlayer || 5
  const hasReachedPhotoLimit = myPhotos.length >= maxPhotos

  return (
    <>
      <AnimatePresence>
        {lobby.settings.gameType === 'spot' && currentPhotoNeedingLocation && (
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
        {lobby.settings.gameType === 'date' && currentPhotoNeedingDate && (
          <DatePickerDialog
            photoUrl={buildPhotoUrl(currentPhotoNeedingDate.url, lobby.id, playerId)}
            onConfirm={date => savePhotoDate(currentPhotoNeedingDate.photoId, date)}
            onDelete={handleDateDelete}
          />
        )}
        {lobby.settings.gameType === 'spot' && editingPhoto && (
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
        <p className="text-xs text-text-darker mb-3">
          {t(lobby.settings.gameType === 'date'
            ? 'uploader.uploadDescDate'
            : lobby.settings.gameType === 'uploader'
              ? 'uploader.uploadDescUploader'
              : 'uploader.uploadDesc', {
            max: lobby.settings.maxPhotosPerPlayer || 5,
          })}
        </p>

        {/* Upload button or limit-reached message */}
        {!hasReachedPhotoLimit ? (
          <div className="flex items-center gap-2 mb-3">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold cursor-pointer transition-colors text-sm">
              <input type="file" accept={lobby.settings.gameType !== 'uploader' && useFileBrowser ? '' : 'image/*'} className="hidden" onChange={onFile} disabled={busy} multiple />
              {busy ? t('uploader.uploading') : t('uploader.selectPhotos')}
            </label>
            {isMobileDevice && lobby.settings.gameType !== 'uploader' && (
              <button
                onClick={() => setUseFileBrowser(!useFileBrowser)}
                className="text-xs px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-text-darker transition-colors"
                title={useFileBrowser ? t('uploader.fileBrowserMode') : t('uploader.photoPickerMode')}
              >
                {lobby.settings.gameType === 'date'
                  ? useFileBrowser
                    ? t('uploader.metadataSafePicker')
                    : t('uploader.quickPicker')
                  : useFileBrowser
                    ? t('uploader.fileBrowser')
                    : t('uploader.photoPicker')}
              </button>
            )}
          </div>
        ) : (
          <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-sm font-medium text-amber-400">{t('uploader.photoLimitReached', { max: maxPhotos })}</p>
            <p className="text-xs text-text-darker mt-1">{t('uploader.photoLimitReachedDesc')}</p>
          </div>
        )}

        {isMobileDevice && lobby.settings.gameType !== 'uploader' && !useFileBrowser && (
          <p className="text-xs text-yellow-600/70 mb-3">
            {t(lobby.settings.gameType === 'date' ? 'uploader.dateMetadataTip' : 'uploader.androidTip')}
          </p>
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
                        {lobby.settings.gameType === 'date'
                          ? normalizeCaptureDate(p.captureDate)
                            ? t('uploader.dated', { date: p.captureDate ?? '' })
                            : t('uploader.noDate')
                          : lobby.settings.gameType === 'uploader'
                            ? t('uploader.readyForIdentityGame')
                            : p.lat != null && p.lon != null
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
                      {lobby.settings.gameType !== 'uploader' && <div className="block">
                        <label htmlFor={`capture-date-${p.id}`} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-text-darker">
                          <CalendarDays size={13} />
                          {t('uploader.captureDate')}{lobby.settings.gameType === 'date' ? ' *' : ''}
                        </label>
                        <input
                          id={`capture-date-${p.id}`}
                          type="date"
                          value={photoDates[p.id] ?? normalizeCaptureDate(p.captureDate) ?? ''}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={event => setPhotoDates(prev => ({ ...prev, [p.id]: event.target.value }))}
                          onBlur={event => event.target.value && void savePhotoDate(p.id, event.target.value)}
                          className={`w-full bg-background border rounded px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none ${
                            lobby.settings.gameType === 'date' && !normalizeCaptureDate(photoDates[p.id] ?? p.captureDate)
                              ? 'border-amber-400/70'
                              : 'border-primary/20'
                          }`}
                        />
                        {lobby.settings.gameType === 'date' && !normalizeCaptureDate(photoDates[p.id] ?? p.captureDate) && (
                          <span className="block mt-1 text-[11px] text-amber-400">{t('uploader.dateRequired')}</span>
                        )}
                      </div>}
                      {p.captureDate && lobby.settings.gameType === 'spot' && (
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
                          {lobby.settings.gameType === 'spot' && <button
                            onClick={() => setEditingPhotoId(p.id)}
                            className="flex-1 px-3 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 font-medium text-xs transition-colors flex items-center justify-center gap-2 border border-blue-500/30"
                          >
                            <Map size={14} /> {(p.lat != null && p.lon != null) ? t('uploader.changeLocation') : t('uploader.setLocation')}
                          </button>}
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

        {/* Other players: show ownership/count only. The server deliberately
            withholds pre-round URLs because a CSS blur is trivial to remove. */}
        {otherPhotos.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-bold text-text-darker mb-3">{t('uploader.otherPhotos', { count: otherPhotos.length })}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {lobby.players.filter(player => player.id !== playerId && !player.id.startsWith('ai-')).map(player => {
                const count = otherPhotos.filter(photo => photo.uploaderId === player.id).length
                if (count === 0) return null
                return (
                  <div key={player.id} className="rounded-lg border border-primary/20 bg-white/5 p-3 flex items-center gap-2 min-w-0">
                    <span className="text-xl">{player.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{player.nickname}</div>
                      <div className="text-[11px] text-text-darker">📷 {count}</div>
                    </div>
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
