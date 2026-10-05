import { useEffect, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useGeoJSON } from '../../hooks/useGeoJSON'
import { fetchVoronoiDiagram } from '../../services/voronoiService'
import { useLanguage } from '../../i18n'

// Default URLs for Voronoi data
const VORONOI_CLIPPED_URL = '/data/villages_voronoi_clipped.geojson'
const VORONOI_ORIGINAL_URL = '/data/villages_voronoi.geojson'

/**
 * VoronoiLayer Component
 * 
 * Displays Voronoi polygons on the map. Supports multiple data sources:
 * - Clipped GeoJSON file (default, recommended - clipped to Cameroon boundaries)
 * - Original GeoJSON file (fallback)
 * - API endpoint
 * 
 * @param {string} url - Custom URL for Voronoi GeoJSON (optional)
 * @param {boolean} useAPI - If true, fetch from API instead of file
 * @param {boolean} useClipped - If true, use clipped version (default: true)
 * @param {boolean} visible - Show/hide the layer
 * @param {object} style - Custom styling for polygons
 */
const VoronoiLayer = ({ 
  url, 
  useAPI = false,
  useClipped = true,
  visible = true, 
  style = {} 
}) => {
  const map = useMap()
  const { isFrench } = useLanguage()
  const [apiData, setApiData] = useState(null)
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [useFallback, setUseFallback] = useState(false)
  
  // Determine which URL to use
  const effectiveUrl = url || (useClipped ? VORONOI_CLIPPED_URL : VORONOI_ORIGINAL_URL)
  
  // Load from file if URL is provided
  const { data: fileData, isLoading: fileLoading, error: fileError } = useGeoJSON(effectiveUrl)
  
  // Fallback to original if clipped file fails
  const { data: fallbackData } = useGeoJSON(useFallback ? VORONOI_ORIGINAL_URL : null)
  
  // Handle fallback when clipped file is not available
  useEffect(() => {
    if (fileError && useClipped && !url) {
      console.warn('Clipped Voronoi file not found, falling back to original')
      setUseFallback(true)
    }
  }, [fileError, useClipped, url])
  
  // Determine which data source to use
  const voronoiData = useAPI ? apiData : (fileData || fallbackData)
  const isLoading = useAPI ? apiLoading : fileLoading
  const error = useAPI ? apiError : (fileError && !fallbackData ? fileError : null)
  
  // Fetch from API if useAPI is true
  useEffect(() => {
    if (!useAPI) return
    
    const loadFromAPI = async () => {
      setApiLoading(true)
      try {
        const response = await fetchVoronoiDiagram()
        setApiData(response.data)
        setApiError(null)
      } catch (err) {
        setApiError(err)
        console.error('Failed to load Voronoi from API:', err)
      } finally {
        setApiLoading(false)
      }
    }
    
    loadFromAPI()
  }, [useAPI])

  useEffect(() => {
    if (!map || !voronoiData || !visible) return

    // Default style for Voronoi polygons
    const defaultStyle = {
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      color: '#2563eb',
      weight: 2,
      ...style
    }

    // Create GeoJSON layer
    const voronoiLayer = L.geoJSON(voronoiData, {
      style: (feature) => {
        return defaultStyle
      },
      onEachFeature: (feature, layer) => {
        // Add popup with polygon info if available
        if (feature.properties) {
          const props = feature.properties
          let popupContent = '<div class="p-2">'
          popupContent += `<h3 class="font-bold text-sm mb-1">${isFrench ? 'Polygone Voronoi' : 'Voronoi Polygon'}</h3>`
          
          // Support both 'name' and 'village_name' properties
          const villageName = props.village_name || props.name
          if (villageName) {
            popupContent += `<p class="text-xs"><strong>Village:</strong> ${villageName}</p>`
          }
          if (props.area) {
            const areaValue = typeof props.area === 'number' ? props.area.toFixed(2) : props.area
            popupContent += `<p class="text-xs"><strong>Surface:</strong> ${areaValue} km²</p>`
          }
          if (props.clipped) {
            popupContent += `<p class="text-xs text-green-600"><em>✓ Clipped to Cameroon</em></p>`
          }
          
          popupContent += '</div>'
          layer.bindPopup(popupContent)
        }

        // Hover effect
        layer.on({
          mouseover: (e) => {
            const layer = e.target
            layer.setStyle({
              fillOpacity: 0.3,
              weight: 3
            })
          },
          mouseout: (e) => {
            voronoiLayer.resetStyle(e.target)
          }
        })
      }
    })

    // Add layer to map
    voronoiLayer.addTo(map)

    // Cleanup
    return () => {
      map.removeLayer(voronoiLayer)
    }
  }, [map, voronoiData, visible, style])

  // Show loading or error states in console
  useEffect(() => {
    if (isLoading) {
      console.log('Chargement des polygones Voronoi...')
    }
    if (error) {
      console.error('Erreur de chargement Voronoi:', error)
    }
  }, [isLoading, error])

  return null
}

export default VoronoiLayer
