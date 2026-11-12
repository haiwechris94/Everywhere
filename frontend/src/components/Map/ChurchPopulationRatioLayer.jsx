import { useState, useEffect, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { churchPopulationRatioApi } from '../../services/api'

/**
 * Church Population Ratio color scale
 * Based on churches per person ratio
 */
const RATIO_COLORS = {
  brightGreen: '#00FF00',  // 1:1000 or better
  teal: '#008080',         // 1:5000 to 1:1000
  lightGreen: '#90EE90',   // 1:25000 to 1:5000
  yellow: '#FFFF00',       // 1:50000 to 1:25000
  orange: '#FFA500',       // 1:100000 to 1:50000
  gray: '#CCCCCC'          // No data or worse than 1:100000
}

/**
 * Get color based on church-to-population ratio
 * @param {number} ratio - Churches per person (e.g., 1/100000 = 0.00001)
 * @returns {string} Hex color code
 */
const getColorByRatio = (ratio) => {
  if (!ratio || ratio === 0) return RATIO_COLORS.gray
  if (ratio >= 1/1000) return RATIO_COLORS.brightGreen
  if (ratio >= 1/5000) return RATIO_COLORS.teal
  if (ratio >= 1/25000) return RATIO_COLORS.lightGreen
  if (ratio >= 1/50000) return RATIO_COLORS.yellow
  if (ratio >= 1/100000) return RATIO_COLORS.orange
  return RATIO_COLORS.gray
}

/**
 * Get ratio category label
 * @param {number} ratio - Churches per person
 * @returns {string} Category label
 */
const getRatioCategory = (ratio) => {
  if (!ratio || ratio === 0) return 'Pas de données'
  if (ratio >= 1/1000) return '1:1000+'
  if (ratio >= 1/5000) return '1:5000'
  if (ratio >= 1/25000) return '1:25000'
  if (ratio >= 1/50000) return '1:50000'
  if (ratio >= 1/100000) return '1:100000'
  return 'Pas de données'
}

// Debug logging helper
const DEBUG = false
const debugLog = (message, data = null) => {
  if (DEBUG) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12)
    if (data) {
      console.log(`[ChurchPopulationRatioLayer ${timestamp}] ${message}`, data)
    } else {
      console.log(`[ChurchPopulationRatioLayer ${timestamp}] ${message}`)
    }
  }
}

/**
 * ChurchPopulationRatioLayer Component
 * Displays a choropleth overlay on administrative boundaries showing
 * the church-to-population ratio for each region or department.
 * 
 * @param {Object} props
 * @param {Object} props.adminData - GeoJSON data for administrative boundaries
 * @param {boolean} props.visible - Whether the layer is visible
 * @param {number} props.adminLevel - Admin level (1 for regions, 2 for departments)
 * @param {Function} props.onDataLoaded - Callback when ratio data is loaded
 */
