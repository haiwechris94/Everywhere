import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { villagesApi, peopleGroupsApi } from '../../services/api'
import { useLanguage } from '../../i18n'

// ═══════════════════════════════════════════════════════════════════════════
// POINT-IN-POLYGON HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ray casting point-in-polygon algorithm
 * @param {[number, number]} point - [lng, lat] coordinates
 * @param {number[][]} ring - Array of [lng, lat] coordinate pairs forming a ring
 * @returns {boolean}
 */
function pointInRing(point, ring) {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Check if a point [lng, lat] is inside a GeoJSON geometry (Polygon or MultiPolygon)
 */
function pointInGeometry(point, geometry) {
  if (!geometry || !point) return false
  try {
    if (geometry.type === 'Polygon') {
      // Check outer ring, then subtract holes
      if (!pointInRing(point, geometry.coordinates[0])) return false
      for (let i = 1; i < geometry.coordinates.length; i++) {
        if (pointInRing(point, geometry.coordinates[i])) return false
      }
      return true
    } else if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.some(polygonCoords => {
        if (!pointInRing(point, polygonCoords[0])) return false
        for (let i = 1; i < polygonCoords.length; i++) {
          if (pointInRing(point, polygonCoords[i])) return false
        }
        return true
      })
    }
  } catch (e) {
    // silently ignore geometry errors
  }
  return false
}

/**
 * Get people groups whose coordinates fall within a GeoJSON feature's geometry
 */
function getPeopleGroupsInFeature(feature, peopleGroups) {
  if (!feature?.geometry || !peopleGroups?.length) return []
  return peopleGroups.filter(pg => {
    if (!pg?.location?.coordinates || pg.location.coordinates.length < 2) return false
    return pointInGeometry(pg.location.coordinates, feature.geometry)
  })
}

// Status colors for village polygons - NEW COLOR SYSTEM
// Gray=Pas d'information, Red=Unreached, Orange=Pioneer, Yellow=Midway, Light Green=Tipping Point, Dark Green=DMM
const STATUS_COLORS = {
  'pas-d-information': '#9ca3af', // Gray (no people groups)
  unreached: '#ef4444',           // Red (≥90% unreached people groups)
  pioneer: '#f97316',             // Orange
  midway: '#eab308',              // Yellow
  'tipping-point': '#22c55e',     // Light Green
  dmm: '#15803d'                  // Dark Green
}

// Status display names
const STATUS_DISPLAY_NAMES = {
  'pas-d-information': "Pas d'information",
  unreached: 'Unreached',
  pioneer: 'Pioneer',
  midway: 'Midway',
  'tipping-point': 'Tipping Point',
  dmm: 'DMM'
}

/**
 * Status thresholds for village status calculation
 * These thresholds determine the minimum percentage of people groups
 * that must have a specific status for the village to be assigned that status.
 * 
 * THRESHOLD RULES (applied in priority order):
 * 1. DMM: ≥ 30% of people groups have DMM status
 * 2. Tipping Point: ≥ 40% of people groups have Tipping Point status
 * 3. Midway: ≥ 50% of people groups have Midway status
 * 4. Pioneer: ≥ 70% of people groups have Pioneer status
 * 5. Unreached: No people groups or no threshold met
 */
const STATUS_THRESHOLDS = {
  dmm: 30,
  'tipping-point': 40,
  midway: 50,
  pioneer: 70
}

// Legend descriptions with threshold rules
const LEGEND_DESCRIPTIONS = {
  dmm: 'DMM (≥30% peuples DMM)',
  'tipping-point': 'Tipping Point (≥40% peuples Tipping Point)',
  midway: 'Midway (≥50% peuples Midway)',
  pioneer: 'Pioneer (≥70% peuples Pioneer)',
  unreached: 'Unreached (≥90% peuples Unreached)',
  'pas-d-information': "Pas d'information (aucun peuple)"
}

// Debug logging helper
const DEBUG = true
const debugLog = (message, data = null) => {
  if (DEBUG) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12)
    if (data) {
      console.log(`[VillageStatusLayer ${timestamp}] ${message}`, data)
    } else {
      console.log(`[VillageStatusLayer ${timestamp}] ${message}`)
    }
  }
}

/**
 * VillageStatusLayer Component
 * Displays village polygons colored by their calculated status based on 
 * threshold-based rules for people group status proportions.
 * 
 * NEW THRESHOLD-BASED STATUS RULES (applied in priority order):
 * 1. DMM: ≥ 30% of people groups have DMM status
 * 2. Tipping Point: ≥ 40% of people groups have Tipping Point status
 * 3. Midway: ≥ 50% of people groups have Midway status
 * 4. Pioneer: ≥ 70% of people groups have Pioneer status
 * 5. Unreached: No people groups or no threshold met
 */

// Debounce hook to prevent layer recreation on every map pan
function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

