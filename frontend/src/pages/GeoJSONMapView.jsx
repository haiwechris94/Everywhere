import { useState, useEffect, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, useMap, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import VillageStatusLayer, { VillageStatusLegend, VillageStatusStats } from '../components/Map/VillageStatusLayer'
import { useGeoJSON, getGeoJSONBounds } from '../hooks/useGeoJSON'
import { villagesApi } from '../services/api'
import { peopleGroupsApi } from '../services/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Search, X, MapPin, Navigation, Maximize2, Loader2, AlertCircle, 
  ChevronLeft, ChevronRight, Eye, EyeOff,
  ChevronDown, RefreshCw,
  Users, Church, ExternalLink, Plus
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '../i18n'
import { useNavigate } from 'react-router-dom'
import { initSocket, subscribeToVillageStatusUpdates, subscribeToPeopleGroupUpdates } from '../services/socket'
import { SUPPORTED_COUNTRIES, getCountryConfig, DEFAULT_COUNTRY, COUNTRIES_WITH_OSM_VILLAGES } from '../config/supportedCountries'

// Status colors for people groups
const ENGAGEMENT_STATUS_COLORS = {
  unreached: 'bg-red-500',
  pioneer: 'bg-yellow-500',
  midway: 'bg-blue-500',
  'tipping-point': 'bg-orange-500',
  dmm: 'bg-green-500',
}

const ENGAGEMENT_STATUS_LABELS = {
  unreached: 'Unreached',
  pioneer: 'Pioneer',
  midway: 'Midway',
  'tipping-point': 'Tipping Point',
  dmm: 'DMM',
}

// Village People Groups Modal Component
// Now supports both villages (Admin 3) and admin areas (Admin 1/2 - regions/departments)
const VillagePeopleGroupsModal = ({ isOpen, onClose, villageName, polygon, adminLevel, isAdminArea }) => {
  const navigate = useNavigate()
  const [peopleGroups, setPeopleGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  useEffect(() => {
    if (isOpen && villageName) {
      fetchPeopleGroups()
    }
  }, [isOpen, villageName, polygon, adminLevel, isAdminArea])
  
  const fetchPeopleGroups = async () => {
    setLoading(true)
    setError(null)
    
    try {
      let response
      
      if (isAdminArea && adminLevel) {
        // For Admin 1 (regions) or Admin 2 (departments), fetch by region/department name
        if (adminLevel === 1) {
          // Fetch people groups by region
          response = await peopleGroupsApi.getAll({ region: villageName, limit: 100 })
        } else if (adminLevel === 2) {
          // Fetch people groups by department
          response = await peopleGroupsApi.getAll({ department: villageName, limit: 100 })
        }
        
        // If no results by name and we have a polygon, try spatial query
        if ((!response?.data?.peopleGroups || response.data.peopleGroups.length === 0) && polygon) {
          response = await peopleGroupsApi.getByPolygon(polygon, villageName)
        }
      } else {
        // For villages (Admin 3), use the existing logic
        response = await peopleGroupsApi.getByVillage(villageName)
        
        // If no results and we have a polygon, try spatial query
        if (response.data?.total === 0 && polygon) {
          response = await peopleGroupsApi.getByPolygon(polygon, villageName)
        }
      }
      
      setPeopleGroups(response?.data?.peopleGroups || [])
    } catch (err) {
      console.error('Error fetching people groups:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  
  if (!isOpen) return null
  
  // Determine the title based on admin level
  const getTitle = () => {
    if (isAdminArea) {
      if (adminLevel === 1) return `Peuples dans la région ${villageName}`
      if (adminLevel === 2) return `Peuples dans le département ${villageName}`
    }
    return `Peuples dans ${villageName}`
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-primary-50 to-blue-50 rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users size={20} className="text-primary-600" />
              {getTitle()}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {loading ? 'Chargement...' : `${peopleGroups.length} groupe(s) de peuples trouvé(s)`}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-gray-600">{error}</p>
              <button 
                onClick={fetchPeopleGroups}
                className="mt-4 btn-primary"
              >
                Réessayer
              </button>
            </div>
          ) : peopleGroups.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">{isFrench ? 'Aucun peuple trouvé' : 'No people group found'}</p>
              <p className="text-sm text-gray-400 mt-2">
                Aucun groupe de peuples n'est enregistré dans ce village.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {peopleGroups.map((pg) => (
                <div 
                  key={pg._id}
                  className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${ENGAGEMENT_STATUS_COLORS[pg.engagementStatus] || ENGAGEMENT_STATUS_COLORS.pioneer}`}></span>
                        <h3 className="font-semibold text-gray-900">{pg.name}</h3>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <span className="font-medium">Statut:</span>
                          {ENGAGEMENT_STATUS_LABELS[pg.engagementStatus] || pg.engagementStatus}
                          {pg.engagementLevel && (
                            <span className="bg-gray-200 px-1.5 py-0.5 rounded text-xs ml-1">
                              Niveau {pg.engagementLevel}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          <Church size={14} className="text-gray-400" />
                          {pg.numberOfChurches || pg.eglises || 0} églises
                        </span>
                        {(pg.churchGeneration || pg.generations) > 0 && (
                          <span className="text-gray-400">
                            (Gén. {pg.churchGeneration || pg.generations})
                          </span>
                        )}
                      </div>
                      {pg.description && (
                        <p className="mt-2 text-sm text-gray-500 line-clamp-2">{pg.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => navigate(`/people-groups/${pg._id}`)}
                      className="ml-4 p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title={isFrench ? 'Voir les détails' : 'View details'}
                    >
                      <ExternalLink size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full btn-secondary"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// Add People Group Modal Component
const AddPeopleGroupModal = ({ isOpen, onClose, villageName, polygon, onSuccess }) => {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    name: '',
    villageName: villageName || '',
    numberOfChurches: 0,
    churchGeneration: 0,
    engagementStatus: 'pioneer',
    engagementLevel: '',
    description: '',
    population: 0,
    country: 'Cameroon',
    countryCode: 'CM',
  })
  
  // Reset form and update villageName when modal opens with a new village
  // This ensures the people group is added to the specific clicked village
  useEffect(() => {
    if (isOpen && villageName) {
      setFormData({
        name: '',
        villageName: villageName,
        numberOfChurches: 0,
        churchGeneration: 0,
        engagementStatus: 'pioneer',
        engagementLevel: '',
        description: '',
        population: 0,
        country: 'Cameroon',
        countryCode: 'CM',
      })
    }
  }, [isOpen, villageName])
  
  // Calculate DMM status based on churches and generation
  const calculateDmmStatus = (churches, generation) => {
    const numChurches = parseInt(churches) || 0
    const numGeneration = parseInt(generation) || 0
    
    if (numGeneration >= 4 && numChurches >= 100) {
      return { status: 'dmm', level: 'IV' }
    } else if (numGeneration >= 4 || numChurches >= 100) {
      return { status: 'tipping-point', level: 'III' }
    } else if (numGeneration >= 2 || numChurches >= 10) {
      return { status: 'midway', level: 'II' }
    } else if (numChurches >= 1) {
      return { status: 'pioneer', level: 'I' }
    }
    return { status: 'unreached', level: '' }
  }
  
  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data) => peopleGroupsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['peopleGroups'])
      toast.success(isFrench ? 'Groupe de peuple ajouté avec succès !' : 'People group added successfully!')
      if (onSuccess) onSuccess()
      onClose()
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || "Erreur lors de l'ajout")
    },
  })
  
  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Calculate status based on churches and generation
    const { status, level } = calculateDmmStatus(formData.numberOfChurches, formData.churchGeneration)
    
    // Get centroid of polygon for location
    let location = null
    if (polygon?.coordinates) {
      const centroid = getPolygonCentroid(polygon.coordinates)
      if (centroid) {
        location = { type: 'Point', coordinates: centroid }
      }
    }
    
    createMutation.mutate({
      ...formData,
      numberOfChurches: parseInt(formData.numberOfChurches) || 0,
      churchGeneration: parseInt(formData.churchGeneration) || 0,
      population: parseInt(formData.population) || 0,
      engagementStatus: status,
      engagementLevel: level,
      location,
    })
  }
  
  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }
  
  if (!isOpen) return null
  
  const calculatedStatus = calculateDmmStatus(formData.numberOfChurches, formData.churchGeneration)
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Plus size={20} className="text-green-600" />
              Ajouter un groupe de peuples
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Village: {villageName}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom du groupe de peuples *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder={isFrench ? 'Ex : Peuple Bamiléké' : 'e.g. Bamileke people group'}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Village
            </label>
            <input
              type="text"
              name="villageName"
              value={formData.villageName}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
              readOnly
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Population
            </label>
            <input
              type="number"
              name="population"
              min="0"
              value={formData.population}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="Ex: 50000"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre d'églises
              </label>
              <input
                type="number"
                name="numberOfChurches"
                min="0"
                value={formData.numberOfChurches}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Génération d'église
              </label>
              <input
                type="number"
                name="churchGeneration"
                min="0"
                value={formData.churchGeneration}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="1, 2, 3..."
              />
            </div>
          </div>
          
          {/* Auto-calculated Status Preview */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Statut calculé automatiquement:</p>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${ENGAGEMENT_STATUS_COLORS[calculatedStatus.status]}`}></span>
              <span className="font-semibold">{ENGAGEMENT_STATUS_LABELS[calculatedStatus.status]}</span>
              {calculatedStatus.level && (
                <span className="bg-gray-200 px-2 py-0.5 rounded text-xs">
                  Niveau {calculatedStatus.level}
                </span>
              )}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder={isFrench ? 'Description du groupe de peuple...' : 'People group description...'}
            />
          </div>
          
          {/* Footer */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Ajout...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Ajouter
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Fix Leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Map controller for programmatic control
const MapController = ({ bounds, center, zoom }) => {
  const map = useMap()
  
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 })
    } else if (center) {
      map.flyTo(center, zoom || 10)
    }
  }, [bounds, center, zoom, map])
  
  return null
}

// Component to track map stats
const MapStats = ({ onStatsUpdate }) => {
  const map = useMap()
  
  useEffect(() => {
    const updateStats = () => {
      const bounds = map.getBounds()
      const zoom = map.getZoom()
      const center = map.getCenter()
      onStatsUpdate({ bounds, zoom, center })
    }
    
    updateStats()
    map.on('moveend', updateStats)
    map.on('zoomend', updateStats)
    
    return () => {
      map.off('moveend', updateStats)
      map.off('zoomend', updateStats)
    }
  }, [map, onStatsUpdate])
  
  return null
}

// Component to handle map resize when sidebar is toggled
const MapResizeHandler = ({ sidebarOpen }) => {
  const map = useMap()
  
  useEffect(() => {
    // Wait for CSS transition to complete (300ms) then invalidate map size
    const timeoutId = setTimeout(() => {
      map.invalidateSize({ animate: true })
    }, 350) // Slightly longer than the 300ms transition
    
    return () => clearTimeout(timeoutId)
  }, [sidebarOpen, map])
  
  return null
}

// Helper function to check if a point is inside a polygon (ray casting algorithm)
const isPointInPolygon = (point, polygon) => {
  const [x, y] = point
  let inside = false
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  
  return inside
}

// Helper function to check if a point is inside a MultiPolygon
const isPointInMultiPolygon = (point, multiPolygon) => {
  for (const polygon of multiPolygon) {
    // Check outer ring (first element)
    if (isPointInPolygon(point, polygon[0])) {
      // Check if point is in any holes (remaining elements)
      let inHole = false
      for (let i = 1; i < polygon.length; i++) {
        if (isPointInPolygon(point, polygon[i])) {
          inHole = true
          break
        }
      }
      if (!inHole) return true
    }
  }
  return false
}

// Helper function to get centroid of a polygon
const getPolygonCentroid = (coordinates) => {
  if (!coordinates || !coordinates.length) return null
  
  // Handle different geometry types
  let ring = coordinates
  
  // If it's a Polygon, get the outer ring
  if (Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
    ring = coordinates[0]
  }
  
  // If it's a MultiPolygon, get the first polygon's outer ring
  if (Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0]) && Array.isArray(coordinates[0][0][0])) {
    ring = coordinates[0][0]
  }
  
  if (!ring || !ring.length) return null
  
  let sumX = 0, sumY = 0
  for (const coord of ring) {
    sumX += coord[0]
    sumY += coord[1]
  }
  
  return [sumX / ring.length, sumY / ring.length]
}