const ChurchPopulationRatioLayer = ({ 
  adminData, 
  visible, 
  adminLevel = 1,
  onDataLoaded
}) => {
  const map = useMap()
  const [ratioData, setRatioData] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch ratio data when admin level changes or layer becomes visible
  useEffect(() => {
    const fetchRatioData = async () => {
      if (!visible) return
      
      debugLog(`Fetching ratio data for admin level ${adminLevel}`)
      setLoading(true)
      setError(null)
      
      try {
        const response = adminLevel === 1 
          ? await churchPopulationRatioApi.getAdmin1()
          : await churchPopulationRatioApi.getAdmin2()
        
        debugLog('API Response:', response.data)
        
        // Create a map of admin name -> ratio data
        const dataMap = {}
        if (response.data?.data) {
          response.data.data.forEach(item => {
            dataMap[item.adminName] = item
            // Also add lowercase version for case-insensitive matching
            dataMap[item.adminName.toLowerCase()] = item
          })
        }
        
        setRatioData(dataMap)
        
        if (onDataLoaded) {
          onDataLoaded(response.data)
        }
      } catch (err) {
        console.error('Error fetching church population ratio data:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    
    fetchRatioData()
  }, [visible, adminLevel, onDataLoaded])

  // Filter features based on admin level
  const filteredFeatures = useMemo(() => {
    if (!adminData?.features) return []
    
    return adminData.features.filter(feature => {
      const props = feature.properties || {}
      
      if (adminLevel === 1) {
        // Admin 1 (Régions): NAME_1 is defined, NAME_2 and NAME_3 are null
        return props.NAME_1 && !props.NAME_2 && !props.NAME_3
      } else if (adminLevel === 2) {
        // Admin 2 (Départements): NAME_2 is defined, NAME_3 is null
        return props.NAME_2 && !props.NAME_3
      }
      
      return false
    })
  }, [adminData, adminLevel])

  // Create the choropleth layer
  useEffect(() => {
    if (!map || !visible || filteredFeatures.length === 0) {
      debugLog('Skipping layer creation - conditions not met')
      return
    }

    debugLog(`Creating choropleth layer with ${filteredFeatures.length} features`)

    const filteredData = {
      type: 'FeatureCollection',
      features: filteredFeatures
    }

    const layer = L.geoJSON(filteredData, {
      style: (feature) => {
        const props = feature.properties || {}
        
        // Get the admin name based on level
        const adminName = adminLevel === 1 ? props.NAME_1 : props.NAME_2
        
        // Look up ratio data
        const data = ratioData[adminName] || ratioData[adminName?.toLowerCase()]
        const ratio = data?.ratio || 0
        const color = getColorByRatio(ratio)
        
        debugLog(`Styling ${adminName}: ratio=${ratio}, color=${color}`)
        
        return {
          fillColor: color,
          fillOpacity: 0.5,
          color: '#333333',
          weight: 2,
          opacity: 0.8
        }
      },
      onEachFeature: (feature, featureLayer) => {
        const props = feature.properties || {}
        const adminName = adminLevel === 1 ? props.NAME_1 : props.NAME_2
        const data = ratioData[adminName] || ratioData[adminName?.toLowerCase()]
        
        // Create popup content
        const popupContent = `
          <div class="p-3 min-w-[250px]">
            <h3 class="font-bold text-base mb-2">${adminName || 'Sans nom'}</h3>
            <p class="text-xs text-gray-500 mb-2">${adminLevel === 1 ? 'Région' : 'Département'}</p>
            
            ${data ? `
              <div class="space-y-2 border-t pt-2">
                <div class="flex items-center gap-2">
                  <span class="w-4 h-4 rounded" style="background-color: ${data.color}"></span>
                  <span class="font-medium">${data.category}</span>
                </div>
                <div class="text-sm text-gray-600 space-y-1">
                  <p><strong>Ratio:</strong> ${data.ratioDisplay}</p>
                  <p><strong>Églises:</strong> ${data.churchCount?.toLocaleString() || 0}</p>
                  <p><strong>Population:</strong> ${data.populationCount?.toLocaleString() || 0}</p>
                  <p><strong>Groupes de peuples:</strong> ${data.peopleGroupCount || 0}</p>
                </div>
              </div>
            ` : `
              <div class="text-sm text-gray-500 italic">
                Pas de données disponibles
              </div>
            `}
          </div>
        `
        
        featureLayer.bindPopup(popupContent)
        
        // Hover effects
        featureLayer.on({
          mouseover: (e) => {
            e.target.setStyle({
              fillOpacity: 0.7,
              weight: 3
            })
          },
          mouseout: (e) => {
            layer.resetStyle(e.target)
          }
        })
      }
    })

    layer.addTo(map)
    debugLog('Layer added to map')

    return () => {
      map.removeLayer(layer)
      debugLog('Layer removed from map')
    }
  }, [map, visible, filteredFeatures, ratioData, adminLevel])

  return null
}

/**
 * ChurchPopulationRatioLegend Component
 * Displays the color legend for the church population ratio choropleth
 * 
 * @param {Object} props
 * @param {boolean} props.visible - Whether the legend is visible
 * @param {string} props.className - Additional CSS classes
 */
export const ChurchPopulationRatioLegend = ({ visible, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(true)

  if (!visible) return null

  const legendItems = [
    { color: RATIO_COLORS.brightGreen, label: '1:1000 ou mieux', description: 'Excellente couverture' },
    { color: RATIO_COLORS.teal, label: '1:5000 à 1:1000', description: 'Bonne couverture' },
    { color: RATIO_COLORS.lightGreen, label: '1:25000 à 1:5000', description: 'Couverture modérée' },
    { color: RATIO_COLORS.yellow, label: '1:50000 à 1:25000', description: 'Faible couverture' },
    { color: RATIO_COLORS.orange, label: '1:100000 à 1:50000', description: 'Très faible couverture' },
    { color: RATIO_COLORS.gray, label: 'Pas de données', description: 'Données insuffisantes' }
  ]

  return (
    <div className={`bg-white rounded-lg shadow-lg overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors duration-200 dark:hover:bg-slate-700"
      >
        <h4 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
          Ratio Églises/Population
        </h4>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${
            isExpanded ? 'rotate-0' : '-rotate-90'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Content */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-3 pb-3 space-y-2">
          {legendItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <span 
                className="w-4 h-4 rounded border border-gray-300 flex-shrink-0 dark:border-slate-700"
                style={{ backgroundColor: item.color }}
              ></span>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-gray-700 font-medium dark:text-slate-300">{item.label}</span>
                <span className="text-xs text-gray-500 ml-1">({item.description})</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * ChurchPopulationRatioStats Component
 * Displays summary statistics for the church population ratio data
 * 
 * @param {Object} props
 * @param {Object} props.data - Summary data from the API
 * @param {boolean} props.visible - Whether the stats are visible
 */
export const ChurchPopulationRatioStats = ({ data, visible }) => {
  if (!visible || !data?.summary) return null

  const { summary } = data

  return (
    <div className="bg-white rounded-lg shadow-lg p-3 space-y-2 dark:bg-slate-800">
      <h4 className="text-sm font-semibold text-gray-800 border-b pb-2 dark:text-slate-100">
        Statistiques Globales
      </h4>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-500">Total Églises:</span>
          <span className="font-medium ml-1">{summary.totalChurches?.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-gray-500">Population:</span>
          <span className="font-medium ml-1">{summary.totalPopulation?.toLocaleString()}</span>
        </div>
        <div className="col-span-2">
          <span className="text-gray-500">Ratio Global:</span>
          <span className="font-medium ml-1">{summary.overallRatioDisplay}</span>
          <span 
            className="inline-block w-3 h-3 rounded ml-2"
            style={{ backgroundColor: summary.overallColor }}
          ></span>
        </div>
      </div>
    </div>
  )
}

export default ChurchPopulationRatioLayer