const VillageStatusLayer = ({ 
  villagesBoundaryData, 
  adminBoundaryData,  // NEW PROP: Admin boundary data for zoom-based display
  visible, 
  onStatusesLoaded,
  selectedRegion,
  selectedDepartment,
  selectedArrondissement,
  refreshTrigger, // Optional: increment this to force a refresh
  onVillageClick, // Optional: callback when village polygon is clicked
  peopleGroups = [], // Array of all people groups for popup display
  onAddPeople // Callback function when "Add People Group" button is clicked
}) => {
  const map = useMap()
  const { isFrench } = useLanguage()
  const [villageStatuses, setVillageStatuses] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [currentZoom, setCurrentZoom] = useState(map?.getZoom() || 8)
  const [mapBounds, setMapBounds] = useState(null)
  
  // Debounce mapBounds to prevent layer recreation on every map pan
  const debouncedMapBounds = useDebouncedValue(mapBounds, 300)
  
  // Stabilize onAddPeople callback reference to prevent useEffect re-runs
  const onAddPeopleRef = useRef(onAddPeople)
  useEffect(() => { onAddPeopleRef.current = onAddPeople }, [onAddPeople])
  
  // Stabilize peopleGroups reference to prevent useEffect re-runs
  const peopleGroupsRef = useRef(peopleGroups)
  useEffect(() => { peopleGroupsRef.current = peopleGroups }, [peopleGroups])
  
  // Zoom level constraints for DMM status polygons
  // Admin level 1 (regions): zoom 3-6
  // Admin level 2 (departments): zoom 7-9
  // Admin level 3 (villages): zoom 10+
  const getAdminLevel = (zoom) => {
    if (zoom >= 3 && zoom <= 6) return 1  // Admin 1 (regions)
    if (zoom >= 7 && zoom <= 9) return 2  // Admin 2 (departments)
    return 3  // Village level (zoom 10+)
  }
  
  // Track zoom level and bounds changes for viewport-based loading
  useEffect(() => {
    if (!map) return
    
    const handleMapChange = () => {
      const zoom = map.getZoom()
      const bounds = map.getBounds()
      setCurrentZoom(zoom)
      setMapBounds(bounds)
      debugLog(`🔍 Map changed - zoom: ${zoom}`)
    }
    
    // Set initial values
    setCurrentZoom(map.getZoom())
    setMapBounds(map.getBounds())
    
    map.on('zoomend', handleMapChange)
    map.on('moveend', handleMapChange)
    
    return () => {
      map.off('zoomend', handleMapChange)
      map.off('moveend', handleMapChange)
    }
  }, [map])
  
  // Determine current admin level based on zoom
  const adminLevel = getAdminLevel(currentZoom)
  
  // Check if current zoom is within the allowed range for village polygon display (zoom 10+)
  const isVillageZoomRange = currentZoom >= 10
  
  // Helper function to check if a polygon intersects with the current viewport
  const isPolygonInViewport = (feature, bounds) => {
    if (!bounds || !feature?.geometry?.coordinates) return true
    
    try {
      const coords = feature.geometry.coordinates
      const type = feature.geometry.type
      
      // Get the bounding box of the polygon
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
      
      const processCoords = (coordArray) => {
        for (const coord of coordArray) {
          if (Array.isArray(coord[0])) {
            processCoords(coord)
          } else {
            const [lng, lat] = coord
            minLng = Math.min(minLng, lng)
            maxLng = Math.max(maxLng, lng)
            minLat = Math.min(minLat, lat)
            maxLat = Math.max(maxLat, lat)
          }
        }
      }
      
      processCoords(coords)
      
      // Check if polygon bounding box intersects with viewport
      const sw = bounds.getSouthWest()
      const ne = bounds.getNorthEast()
      
      return !(maxLng < sw.lng || minLng > ne.lng || maxLat < sw.lat || minLat > ne.lat)
    } catch (err) {
      return true // Include polygon if we can't determine
    }
  }
  
  // Filter polygons to only those visible in the current viewport
  // Uses debouncedMapBounds to prevent layer recreation on every map pan
  const visiblePolygons = useMemo(() => {
    if (!villagesBoundaryData?.features || !debouncedMapBounds) {
      return villagesBoundaryData
    }
    
    const filteredFeatures = villagesBoundaryData.features.filter(
      feature => isPolygonInViewport(feature, debouncedMapBounds)
    )
    
    debugLog(`📍 Viewport filtering: ${filteredFeatures.length}/${villagesBoundaryData.features.length} polygons visible`)
    
    return {
      type: 'FeatureCollection',
      features: filteredFeatures
    }
  }, [villagesBoundaryData, debouncedMapBounds])

  // Debug: Log component mount
  useEffect(() => {
    debugLog('🚀 Component MOUNTED', {
      visible,
      refreshTrigger,
      hasBoundaryData: !!villagesBoundaryData,
      boundaryFeatureCount: villagesBoundaryData?.features?.length || 0
    })
    
    return () => {
      debugLog('🔴 Component UNMOUNTED')
    }
  }, [])

  // Debug: Log when villageStatuses state updates
  useEffect(() => {
    const statusCount = Object.keys(villageStatuses).length
    debugLog(`📊 villageStatuses state UPDATED - ${statusCount} villages`, {
      villageNames: Object.keys(villageStatuses).slice(0, 10),
      sampleStatuses: Object.entries(villageStatuses).slice(0, 5).map(([name, data]) => ({
        name,
        status: data?.status,
        totalPeoples: data?.totalPeoples
      }))
    })
  }, [villageStatuses])

  /**
   * Fetch village statuses from API
   * This function is called:
   * 1. When the layer becomes visible
   * 2. When refreshTrigger changes (for real-time updates)
   */
  const fetchStatuses = async () => {
    debugLog('🔄 fetchStatuses() CALLED', { visible, refreshTrigger })
    setLoading(true)
    setError(null)
    
    try {
      debugLog('📡 Calling API: GET /api/villages/statuses?includeJoshuaProject=true')
      // Include Joshua Project peoples in village status calculation
      const response = await villagesApi.getStatuses({ includeJoshuaProject: 'true' })
      debugLog('✅ API Response received', {
        hasData: !!response.data,
        villageCount: response.data?.villages?.length || 0,
        statistics: response.data?.statistics,
        sampleVillages: response.data?.villages?.slice(0, 5)
      })
      
      const statusMap = {}
      
      if (response.data?.villages) {
        response.data.villages.forEach(vs => {
          statusMap[vs.villageName] = vs
        })
        debugLog(`📋 Created statusMap with ${Object.keys(statusMap).length} entries`)
      } else {
        debugLog('⚠️ No villages in API response!')
      }
      
      setVillageStatuses(statusMap)
      
      // Calculate filtered statistics based on villagesBoundaryData
      if (onStatusesLoaded) {
        debugLog('📤 Calling onStatusesLoaded callback')
        
        // Get village names from the filtered boundary data
        const filteredVillageNames = new Set(
          (villagesBoundaryData?.features || [])
            .map(f => f.properties?.name || f.properties?.NAME || '')
            .filter(Boolean)
        )
        
        debugLog(`📊 Filtering statistics for ${filteredVillageNames.size} villages`)
        
        // Filter villages to only include those in the boundary data
        const filteredVillages = (response.data?.villages || []).filter(v => 
          filteredVillageNames.has(v.villageName)
        )
        
        // Recalculate statistics for filtered villages
        const filteredStats = {
          totalVillages: filteredVillages.length,
          totalPeopleGroups: filteredVillages.reduce((sum, v) => sum + (v.totalPeoples || 0), 0),
          byStatus: {
            pioneer: 0,
            midway: 0,
            'tipping-point': 0,
            dmm: 0,
            unreached: 0
          },
          peopleGroupsByStatus: {
            pioneer: 0,
            midway: 0,
            tippingPoint: 0,
            dmm: 0,
            unreached: 0
          },
          overallPercentages: {
            pioneer: 0,
            midway: 0,
            tippingPoint: 0,
            dmm: 0,
            unreached: 0
          }
        }
        
        // Count villages by status and aggregate people group counts
        filteredVillages.forEach(v => {
          const status = v.status || 'unreached'
          filteredStats.byStatus[status] = (filteredStats.byStatus[status] || 0) + 1
          
          // Aggregate people group counts by status
          if (v.statusBreakdown) {
            filteredStats.peopleGroupsByStatus.pioneer += v.statusBreakdown.pioneer || 0
            filteredStats.peopleGroupsByStatus.midway += v.statusBreakdown.midway || 0
            filteredStats.peopleGroupsByStatus.tippingPoint += v.statusBreakdown.tippingPoint || 0
            filteredStats.peopleGroupsByStatus.dmm += v.statusBreakdown.dmm || 0
            filteredStats.peopleGroupsByStatus.unreached += v.statusBreakdown.unreached || 0
          }
        })
        
        // Calculate overall percentages
        const totalPG = filteredStats.totalPeopleGroups
        if (totalPG > 0) {
          filteredStats.overallPercentages.pioneer = Math.round((filteredStats.peopleGroupsByStatus.pioneer / totalPG) * 100)
          filteredStats.overallPercentages.midway = Math.round((filteredStats.peopleGroupsByStatus.midway / totalPG) * 100)
          filteredStats.overallPercentages.tippingPoint = Math.round((filteredStats.peopleGroupsByStatus.tippingPoint / totalPG) * 100)
          filteredStats.overallPercentages.dmm = Math.round((filteredStats.peopleGroupsByStatus.dmm / totalPG) * 100)
          filteredStats.overallPercentages.unreached = Math.round((filteredStats.peopleGroupsByStatus.unreached / totalPG) * 100)
        }
        
        debugLog('📊 Filtered statistics calculated', filteredStats)
        
        onStatusesLoaded({ 
          villages: filteredVillages, 
          statistics: filteredStats 
        })
      }
    } catch (err) {
      debugLog('❌ Error fetching village statuses', {
        message: err.message,
        stack: err.stack
      })
      console.error('Error fetching village statuses:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      debugLog('🏁 fetchStatuses() COMPLETED')
    }
  }

  // Fetch statuses when visible, when refresh is triggered, or when boundary data changes
  useEffect(() => {
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('[VillageStatusLayer] REFRESH EFFECT TRIGGERED!')
    console.log('[VillageStatusLayer] visible:', visible)
    console.log('[VillageStatusLayer] refreshTrigger:', refreshTrigger)
    console.log('[VillageStatusLayer] hasBoundaryData:', !!villagesBoundaryData)
    console.log('═══════════════════════════════════════════════════════════════')
    
    if (visible) {
      console.log('[VillageStatusLayer] Calling fetchStatuses() because visible=true')
      // Add a small delay to ensure the database has been updated
      const timeoutId = setTimeout(() => {
        fetchStatuses()
      }, 500) // 500ms delay to ensure DB is updated
      
      return () => clearTimeout(timeoutId)
    }
  }, [visible, refreshTrigger, villagesBoundaryData])

  /**
   * Update a single village status (for real-time Socket.IO updates)
   * This allows updating individual villages without refetching all data
   */
  const updateSingleVillageStatus = (villageName, newStatus) => {
    setVillageStatuses(prev => ({
      ...prev,
      [villageName]: newStatus
    }))
  }

  // Compute aggregate statuses for admin level 1 and 2
  // Uses geographic point-in-polygon for people groups with coordinates,
  // falls back to name-based matching for people groups without coordinates
  const adminAreaStatuses = useMemo(() => {
    if (adminLevel === 3 || !adminBoundaryData?.features) return null
    
    debugLog('🔢 [ADMIN] Computing adminAreaStatuses', {
      adminLevel,
      featureCount: adminBoundaryData.features.length,
      peopleGroupsCount: peopleGroups.length,
      samplePeopleGroups: peopleGroups.slice(0, 3).map(pg => ({ name: pg.name, engagementStatus: pg.engagementStatus, region: pg.region, admin1: pg.admin1, admin2: pg.admin2, departement: pg.departement }))
    })
    
    const areaStatuses = {}
    const processedAreas = new Set()
    
    // Filter features by their REAL admin level (matches the dedup logic in the admin useEffect).
    // GADM merged GeoJSON files contain features for all admin levels (1, 2, 3) in the same
    // FeatureCollection. Each feature only has NAME_* fields populated up to its own admin level:
    //   - Level 1 feature: NAME_1 only (NAME_2/NAME_3 null)
    //   - Level 2 feature: NAME_1 + NAME_2 (NAME_3 null)
    //   - Level 3 feature: NAME_1 + NAME_2 + NAME_3
    // Without this filter, e.g. when adminLevel === 1 we would pick up tiny level-2/3 polygons
    // (because they also have NAME_1 populated) and use them for point-in-polygon tests, which
    // would either miss people groups (wrong polygon) or duplicate-collapse the real admin-1 polygon.
    const isPopulated = (v) => v != null && v !== '' && v !== 'NA' && v !== 'null'
    const levelFilteredFeatures = adminBoundaryData.features.filter(feature => {
      const props = feature.properties || {}
      let featureAdminLevel = typeof props.admin_level === 'number' ? props.admin_level : null
      if (featureAdminLevel == null) {
        if (isPopulated(props.NAME_3)) featureAdminLevel = 3
        else if (isPopulated(props.NAME_2)) featureAdminLevel = 2
        else if (isPopulated(props.NAME_1)) featureAdminLevel = 1
        else return false
      }
      return featureAdminLevel === adminLevel
    })
    
    debugLog(`📍 [ADMIN] adminAreaStatuses: ${levelFilteredFeatures.length}/${adminBoundaryData.features.length} features at level ${adminLevel}`)
    
    levelFilteredFeatures.forEach(feature => {
      const props = feature.properties || {}
      let areaName, areaKey
      
      if (adminLevel === 1) {
        if (!isPopulated(props.NAME_1)) return
        areaName = props.NAME_1
        areaKey = `admin1_${areaName}`
      } else if (adminLevel === 2) {
        if (!isPopulated(props.NAME_1) || !isPopulated(props.NAME_2)) return
        areaName = props.NAME_2
        // Include NAME_1 in the key to disambiguate identically-named admin-2 areas across regions
        areaKey = `admin2_${props.NAME_1}__${areaName}`
      }
      
      if (!areaName || processedAreas.has(areaKey)) return
      processedAreas.add(areaKey)
      
      // --- GEOGRAPHIC: find people groups inside this polygon ---
      const pgInPolygon = getPeopleGroupsInFeature(feature, peopleGroups || [])
      
      // --- NAME-BASED FALLBACK: also include people groups matched by admin name ---
      const pgByName = (peopleGroups || []).filter(pg => {
        if (adminLevel === 1) return (pg.region === areaName || pg.admin1 === areaName)
        if (adminLevel === 2) return (pg.admin2 === areaName || pg.departement === areaName || pg.department === areaName)
        return false
      })
      
      // Merge both sets (deduplicate by _id)
      const pgMap = new Map()
      pgInPolygon.forEach(pg => pgMap.set(pg._id || pg.name, pg))
      pgByName.forEach(pg => pgMap.set(pg._id || pg.name, pg))
      const allPGsInArea = Array.from(pgMap.values())
      
      // Aggregate status counts from people groups directly
      let statusCounts = { unreached: 0, pioneer: 0, midway: 0, 'tipping-point': 0, dmm: 0 }
      allPGsInArea.forEach(pg => {
        const s = pg.engagementStatus || 'unreached'
        if (statusCounts[s] !== undefined) statusCounts[s]++
      })
      const totalPeoples = allPGsInArea.length
      
      // Also aggregate from village statuses (existing logic)
      const villagesInArea = Object.entries(villageStatuses).filter(([villageName, vs]) => {
        if (adminLevel === 1) return vs.region === areaName || vs.NAME_1 === areaName
        if (adminLevel === 2) return vs.department === areaName || vs.NAME_2 === areaName
        return false
      })
      let totalVillagePeoples = 0
      villagesInArea.forEach(([, vs]) => {
        totalVillagePeoples += vs.totalPeoples || 0
        if (vs.statusBreakdown) {
          statusCounts.unreached += vs.statusBreakdown.unreached || 0
          statusCounts.pioneer += vs.statusBreakdown.pioneer || 0
          statusCounts.midway += vs.statusBreakdown.midway || 0
          statusCounts['tipping-point'] += vs.statusBreakdown.tippingPoint || 0
          statusCounts.dmm += vs.statusBreakdown.dmm || 0
        }
      })
      
      const grandTotal = totalPeoples + totalVillagePeoples
      
      // Calculate aggregate status using threshold rules
      let aggregateStatus = 'pas-d-information'
      if (grandTotal > 0) {
        const dmmPct = (statusCounts.dmm / grandTotal) * 100
        const tpPct = (statusCounts['tipping-point'] / grandTotal) * 100
        const midwayPct = (statusCounts.midway / grandTotal) * 100
        const pioneerPct = (statusCounts.pioneer / grandTotal) * 100
        
        if (dmmPct >= 30) aggregateStatus = 'dmm'
        else if (tpPct >= 40) aggregateStatus = 'tipping-point'
        else if (midwayPct >= 50) aggregateStatus = 'midway'
        else if (pioneerPct >= 70) aggregateStatus = 'pioneer'
        else aggregateStatus = 'unreached'
      }
      
      areaStatuses[areaKey] = {
        name: areaName,
        status: aggregateStatus,
        totalPeoples: grandTotal,
        peopleGroupsDirect: allPGsInArea, // people groups found directly
        statusBreakdown: statusCounts,
        villageCount: villagesInArea.length
      }
    })
    
    debugLog('✅ [ADMIN] adminAreaStatuses computed', {
      areaCount: Object.keys(areaStatuses).length,
      sample: Object.entries(areaStatuses).slice(0, 3).map(([k, v]) => ({ key: k, status: v.status, totalPeoples: v.totalPeoples }))
    })
    
    return areaStatuses
  }, [adminLevel, adminBoundaryData, villageStatuses, peopleGroups])

  // Stabilize adminAreaStatuses reference to prevent useEffect re-runs
  const adminAreaStatusesRef = useRef(adminAreaStatuses)
  useEffect(() => { adminAreaStatusesRef.current = adminAreaStatuses }, [adminAreaStatuses])

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN LAYER useEffect (zoom 3-9) - Admin level 1 and 2 polygons
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    debugLog('🗺️ [ADMIN] Layer creation effect triggered', {
      hasMap: !!map,
      visible,
      currentZoom,
      adminLevel,
      hasAdminBoundaryData: !!adminBoundaryData?.features,
      hasAdminAreaStatuses: !!adminAreaStatuses
    })
    
    if (!map || !visible) {
      debugLog(`⏭️ [ADMIN] Skipping layer creation - map or visibility not ready`)
      return
    }
    
    // Only handle admin level 1 and 2 (zoom 3-9)
    if (adminLevel === 3) {
      debugLog(`⏭️ [ADMIN] Skipping admin layer - at village zoom level`)
      return
    }
    
    debugLog('🔢 [ADMIN] adminAreaStatuses value', {
      isNull: adminAreaStatuses === null,
      keys: adminAreaStatuses ? Object.keys(adminAreaStatuses).slice(0, 5) : [],
      sample: adminAreaStatuses ? Object.entries(adminAreaStatuses).slice(0, 3).map(([k,v]) => ({k, status: v.status, total: v.totalPeoples})) : []
    })
    
    if (!adminBoundaryData?.features) {
      debugLog(`⏭️ [ADMIN] Skipping admin layer - no admin boundary data`)
      return
    }

    // adminAreaStatuses can be null if adminLevel === 3 (handled above)
    // or an empty object {} if no people groups match yet
    const currentAdminStatuses = adminAreaStatuses || {}
      
      // Deduplicate features for the current admin level
      // GADM merged files contain features for ALL admin levels (1, 2, and 3) in the same FeatureCollection.
      // Each feature only has the NAME_* fields populated up to its own admin level:
      //   - Level 1 feature: NAME_1 only (NAME_2/NAME_3 are null)
      //   - Level 2 feature: NAME_1 + NAME_2 (NAME_3 is null)
      //   - Level 3 feature: NAME_1 + NAME_2 + NAME_3
      // We must filter by the feature's actual admin level (not just check NAME_1 presence),
      // otherwise level-2/3 features would be picked up when adminLevel=1, which would either
      // exclude the real region polygons (via dedup) or render tiny sub-polygons instead.
      const seenNames = new Set()
      const levelFeatures = []
      const isPopulated = (v) => v != null && v !== '' && v !== 'NA' && v !== 'null'
      for (const feature of adminBoundaryData.features) {
        const props = feature.properties || {}
        // Prefer explicit admin_level property when present (some merged files include it)
        let featureAdminLevel = typeof props.admin_level === 'number' ? props.admin_level : null
        if (featureAdminLevel == null) {
          if (isPopulated(props.NAME_3)) featureAdminLevel = 3
          else if (isPopulated(props.NAME_2)) featureAdminLevel = 2
          else if (isPopulated(props.NAME_1)) featureAdminLevel = 1
          else continue
        }
        if (featureAdminLevel !== adminLevel) continue
        if (adminLevel === 1) {
          if (!isPopulated(props.NAME_1)) continue
          if (seenNames.has(props.NAME_1)) continue
          seenNames.add(props.NAME_1)
          levelFeatures.push(feature)
        } else if (adminLevel === 2) {
          if (!isPopulated(props.NAME_1) || !isPopulated(props.NAME_2)) continue
          const key = `${props.NAME_1}__${props.NAME_2}`
          if (seenNames.has(key)) continue
          seenNames.add(key)
          levelFeatures.push(feature)
        }
      }
      
      debugLog(`📍 Admin level ${adminLevel}: ${levelFeatures.length} features`)
      
      if (levelFeatures.length === 0) {
        debugLog(`⏭️ No features found for admin level ${adminLevel}`)
        return
      }
      
      // Ensure a dedicated pane exists for admin polygons
      if (!map.getPane('adminStatusPane')) {
        const pane = map.createPane('adminStatusPane')
        pane.style.zIndex = '440'
        pane.style.pointerEvents = 'auto'
      }
      const layer = L.geoJSON({ type: 'FeatureCollection', features: levelFeatures }, {
        pane: 'adminStatusPane',
        interactive: true,
        // Only render Polygon/MultiPolygon features. Exclude Point/MultiPoint
        // so no individual village markers/icons appear on the map.
        filter: (feature) => {
          const t = feature?.geometry?.type
          return t === 'Polygon' || t === 'MultiPolygon'
        },
        // Safety net: if any Point feature slips through, render nothing.
        // Returning an empty LayerGroup prevents Leaflet's default CircleMarker
        // from being created for Point geometries.
        pointToLayer: () => L.layerGroup(),
        style: (feature) => {
          const props = feature.properties || {}
          const areaName = adminLevel === 1 ? props.NAME_1 : props.NAME_2
          const areaKey = adminLevel === 1 ? `admin1_${areaName}` : `admin2_${areaName}`
          const areaStatus = currentAdminStatuses[areaKey]
          const status = areaStatus?.status || 'pas-d-information'
          const color = STATUS_COLORS[status] || STATUS_COLORS['pas-d-information']
          
          return {
            fillColor: color,
            fillOpacity: 0.4,
            color: '#000000',
            weight: 1,
            opacity: 0.9
          }
        },
        onEachFeature: (feature, featureLayer) => {
          const props = feature.properties || {}
          const areaName = adminLevel === 1 ? props.NAME_1 : props.NAME_2
          const areaKey = adminLevel === 1 ? `admin1_${areaName}` : `admin2_${areaName}`
          const areaStatus = currentAdminStatuses[areaKey]
          
          const statusDisplay = STATUS_DISPLAY_NAMES[areaStatus?.status] || "Pas d'information"
          const statusColor = STATUS_COLORS[areaStatus?.status] || STATUS_COLORS['pas-d-information']
          const levelName = adminLevel === 1 ? 'Région' : 'Département'
          
          // Find matching people groups for this admin area
          // Use pre-computed direct people groups from adminAreaStatuses if available,
          // otherwise fall back to name-based matching using peopleGroupsRef for stability
          const matchingPeopleGroups = areaStatus?.peopleGroupsDirect?.length > 0
            ? areaStatus.peopleGroupsDirect
            : (peopleGroupsRef.current || []).filter(pg => {
                if (adminLevel === 1) {
                  return (pg.region === areaName || pg.admin1 === areaName)
                } else if (adminLevel === 2) {
                  return (pg.admin2 === areaName || pg.departement === areaName || pg.department === areaName)
                }
                return false
              })
          
          const pgCount = matchingPeopleGroups.length
          const displayPGs = matchingPeopleGroups.slice(0, 5)
          
          // Build people groups list HTML with status badges
          const pgListHtml = displayPGs.length > 0 ? `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
              <p style="font-weight: 600; font-size: 11px; color: #374151; margin-bottom: 6px;">Groupes de peuples (${pgCount}):</p>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${displayPGs.map(pg => {
                  const pgStatus = pg.engagementStatus || 'unreached'
                  const pgStatusColor = STATUS_COLORS[pgStatus] || STATUS_COLORS.unreached
                  const pgStatusName = STATUS_DISPLAY_NAMES[pgStatus] || pgStatus
                  return `
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                      <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${pgStatusColor}; flex-shrink: 0;"></span>
                      <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${pg.name || 'Sans nom'}</span>
                      <span style="font-size: 9px; padding: 1px 4px; border-radius: 4px; background-color: ${pgStatusColor}20; color: ${pgStatusColor}; font-weight: 500;">${pgStatusName}</span>
                    </div>
                  `
                }).join('')}
                ${pgCount > 5 ? `<p style="font-size: 10px; color: #6b7280; margin-top: 4px;">... et ${pgCount - 5} autres</p>` : ''}
              </div>
            </div>
          ` : ''
          
          // View People Groups button HTML (for Admin 1/2 areas)
          const viewPeopleGroupsButtonHtml = pgCount > 0 ? `
            <button 
              class="admin-details-btn" 
              data-admin-level="${adminLevel}"
              data-area-name="${areaName}"
              data-polygon='${encodeURIComponent(JSON.stringify(feature.geometry))}'
              style="margin-top: 10px; width: 100%; padding: 8px 12px; background-color: #2563eb; color: white; font-size: 12px; font-weight: 500; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;"
              onmouseover="this.style.backgroundColor='#1d4ed8'"
              onmouseout="this.style.backgroundColor='#2563eb'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              Voir les groupes de peuples (${pgCount})
            </button>
          ` : ''
          
          // Add People button HTML
          const addPeopleButtonHtml = onAddPeople ? `
            <button 
              class="add-people-admin-btn" 
              data-admin-level="${adminLevel}"
              data-area-name="${areaName}"
              data-polygon='${encodeURIComponent(JSON.stringify(feature.geometry))}'
              style="margin-top: 10px; width: 100%; padding: 8px 12px; background-color: #16a34a; color: white; font-size: 12px; font-weight: 500; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;"
              onmouseover="this.style.backgroundColor='#15803d'"
              onmouseout="this.style.backgroundColor='#16a34a'"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <line x1="19" y1="8" x2="19" y2="14"></line>
                <line x1="22" y1="11" x2="16" y2="11"></line>
              </svg>
              Ajouter un groupe de peuples
            </button>
          ` : ''
          
          const popupContent = `
            <div style="padding:6px 8px;min-width:160px;max-width:220px;font-family:inherit;">
              <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
                <span style="width:8px;height:8px;border-radius:50%;background-color:${statusColor};flex-shrink:0;"></span>
                <span style="font-weight:700;font-size:11px;color:#111;">${areaName || 'Zone inconnue'}</span>
              </div>
              <div style="font-size:9px;color:#6b7280;margin-bottom:3px;">${levelName}</div>
              <div style="font-size:10px;color:#374151;font-weight:500;margin-bottom:2px;">${statusDisplay}</div>
              <div style="font-size:9px;color:#4b5563;display:flex;gap:8px;margin-bottom:3px;">
                <span>Peuples: <strong>${areaStatus?.totalPeoples || 0}</strong></span>
                <span>Villages: <strong>${areaStatus?.villageCount || 0}</strong></span>
              </div>
              ${areaStatus?.statusBreakdown ? `
                <div style="font-size:9px;border-top:1px solid #e5e7eb;padding-top:3px;margin-top:2px;">
                  <div style="display:flex;flex-wrap:wrap;gap:2px 6px;">
                    <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:${STATUS_COLORS.dmm};margin-right:2px;"></span>DMM:${areaStatus.statusBreakdown.dmm}</span>
                    <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:${STATUS_COLORS['tipping-point']};margin-right:2px;"></span>TP:${areaStatus.statusBreakdown['tipping-point']}</span>
                    <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:${STATUS_COLORS.midway};margin-right:2px;"></span>Mid:${areaStatus.statusBreakdown.midway}</span>
                    <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:${STATUS_COLORS.pioneer};margin-right:2px;"></span>Pio:${areaStatus.statusBreakdown.pioneer}</span>
                    <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background-color:${STATUS_COLORS.unreached};margin-right:2px;"></span>Unr:${areaStatus.statusBreakdown.unreached}</span>
                  </div>
                </div>
              ` : ''}
              ${pgCount > 0 ? `
                <div style="border-top:1px solid #e5e7eb;padding-top:3px;margin-top:2px;">
                  <div style="font-size:9px;color:#374151;font-weight:600;margin-bottom:2px;">Groupes (${pgCount}):</div>
                  ${displayPGs.map(pg => {
                    const pgStatus = pg.engagementStatus || 'unreached'
                    const pgStatusColor = STATUS_COLORS[pgStatus] || STATUS_COLORS.unreached
                    const pgStatusName = STATUS_DISPLAY_NAMES[pgStatus] || pgStatus
                    return `<div style="display:flex;align-items:center;gap:4px;font-size:9px;margin-bottom:1px;">
                      <span style="width:5px;height:5px;border-radius:50%;background-color:${pgStatusColor};flex-shrink:0;"></span>
                      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pg.name || 'Sans nom'}</span>
                      <span style="font-size:8px;padding:0 3px;border-radius:3px;background-color:${pgStatusColor}20;color:${pgStatusColor};">${pgStatusName}</span>
                    </div>`
                  }).join('')}
                  ${pgCount > 5 ? `<div style="font-size:8px;color:#9ca3af;margin-top:1px;">+${pgCount - 5} autres</div>` : ''}
                </div>
              ` : ''}
              ${pgCount > 0 ? `
                <button class="admin-details-btn" data-admin-level="${adminLevel}" data-area-name="${areaName}" data-polygon='${encodeURIComponent(JSON.stringify(feature.geometry))}'
                  style="margin-top:4px;width:100%;padding:3px 6px;background-color:#2563eb;color:white;font-size:9px;font-weight:500;border-radius:4px;border:none;cursor:pointer;"
                  onmouseover="this.style.backgroundColor='#1d4ed8'" onmouseout="this.style.backgroundColor='#2563eb'">
                  Voir groupes (${pgCount})
                </button>
              ` : ''}
              ${onAddPeople ? `
                <button class="add-people-admin-btn" data-admin-level="${adminLevel}" data-area-name="${areaName}" data-polygon='${encodeURIComponent(JSON.stringify(feature.geometry))}'
                  style="margin-top:3px;width:100%;padding:3px 6px;background-color:#16a34a;color:white;font-size:9px;font-weight:500;border-radius:4px;border:none;cursor:pointer;"
                  onmouseover="this.style.backgroundColor='#15803d'" onmouseout="this.style.backgroundColor='#16a34a'">
                  + Ajouter groupe
                </button>
              ` : ''}
            </div>
          `
          
          featureLayer.bindPopup(popupContent, { maxWidth: 240, minWidth: 160, autoPan: false })
          
          featureLayer.on({
            click: (e) => {
              L.DomEvent.stopPropagation(e)
              if (e.originalEvent) e.originalEvent.stopPropagation()
              map.closePopup()
              featureLayer.openPopup(e.latlng)
            },
            dblclick: (e) => {
              // Double-click to zoom in further
              L.DomEvent.stopPropagation(e)
              if (e.originalEvent) e.originalEvent.stopPropagation()
              const bounds = featureLayer.getBounds()
              if (bounds && bounds.isValid()) {
                const targetZoom = adminLevel === 1 ? 10 : 12
                map.fitBounds(bounds, { 
                  padding: [20, 20],
                  maxZoom: targetZoom,
                  animate: true,
                  duration: 0.5
                })
              }
            },
            mouseover: (e) => {
              e.target.setStyle({ fillOpacity: 0.6, weight: 3 })
            },
            mouseout: (e) => {
              const status = areaStatus?.status || 'pas-d-information'
              const color = STATUS_COLORS[status] || STATUS_COLORS['pas-d-information']
              e.target.setStyle({ fillColor: color, fillOpacity: 0.4, color: '#000000', weight: 1, opacity: 0.9 })
            }
          })
        }
      })
      
      layer.addTo(map)
      debugLog(`✅ Admin level ${adminLevel} layer added to map`)
      
      // Add event listener for "Add People" buttons in admin popups
      const handleAddPeopleAdminClick = (e) => {
        if (e.target.closest('.add-people-admin-btn')) {
          const btn = e.target.closest('.add-people-admin-btn')
          const adminLevelAttr = btn.getAttribute('data-admin-level')
          const areaName = btn.getAttribute('data-area-name')
          const polygonData = btn.getAttribute('data-polygon')
          
          if (onAddPeopleRef.current && polygonData) {
            try {
              const geometry = JSON.parse(decodeURIComponent(polygonData))
              // Calculate centroid for pre-filling location
              let centroid = null
              if (geometry.coordinates) {
                const coords = geometry.type === 'MultiPolygon' 
                  ? geometry.coordinates[0][0] 
                  : geometry.coordinates[0]
                if (coords && coords.length > 0) {
                  const sumLng = coords.reduce((sum, c) => sum + c[0], 0)
                  const sumLat = coords.reduce((sum, c) => sum + c[1], 0)
                  centroid = { lng: sumLng / coords.length, lat: sumLat / coords.length }
                }
              }
              
              onAddPeopleRef.current({
                adminLevel: parseInt(adminLevelAttr),
                areaName,
                geometry,
                centroid,
                region: adminLevelAttr === '1' ? areaName : null,
                department: adminLevelAttr === '2' ? areaName : null
              })
            } catch (err) {
              console.error('Error parsing polygon data:', err)
            }
          }
        }
      }
      
      document.addEventListener('click', handleAddPeopleAdminClick)
      
      return () => {
        debugLog('🗑️ [ADMIN] Removing admin layer from map')
        document.removeEventListener('click', handleAddPeopleAdminClick)
        map.removeLayer(layer)
      }
  }, [map, visible, adminLevel, adminBoundaryData, adminAreaStatuses])

  // ═══════════════════════════════════════════════════════════════════════════
  // VILLAGE LAYER useEffect (zoom 10+) - Village level polygons
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    debugLog('🗺️ [VILLAGE] Layer creation effect triggered', {
      hasMap: !!map,
      hasFeatures: !!visiblePolygons?.features,
      visibleFeatureCount: visiblePolygons?.features?.length || 0,
      totalFeatureCount: villagesBoundaryData?.features?.length || 0,
      visible,
      statusCount: Object.keys(villageStatuses).length,
      currentZoom,
      isVillageZoomRange
    })
    
    if (!map || !visible) {
      debugLog(`⏭️ [VILLAGE] Skipping layer creation - map or visibility not ready`)
      return
    }
    
    // Village level (zoom 10+) - only render at village zoom range
    if (!visiblePolygons?.features || !isVillageZoomRange) {
      debugLog(`⏭️ [VILLAGE] Skipping village layer creation - conditions not met (zoom: ${currentZoom}, need >= 10)`)
      return
    }

    // Log GeoJSON village names for matching debug (from visible polygons only)
    const geoJsonVillageNames = visiblePolygons.features
      .map(f => f.properties?.name || f.properties?.NAME || '')
      .filter(Boolean)
      .slice(0, 20)
    debugLog('📍 Visible village names (first 20)', geoJsonVillageNames)
    
    // Log status village names for comparison
    const statusVillageNames = Object.keys(villageStatuses).slice(0, 20)
    debugLog('📊 Status village names (first 20)', statusVillageNames)
    
    // Check for matches
    const matchedVillages = geoJsonVillageNames.filter(name => villageStatuses[name])
    debugLog(`🔗 Matched villages: ${matchedVillages.length}/${geoJsonVillageNames.length}`, matchedVillages)

    let coloredCount = 0
    let unreachedCount = 0

    // Use viewport-filtered polygons for rendering (performance optimization)
    // Ensure a dedicated pane exists for colored polygons (above tile layer, below markers)
    if (!map.getPane('villageStatusPane')) {
      const pane = map.createPane('villageStatusPane')
      pane.style.zIndex = '450'
      pane.style.pointerEvents = 'auto'
    }
    const layer = L.geoJSON(visiblePolygons, {
      pane: 'villageStatusPane',
      interactive: true,
      // Only render Polygon/MultiPolygon features. Exclude Point/MultiPoint
      // so no individual village markers/icons appear on the map.
      filter: (feature) => {
        const t = feature?.geometry?.type
        return t === 'Polygon' || t === 'MultiPolygon'
      },
      // Safety net: if any Point feature slips through, render nothing.
      // Returning an empty LayerGroup prevents Leaflet's default CircleMarker
      // from being created for Point geometries.
      pointToLayer: () => L.layerGroup(),
      style: (feature) => {
        const villageName = feature.properties?.name || feature.properties?.NAME || ''
        const villageStatus = villageStatuses[villageName]
        
        // Try case-insensitive match if exact match fails
        let matchedStatus = villageStatus
        if (!matchedStatus && villageName) {
          const lowerName = villageName.toLowerCase().trim()
          const matchKey = Object.keys(villageStatuses).find(
            key => key.toLowerCase().trim() === lowerName
          )
          if (matchKey) {
            matchedStatus = villageStatuses[matchKey]
            debugLog(`🔄 Case-insensitive match: "${villageName}" -> "${matchKey}"`)
          }
        }
        
        const status = matchedStatus?.status || 'pas-d-information'
        const color = STATUS_COLORS[status] || STATUS_COLORS.unreached
        
        if (status !== 'unreached') {
          coloredCount++
          debugLog(`🎨 Coloring village "${villageName}" with status "${status}" -> color ${color}`)
        } else {
          unreachedCount++
        }

        return {
          fillColor: color,
          fillOpacity: 0.4,
          color: '#000000',
          weight: 1,
          opacity: 0.9
        }
      },
      onEachFeature: (feature, featureLayer) => {
        const villageName = feature.properties?.name || feature.properties?.NAME || 'Sans nom'
        const villageStatus = villageStatuses[villageName]
        
        // Find matching people groups for this village
        // First try geographic point-in-polygon, then fall back to name matching
        // Use peopleGroupsRef.current for stability (prevents layer recreation on peopleGroups change)
        const pgByGeography = getPeopleGroupsInFeature(feature, peopleGroupsRef.current || [])
        const pgByName = (peopleGroupsRef.current || []).filter(pg => pg.villageName === villageName)
        // Merge both sets
        const pgMergeMap = new Map()
        pgByGeography.forEach(pg => pgMergeMap.set(pg._id || pg.name, pg))
        pgByName.forEach(pg => pgMergeMap.set(pg._id || pg.name, pg))
        const matchingVillagePGs = Array.from(pgMergeMap.values())
        
        const villagePGCount = matchingVillagePGs.length
        const displayVillagePGs = matchingVillagePGs.slice(0, 5)
        
        // Build people groups list HTML for village popup
        const villagePGListHtml = displayVillagePGs.length > 0 ? `
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
            <p style="font-weight: 600; font-size: 11px; color: #374151; margin-bottom: 6px;">Groupes de peuples (${villagePGCount}):</p>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              ${displayVillagePGs.map(pg => {
                const pgStatus = pg.engagementStatus || 'unreached'
                const pgStatusColor = STATUS_COLORS[pgStatus] || STATUS_COLORS.unreached
                const pgStatusName = STATUS_DISPLAY_NAMES[pgStatus] || pgStatus
                return `
                  <div style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${pgStatusColor}; flex-shrink: 0;"></span>
                    <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${pg.name || 'Sans nom'}</span>
                    <span style="font-size: 9px; padding: 1px 4px; border-radius: 4px; background-color: ${pgStatusColor}20; color: ${pgStatusColor}; font-weight: 500;">${pgStatusName}</span>
                  </div>
                `
              }).join('')}
              ${villagePGCount > 5 ? `<p style="font-size: 10px; color: #6b7280; margin-top: 4px;">... et ${villagePGCount - 5} autres</p>` : ''}
            </div>
          </div>
        ` : ''
        
        let popupContent = `<div style="padding:6px 8px;min-width:150px;max-width:210px;font-family:inherit;">
          <div style="font-weight:700;font-size:11px;color:#111;margin-bottom:3px;">${villageName}</div>
        `
        
        if (villageStatus) {
          const statusDisplay = STATUS_DISPLAY_NAMES[villageStatus.status] || villageStatus.status
          const statusColor = STATUS_COLORS[villageStatus.status] || STATUS_COLORS.unreached
          const percentages = villageStatus.percentages || { pioneer: 0, midway: 0, tippingPoint: 0, dmm: 0, unreached: 0 }
          const breakdown = villageStatus.statusBreakdown || { pioneer: 0, midway: 0, tippingPoint: 0, dmm: 0, unreached: 0 }
          const dominantStatus = villageStatus.dominantStatus || villageStatus.status
          
          popupContent += `
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
              <span style="width:7px;height:7px;border-radius:50%;background-color:${statusColor};flex-shrink:0;"></span>
              <span style="font-size:10px;font-weight:600;color:#374151;">${statusDisplay}</span>
            </div>
            <div style="font-size:9px;color:#4b5563;margin-bottom:2px;">Groupes: <strong>${villageStatus.totalPeoples}</strong></div>
            <div style="font-size:9px;border-top:1px solid #e5e7eb;padding-top:2px;margin-top:2px;">
              <div style="display:flex;flex-wrap:wrap;gap:1px 5px;">
                <span style="color:${dominantStatus==='unreached'?STATUS_COLORS.unreached:'#6b7280'};font-weight:${dominantStatus==='unreached'?'700':'400'};">
                  <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background-color:${STATUS_COLORS.unreached};margin-right:1px;"></span>Unr:${breakdown.unreached||0}(${percentages.unreached||0}%)
                </span>
                <span style="color:${dominantStatus==='pioneer'?STATUS_COLORS.pioneer:'#6b7280'};font-weight:${dominantStatus==='pioneer'?'700':'400'};">
                  <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background-color:${STATUS_COLORS.pioneer};margin-right:1px;"></span>Pio:${breakdown.pioneer}(${percentages.pioneer}%)
                </span>
                <span style="color:${dominantStatus==='midway'?STATUS_COLORS.midway:'#6b7280'};font-weight:${dominantStatus==='midway'?'700':'400'};">
                  <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background-color:${STATUS_COLORS.midway};margin-right:1px;"></span>Mid:${breakdown.midway}(${percentages.midway}%)
                </span>
                <span style="color:${dominantStatus==='tipping-point'?STATUS_COLORS['tipping-point']:'#6b7280'};font-weight:${dominantStatus==='tipping-point'?'700':'400'};">
                  <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background-color:${STATUS_COLORS['tipping-point']};margin-right:1px;"></span>TP:${breakdown.tippingPoint}(${percentages.tippingPoint}%)
                </span>
                <span style="color:${dominantStatus==='dmm'?STATUS_COLORS.dmm:'#6b7280'};font-weight:${dominantStatus==='dmm'?'700':'400'};">
                  <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background-color:${STATUS_COLORS.dmm};margin-right:1px;"></span>DMM:${breakdown.dmm}(${percentages.dmm}%)
                </span>
              </div>
            </div>
            <button class="village-details-btn" data-village-name="${villageName}" data-polygon='${encodeURIComponent(JSON.stringify(feature.geometry))}'
              style="margin-top:4px;width:100%;padding:3px 6px;background-color:#2563eb;color:white;font-size:9px;font-weight:500;border-radius:4px;border:none;cursor:pointer;">
              Voir groupes (${villageStatus.totalPeoples})
            </button>
            <button class="add-people-group-btn" data-village-name="${villageName}" data-polygon='${encodeURIComponent(JSON.stringify(feature.geometry))}'
              style="margin-top:2px;width:100%;padding:3px 6px;background-color:#16a34a;color:white;font-size:9px;font-weight:500;border-radius:4px;border:none;cursor:pointer;">
              + Ajouter groupe
            </button>
          `
        } else {
          popupContent += `
            <div style="font-size:9px;color:#6b7280;margin-bottom:3px;">${isFrench ? 'Aucune donnée de statut' : 'No status data'}</div>
            <button class="village-details-btn" data-village-name="${villageName}" data-polygon='${encodeURIComponent(JSON.stringify(feature.geometry))}'
              style="margin-top:3px;width:100%;padding:3px 6px;background-color:#6b7280;color:white;font-size:9px;font-weight:500;border-radius:4px;border:none;cursor:pointer;">
              Rechercher groupes
            </button>
            <button class="add-people-group-btn" data-village-name="${villageName}" data-polygon='${encodeURIComponent(JSON.stringify(feature.geometry))}'
              style="margin-top:2px;width:100%;padding:3px 6px;background-color:#16a34a;color:white;font-size:9px;font-weight:500;border-radius:4px;border:none;cursor:pointer;">
              + Ajouter groupe
            </button>
          `
        }
        
        popupContent += villagePGListHtml ? `<div style="border-top:1px solid #e5e7eb;padding-top:2px;margin-top:2px;font-size:9px;">${villagePGListHtml}</div>` : ''
        popupContent += '</div>'
        
        featureLayer.bindPopup(popupContent, {
          closeButton: true,
          autoClose: false,
          closeOnEscapeKey: true,
          closeOnClick: false,
          maxWidth: 230,
          minWidth: 150,
          autoPan: false
        })
        
        // Track if popup is open to prevent mouseout from resetting style
        let isPopupOpen = false
        
        featureLayer.on({
          click: (e) => {
            L.DomEvent.stopPropagation(e)
            L.DomEvent.preventDefault(e)
            if (e.originalEvent) {
              e.originalEvent.stopPropagation()
              e.originalEvent.preventDefault()
            }
            // Close any open popup first (single popup at a time)
            map.closePopup()
            featureLayer.openPopup(e.latlng)
            isPopupOpen = true
          },
          popupopen: () => {
            isPopupOpen = true
          },
          popupclose: () => {
            isPopupOpen = false
            // Reset style when popup closes
            const villageName = feature.properties?.name || feature.properties?.NAME || ''
            const villageStatus = villageStatuses[villageName]
            let matchedStatus = villageStatus
            if (!matchedStatus && villageName) {
              const lowerName = villageName.toLowerCase().trim()
              const matchKey = Object.keys(villageStatuses).find(
                key => key.toLowerCase().trim() === lowerName
              )
              if (matchKey) {
                matchedStatus = villageStatuses[matchKey]
              }
            }
            const status = matchedStatus?.status || 'pas-d-information'
            const color = STATUS_COLORS[status] || STATUS_COLORS['pas-d-information']
            featureLayer.setStyle({
              fillColor: color,
              fillOpacity: 0.4,
              color: '#000000',
              weight: 1,
              opacity: 0.9
            })
          },
          mouseover: (e) => {
            e.target.setStyle({
              fillOpacity: 0.6,
              weight: 3
            })
          },
          mouseout: (e) => {
            // Don't reset style if popup is open
            if (isPopupOpen) return
            
            const villageName = feature.properties?.name || feature.properties?.NAME || ''
            const villageStatus = villageStatuses[villageName]
            
            // Try case-insensitive match if exact match fails (same logic as style function)
            let matchedStatus = villageStatus
            if (!matchedStatus && villageName) {
              const lowerName = villageName.toLowerCase().trim()
              const matchKey = Object.keys(villageStatuses).find(
                key => key.toLowerCase().trim() === lowerName
              )
              if (matchKey) {
                matchedStatus = villageStatuses[matchKey]
              }
            }
            
            // Use 'pas-d-information' as default (gray) instead of 'unreached' (red)
            // This ensures gray polygons stay gray on mouseout
            const status = matchedStatus?.status || 'pas-d-information'
            const color = STATUS_COLORS[status] || STATUS_COLORS['pas-d-information']
            
            e.target.setStyle({
              fillColor: color,
              fillOpacity: 0.4,
              color: '#000000',
              weight: 1,
              opacity: 0.9
            })
          }
        })
      }
    })

    layer.addTo(map)
    debugLog(`✅ Layer added to map - ${coloredCount} colored, ${unreachedCount} unreached`)

    // Add event listener for "Add People Group" buttons in village popups
    const handleAddPeopleVillageClick = (e) => {
      if (e.target.closest('.add-people-group-btn')) {
        const btn = e.target.closest('.add-people-group-btn')
        const villageName = btn.getAttribute('data-village-name')
        const polygonData = btn.getAttribute('data-polygon')
        
        if (onAddPeopleRef.current && polygonData) {
          try {
            const geometry = JSON.parse(decodeURIComponent(polygonData))
            // Calculate centroid for pre-filling location
            let centroid = null
            if (geometry.coordinates) {
              const coords = geometry.type === 'MultiPolygon' 
                ? geometry.coordinates[0][0] 
                : geometry.coordinates[0]
              if (coords && coords.length > 0) {
                const sumLng = coords.reduce((sum, c) => sum + c[0], 0)
                const sumLat = coords.reduce((sum, c) => sum + c[1], 0)
                centroid = { lng: sumLng / coords.length, lat: sumLat / coords.length }
              }
            }
            
            onAddPeopleRef.current({
              adminLevel: 3, // Village level
              villageName,
              geometry,
              centroid
            })
          } catch (err) {
            console.error('Error parsing polygon data:', err)
          }
        }
      }
    }
    
    document.addEventListener('click', handleAddPeopleVillageClick)

    return () => {
      debugLog('🗑️ [VILLAGE] Removing village layer from map')
      document.removeEventListener('click', handleAddPeopleVillageClick)
      map.removeLayer(layer)
    }
  }, [map, visiblePolygons, villageStatuses, visible, isVillageZoomRange, currentZoom])

  return null
}

