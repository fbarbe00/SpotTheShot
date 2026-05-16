import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import App from './App'

// Repoint Leaflet's default marker icons to bundled copies under public/leaflet/.
// Leaflet sets icon URLs via JavaScript (not CSS), so the override has to happen
// here; bundling locally keeps everything self-hosted (no third-party CDN call).
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  iconUrl: '/leaflet/marker-icon.png',
  shadowUrl: '/leaflet/marker-shadow.png',
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)