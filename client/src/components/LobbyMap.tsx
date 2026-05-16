import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import { useState } from "react";
import type { Lobby } from "../lib/types";
import { buildPhotoUrl } from "../lib/socket";
import { getMapInitialView } from "../lib/utils";
import LocationPickerDialog from "./LocationPickerDialog";
import { useI18n } from "../contexts/I18nContext";
import { getTileUrl, getMapProvider } from "../lib/mapConfig";
import { X } from "lucide-react";

export default function LobbyMap({
  lobby,
  playerId,
  onUpdateLocation,
}: {
  lobby: Lobby;
  playerId: string;
  onUpdateLocation: (photoId: string, lat: number, lon: number) => void;
}) {
  const { t } = useI18n();
  const [editingPhoto, setEditingPhoto] = useState<{id: string, url: string} | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const myPhotos = lobby.photos.filter((p) => p.uploaderId === playerId);

  // Get default map center and zoom from environment
  const { center: defaultCenter, zoom: defaultZoom } = getMapInitialView();

  // Get map settings from lobby
  const mapStyle = lobby.settings.mapStyle || 'osm';
  const mapLanguage = lobby.settings.mapLanguage || 'local';

  const photoIcon = (icon?: string, playerName?: string, photoUrl?: string) => {
    const playerLabel = playerName ? `<div style="font-size: 10px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px; color: var(--color-text, #333); font-weight: 500; margin-top: 2px;">${playerName}</div>` : '';
    const content = photoUrl
      ? `<div style="width: 48px; height: 48px; border-radius: 8px; overflow: hidden; border: 2px solid var(--color-primary, #9945ff); box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><img src="${photoUrl}" style="width: 100%; height: 100%; object-fit: cover;" /></div>${playerLabel}`
      : `<div style="font-size: 28px; line-height: 1;">${icon || "📸"}</div>${playerLabel}`;

    return new L.DivIcon({
      className: "leaflet-div-icon",
      html: content,
      iconSize: [48, 64],
      iconAnchor: [24, 32],
      popupAnchor: [0, -32],
    });
  };

  return (
    <>
      <div className="rounded-xl overflow-hidden h-full min-h-[60vh] md:min-h-[40vh] md:max-h-[60vh] border-2 border-primary/20">
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          style={{
            height: "100%",
            width: "100%",
          }}
          scrollWheelZoom={true}
        >
          <TileLayer
            key={`${mapStyle}-${mapLanguage}`}
            url={getTileUrl(mapStyle, mapLanguage)}
            attribution={getMapProvider(mapStyle).attribution}
            maxZoom={getMapProvider(mapStyle).maxZoom}
          />

          {/* Show all user's photos as markers */}
          {myPhotos.map((photo) => {
            if (photo.lat == null || photo.lon == null) return null;
            const uploader = lobby.players.find((p) => p.id === photo.uploaderId);
            const photoUrl = buildPhotoUrl(photo.url, lobby.id, playerId);

            return (
              <Marker
                key={photo.id}
                position={[photo.lat, photo.lon]}
                icon={photoIcon(uploader?.icon, uploader?.nickname, photoUrl)}
                eventHandlers={{
                  click: () => {
                    setEnlargedImage(photoUrl);
                  }
                }}
              >
                <Popup>
                  <div className="text-sm w-48">
                    <img
                      src={photoUrl}
                      alt="photo"
                      className="w-full h-32 object-cover rounded mb-2"
                    />
                    <div className="font-bold">{photo.title || t("ui.untitled")}</div>
                    <div className="text-xs text-gray-600 mb-2">
                      <div className="mt-1">
                        {photo.manualLocation ? (
                          <span className="text-amber-500 font-semibold">📍 Manually entered</span>
                        ) : (
                          <span className="text-green-500 font-semibold">📷 From EXIF GPS</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setEditingPhoto({id: photo.id, url: photo.url});
                      }}
                      className="w-full px-2 py-1 rounded bg-primary text-black text-xs font-bold hover:bg-primary-dark"
                    >
                      Edit Location
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Location Picker Dialog for editing */}
          {editingPhoto && (
              <LocationPickerDialog
                photoId={editingPhoto.id}
                photoUrl={buildPhotoUrl(editingPhoto.url, lobby.id, playerId)}
              onConfirm={(lat, lon) => {
                onUpdateLocation(editingPhoto.id, lat, lon);
                setEditingPhoto(null);
              }}
              onCancel={() => {
                setEditingPhoto(null);
              }}
              mapStyle={mapStyle}
              mapLanguage={mapLanguage}
              isEditing={true}
              hasExistingLocation={true}
            />
          )}
        </MapContainer>
      </div>

      {/* Enlarged Image Modal - Outside MapContainer to fix z-index */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={enlargedImage}
              alt="Enlarged photo"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              onClick={() => setEnlargedImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors text-white"
              aria-label={t("common.close")}
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