/**
 * VillageStatusLegend Component
 * Displays a toggleable legend for village status colors with threshold rules.
 * Click to show/hide the legend content.
 * 
 * Shows the new threshold-based rules:
 * - DMM (≥30% peuples DMM)
 * - Tipping Point (≥40% peuples Tipping Point)
 * - Midway (≥50% peuples Midway)
 * - Pioneer (≥70% peuples Pioneer)
 * - Unreached (aucun peuple)
 */
export const VillageStatusLegend = ({ visible }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  
  if (!visible) return null

  // Order statuses for display (priority order: dmm, tipping-point, midway, pioneer, unreached, pas-d-information)
  const statusOrder = ['dmm', 'tipping-point', 'midway', 'pioneer', 'unreached', 'pas-d-information']

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      {/* Clickable Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-xs font-semibold text-gray-600 hover:text-gray-800 transition-colors"
      >
        <span>Statut des villages (seuils)</span>
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {/* Collapsible Content */}
      <div
        className={`transition-all duration-200 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-48 opacity-100 mt-1.5' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-1.5">
          {statusOrder.map((status) => (
            <div key={status} className="flex items-center gap-2">
              <span 
                className="w-3 h-3 rounded" 
                style={{ backgroundColor: STATUS_COLORS[status] }}
              ></span>
              <span className="text-xs">{LEGEND_DESCRIPTIONS[status]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * VillageStatusStats Component
 * Displays statistics panel for village statuses with counts and percentages.
 * 
 * Shows:
 * - Total villages count
 * - Total people groups count
 * - Villages by status with counts and percentages
 * - People groups by status with counts and percentages
 * 
 * When administrative filters are applied (selectedRegion, selectedDepartment, selectedArrondissement),
 * the statistics are filtered to show only data for the selected area.
 */
export const VillageStatusStats = ({ 
  statistics, 
  visible,
  selectedRegion,
  selectedDepartment,
  selectedArrondissement
}) => {
  if (!visible || !statistics) return null

  // Get the filter label for display
  const getFilterLabel = () => {
    if (selectedArrondissement) return `Arrondissement: ${selectedArrondissement}`
    if (selectedDepartment) return `Département: ${selectedDepartment}`
    if (selectedRegion) return `Région: ${selectedRegion}`
    return null
  }
  const filterLabel = getFilterLabel()

  // Calculate village percentages
  const totalVillages = statistics.totalVillages || 0
  const villagePercentages = {}
  Object.entries(statistics.byStatus || {}).forEach(([status, count]) => {
    villagePercentages[status] = totalVillages > 0 
      ? Math.round((count / totalVillages) * 100) 
      : 0
  })

  // Get people group percentages (use new format if available)
  const pgPercentages = statistics.overallPercentages || {
    pioneer: 0,
    midway: 0,
    tippingPoint: 0,
    dmm: statistics.overallDmmPercentage || 0,
    unreached: 0
  }

  // Get people group counts by status
  const pgByStatus = statistics.peopleGroupsByStatus || {
    pioneer: 0,
    midway: 0,
    tippingPoint: 0,
    dmm: statistics.totalDmmPeopleGroups || 0,
    unreached: 0
  }

  // Order statuses for display
  const statusOrder = ['dmm', 'tipping-point', 'midway', 'pioneer', 'unreached']

  return (
    <div className="p-3 text-xs max-w-[280px]">
      {/* Filter indicator */}
      {filterLabel && (
        <div className="mb-2 px-2 py-1 bg-primary-50 text-primary-700 rounded text-xs font-medium">
          📍 {filterLabel}
        </div>
      )}
      
      {/* Summary */}
      <div className="space-y-1 mb-3">
        <p><strong>Total villages:</strong> {statistics.totalVillages}</p>
        <p><strong>Groupes de peuples:</strong> {statistics.totalPeopleGroups}</p>
      </div>
      
      {/* Villages by status */}
      <div className="pt-2 border-t border-gray-200">
        <p className="font-medium mb-1 text-gray-700">Villages par statut:</p>
        <div className="space-y-1">
          {statusOrder.map((status) => {
            const count = statistics.byStatus?.[status] || 0
            const pct = villagePercentages[status] || 0
            return (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                  ></span>
                  <span>{STATUS_DISPLAY_NAMES[status]}:</span>
                </div>
                <span className="font-medium">{count} ({pct}%)</span>
              </div>
            )
          })}
        </div>
      </div>
      
      {/* People groups by status */}
      <div className="mt-2 pt-2 border-t border-gray-200">
        <p className="font-medium mb-1 text-gray-700">Peuples par statut:</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.pioneer }}></span>
              <span>Pioneer:</span>
            </div>
            <span className="font-medium">{pgByStatus.pioneer} ({pgPercentages.pioneer}%)</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.midway }}></span>
              <span>Midway:</span>
            </div>
            <span className="font-medium">{pgByStatus.midway} ({pgPercentages.midway}%)</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS['tipping-point'] }}></span>
              <span>Tipping Point:</span>
            </div>
            <span className="font-medium">{pgByStatus.tippingPoint} ({pgPercentages.tippingPoint}%)</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.dmm }}></span>
              <span>DMM:</span>
            </div>
            <span className="font-medium">{pgByStatus.dmm} ({pgPercentages.dmm}%)</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.unreached }}></span>
              <span>Unreached:</span>
            </div>
            <span className="font-medium">{pgByStatus.unreached} ({pgPercentages.unreached}%)</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export { STATUS_COLORS, STATUS_DISPLAY_NAMES, STATUS_THRESHOLDS, LEGEND_DESCRIPTIONS }
export default VillageStatusLayer