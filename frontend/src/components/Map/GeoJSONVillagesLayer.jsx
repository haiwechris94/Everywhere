import { useEffect, useMemo, useState, useCallback } from 'react'
import { GeoJSON, useMap, CircleMarker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { useGeoJSON, getGeoJSONBounds } from '../../hooks/useGeoJSON'

/**
 * GeoJSON Villages Layer Component
 * Displays villages from a GeoJSON file with clustering and popups
 */
const GeoJSONVillagesLayer = ({
  url = '/data/villages.geojson',
  visible = true,
  onVillageClick,
  selectedVillageId,
  filterFn,
  style,
  clusterRadius = 50,
  showPopups = true,
  fitBoundsOnLoad = false,
  maxZoomForClustering = 12,
}) => {
  const map = useMap()
  const [visibleFeatures, setVisibleFeatures] = useState([])
  
  // Load GeoJSON data
  const { data: geojsonData, isLoading, error } = useGeoJSON(url, {
    enabled: visible,
  })

  // Filter features if filterFn is provided
  const filteredData = useMemo(() => {
    if (!geojsonData || !geojsonData.features) return null
    
    if (!filterFn) return geojsonData

    return {
      ...geojsonData,
      features: geojsonData.features.filter(filterFn)
    }
  }, [geojsonData, filterFn])

  // Fit bounds on load
  useEffect(() => {
    if (fitBoundsOnLoad && filteredData) {
      const bounds = getGeoJSONBounds(filteredData)
      if (bounds) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 })
      }
    }
  }, [fitBoundsOnLoad, filteredData, map])

  // Update visible features based on map bounds (for performance)
  const updateVisibleFeatures = useCallback(() => {
    if (!filteredData || !filteredData.features) return

    const bounds = map.getBounds()
    const zoom = map.getZoom()

    // At low zoom levels, limit the number of features shown
    const maxFeatures = zoom < 8 ? 500 : zoom < 10 ? 1000 : 5000

    const visible = filteredData.features.filter(feature => {
      if (!feature.geometry || !feature.geometry.coordinates) return false
      const [lng, lat] = feature.geometry.coordinates
      return bounds.contains([lat, lng])
    }).slice(0, maxFeatures)

    setVisibleFeatures(visible)
  }, [filteredData, map])

  // Update visible features on map move
  useEffect(() => {
    if (!filteredData) return

    updateVisibleFeatures()

    map.on('moveend', updateVisibleFeatures)
    map.on('zoomend', updateVisibleFeatures)

    return () => {
      map.off('moveend', updateVisibleFeatures)
      map.off('zoomend', updateVisibleFeatures)
    }
  }, [filteredData, map, updateVisibleFeatures])

  // Default style for points - reduced size by 50%
  const defaultPointStyle = {
    radius: 3,
    fillColor: '#ef4444',
    color: '#fff',
    weight: 1,
    opacity: 1,
    fillOpacity: 0.8,
  }

  // Style function for GeoJSON
  const pointToLayer = useCallback((feature, latlng) => {
    const isSelected = feature.properties?.osm_id === selectedVillageId
    
    const markerStyle = {
      ...defaultPointStyle,
      ...style,
      radius: isSelected ? 5 : 3,
      fillColor: isSelected ? '#4F46E5' : (style?.fillColor || '#ef4444'),
      weight: isSelected ? 2 : 1,
    }

    return L.circleMarker(latlng, markerStyle)
  }, [selectedVillageId, style])

  // Event handlers for each feature
  const onEachFeature = useCallback((feature, layer) => {
    // Click handler
    layer.on('click', () => {
      if (onVillageClick) {
        onVillageClick(feature)
      }
    })

    // Popup content
    if (showPopups) {
      const name = feature.properties?.name || 'Village sans nom'
      const altName = feature.properties?.other_tags?.match(/alt_name[^"]*"([^"]+)"/)?.[1]
      
      layer.bindPopup(`
        <div class="village-popup">
          <h3 class="font-bold text-lg">${name}</h3>
          ${altName ? `<p class="text-sm text-gray-500">${altName}</p>` : ''}
          <p class="text-xs text-gray-500 dark:text-slate-400 mt-1">
            ${feature.geometry.coordinates[1].toFixed(4)}, ${feature.geometry.coordinates[0].toFixed(4)}
          </p>
        </div>
      `, {
        className: 'village-popup-container'
      })
    }

    // Hover effects
    layer.on('mouseover', () => {
      layer.setStyle({
        fillOpacity: 1,
        radius: 4,
      })
    })

    layer.on('mouseout', () => {
      const isSelected = feature.properties?.osm_id === selectedVillageId
      layer.setStyle({
        fillOpacity: 0.8,
        radius: isSelected ? 5 : 3,
      })
    })
  }, [onVillageClick, showPopups, selectedVillageId])

  if (!visible || isLoading || error || !filteredData) {
    return null
  }

  // For performance, render CircleMarkers directly instead of GeoJSON layer
  // when there are many features
  if (visibleFeatures.length > 0 && visibleFeatures.length < 2000) {
    return (
      <>
        {visibleFeatures.map((feature, index) => {
          const [lng, lat] = feature.geometry.coordinates
          const isSelected = feature.properties?.osm_id === selectedVillageId
          const name = feature.properties?.name || 'Village sans nom'

          return (
            <CircleMarker
              key={feature.properties?.osm_id || index}
              center={[lat, lng]}
              radius={isSelected ? 5 : 3}
              pathOptions={{
                fillColor: isSelected ? '#4F46E5' : (style?.fillColor || '#ef4444'),
                color: '#fff',
                weight: isSelected ? 2 : 1,
                opacity: 1,
                fillOpacity: 0.8,
              }}
              eventHandlers={{
                click: () => onVillageClick?.(feature),
              }}
            >
              {showPopups && (
                <Popup>
                  <div className="village-popup">
                    <h3 className="font-bold text-lg">{name}</h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                      {lat.toFixed(4)}, {lng.toFixed(4)}
                    </p>
                  </div>
                </Popup>
              )}
            </CircleMarker>
          )
        })}
      </>
    )
  }

  // Fallback to GeoJSON layer for very large datasets
  return (
    <GeoJSON
      data={{
        type: 'FeatureCollection',
        features: visibleFeatures
      }}
      pointToLayer={pointToLayer}
      onEachFeature={onEachFeature}
    />
  )
}

export default GeoJSONVillagesLayer
