/**
 * Lazy Map Components
 * Dynamically import map components to reduce initial bundle size
 */

import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { useI18n } from '../contexts/I18nContext';

type LazyLeafletComponent = ComponentType<Record<string, unknown>>;

/**
 * Lazy load react-leaflet components
 * These are loaded on-demand when a map is first rendered
 */
export const LazyMapContainer = lazy<LazyLeafletComponent>(() =>
  import('react-leaflet').then(module => ({ default: module.MapContainer as LazyLeafletComponent }))
);

export const LazyTileLayer = lazy<LazyLeafletComponent>(() =>
  import('react-leaflet').then(module => ({ default: module.TileLayer as unknown as LazyLeafletComponent }))
);

export const LazyMarker = lazy<LazyLeafletComponent>(() =>
  import('react-leaflet').then(module => ({ default: module.Marker as unknown as LazyLeafletComponent }))
);

export const LazyPopup = lazy<LazyLeafletComponent>(() =>
  import('react-leaflet').then(module => ({ default: module.Popup as LazyLeafletComponent }))
);

export const LazyPolyline = lazy<LazyLeafletComponent>(() =>
  import('react-leaflet').then(module => ({ default: module.Polyline as unknown as LazyLeafletComponent }))
);

export const LazyTooltip = lazy<LazyLeafletComponent>(() =>
  import('react-leaflet').then(module => ({ default: module.Tooltip as LazyLeafletComponent }))
);

/**
 * Map loading fallback component
 */
export function MapLoadingFallback() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center h-full min-h-[300px] bg-white/5 rounded-xl border border-primary/20">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
        <p className="text-sm text-text-darker">{t('common.loadingMap')}</p>
      </div>
    </div>
  );
}

/**
 * Wrapper component for lazy-loaded maps
 */
export function LazyMap({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (
    <Suspense fallback={fallback || <MapLoadingFallback />}>
      {children}
    </Suspense>
  );
}
