import { Photo } from '../../lib/types'
import { MapPin, User, Calendar } from 'lucide-react'
import { Skeleton } from './Skeleton'
import { buildPhotoUrl } from '../../lib/socket'

interface PhotoCardProps {
  photo: Photo
  isLoading?: boolean
  onClick?: () => void
  variant?: 'compact' | 'full'
}

/**
 * Reusable photo card component
 * Displays photo with metadata (location, uploader, date)
 * Used by: LobbyMap, Uploader, Result, etc.
 */
export function PhotoCard({ photo, isLoading = false, onClick, variant = 'full' }: PhotoCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg overflow-hidden border border-primary/20 bg-white/5">
        <Skeleton className="w-full h-40" />
        <div className="p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" variant="text" />
          <Skeleton className="h-3 w-1/2" variant="text" />
        </div>
      </div>
    )
  }

  const photoUrl = photo.url ? buildPhotoUrl(photo.url) : '/placeholder.jpg'

  return (
    <div
      onClick={onClick}
      className={`rounded-lg overflow-hidden border border-primary/20 bg-white/5 hover:border-primary/40 transition-colors cursor-pointer ${
        onClick ? 'hover:shadow-lg' : ''
      }`}
    >
      {/* Image */}
      <div className="relative w-full h-40 bg-gray-400/20 overflow-hidden">
        <img
          src={photoUrl}
          alt="Photo"
          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder.jpg'
          }}
        />
      </div>

      {/* Metadata */}
      <div className="p-3 space-y-2">
        {/* Location */}
        {photo.country && (
          <div className="flex items-center gap-2 text-sm text-text-darker">
            <MapPin className="w-4 h-4 text-primary" />
            <span>{photo.region ? `${photo.region}, ${photo.country}` : photo.country}</span>
          </div>
        )}

        {/* Uploader */}
        {photo.uploaderNickname && variant === 'full' && (
          <div className="flex items-center gap-2 text-sm text-text-darker">
            <User className="w-4 h-4 text-primary" />
            <span>{photo.uploaderNickname}</span>
          </div>
        )}

        {/* Date */}
        {photo.uploadedAt && variant === 'full' && (
          <div className="flex items-center gap-2 text-sm text-text-darker">
            <Calendar className="w-4 h-4 text-primary" />
            <span>{new Date(photo.uploadedAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
