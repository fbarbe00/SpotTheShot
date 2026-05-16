import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import { Check, Trash2, Search, Loader, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { getMapInitialView } from '../lib/utils'
import { useI18n } from '../contexts/I18nContext'
import { logger } from '../lib/logger'
import { getTileUrl, getMapProvider, type MapStyle, type MapLanguage } from '../lib/mapConfig'

interface LocationPickerDialogProps {
  photoId: string
  photoUrl: string
  onConfirm: (lat: number, lon: number) => void
  onDelete?: () => void
  onCancel?: () => void
  isEditing?: boolean
  hasExistingLocation?: boolean
  predictionCenter?: [number, number] | null
  predictionWaitMs?: number
  predictionEnabled?: boolean
  mapStyle?: MapStyle
  mapLanguage?: MapLanguage
}

const SEARCH_ZOOM = 12
const COUNTRY_LEVEL_ZOOM = 6

function LocationMarker({
  position,
  setPosition,
  onUserInteraction,
}: {
  position: [number, number] | null
  setPosition: (pos: [number, number]) => void
  onUserInteraction: () => void
}) {
  useMapEvents({
    click(e) {
      onUserInteraction()
      setPosition([e.latlng.lat, e.latlng.lng])
    },
  })
  return position === null ? null : <Marker position={position} />
}

function MapViewportController({
  center,
  zoom,
}: {
  center: [number, number] | null
  zoom: number | null
}) {
  const map = useMap()

  useEffect(() => {
    if (!center || zoom == null) return
    map.flyTo(center, zoom, { animate: true, duration: 0.6 })
  }, [center, zoom, map])

  return null
}

export default function LocationPickerDialog({
  photoId,
  photoUrl,
  onConfirm,
  onDelete,
  onCancel,
  isEditing = false,
  hasExistingLocation = false,
  predictionCenter = null,
  predictionWaitMs = 1500,
  predictionEnabled = false,
  mapStyle = 'osm',
  mapLanguage,
}: LocationPickerDialogProps) {
  const { t, language } = useI18n()
  // Default map language to user's language if not provided
  // Only use languages with working tile servers (en, fr, de, local)
  const effectiveMapLanguage = mapLanguage ?? (['en', 'fr', 'de'].includes(language) ? language as MapLanguage : 'local')
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ lat: string; lon: string; display_name: string }>>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastSelectedLocation, setLastSelectedLocation] = useState<string | null>(null)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [predictionWindowOpen, setPredictionWindowOpen] = useState(false)
  const [mapCenterOverride, setMapCenterOverride] = useState<[number, number] | null>(null)
  const [mapZoomOverride, setMapZoomOverride] = useState<number | null>(null)
  const [photoCollapsed, setPhotoCollapsed] = useState(false)
  const [photoExpanded, setPhotoExpanded] = useState(false)
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const { center: defaultCenter, zoom: defaultZoom } = getMapInitialView()

  // Collapse photo header on scroll down, expand on scroll up
  useEffect(() => {
    const el = contentScrollRef.current
    if (!el) return
    const handleScroll = () => {
      // Collapse when scrolled down past 60px, expand when near top
      setPhotoCollapsed(el.scrollTop > 60)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Clear position when photo changes to ensure clean state for each new photo
  useEffect(() => {
    setPosition(null)
    setSearchQuery('')
    setSearchResults([])
    setSearchError(null)
    setHasUserInteracted(false)
    setPredictionWindowOpen(Boolean(predictionEnabled))
    setMapCenterOverride(null)
    setMapZoomOverride(null)
    setPhotoCollapsed(false)
    setPhotoExpanded(false)
  }, [photoId, predictionEnabled])

  useEffect(() => {
    if (!predictionEnabled || hasUserInteracted || !predictionWindowOpen || predictionCenter) return
    const timer = setTimeout(() => setPredictionWindowOpen(false), predictionWaitMs)
    return () => clearTimeout(timer)
  }, [predictionEnabled, hasUserInteracted, predictionCenter, predictionWindowOpen, predictionWaitMs])

  useEffect(() => {
    if (!predictionEnabled || hasUserInteracted || !predictionWindowOpen || !predictionCenter) return
    setMapCenterOverride(predictionCenter)
    setMapZoomOverride(COUNTRY_LEVEL_ZOOM)
    setPredictionWindowOpen(false)
  }, [predictionEnabled, hasUserInteracted, predictionCenter, predictionWindowOpen])

  // Debounced search function
  const handleSearch = async (query: string) => {
    if (query == lastSelectedLocation) {
      return
    }
    if (!query.trim()) {
      setSearchResults([])
      setSearchError(null)
      return
    }

    setSearchLoading(true)
    setSearchError(null)

    try {
      // Use Photon API (komoot) - more permissive ToS than Nominatim
      // https://photon.komoot.io/
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=3`
      )
      const data = await response.json()
      // Photon returns features array with geometry.coordinates [lon, lat]
      const results = (data.features || []).map((f: {
        geometry: { coordinates: [number, number] };
        properties: { name?: string; street?: string; district?: string; city?: string; state?: string; country?: string };
      }) => ({
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        display_name: f.properties.name || f.properties.street || f.properties.district || f.properties.city || f.properties.state || f.properties.country || 'Unknown',
      }))
      setSearchResults(results)
    } catch (error) {
      logger.error('Search failed', error)
      setSearchError(t('ui.searchError'))
    } finally {
      setSearchLoading(false)
    }
  }

  // Debounce search input
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current)
    }

    searchTimeout.current = setTimeout(() => {
      handleSearch(searchQuery)
    }, 500)

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current)
      }
    }
  }, [searchQuery])
  /* eslint-enable react-hooks/exhaustive-deps */

  const handleSearchSelect = (result: { lat: string; lon: string; display_name: string } | undefined) => {
    if (!result) return
    const lat = parseFloat(result.lat)
    const lon = parseFloat(result.lon)
    if (!isNaN(lat) && !isNaN(lon)) {
      setHasUserInteracted(true)
      setPosition([lat, lon])
      setMapCenterOverride([lat, lon])
      setMapZoomOverride(SEARCH_ZOOM)
      setLastSelectedLocation(result.display_name)
      setSearchQuery(result.display_name)
      setSearchResults([])
    }
  }

  const handleConfirm = () => {
    if (position) {
      onConfirm(position[0], position[1])
    }
  }

  // Prevent escape key from closing the modal
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
    }
  }

  return (
    <motion.div
      className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onKeyDown={handleKeyDown}
    >
      <motion.div
        className="bg-surface rounded-2xl border border-primary/20 w-full max-w-4xl h-[90vh] md:max-w-6xl md:h-[85vh] flex flex-col overflow-hidden"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
      >
        {/* Header - includes photo that collapses on scroll and expands on click */}
        <div className={`border-b border-primary/10 flex-shrink-0 transition-all duration-300 overflow-hidden ${photoExpanded ? 'max-h-[50vh]' : photoCollapsed ? 'max-h-12' : 'max-h-40'}`}>
          <div className="p-3 flex items-center gap-3">
            <img
              src={photoUrl}
              alt={t('ui.photoPreview')}
              className={`${photoExpanded ? 'w-full max-h-[40vh] object-contain' : 'w-16 h-16 object-cover'} rounded-lg border border-primary/20 flex-shrink-0 cursor-pointer hover:border-primary/40 transition-all`}
              onClick={() => setPhotoExpanded(!photoExpanded)}
            />
            {!photoExpanded && (
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{isEditing ? t('ui.editPhotoLocation') : t('ui.setPhotoLocation')}</h2>
                <p className="text-xs text-text-darker mt-0.5">{isEditing ? t('ui.editPhotoLocationDesc') : t('ui.setPhotoLocationDesc')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Content - Map + Search */}
        <div ref={contentScrollRef} className="flex flex-col flex-1 overflow-auto">
          <div className="flex-1 p-3">
            <div className="rounded-lg overflow-hidden border border-primary/20 h-full min-h-[200px]">
            <MapContainer
              center={defaultCenter}
              zoom={defaultZoom}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                key={`${mapStyle}-${effectiveMapLanguage}`}
                url={getTileUrl(mapStyle, effectiveMapLanguage)}
                attribution={getMapProvider(mapStyle).attribution}
                maxZoom={getMapProvider(mapStyle).maxZoom}
              />
              <LocationMarker
                position={position}
                setPosition={setPosition}
                onUserInteraction={() => setHasUserInteracted(true)}
              />
              <MapViewportController center={mapCenterOverride} zoom={mapZoomOverride} />
            </MapContainer>
            </div>
          </div>

          {/* Search Bar and Results */}
          <div className="px-3 pb-3">
          <div className="relative mb-2">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-text-darker" />
            </div>
            <input
              type="text"
              placeholder={t('ui.searchLocation')}
              className="w-full pl-10 pr-8 py-1.5 bg-surface border border-primary/20 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-text text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults.length > 0) {
                  e.preventDefault()
                  handleSearchSelect(searchResults[0])
                }
              }}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchError(null);
                }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                title={t('ui.clearSearch')}
              >
                <X className="h-4 w-4 text-text-darker hover:text-text" />
              </button>
            )}
            {searchLoading && (
              <div className="absolute inset-y-0 right-0 pr-8 flex items-center">
                <Loader className="h-4 w-4 text-primary animate-spin" />
              </div>
            )}
          </div>
          {searchError && (
            <p className="text-sm text-red-400 mt-1">{searchError}</p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto bg-surface/80 border border-primary/20 rounded-md shadow-sm text-sm">
              {searchResults.map((result, index) => (
                <button
                  key={index}
                  onClick={() => {
                    handleSearchSelect(result);
                    setSearchResults([]);
                  }}
                  className="w-full text-left p-2 hover:bg-primary/10 flex flex-col border-b border-primary/10 last:border-b-0"
                >
                  <span className="font-medium text-text truncate">{result.display_name.split(',')[0]}</span>
                  <span className="text-xs text-text-darker truncate">{result.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-primary/10 flex items-center justify-between flex-shrink-0">
          <div className="text-sm text-text-darker">
            {position ? `📍 ${position[0].toFixed(4)}, ${position[1].toFixed(4)}` : t('ui.clickMapToSelect')}
          </div>
          <div className="flex gap-3">
            {/* Cancel button - only show when editing with existing location */}
            {isEditing && hasExistingLocation && onCancel && (
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-text-darker font-bold transition-colors flex items-center gap-2"
              >
                <X size={18} /> {t('common.cancel')}
              </button>
            )}
            {/* Delete button - show when not editing OR when editing without existing location */}
            {onDelete && (!isEditing || !hasExistingLocation) && (
              <button
                onClick={onDelete}
                className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 font-bold transition-colors flex items-center gap-2"
              >
                <Trash2 size={18} /> {t('common.delete')}
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={!position}
              className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Check size={18} /> {t('common.confirm')}
            </button>
          </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