// Helper function to check if a village centroid is within an admin boundary
const isVillageInAdminBoundary = (villageCentroid, adminFeature) => {
  if (!villageCentroid || !adminFeature?.geometry) return false
  
  const geomType = adminFeature.geometry.type
  const coords = adminFeature.geometry.coordinates
  
  if (geomType === 'Polygon') {
    return isPointInPolygon(villageCentroid, coords[0])
  } else if (geomType === 'MultiPolygon') {
    return isPointInMultiPolygon(villageCentroid, coords)
  }
  
  return false
}

// Administrative Boundary Layer Component
// Uses NAME_1 (Region), NAME_2 (Department), NAME_3 (Arrondissement) from GADM data
// Filters features to show only the appropriate admin level:
// - Admin 1 (Régions): Features where NAME_2 and NAME_3 are null (only 10 regions)
// - Admin 2 (Départements): Features where NAME_2 is defined but NAME_3 is null
// - Admin 3 (Arrondissements): Features where NAME_3 is defined
const AdminBoundaryLayer = ({ data, visible, level, style }) => {
  const map = useMap()
  
  // Filter features based on admin level
  const filteredFeatures = useMemo(() => {
    if (!data?.features) return []
    
    return data.features.filter(feature => {
      const props = feature.properties || {}
      
      if (level === 1) {
        // Admin 1 (Régions): NAME_1 is defined, NAME_2 and NAME_3 are null
        // These are the 10 main regions of Cameroon
        return props.NAME_1 && !props.NAME_2 && !props.NAME_3
      } else if (level === 2) {
        // Admin 2 (Départements): NAME_2 is defined, NAME_3 is null
        return props.NAME_1 && props.NAME_2 && !props.NAME_3
      } else if (level === 3) {
        // Admin 3 (Arrondissements): NAME_3 is defined
        return props.NAME_1 && props.NAME_2 && props.NAME_3
      } else if (level === 4) {
        // Admin 4 (Villages): All features from villages boundary data
        return true
      }
      return false
    })
  }, [data, level])
  
  useEffect(() => {
    if (!map || !filteredFeatures.length || !visible) return
    
    const defaultStyle = {
      fillColor: level === 1 ? '#f59e0b' : level === 2 ? '#10b981' : level === 3 ? '#8b5cf6' : '#ec4899',
      fillOpacity: 0.05,
      color: level === 1 ? '#d97706' : level === 2 ? '#059669' : level === 3 ? '#7c3aed' : '#db2777',
      weight: level === 1 ? 3 : level === 2 ? 2 : 1.5,
      dashArray: level === 4 ? '5, 5' : null,
      ...style
    }
    
    // Create GeoJSON data with filtered features
    const filteredData = {
      type: 'FeatureCollection',
      features: filteredFeatures
    }
    
    const layer = L.geoJSON(filteredData, {
      style: () => defaultStyle,
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {}
        
        // Get name based on admin level (GADM format: NAME_1, NAME_2, NAME_3)
        let name = 'Sans nom'
        let type = ''
        
        if (level === 1) {
          name = props.NAME_1 || props.name || 'Sans nom'
          type = props.TYPE_1 || 'Région'
        } else if (level === 2) {
          name = props.NAME_2 || props.name || 'Sans nom'
          type = props.TYPE_2 || 'Département'
        } else if (level === 3) {
          name = props.NAME_3 || props.name || 'Sans nom'
          type = props.TYPE_3 || 'Arrondissement'
        } else {
          name = props.name || props.NAME || 'Sans nom'
          type = 'Village'
        }
        
        let popupContent = `<div class="p-2">
          <h3 class="font-bold text-sm mb-1">${name}</h3>
          <p class="text-xs text-gray-600">${type}</p>
          ${props.NAME_1 && level > 1 ? `<p class="text-xs text-gray-500">Région: ${props.NAME_1}</p>` : ''}
          ${props.NAME_2 && level > 2 ? `<p class="text-xs text-gray-500">Département: ${props.NAME_2}</p>` : ''}
        </div>`
        
        layer.bindPopup(popupContent)
        
        layer.on({
          mouseover: (e) => {
            e.target.setStyle({
              fillOpacity: 0.2,
              weight: defaultStyle.weight + 1
            })
          },
          mouseout: (e) => {
            e.target.setStyle(defaultStyle)
          }
        })
      }
    })
    
    layer.addTo(map)
    
    return () => {
      map.removeLayer(layer)
    }
  }, [map, filteredFeatures, visible, level, style])
  
  return null
}

