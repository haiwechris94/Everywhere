/**
 * MiniMap - Overview Mini-Map Component
 * 
 * Features:
 * - Shows entire country bounds in a small overview map
 * - Displays rectangle showing current main map viewport
 * - Bidirectional synchronization (main map ↔ mini-map)
 * - Click to navigate on mini-map
 * - Draggable viewport rectangle
 * 
 * @author Church Planting Map Team
 * @version 1.0.0
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, Rectangle, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useCountry } from '../context/CountryContext'
import { Maximize2, Minimize2, Map as MapIcon } from 'lucide-react'

/**
 * ViewportRectangle - Shows and syncs the main map viewport on mini-map
 */
const ViewportRectangle = ({ 
  mainMapBounds, 
  onViewportClick, 
  onViewportDrag,
  isDragging,
  setIsDragging,
}) => {
  const map = useMap()
  const rectangleRef = useRef(null)
  
  // Handle click on mini-map to move main map
  useMapEvents({
    click: (e) => {
      if (!isDragging) {
        onViewportClick(e.latlng)
      }
    },
  })
  
  // Rectangle style
  const rectangleStyle = useMemo(() => ({
    color: '#3b82f6',
    weight: 2,
    fillColor: '#3b82f6',
    fillOpacity: 0.15,
    dashArray: isDragging ? '5, 5' : null,
  }), [isDragging])
  
  if (!mainMapBounds) return null
  
  return (
    <Rectangle
      ref={rectangleRef}
      bounds={mainMapBounds}
      pathOptions={rectangleStyle}
      eventHandlers={{
        mousedown: (e) => {
          L.DomEvent.stopPropagation(e)
          setIsDragging(true)
        },
        mouseup: () => {
          setIsDragging(false)
        },
      }}
    />
  )
}

/**
 * MiniMapSync - Syncs mini-map with main map bounds
 */
const MiniMapSync = ({ countryBounds }) => {
  const map = useMap()
  
  useEffect(() => {
    if (countryBounds) {
      // Fit mini-map to country bounds with padding
      map.fitBounds(countryBounds, { 
        padding: [10, 10],
        animate: false,
      })
    }
  }, [map, countryBounds])
  
  return null
}

/**
 * MiniMap Component
 * @param {Object} mainMapRef - Reference to the main map instance
 * @param {number} width - Width of mini-map (default: 200)
 * @param {number} height - Height of mini-map (default: 150)
 * @param {string} position - Position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
 * @param {boolean} collapsible - Allow collapsing the mini-map
 */
const MiniMap = ({ 
  mainMapRef,
  width = 200, 
  height = 150,
  position = 'bottom-right',
  collapsible = true,
}) => {
  const { countryBounds, countryCenter, countryZoom, selectedCountry } = useCountry()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mainMapBounds, setMainMapBounds] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const miniMapRef = useRef(null)
  
  // Position styles
  const positionStyles = useMemo(() => {
    const base = 'absolute z-[1000]'
    switch (position) {
      case 'bottom-left':
        return `${base} bottom-6 left-6`
      case 'top-right':
        return `${base} top-6 right-6`
      case 'top-left':
        return `${base} top-6 left-6`
      case 'bottom-right':
      default:
        return `${base} bottom-6 right-6`
    }
  }, [position])
  
  // Convert country bounds to Leaflet format
  const leafletCountryBounds = useMemo(() => {
    if (!countryBounds) return null
    // countryBounds format: [[south, west], [north, east]]
    return L.latLngBounds(countryBounds)
  }, [countryBounds])
  
  // Update main map bounds when main map moves
  useEffect(() => {
    if (!mainMapRef?.current) return
    
    const mainMap = mainMapRef.current
    
    const updateBounds = () => {
      const bounds = mainMap.getBounds()
      setMainMapBounds(bounds)
    }
    
    // Initial bounds
    updateBounds()
    
    // Listen to main map events
    mainMap.on('moveend', updateBounds)
    mainMap.on('zoomend', updateBounds)
    
    return () => {
      mainMap.off('moveend', updateBounds)
      mainMap.off('zoomend', updateBounds)
    }
  }, [mainMapRef])
  
  // Handle click on mini-map to center main map
  const handleViewportClick = useCallback((latlng) => {
    if (!mainMapRef?.current) return
    
    const mainMap = mainMapRef.current
    mainMap.setView(latlng, mainMap.getZoom(), { animate: true })
  }, [mainMapRef])
  
  // Handle viewport drag on mini-map
  const handleViewportDrag = useCallback((newBounds) => {
    if (!mainMapRef?.current) return
    
    const mainMap = mainMapRef.current
    mainMap.fitBounds(newBounds, { animate: false })
  }, [mainMapRef])
  
  // Collapsed state
  if (isCollapsed) {
    return (
      <div className={positionStyles}>
        <button
          onClick={() => setIsCollapsed(false)}
          className="bg-white rounded-lg shadow-lg p-2 hover:bg-gray-50 transition-colors border border-gray-200"
          title="Show mini-map"
        >
          <MapIcon size={20} className="text-gray-600" />
        </button>
      </div>
    )
  }
  
  return (
    <div 
      className={`${positionStyles} bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden`}
      style={{ width, height: height + 28 }} // +28 for header
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-600">
          {selectedCountry} Overview
        </span>
        {collapsible && (
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title="Collapse mini-map"
          >
            <Minimize2 size={14} className="text-gray-500" />
          </button>
        )}
      </div>
      
      {/* Mini Map */}
      <div style={{ width, height }}>
        <MapContainer
          ref={miniMapRef}
          center={countryCenter || [7.3697, 12.3547]}
          zoom={4}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          touchZoom={false}
          doubleClickZoom={false}
          scrollWheelZoom={false}
          boxZoom={false}
          keyboard={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          
          {/* Sync mini-map to country bounds */}
          <MiniMapSync countryBounds={leafletCountryBounds} />
          
          {/* Viewport rectangle */}
          <ViewportRectangle
            mainMapBounds={mainMapBounds}
            onViewportClick={handleViewportClick}
            onViewportDrag={handleViewportDrag}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
          />
        </MapContainer>
      </div>
    </div>
  )
}

/**
 * MiniMapControl - Wrapper component that can be used inside a MapContainer
 * This version uses useMap() to get the main map reference automatically
 */
export const MiniMapControl = ({ 
  width = 200, 
  height = 150,
  position = 'bottom-right',
  collapsible = true,
}) => {
  const mainMap = useMap()
  const mainMapRef = useRef(mainMap)
  
  useEffect(() => {
    mainMapRef.current = mainMap
  }, [mainMap])
  
  return (
    <MiniMap
      mainMapRef={mainMapRef}
      width={width}
      height={height}
      position={position}
      collapsible={collapsible}
    />
  )
}

export default MiniMap
