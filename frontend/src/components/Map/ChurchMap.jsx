import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import VoronoiLayer, { VoronoiToggleButton, VoronoiLegend } from './VoronoiLayer'
import MapAttribution from './MapAttribution'

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Create custom marker icons for different statuses
export const createCustomIcon = (color) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  })
}

// Church icon
export const createChurchIcon = () => {
  return L.divIcon({
    className: 'church-marker',
    html: `<div style="background-color: #22c55e; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2">
        <path d="M18 21V7.5l-6-4.5-6 4.5V21"/>
        <path d="M12 3v4"/>
        <path d="M9 21v-4h6v4"/>
      </svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  })
}

// Status icons mapping
export const statusIcons = {
  unreached: createCustomIcon('#ef4444'),      // Red
  engaged: createCustomIcon('#f59e0b'),        // Orange/Yellow
  established: createCustomIcon('#22c55e'),    // Green
  'in-progress': createCustomIcon('#f59e0b'),  // Orange (alias)
  'church-planted': createCustomIcon('#22c55e'), // Green (alias)
  multiplying: createCustomIcon('#0ea5e9'),    // Blue
}

// Status labels
export const statusLabels = {
  unreached: 'Non atteint',
  engaged: 'Engagé',
  established: 'Établi',
  'in-progress': 'En cours',
  'church-planted': 'Église plantée',
  multiplying: 'Multiplication',
}

// Status colors for CSS classes
export const statusColors = {
  unreached: 'bg-red-500',
  engaged: 'bg-yellow-500',
  established: 'bg-green-500',
  'in-progress': 'bg-yellow-500',
  'church-planted': 'bg-green-500',
  multiplying: 'bg-blue-500',
}

// Map click handler component
export const MapClickHandler = ({ onMapClick, isEnabled }) => {
  useMapEvents({
    click: (e) => {
      if (isEnabled && onMapClick) {
        onMapClick(e.latlng)
      }
    },
  })
  return null
}

// Fly to location component
export const FlyToLocation = ({ center, zoom = 12 }) => {
  const map = useMap()
  const prevCenter = useRef(null)
  
  useEffect(() => {
    if (center && JSON.stringify(center) !== JSON.stringify(prevCenter.current)) {
      map.flyTo(center, zoom)
      prevCenter.current = center
    }
  }, [center, zoom, map])
  
  return null
}

// Fit all markers component
export const FitAllMarkers = ({ locations, trigger }) => {
  const map = useMap()
  
  useEffect(() => {
    if (trigger && locations && locations.length > 0) {
      const bounds = L.latLngBounds(locations)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 })
    }
  }, [trigger, locations, map])
  
  return null
}

/**
 * Main ChurchMap component
 * 
 * Features:
 * - Display village and church markers
 * - Voronoi diagram overlay for village influence zones
 * - Click handlers for adding new locations
 * - Fly to location and fit bounds functionality
 */
const ChurchMap = ({
  center = [0, 20],
  zoom = 3,
  villages = [],
  churches = [],
  onVillageClick,
  onChurchClick,
  onMapClick,
  isAddingMode = false,
  selectedId = null,
  showChurches = true,
  showVillages = true,
  showVoronoi = false,           // New: Control Voronoi visibility
  onVoronoiToggle = null,        // New: Callback when Voronoi is toggled
  voronoiColorMode = 'status',   // New: 'status' | 'distinct'
  className = '',
  style = {},
}) => {
  // Internal state for Voronoi if no external control provided
  const [internalShowVoronoi, setInternalShowVoronoi] = useState(false)
  const [voronoiError, setVoronoiError] = useState(null)
  
  // Use external or internal Voronoi state
  const isVoronoiVisible = onVoronoiToggle ? showVoronoi : internalShowVoronoi
  const handleVoronoiToggle = onVoronoiToggle || setInternalShowVoronoi

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={center}
        zoom={zoom}
        className={`h-full w-full ${className}`}
        style={{ cursor: isAddingMode ? 'crosshair' : 'grab', ...style }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapClickHandler onMapClick={onMapClick} isEnabled={isAddingMode} />
        <FlyToLocation center={center} zoom={zoom} />
        
        {/* Voronoi Layer - rendered below markers */}
        <VoronoiLayer
          visible={isVoronoiVisible}
          villages={villages.length >= 3 ? villages : null}
          colorMode={voronoiColorMode}
          fillOpacity={0.25}
          strokeOpacity={0.7}
          strokeWeight={2}
          showTooltips={true}
          onError={(error) => setVoronoiError(error)}
          onPolygonClick={(props) => {
            // Find and click the associated village
            const village = villages.find(v => v._id === props.villageId)
            if (village && onVillageClick) {
              onVillageClick(village)
            }
          }}
        />
        
        {/* Village Markers */}
        {showVillages && villages.map((village) => (
          village.location?.coordinates && (
            <Marker
              key={village._id}
              position={[village.location.coordinates[1], village.location.coordinates[0]]}
              icon={statusIcons[village.status] || statusIcons.unreached}
              eventHandlers={{
                click: () => onVillageClick && onVillageClick(village)
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <h3 className="font-bold text-lg mb-1">{village.name}</h3>
                  {village.region && (
                    <p className="text-sm text-gray-500 mb-2">{village.region}</p>
                  )}
                  <div className="space-y-1 text-sm">
                    <p className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusColors[village.status] || statusColors.unreached}`}></span>
                      {statusLabels[village.status] || village.status}
                    </p>
                    {village.population && (
                      <p>Population: {village.population.toLocaleString()}</p>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        ))}
        
        {/* Church Markers */}
        {showChurches && churches.map((church) => (
          church.location?.coordinates && (
            <Marker
              key={church._id}
              position={[church.location.coordinates[1], church.location.coordinates[0]]}
              icon={createChurchIcon()}
              eventHandlers={{
                click: () => onChurchClick && onChurchClick(church)
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <h3 className="font-bold text-lg mb-1">{church.name}</h3>
                  {church.pastor && (
                    <p className="text-sm text-gray-500">Pasteur: {church.pastor}</p>
                  )}
                  {church.members && (
                    <p className="text-sm">Membres: {church.members}</p>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
      
      {/* Map Controls Overlay */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        {/* Voronoi Toggle Button */}
        <VoronoiToggleButton
          visible={isVoronoiVisible}
          onToggle={handleVoronoiToggle}
          disabled={villages.length < 3}
        />
        
        {/* Error message */}
        {voronoiError && (
          <div className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded dark:bg-red-900/40 dark:text-red-300">
            {voronoiError}
          </div>
        )}
      </div>
      
      {/* Voronoi Legend */}
      <div className="absolute bottom-4 left-4 z-[1000]">
        <VoronoiLegend 
          visible={isVoronoiVisible} 
          colorMode={voronoiColorMode}
        />
      </div>
      
      {/* Map Attribution - Joshua Project & OpenStreetMap */}
      <MapAttribution 
        showJoshuaProject={true}
        showOpenStreetMap={true}
        position="bottom-right"
      />
    </div>
  )
}

// Re-export Voronoi components for external use
export { VoronoiLayer, VoronoiToggleButton, VoronoiLegend }

export default ChurchMap