// Voronoi Layer with Cameroon Clipping
const VoronoiClippedLayer = ({ data, cameroonBoundary, visible, style, onPolygonClick }) => {
  const map = useMap()
  
  useEffect(() => {
    if (!map || !data || !visible) return
    
    const defaultStyle = {
      fillColor: '#3b82f6',
      fillOpacity: 0.15,
      color: '#2563eb',
      weight: 2,
      ...style
    }
    
    // Create the Voronoi layer
    const voronoiLayer = L.geoJSON(data, {
      style: (feature) => {
        // Color based on area if available
        const area = feature.properties?.area || 0
        let fillColor = defaultStyle.fillColor
        
        if (area > 100) fillColor = '#ef4444' // Large - red
        else if (area > 50) fillColor = '#f97316' // Medium-large - orange
        else if (area > 20) fillColor = '#eab308' // Medium - yellow
        else if (area > 10) fillColor = '#22c55e' // Small-medium - green
        else fillColor = '#3b82f6' // Small - blue
        
        return { ...defaultStyle, fillColor }
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {}
        const name = props.village_name || props.name || props.point_name || 'Polygone Voronoi'
        const area = props.area ? `${props.area.toFixed(2)} km²` : 'N/A'
        const isClipped = props.clipped || props.is_clipped
        
        let popupContent = `<div class="p-2">
          <h3 class="font-bold text-sm mb-1">${name}</h3>
          <p class="text-xs"><strong>Surface:</strong> ${area}</p>
          ${isClipped ? '<p class="text-xs text-green-600">✓ Limité aux frontières du Cameroun</p>' : ''}
        </div>`
        
        layer.bindPopup(popupContent)
        
        layer.on({
          mouseover: (e) => {
            e.target.setStyle({
              fillOpacity: 0.35,
              weight: 3
            })
          },
          mouseout: (e) => {
            voronoiLayer.resetStyle(e.target)
          },
          click: () => {
            if (onPolygonClick) onPolygonClick(feature)
          }
        })
      }
    })
    
    voronoiLayer.addTo(map)
    
    return () => {
      map.removeLayer(voronoiLayer)
    }
  }, [map, data, cameroonBoundary, visible, style, onPolygonClick])
  
  return null
}

// Coverage Gaps Layer
const CoverageGapsLayer = ({ voronoiData, adminData, visible, minGapArea = 10 }) => {
  const map = useMap()
  const { isFrench } = useLanguage()
  
  // This would calculate gaps based on Voronoi coverage vs admin boundaries
  // For now, we'll highlight areas with large Voronoi cells as potential gaps
  
  useEffect(() => {
    if (!map || !voronoiData || !visible) return
    
    // Filter for large cells (potential coverage gaps)
    const gapFeatures = voronoiData.features?.filter(f => {
      const area = f.properties?.area || 0
      return area > minGapArea
    }) || []
    
    if (gapFeatures.length === 0) return
    
    const gapData = {
      type: 'FeatureCollection',
      features: gapFeatures
    }
    
    const gapLayer = L.geoJSON(gapData, {
      style: (feature) => {
        const area = feature.properties?.area || 0
        let severity = 'low'
        let fillColor = '#fef3c7'
        let borderColor = '#f59e0b'
        
        if (area > 100) {
          severity = 'critical'
          fillColor = '#fecaca'
          borderColor = '#ef4444'
        } else if (area > 50) {
          severity = 'high'
          fillColor = '#fed7aa'
          borderColor = '#f97316'
        } else if (area > 25) {
          severity = 'medium'
          fillColor = '#fef3c7'
          borderColor = '#eab308'
        }
        
        return {
          fillColor,
          fillOpacity: 0.3,
          color: borderColor,
          weight: 2,
          dashArray: '5, 5'
        }
      },
      onEachFeature: (feature, layer) => {
        const area = feature.properties?.area || 0
        let severity = 'Faible'
        if (area > 100) severity = 'Critique'
        else if (area > 50) severity = 'Élevé'
        else if (area > 25) severity = 'Modéré'
        
        layer.bindPopup(`<div class="p-2">
          <h3 class="font-bold text-sm mb-1 text-orange-600">⚠️ ${isFrench ? 'Zone de couverture faible' : 'Low coverage area'}</h3>
          <p class="text-xs"><strong>Surface:</strong> ${area.toFixed(2)} km²</p>
          <p class="text-xs"><strong>${isFrench ? 'Sévérité :' : 'Severity:'}</strong> ${severity}</p>
          <p class="text-xs text-gray-500 mt-1">${isFrench ? "Cette zone pourrait nécessiter plus d'églises" : 'This area may need more churches'}</p>
        </div>`)
      }
    })
    
    gapLayer.addTo(map)
    
    return () => {
      map.removeLayer(gapLayer)
    }
  }, [map, voronoiData, adminData, visible, minGapArea])
  
  return null
}

const GeoJSONMapView = () => {
  const { t, isFrench } = useLanguage()
  
  // State
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedVillage, setSelectedVillage] = useState(null)
  // Default to Nord region center coordinates and zoom level
  const [mapCenter, setMapCenter] = useState([9.3, 13.4]) // Nord region center
  const [mapZoom, setMapZoom] = useState(8) // Zoom level for Nord region
  const [fitBounds, setFitBounds] = useState(null)
  const [mapStats, setMapStats] = useState({ zoom: 6, center: null, bounds: null })
  
  // Village People Groups Modal state
  const [showPeopleGroupsModal, setShowPeopleGroupsModal] = useState(false)
  const [selectedVillageForModal, setSelectedVillageForModal] = useState({ name: '', polygon: null })
  
  // State for Add People Group modal
  const [showAddPeopleGroupModal, setShowAddPeopleGroupModal] = useState(false)
  const [villageForAddPeopleGroup, setVillageForAddPeopleGroup] = useState({ name: '', polygon: null })
  
  // Handle click on "Details" button in village popup
  useEffect(() => {
    const handleDetailsClick = (e) => {
      // Handle "View People Groups" button for villages (Admin 3)
      if (e.target.classList.contains('village-details-btn') || e.target.closest('.village-details-btn')) {
        const btn = e.target.classList.contains('village-details-btn') ? e.target : e.target.closest('.village-details-btn')
        const villageName = btn.dataset.villageName
        const polygonStr = btn.dataset.polygon
        
        let polygon = null
        try {
          polygon = polygonStr ? JSON.parse(decodeURIComponent(polygonStr)) : null
        } catch (err) {
          console.error('Error parsing polygon:', err)
        }
        
        setSelectedVillageForModal({ name: villageName, polygon })
        setShowPeopleGroupsModal(true)
      }
      
      // Handle "View People Groups" button for Admin 1/2 areas (regions/departments)
      if (e.target.classList.contains('admin-details-btn') || e.target.closest('.admin-details-btn')) {
        const btn = e.target.classList.contains('admin-details-btn') ? e.target : e.target.closest('.admin-details-btn')
        const areaName = btn.dataset.areaName
        const adminLevel = btn.dataset.adminLevel
        const polygonStr = btn.dataset.polygon
        
        let polygon = null
        try {
          polygon = polygonStr ? JSON.parse(decodeURIComponent(polygonStr)) : null
        } catch (err) {
          console.error('Error parsing polygon:', err)
        }
        
        // Use the same modal but with the admin area name
        // The modal will fetch people groups by region/department name
        setSelectedVillageForModal({ 
          name: areaName, 
          polygon,
          adminLevel: parseInt(adminLevel),
          isAdminArea: true
        })
        setShowPeopleGroupsModal(true)
      }
      
      // Handle "Add People Group" button
      if (e.target.classList.contains('add-people-group-btn') || e.target.closest('.add-people-group-btn')) {
        const btn = e.target.classList.contains('add-people-group-btn') ? e.target : e.target.closest('.add-people-group-btn')
        const villageName = btn.dataset.villageName
        const polygonStr = btn.dataset.polygon
        
        let polygon = null
        try {
          polygon = polygonStr ? JSON.parse(decodeURIComponent(polygonStr)) : null
        } catch (err) {
          console.error('Error parsing polygon:', err)
        }
        
        setVillageForAddPeopleGroup({ name: villageName, polygon })
        setShowAddPeopleGroupModal(true)
      }
    }
    
    document.addEventListener('click', handleDetailsClick)
    return () => document.removeEventListener('click', handleDetailsClick)
  }, [])
  
  // Layer visibility states - Simplified: removed admin toggles (now zoom-based)
  // showAdmin1-4 removed - DMM status now shows automatically based on zoom level
  // Legend toggle states
  const [legendExpanded, setLegendExpanded] = useState(false)
  const [statusLegendExpanded, setStatusLegendExpanded] = useState(false)
  
  // Village status statistics and refresh trigger
  const [villageStatusStats, setVillageStatusStats] = useState(null)
  const [villageStatusRefreshTrigger, setVillageStatusRefreshTrigger] = useState(0)
  
  
  /**
   * Trigger a refresh of village statuses
   * Call this when people groups are added/updated/deleted
   * to update the village status layer in real-time
   */
  const refreshVillageStatuses = useCallback(() => {
    console.log('[GeoJSONMapView] 🔄 refreshVillageStatuses called, incrementing trigger')
    setVillageStatusRefreshTrigger(prev => {
      const newValue = prev + 1
      console.log(`[GeoJSONMapView] 📊 villageStatusRefreshTrigger: ${prev} -> ${newValue}`)
      return newValue
    })
  }, [])
  
  // Socket.IO connection for real-time village status updates
  useEffect(() => {
    console.log('[GeoJSONMapView] 🔌 Initializing Socket.IO connection for village status updates...')
    
    // Initialize socket connection with auth token
    const token = localStorage.getItem('token')
    const socket = initSocket(token)
    console.log('[GeoJSONMapView] 🔌 Socket initialized:', socket?.id || 'pending', 'connected:', socket?.connected)
    
    // Subscribe to village status updates
    const unsubscribeVillage = subscribeToVillageStatusUpdates((data) => {
      console.log('[GeoJSONMapView] 🔌 Received village-status-updated event:', data)
      console.log('[GeoJSONMapView] 📍 Village name:', data.villageName)
      console.log('[GeoJSONMapView] 📊 Status:', data.status)
      
      // Trigger a refresh of the village status layer
      refreshVillageStatuses()
      
      // Show a toast notification
      if (data.villageName) {
        toast.success(`Village "${data.villageName}" status updated to ${data.status?.status || 'unknown'}`, {
          duration: 3000,
          icon: '🏘️'
        })
      }
    })
    
    // Subscribe to people group updates (added/updated)
    const unsubscribePeopleGroup = subscribeToPeopleGroupUpdates((event) => {
      console.log('[GeoJSONMapView] 🔌 Received people-group event:', event)
      
      // Trigger a refresh of the village status layer when people groups change
      refreshVillageStatuses()
      
      // Show a toast notification
      const actionText = event.type === 'added' ? 'ajouté' : 'mis à jour'
      const peopleName = event.data?.name || 'Groupe de peuples'
      toast.success(`${peopleName} ${actionText}`, {
        duration: 3000,
        icon: '👥'
      })
    })
    
    // Cleanup on unmount
    return () => {
      console.log('[GeoJSONMapView] 🔌 Cleaning up Socket.IO connection...')
      unsubscribeVillage()
      unsubscribePeopleGroup()
      // Don't disconnect socket here as other components might use it
    }
  }, [refreshVillageStatuses])
  
  // Country selection state - default to Cameroon
  const [selectedCountryCode, setSelectedCountryCode] = useState(DEFAULT_COUNTRY)
  const selectedCountryConfig = useMemo(() => getCountryConfig(selectedCountryCode), [selectedCountryCode])
  
  // Administrative filter states
  const [selectedCountry, setSelectedCountry] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [selectedArrondissement, setSelectedArrondissement] = useState('')
  
  // Filter panel state
  const [showFilters, setShowFilters] = useState(true)
  
  // Determine which admin file to load based on selected country
  const adminFilePath = useMemo(() => {
    if (!selectedCountryConfig) return null
    // Use the merged admin file if available, otherwise try GADM level 1
    if (selectedCountryConfig.adminFile) {
      return selectedCountryConfig.adminFile
    }
    // Fallback to GADM files if available
    if (selectedCountryConfig.gadmFiles) {
      // Load all GADM levels and merge them
      return selectedCountryConfig.gadmFiles[1] // Start with level 1
    }
    return null
  }, [selectedCountryConfig])
  
  // Load GeoJSON data - dynamically based on selected country
  // Only load villages if the country has a villagesFile defined (not null)
  // This prevents fallback to Cameroon data when a country explicitly has no villages
  const villagesFilePath = selectedCountryConfig?.villagesFile !== null 
    ? (selectedCountryConfig?.villagesFile || '/data/villages.geojson')
    : null
  const { data: villagesData, isLoading: villagesLoading, error: villagesError, refetch: refetchVillages } = useGeoJSON(
    villagesFilePath
  )
  const { data: adminData, isLoading: adminLoading } = useGeoJSON(adminFilePath)
  // Only load village boundaries if the country has a villagesBoundaryFile defined (not null)
  const villagesBoundaryFilePath = selectedCountryConfig?.villagesBoundaryFile !== null
    ? (selectedCountryConfig?.villagesBoundaryFile || '/data/Villages découpés.geojson')
    : null
  const { data: villagesBoundaryData } = useGeoJSON(
    villagesBoundaryFilePath
  )
  
  // Load additional GADM levels if needed (for countries without merged admin file)
  const { data: gadmLevel2Data } = useGeoJSON(
    !selectedCountryConfig?.adminFile && selectedCountryConfig?.gadmFiles?.[2] 
      ? selectedCountryConfig.gadmFiles[2] 
      : null
  )
  const { data: gadmLevel3Data } = useGeoJSON(
    !selectedCountryConfig?.adminFile && selectedCountryConfig?.gadmFiles?.[3] 
      ? selectedCountryConfig.gadmFiles[3] 
      : null
  )
  
  // Merge GADM data if we're using separate GADM files
  const mergedAdminData = useMemo(() => {
    // If we have a merged admin file, use it directly
    if (selectedCountryConfig?.adminFile && adminData) {
      return adminData
    }
    
    // Otherwise, merge GADM levels
    const features = []
    if (adminData?.features) features.push(...adminData.features)
    if (gadmLevel2Data?.features) features.push(...gadmLevel2Data.features)
    if (gadmLevel3Data?.features) features.push(...gadmLevel3Data.features)
    
    if (features.length === 0) return null
    
    return {
      type: 'FeatureCollection',
      features
    }
  }, [adminData, gadmLevel2Data, gadmLevel3Data, selectedCountryConfig])
  
  // Fetch people groups data for VillageStatusLayer
  // Use getAllPaginated to fetch ALL people groups (not just the first 200)
  const { data: peopleGroupsData, isLoading: isPeopleGroupsLoading, isFetching: isPeopleGroupsFetching } = useQuery({
    queryKey: ['peopleGroups', 'all-for-map'],
    queryFn: async () => {
      const allPeopleGroups = await peopleGroupsApi.getAllPaginated()
      return allPeopleGroups
    },
    select: (data) => Array.isArray(data) ? data : [],
    staleTime: 5 * 60 * 1000,      // 5 minutes — évite les re-fetch inutiles
    gcTime: 10 * 60 * 1000,         // 10 minutes en cache
    refetchOnWindowFocus: false      // pas de re-fetch au focus fenêtre
  })
  
  // Handle country change - reset filters and update map center
  const handleCountryChange = useCallback((newCountryCode) => {
    setSelectedCountryCode(newCountryCode)
    setSelectedCountry('')
    setSelectedRegion('')
    setSelectedDepartment('')
    setSelectedArrondissement('')
    
    // Update map center and zoom for the new country
    const config = getCountryConfig(newCountryCode)
    if (config) {
      setMapCenter(config.center)
      setMapZoom(config.zoom)
      toast.success(`Pays changé: ${config.nameFr}`, { icon: '🌍' })
    }
  }, [])
  
  // Extract unique countries, regions, departments, arrondissements from admin data
  // The GeoJSON uses COUNTRY, NAME_1 (Region), NAME_2 (Department), NAME_3 (Arrondissement)
  const adminOptions = useMemo(() => {
    // Use mergedAdminData instead of adminData to support GADM files
    const dataToUse = mergedAdminData
    if (!dataToUse?.features) return { countries: [], regions: new Map(), departments: new Map(), arrondissements: new Map() }
    
    const countries = new Set()
    const regions = new Map() // Map<country, Set<region>>
    const departments = new Map() // Map<region, Set<department>>
    const arrondissements = new Map() // Map<department, Set<arrondissement>>
    
    dataToUse.features.forEach(f => {
      const props = f.properties || {}
      
      // Extract COUNTRY, NAME_1 (Region), NAME_2 (Department), NAME_3 (Arrondissement)
      const country = props.COUNTRY
      const region = props.NAME_1
      const department = props.NAME_2
      const arrondissement = props.NAME_3
      
      // Add country
      if (country) {
        countries.add(country)
        
        // Add region under country
        if (region) {
          if (!regions.has(country)) regions.set(country, new Set())
          regions.get(country).add(region)
          
          // Add department under region
          if (department) {
            if (!departments.has(region)) departments.set(region, new Set())
            departments.get(region).add(department)
            
            // Add arrondissement under department
            if (arrondissement) {
              if (!arrondissements.has(department)) arrondissements.set(department, new Set())
              arrondissements.get(department).add(arrondissement)
            }
          }
        }
      }
    })
    
    return {
      countries: Array.from(countries).sort(),
      regions,
      departments,
      arrondissements
    }
  }, [mergedAdminData])
  
  // Set default country when adminOptions.countries is loaded (first country in the list)
  // This ensures a country is always selected (no "all countries" option)
  useEffect(() => {
    if (adminOptions.countries.length > 0 && !selectedCountry) {
      setSelectedCountry(adminOptions.countries[0])
    }
  }, [adminOptions.countries, selectedCountry])
  
  // Filter admin data based on selections (using COUNTRY, NAME_1, NAME_2, NAME_3)
  // Filter admin data based on selections (using COUNTRY, NAME_1, NAME_2, NAME_3)
  // Filter admin data based on selections (using NAME_1, NAME_2, NAME_3)
  // No COUNTRY filter needed - the correct country file is already loaded via adminFilePath
  const filteredAdminData = useMemo(() => {
    if (!mergedAdminData?.features) return null
    
    let filtered = mergedAdminData.features
    
    // No COUNTRY filter - the correct country file is already loaded via adminFilePath
    // based on selectedCountryCode from SUPPORTED_COUNTRIES config
    
    if (selectedRegion) {
      filtered = filtered.filter(f => {
        const props = f.properties || {}
        return props.NAME_1 === selectedRegion
      })
    }
    
    if (selectedDepartment) {
      filtered = filtered.filter(f => {
        const props = f.properties || {}
        return props.NAME_2 === selectedDepartment
      })
    }
    
    if (selectedArrondissement) {
      filtered = filtered.filter(f => {
        const props = f.properties || {}
        return props.NAME_3 === selectedArrondissement
      })
    }
    
    return {
      type: 'FeatureCollection',
      features: filtered
    }
  }, [mergedAdminData, selectedRegion, selectedDepartment, selectedArrondissement])
  
  // Filter Admin 4 (villages boundary) data based on selected administrative levels
  // Uses spatial filtering to check if village centroids fall within selected admin boundaries
  const filteredVillagesBoundaryData = useMemo(() => {
    if (!villagesBoundaryData?.features) return null
    
    // If no filters are selected, return all villages
    if (!selectedRegion && !selectedDepartment && !selectedArrondissement) {
      return villagesBoundaryData
    }
    
    // Get the admin boundary to filter against (most specific selected level)
    let filterBoundary = null
    
    if (filteredAdminData?.features) {
      // Find the most specific admin boundary based on selection
      if (selectedArrondissement) {
        // Filter by arrondissement (Admin 3)
        filterBoundary = filteredAdminData.features.find(f => {
          const props = f.properties || {}
          return props.NAME_3 === selectedArrondissement && props.NAME_2 && props.NAME_1
        })
      } else if (selectedDepartment) {
        // Filter by department (Admin 2)
        filterBoundary = filteredAdminData.features.find(f => {
          const props = f.properties || {}
          return props.NAME_2 === selectedDepartment && !props.NAME_3 && props.NAME_1
        })
      } else if (selectedRegion) {
        // Filter by region (Admin 1)
        filterBoundary = filteredAdminData.features.find(f => {
          const props = f.properties || {}
          return props.NAME_1 === selectedRegion && !props.NAME_2 && !props.NAME_3
        })
      }
    }
    
    // If no boundary found, return all villages
    if (!filterBoundary) {
      return villagesBoundaryData
    }
    
    // Filter villages by checking if their centroid is within the admin boundary
    const filteredFeatures = villagesBoundaryData.features.filter(village => {
      if (!village.geometry?.coordinates) return false
      
      // Get centroid of village polygon
      const centroid = getPolygonCentroid(village.geometry.coordinates)
      if (!centroid) return false
      
      // Check if centroid is within the admin boundary
      return isVillageInAdminBoundary(centroid, filterBoundary)
    })
    
    return {
      type: 'FeatureCollection',
      features: filteredFeatures
    }
  }, [villagesBoundaryData, filteredAdminData, selectedRegion, selectedDepartment, selectedArrondissement])
  
  // Filter villages based on search and admin filters
  const filteredVillages = useMemo(() => {
    if (!villagesData || !villagesData.features) return []
    
    let filtered = villagesData.features.filter(f => 
      f.geometry && 
      f.geometry.coordinates && 
      f.properties?.name
    )
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(f => 
        f.properties?.name?.toLowerCase().includes(query)
      )
    }
    
    // Sort alphabetically
    filtered.sort((a, b) => 
      (a.properties?.name || '').localeCompare(b.properties?.name || '')
    )
    
    return filtered.slice(0, 500)
  }, [villagesData, searchQuery])
  
  // Stats - count features by admin level
  const stats = useMemo(() => {
    const villageCount = villagesData?.features?.length || 0
    const adminCount = adminData?.features?.length || 0
    
    // Count features by admin level
    let regionsCount = 0
    let departmentsCount = 0
    let arrondissementsCount = 0
    
    if (adminData?.features) {
      adminData.features.forEach(f => {
        const props = f.properties || {}
        if (props.NAME_1 && !props.NAME_2 && !props.NAME_3) {
          regionsCount++
        } else if (props.NAME_1 && props.NAME_2 && !props.NAME_3) {
          departmentsCount++
        } else if (props.NAME_1 && props.NAME_2 && props.NAME_3) {
          arrondissementsCount++
        }
      })
    }
    
    return { 
      villages: villageCount,
      admin: adminCount,
      regions: regionsCount,
      departments: departmentsCount,
      arrondissements: arrondissementsCount,
      villageBoundaries: villagesBoundaryData?.features?.length || 0,
      withNames: villagesData?.features?.filter(f => f.properties?.name).length || 0
    }
  }, [villagesData, adminData, villagesBoundaryData])
  
  // Handlers
  const handleVillageClick = useCallback((feature) => {
    setSelectedVillage(feature.properties?.osm_id)
    const [lng, lat] = feature.geometry.coordinates
    setMapCenter([lat, lng])
    setMapZoom(14)
  }, [])
  
  const handleSidebarVillageClick = useCallback((feature) => {
    setSelectedVillage(feature.properties?.osm_id)
    const [lng, lat] = feature.geometry.coordinates
    setMapCenter([lat, lng])
    setMapZoom(14)
  }, [])
  
  const handleLocateMe = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapCenter([position.coords.latitude, position.coords.longitude])
          setMapZoom(12)
          toast.success(isFrench ? 'Position trouvée !' : 'Position found!')
        },
        () => toast.error("Impossible d'obtenir votre position")
      )
    } else {
      toast.error("Géolocalisation non supportée")
    }
  }, [])
  
  const handleFitAll = useCallback(() => {
    if (villagesData) {
      const bounds = getGeoJSONBounds(villagesData)
      if (bounds) {
        setFitBounds(bounds)
        setTimeout(() => setFitBounds(null), 100)
      }
    }
  }, [villagesData])
  
  const handleResetFilters = useCallback(() => {
    setSelectedCountry('')
    setSelectedRegion('')
    setSelectedDepartment('')
    setSelectedArrondissement('')
    setSearchQuery('')
  }, [])
  
  const layerFilterFn = useCallback((feature) => {
    if (!searchQuery) return true
    const name = feature.properties?.name?.toLowerCase() || ''
    return name.includes(searchQuery.toLowerCase())
  }, [searchQuery])
  
  // Loading state
  const isLoading = villagesLoading || adminLoading
  
  if (villagesLoading && !villagesData) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">{t('villagesMap.loading')}</p>
          <p className="text-sm text-gray-400 mt-2">{t('villagesMap.loadingDetails')}</p>
        </div>
      </div>
    )
  }
  
  if (villagesError) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center bg-white rounded-xl shadow-lg p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">{t('villagesMap.loadError')}</h3>
          <p className="text-gray-600 mb-4">{t('villagesMap.loadErrorDesc')}</p>
          <button onClick={() => refetchVillages()} className="btn-primary">
            {t('common.tryAgain')}
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="h-[calc(100vh-8rem)] relative animate-fade-in flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-96' : 'w-0'} transition-all duration-300 bg-white shadow-lg z-[1001] overflow-hidden flex flex-col`}>
        {sidebarOpen && (
          <>
            {/* Sidebar Header */}
            <div className="px-3 py-2 border-b">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-700">Villages</h2>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="p-1 rounded hover:bg-gray-100 transition-colors"
                  title={showFilters ? t('villagesMap.hideFilters') : t('villagesMap.showFilters')}
                >
                  <ChevronDown size={14} className={`text-gray-400 transform transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>
              </div>
              
              {/* Search Input */}
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  type="text"
                  placeholder={t('villagesMap.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 text-xs border-0 border-b border-gray-200 bg-transparent focus:ring-0 focus:border-gray-400 placeholder-gray-400"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
            
            {/* Filters Panel - minimalist design */}
            {showFilters && (
              <div className="px-3 py-2 border-b space-y-3 max-h-[60vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#e5e7eb transparent' }}>
                
                {/* Country Selector */}
                <select
                  value={selectedCountryCode}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border-0 border-b border-gray-200 bg-transparent focus:ring-0 focus:border-gray-400"
                >
                  {Object.entries(SUPPORTED_COUNTRIES).map(([code, config]) => (
                    <option key={code} value={code}>
                      {config.nameFr}
                    </option>
                  ))}
                </select>
                
                {/* Thin divider */}
                <div className="border-t border-gray-100"></div>
                
                {/* Administrative Filters - cascading selects */}
                <div className="space-y-1.5">
                  <select
                    value={selectedRegion}
                    onChange={(e) => {
                      setSelectedRegion(e.target.value)
                      setSelectedDepartment('')
                      setSelectedArrondissement('')
                    }}
                    disabled={!selectedCountry}
                    className="w-full px-2 py-1.5 text-xs border-0 border-b border-gray-200 bg-transparent focus:ring-0 focus:border-gray-400 disabled:text-gray-300 disabled:cursor-not-allowed"
                  >
                    <option value="">{t('villagesMap.allRegions')}</option>
                    {selectedCountry && adminOptions.regions.get(selectedCountry) && 
                      Array.from(adminOptions.regions.get(selectedCountry)).sort().map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))
                    }
                  </select>
                  
                  <select
                    value={selectedDepartment}
                    onChange={(e) => {
                      setSelectedDepartment(e.target.value)
                      setSelectedArrondissement('')
                    }}
                    disabled={!selectedRegion}
                    className="w-full px-2 py-1.5 text-xs border-0 border-b border-gray-200 bg-transparent focus:ring-0 focus:border-gray-400 disabled:text-gray-300 disabled:cursor-not-allowed"
                  >
                    <option value="">{t('villagesMap.allDepartments')}</option>
                    {selectedRegion && adminOptions.departments.get(selectedRegion) && 
                      Array.from(adminOptions.departments.get(selectedRegion)).sort().map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))
                    }
                  </select>
                  
                  <select
                    value={selectedArrondissement}
                    onChange={(e) => setSelectedArrondissement(e.target.value)}
                    disabled={!selectedDepartment}
                    className="w-full px-2 py-1.5 text-xs border-0 border-b border-gray-200 bg-transparent focus:ring-0 focus:border-gray-400 disabled:text-gray-300 disabled:cursor-not-allowed"
                  >
                    <option value="">{t('villagesMap.allArrondissements')}</option>
                    {selectedDepartment && adminOptions.arrondissements.get(selectedDepartment) && 
                      Array.from(adminOptions.arrondissements.get(selectedDepartment)).sort().map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))
                    }
                  </select>
                  
                  {(selectedCountry || selectedRegion || selectedDepartment || selectedArrondissement) && (
                    <button
                      onClick={handleResetFilters}
                      className="w-full py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {t('villagesMap.resetFilters')}
                    </button>
                  )}
                </div>
                
                {/* Thin divider */}
                <div className="border-t border-gray-100"></div>
                
                {/* Layer Toggles - simplified (DMM status is now zoom-based) */}
                <div className="space-y-1">
                  {/* DMM Status Info - Always visible, zoom-based */}
                  <div className="flex items-center gap-1">
                    <div className="flex-1 flex items-center justify-between px-2 py-1.5 rounded text-xs bg-indigo-50 text-indigo-600">
                      <span>{t('villagesMap.dmmStatus')} (auto)</span>
                      <Eye size={12} />
                    </div>
                    <button
                      onClick={refreshVillageStatuses}
                      className="p-1.5 rounded text-indigo-500 hover:bg-indigo-50 transition-colors"
                      title={isFrench ? 'Actualiser' : 'Refresh'}
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                  
                  {/* Zoom level info */}
                  <div className="px-2 py-1 text-xs text-gray-500 bg-gray-50 rounded">
                    <span>Zoom 3-6: Régions • 7-9: Départements • 10+: Villages</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Village List */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-2 bg-gray-100 border-b sticky top-0">
                <span className="text-xs text-gray-500">
                  {filteredVillages.length} {t('villagesMap.villagesDisplayed')}
                </span>
              </div>
              
              {filteredVillages.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <MapPin size={32} className="mx-auto mb-2 opacity-50" />
                  <p>{t('villagesMap.noVillagesFound')}</p>
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="text-primary-600 text-sm mt-2 hover:underline"
                    >
                      {t('villagesMap.clearSearch')}
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredVillages.map((feature, index) => {
                    const name = feature.properties?.name || 'Sans nom'
                    const [lng, lat] = feature.geometry.coordinates
                    const isSelected = feature.properties?.osm_id === selectedVillage
                    
                    return (
                      <button
                        key={feature.properties?.osm_id || index}
                        onClick={() => handleSidebarVillageClick(feature)}
                        className={`w-full p-3 text-left hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-primary-50 border-l-4 border-primary-500' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="w-2 h-2 rounded-full mt-2 flex-shrink-0 bg-red-500"></span>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">{name}</h4>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {lat.toFixed(4)}, {lng.toFixed(4)}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            
            {/* Sidebar Footer Stats */}
            <div className="p-3 border-t bg-gray-50">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white rounded p-2 text-center">
                  <div className="font-bold text-primary-600">{stats.villageBoundaries.toLocaleString()}</div>
                  <div className="text-gray-500">{t('villagesMap.villages')}</div>
                </div>
                <div className="bg-white rounded p-2 text-center">
                  <div className="font-bold text-indigo-600">{villageStatusStats?.totalPeopleGroups || 0}</div>
                  <div className="text-gray-500">{t('villagesMap.peoples')}</div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Zoom: {mapStats.zoom} • Source: OpenStreetMap
              </p>
            </div>
          </>
        )}
      </div>
      
      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-[1002] bg-white shadow-lg rounded-r-lg p-2 hover:bg-gray-50 transition-all"
        style={{ left: sidebarOpen ? '384px' : '0' }}
      >
        {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>
      
      {/* Map Container */}
      <div className="flex-1 relative">
        {/* Loading Indicator */}
        {isLoading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-primary-600" />
            <span className="text-sm text-gray-600">Chargement...</span>
          </div>
        )}
        
        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
          <button 
            onClick={handleLocateMe} 
            className="bg-white rounded-lg shadow-lg p-3 hover:bg-gray-50" 
            title={isFrench ? 'Ma position' : 'My location'}
          >
            <Navigation size={20} />
          </button>
          <button 
            onClick={handleFitAll} 
            className="bg-white rounded-lg shadow-lg p-3 hover:bg-gray-50" 
            title={isFrench ? 'Voir tout le Cameroun' : 'View all Cameroon'}
          >
            <Maximize2 size={20} />
          </button>
        </div>
        
        {/* Legend - Collapsible */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg text-xs">
          {/* Legend Header - Clickable to toggle */}
          <button 
            onClick={() => setLegendExpanded(!legendExpanded)}
            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-t-lg transition-colors"
          >
            <h4 className="font-semibold text-gray-700">{isFrench ? 'Légende' : 'Legend'}</h4>
            <ChevronDown 
              size={16} 
              className={`text-gray-500 transition-transform duration-200 ${legendExpanded ? 'rotate-180' : ''}`} 
            />
          </button>
          
          {/* Legend Content - Collapsible */}
          {/* Legend Content - Collapsible */}
          <div className={`overflow-hidden transition-all duration-200 ${legendExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="px-3 pb-3 space-y-1.5">
              {/* DMM Status Legend - Always visible */}
              <VillageStatusLegend visible={true} />
            </div>
          </div>
        </div>
        
        
        {/* Village Status Statistics Panel - Collapsible - Always visible */}
        {villageStatusStats && (
          <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg">
            {/* Statistics Header - Clickable to toggle */}
            <button 
              onClick={() => setStatusLegendExpanded(!statusLegendExpanded)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-t-lg transition-colors"
            >
              <h4 className="font-semibold text-gray-700 text-xs">{isFrench ? 'Statistiques des villages' : 'Village statistics'}</h4>
              <ChevronDown 
                size={16} 
                className={`text-gray-500 transition-transform duration-200 ${statusLegendExpanded ? 'rotate-180' : ''}`} 
              />
            </button>
            
            {/* Statistics Content - Collapsible */}
            <div className={`overflow-hidden transition-all duration-200 ${statusLegendExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <VillageStatusStats 
                statistics={villageStatusStats} 
                visible={true}
                selectedRegion={selectedRegion}
                selectedDepartment={selectedDepartment}
                selectedArrondissement={selectedArrondissement}
              />
            </div>
          </div>
        )}
        
        {/* Map */}
        <MapContainer 
          center={mapCenter} 
          zoom={mapZoom} 
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer 
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
          />
          <ZoomControl position="bottomright" />
          
          {/* Map Controller */}
          <MapController 
            center={mapCenter} 
            zoom={mapZoom}
            bounds={fitBounds}
          />
          
          {/* Stats Tracker */}
          <MapStats onStatsUpdate={setMapStats} />
          
          {/* Map Resize Handler - fixes map display when sidebar is toggled */}
          <MapResizeHandler sidebarOpen={sidebarOpen} />
          
          {/* People Groups Loading Indicator */}
          {(isPeopleGroupsLoading || isPeopleGroupsFetching) && (
            <div style={{
              position: 'absolute',
              bottom: '80px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              backgroundColor: 'rgba(255,255,255,0.92)',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '11px',
              color: '#374151',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
              pointerEvents: 'none'
            }}>
              <svg style={{animation:'spin 1s linear infinite',width:'12px',height:'12px'}} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Chargement des groupes de peuples…
            </div>
          )}
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          
          {/* Village Status Layer - Always visible, handles zoom-based admin levels */}
          <VillageStatusLayer
            villagesBoundaryData={filteredVillagesBoundaryData}
            adminBoundaryData={filteredAdminData}
            visible={true}
            onStatusesLoaded={(data) => setVillageStatusStats(data?.statistics)}
            selectedRegion={selectedRegion}
            selectedDepartment={selectedDepartment}
            selectedArrondissement={selectedArrondissement}
            refreshTrigger={villageStatusRefreshTrigger}
            peopleGroups={peopleGroupsData || []}
            onAddPeople={(locationData) => {
              setVillageForAddPeopleGroup({ 
                name: locationData.villageName || '', 
                polygon: locationData.polygon || null 
              })
              setShowAddPeopleGroupModal(true)
            }}
          />
          
        </MapContainer>
      </div>
      
      {/* Village People Groups Modal */}
      <VillagePeopleGroupsModal
        isOpen={showPeopleGroupsModal}
        onClose={() => setShowPeopleGroupsModal(false)}
        villageName={selectedVillageForModal.name}
        polygon={selectedVillageForModal.polygon}
        adminLevel={selectedVillageForModal.adminLevel}
        isAdminArea={selectedVillageForModal.isAdminArea}
      />
      
      {/* Add People Group Modal */}
      <AddPeopleGroupModal
        isOpen={showAddPeopleGroupModal}
        onClose={() => setShowAddPeopleGroupModal(false)}
        villageName={villageForAddPeopleGroup.name}
        polygon={villageForAddPeopleGroup.polygon}
        onSuccess={() => {
          // Refresh village statuses after adding a people group
          refreshVillageStatuses()
        }}
      />
    </div>
  )
}

export default GeoJSONMapView