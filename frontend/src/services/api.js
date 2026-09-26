import axios from 'axios'

// Use empty baseURL to leverage Vite's proxy in development
// In production, VITE_API_URL should be set to the actual API URL
const api = axios.create({
  baseURL: import.meta.env.PROD ? import.meta.env.VITE_API_URL : '',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout (increased for paginated requests)
})

// ============================================
// PAGINATION HELPER FUNCTIONS
// ============================================

/**
 * Fetch all pages of data automatically with progress callback
 * Handles pagination by fetching pages until no more data is available
 * 
 * @param {Function} fetchFn - Function that takes params and returns axios response
 * @param {Object} baseParams - Base query parameters (filters, etc.)
 * @param {Object} options - Pagination options
 * @param {number} options.limit - Records per page (default: 500, max enforced by server)
 * @param {Function} options.onProgress - Callback for progress updates (page, totalPages, recordsFetched)
 * @param {number} options.maxPages - Maximum pages to fetch (default: 100, safety limit)
 * @param {AbortSignal} options.signal - AbortController signal for cancellation
 * @returns {Promise<Array>} All fetched records combined
 */
export const fetchAllPages = async (fetchFn, baseParams = {}, options = {}) => {
  const {
    limit = 500,
    onProgress = null,
    maxPages = 100,
    signal = null
  } = options
  
  let allData = []
  let page = 1
  let hasMore = true
  let totalCount = 0
  let totalPages = 1
  
  console.log('[Pagination] Starting paginated fetch with params:', baseParams)
  
  while (hasMore && page <= maxPages) {
    // Check for cancellation
    if (signal?.aborted) {
      console.log('[Pagination] Fetch cancelled by user')
      throw new Error('Fetch cancelled')
    }
    
    try {
      const params = { ...baseParams, page, limit }
      const response = await fetchFn(params)
      
      // Handle different response structures
      const responseData = response.data
      const pageData = responseData.data || responseData.peopleGroups || responseData.villages || responseData || []
      const pageTotalCount = responseData.totalCount || responseData.total || 0
      const pageHasMore = responseData.hasMore !== undefined ? responseData.hasMore : (pageData.length === limit)
      
      // Update totals on first page
      if (page === 1) {
        totalCount = pageTotalCount
        totalPages = responseData.totalPages || Math.ceil(totalCount / limit) || 1
      }
      
      // Add data to collection, de-duplicating by _id.
      // Pagination can return the same record on multiple pages when sort values
      // are non-unique; without de-duplication totals get inflated (map vs dashboard).
      if (Array.isArray(pageData)) {
        const seen = new Set(allData.map((d) => d && d._id))
        for (const item of pageData) {
          if (item && item._id != null) {
            if (!seen.has(item._id)) {
              seen.add(item._id)
              allData.push(item)
            }
          } else {
            allData.push(item)
          }
        }
      }
      
      // Report progress
      if (onProgress) {
        onProgress({
          page,
          totalPages,
          recordsFetched: allData.length,
          totalCount,
          isComplete: !pageHasMore || page >= totalPages
        })
      }
      
      console.log(`[Pagination] Page ${page}/${totalPages}: fetched ${pageData.length} records (total: ${allData.length}/${totalCount})`)
      
      // Check if we should continue
      hasMore = pageHasMore && pageData.length > 0 && page < totalPages
      page++
      
    } catch (error) {
      if (error.message === 'Fetch cancelled') {
        throw error
      }
      console.error(`[Pagination] Error fetching page ${page}:`, error)
      // On error, stop pagination but return what we have
      hasMore = false
      if (allData.length === 0) {
        throw error // Re-throw if we have no data at all
      }
    }
  }
  
  if (page > maxPages) {
    console.warn(`[Pagination] Reached max pages limit (${maxPages}). Some data may be missing.`)
  }
  
  console.log(`[Pagination] Complete: fetched ${allData.length} total records in ${page - 1} pages`)
  return allData
}

/**
 * Create a paginated API wrapper for any endpoint
 * Returns an object with methods for single-page and all-pages fetching
 * 
 * @param {Function} apiFn - The base API function (e.g., api.get)
 * @param {string} endpoint - API endpoint path
 * @returns {Object} Object with getPage() and getAll() methods
 */
export const createPaginatedApi = (apiFn, endpoint) => ({
  /**
   * Fetch a single page of data
   */
  getPage: (params) => apiFn(endpoint, { params }),
  
  /**
   * Fetch all pages of data with progress tracking
   */
  getAll: (params, options) => fetchAllPages(
    (p) => apiFn(endpoint, { params: p }),
    params,
    options
  )
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect on 401 if it's NOT the initial auth check
    // This prevents logout loops when the token is simply expired
    if (error.response?.status === 401) {
      const isAuthEndpoint = error.config?.url?.includes('/auth/')
      
      // Don't auto-redirect for auth endpoints (let the AuthContext handle it)
      // and don't redirect if we're already on the login page
      if (!isAuthEndpoint && !window.location.pathname.includes('/login')) {
        localStorage.removeItem('token')
        // Use a small delay to allow any pending operations to complete
        setTimeout(() => {
          window.location.href = '/login'
        }, 100)
      }
    }
    return Promise.reject(error)
  }
)

export default api

// Villages API
export const villagesApi = {
  getAll: (params) => api.get('/api/villages', { params }),
  getById: (id) => api.get(`/api/villages/${id}`),
  create: (data) => api.post('/api/villages', data),
  update: (id, data) => api.put(`/api/villages/${id}`, data),
  delete: (id) => api.delete(`/api/villages/${id}`),
  getNearby: (lng, lat, maxDistance) =>
    api.get(`/api/villages/nearby?lng=${lng}&lat=${lat}&maxDistance=${maxDistance}`),
  
  /**
   * Get Voronoi diagram from all villages in database
   * 
   * Voronoi diagrams (Thiessen polygons) partition space into regions
   * where each region contains all points closest to a specific village.
   * Useful for visualizing village influence zones.
   * 
   * @param {Object} params - Query parameters
   * @param {string} params.status - Filter by village status (optional)
   * @param {number} params.padding - Bounding box padding in degrees (default: 0.5)
   * @param {number} params.limit - Maximum villages to include (default: 500)
   * @returns {Promise} GeoJSON FeatureCollection of Voronoi polygons
   */
  getVoronoi: (params) => api.get('/api/villages/voronoi', { params }),
  
  /**
   * Generate Voronoi diagram from custom village points
   * 
   * @param {Array} villages - Array of village objects
   * @param {string} villages[].name - Village name
   * @param {Array} villages[].coordinates - [longitude, latitude]
   * @param {string} villages[].id - Optional village ID
   * @param {string} villages[].status - Optional status
   * @param {number} padding - Bounding box padding (default: 0.5)
   * @returns {Promise} GeoJSON FeatureCollection of Voronoi polygons
   * 
   * @example
   * villagesApi.getVoronoiFromPoints([
   *   { name: 'Village A', coordinates: [10.5, 5.2], status: 'unreached' },
   *   { name: 'Village B', coordinates: [11.0, 5.5], status: 'engaged' },
   *   { name: 'Village C', coordinates: [10.8, 5.8], status: 'established' }
   * ])
   */
  getVoronoiFromPoints: (villages, padding = 0.5) => 
    api.post('/api/villages/voronoi', { villages, padding }),
  
  /**
   * Get calculated status for all villages based on people group DMM percentages
   * 
   * Status Rules:
   * - Pioneer: 1-15% DMM
   * - Midway: 16-50% DMM
   * - Tipping Point: 51-75% DMM
   * - DMM: 76-100% DMM AND all people groups are at least Pioneer
   * 
   * @param {Object} params - Query parameters
   * @param {string} params.status - Filter by specific status (optional)
   * @returns {Promise} Object with villages array and statistics
   */
  getStatuses: (params) => api.get('/api/villages/statuses', { params }),
  
  /**
   * Get calculated status for a specific village
   * 
   * @param {string} villageName - Name of the village
   * @returns {Promise} Village status object with details
   */
  getStatusByName: (villageName) => 
    api.get(`/api/villages/statuses/${encodeURIComponent(villageName)}`),
  
  /**
   * Get summary statistics of village statuses
   * 
   * @returns {Promise} Statistics object with counts by status
   */
  getStatusSummary: () => api.get('/api/villages/status-summary'),
  
  // ============================================
  // PAGINATED METHODS - Fetch all pages automatically
  // ============================================
  
  /**
   * Fetch ALL villages with automatic pagination
   * Automatically fetches all pages until no more data is available
   * 
   * @param {Object} filters - Geographic and other filters
   * @param {string} filters.country - Country code filter (e.g., 'CM', 'TD', 'CG')
   * @param {string} filters.region - Region/admin1 filter
   * @param {string} filters.admin2 - Department/admin2 filter (alias: departement)
   * @param {string} filters.admin3 - Arrondissement/admin3 filter (alias: arrondissement)
   * @param {string} filters.status - Status filter
   * @param {Object} options - Pagination options
   * @param {Function} options.onProgress - Progress callback ({page, totalPages, recordsFetched, totalCount})
   * @param {AbortSignal} options.signal - AbortController signal for cancellation
   * @returns {Promise<Array>} All villages matching filters
   * 
   * @example
   * // Fetch all villages in Cameroon
   * villagesApi.getAllPaginated({ country: 'CM' })
   * 
   * // Fetch villages in a specific region with progress
   * villagesApi.getAllPaginated(
   *   { country: 'CM', region: 'Centre' },
   *   { onProgress: (p) => console.log(`Page ${p.page}/${p.totalPages}`) }
   * )
   */
  getAllPaginated: async (filters = {}, options = {}) => {
    console.log('[villagesApi] Starting paginated fetch with geographic filters:', filters)
    return fetchAllPages(
      (params) => api.get('/api/villages', { params }),
      filters,
      { limit: 500, ...options }
    )
  },
}

// People Groups API
// 
// PERFORMANCE OPTIMIZATION: includeGeometry parameter
// ====================================================
// The API supports an 'includeGeometry' parameter to control whether polygon/geometry
// data is returned. This significantly reduces payload size for list/table views.
//
// - includeGeometry=false (default): Excludes polygon field (~90% smaller payload)
// - includeGeometry=true: Includes polygon field for map rendering
//
// Use getAll() for lists/tables/dropdowns (no geometry needed)
// Use getAllWithGeometry() for map components that need to render polygons
//
export const peopleGroupsApi = {
  /**
   * Get all people groups WITHOUT geometry data (optimized for lists/tables)
   * 
   * Use this for:
   * - Dashboard statistics
   * - Data tables and lists
   * - Dropdown selections
   * - Export previews
   * - Any non-map context
   * 
   * Performance: ~90% smaller payload than with geometry
   * 
   * @param {Object} params - Query parameters (limit, skip, status, region, etc.)
   * @returns {Promise} People groups without polygon/geometry fields
   */
  getAll: (params) => api.get('/api/people-groups', { 
    params: { ...params, includeGeometry: false } 
  }),
  
  /**
   * Get all people groups WITH geometry data (for map rendering)
   * 
   * Use this ONLY for:
   * - Map components that render polygons
   * - GeoJSON exports
   * - Spatial analysis features
   * 
   * WARNING: Large payload size - use sparingly and with appropriate filters
   * 
   * @param {Object} params - Query parameters (limit, skip, status, region, etc.)
   * @returns {Promise} People groups with polygon/geometry fields included
   */
  getAllWithGeometry: (params) => {
    console.log('[peopleGroupsApi] Loading people groups WITH geometry for map display...')
    return api.get('/api/people-groups', { 
      params: { ...params, includeGeometry: true } 
    })
  },
  
  getById: (id) => api.get(`/api/people-groups/${id}`),
  create: (data) => api.post('/api/people-groups', data),
  update: (id, data) => api.put(`/api/people-groups/${id}`, data),
  delete: (id) => api.delete(`/api/people-groups/${id}`),
  getNearby: (lng, lat, maxDistance) =>
    api.get(`/api/people-groups/nearby/${lng}/${lat}?maxDistance=${maxDistance}`),
  getStats: () => api.get('/api/people-groups/stats/summary'),
  
  /**
   * Get unique village names for dropdown selection
   * @returns {Promise} Object with villages array and total count
   */
  getVillages: () => api.get('/api/people-groups/villages'),
  
  /**
   * Get people groups by village name
   * @param {string} villageName - Name of the village
   * @returns {Promise} Object with peopleGroups array and total count
   */
  getByVillage: (villageName) => 
    api.get(`/api/people-groups/by-village/${encodeURIComponent(villageName)}`),
  
  /**
   * Get people groups within a polygon
   * @param {Object} polygon - GeoJSON polygon geometry
   * @param {string} villageName - Optional village name for reference
   * @returns {Promise} Object with peopleGroups array and total count
   */
  getByPolygon: (polygon, villageName) => 
    api.post('/api/people-groups/by-polygon', { polygon, villageName }),
  
  /**
   * Get people groups within map viewport bounds (for viewport-based loading)
   * @param {Object} bounds - Bounding box { north, south, east, west }
   * @param {Object} options - Optional filters { source, status, limit }
   * @returns {Promise} Object with markers array, total count, and bounds info
   */
  getByBounds: (bounds, options = {}) => 
    api.get('/api/people-groups/by-bounds', { 
      params: { 
        ...bounds, 
        ...options 
      } 
    }),
  
  /**
   * Approve a people group (admin/supervisor only)
   * @param {string} id - People group ID
   * @returns {Promise} Approved people group
   */
  approve: (id) => api.post(`/api/people-groups/${id}/approve`),
  
  /**
   * Reject a people group (admin/supervisor only)
   * @param {string} id - People group ID
   * @param {string} reason - Rejection reason
   * @returns {Promise} Rejected people group
   */
  reject: (id, reason) => api.post(`/api/people-groups/${id}/reject`, { reason }),
  
  /**
   * Get pending people groups awaiting validation (admin/supervisor only)
   * @param {Object} params - Query parameters (limit, skip)
   * @returns {Promise} Object with data array and total count
   */
  getPending: (params) => api.get('/api/people-groups/pending', { params }),
  
  /**
   * Get rejected people groups (admin/supervisor only)
   * @param {Object} params - Query parameters (limit, skip, status, search)
   * @returns {Promise} Object with data array and total count
   */
  getRejected: (params) => api.get('/api/people-groups/rejected', { params }),
  
  /**
   * Get count of rejected people groups
   * @returns {Promise} Object with total and byStatus counts
   */
  getRejectedCount: () => api.get('/api/people-groups/rejected/count'),
  
  /**
   * Get a single rejected people group by ID
   * @param {string} id - Rejected people group ID
   * @returns {Promise} Rejected people group details
   */
  getRejectedById: (id) => api.get(`/api/people-groups/rejected/${id}`),
  
  /**
   * Archive a rejected people group
   * @param {string} id - Rejected people group ID
   * @returns {Promise} Updated rejected people group
   */
  archiveRejected: (id) => api.put(`/api/people-groups/rejected/${id}/archive`),
  
  // ============================================
  // PAGINATED METHODS - Fetch all pages automatically
  // ============================================
  
  /**
   * Fetch ALL people groups with automatic pagination (no geometry)
   * Automatically fetches all pages until no more data is available
   * 
   * @param {Object} filters - Geographic and other filters
   * @param {string} filters.countryCode - Country code(s), comma-separated (e.g., 'CM,TD,CG')
   * @param {string} filters.region - Region/Admin1 filter
   * @param {string} filters.admin2 - Department/Admin2 filter
   * @param {string} filters.admin3 - Arrondissement/Admin3 filter
   * @param {string} filters.status - Status filter
   * @param {string} filters.search - Search term
   * @param {Object} options - Pagination options
   * @param {Function} options.onProgress - Progress callback ({page, totalPages, recordsFetched, totalCount})
   * @param {AbortSignal} options.signal - AbortController signal for cancellation
   * @returns {Promise<Array>} All people groups matching filters
   */
  getAllPaginated: async (filters = {}, options = {}) => {
    console.log('[peopleGroupsApi] Starting paginated fetch (no geometry):', filters)
    return fetchAllPages(
      (params) => api.get('/api/people-groups', { 
        params: { ...params, includeGeometry: false } 
      }),
      filters,
      { limit: 500, ...options }
    )
  },
  
  /**
   * Fetch ALL people groups WITH geometry using automatic pagination
   * Use for map components that need all data with polygons
   * 
   * @param {Object} filters - Geographic and other filters
   * @param {string} filters.countryCode - Country code(s), comma-separated
   * @param {string} filters.region - Region/Admin1 filter
   * @param {string} filters.admin2 - Department/Admin2 filter
   * @param {string} filters.admin3 - Arrondissement/Admin3 filter
   * @param {Object} options - Pagination options
   * @param {Function} options.onProgress - Progress callback
   * @param {AbortSignal} options.signal - AbortController signal
   * @returns {Promise<Array>} All people groups with geometry
   */
  getAllWithGeometryPaginated: async (filters = {}, options = {}) => {
    console.log('[peopleGroupsApi] Starting paginated fetch WITH geometry:', filters)
    return fetchAllPages(
      (params) => api.get('/api/people-groups', { 
        params: { ...params, includeGeometry: true } 
      }),
      filters,
      { limit: 500, ...options }
    )
  },
}

// Churches API
export const churchesApi = {
  getAll: (params) => api.get('/api/churches', { params }),
  getById: (id) => api.get(`/api/churches/${id}`),
  create: (data) => api.post('/api/churches', data),
  update: (id, data) => api.put(`/api/churches/${id}`, data),
  delete: (id) => api.delete(`/api/churches/${id}`),
}

// Activities API
export const activitiesApi = {
  getAll: (params) => api.get('/api/activities', { params }),
  getById: (id) => api.get(`/api/activities/${id}`),
  create: (data) => api.post('/api/activities', data),
  update: (id, data) => api.put(`/api/activities/${id}`, data),
  delete: (id) => api.delete(`/api/activities/${id}`),
  /**
   * Archive or unarchive an activity
   * @param {string} id - Activity ID
   * @param {boolean} archived - Whether to archive (true) or unarchive (false)
   * @returns {Promise} Updated activity
   */
  archive: (id, archived) => api.patch(`/api/activities/${id}/archive`, { archived }),
}

// Projects API
export const projectsApi = {
  getAll: (params) => api.get('/api/projects', { params }),
  getStats: () => api.get('/api/projects/stats'),
  getById: (id) => api.get(`/api/projects/${id}`),
  create: (data) => api.post('/api/projects', data),
  update: (id, data) => api.put(`/api/projects/${id}`, data),
  delete: (id) => api.delete(`/api/projects/${id}`),
}

// Stats API
export const statsApi = {
  getDashboard: () => api.get('/api/stats/dashboard'),
  getVillageStats: () => api.get('/api/stats/villages'),
  getChurchStats: () => api.get('/api/stats/churches'),
  getActivityStats: () => api.get('/api/stats/activities'),
}

// Import API
export const importApi = {
  downloadTemplate: () => api.get('/api/import/people-groups/template', { responseType: 'blob' }),
  validatePeopleGroups: (formData) => api.post('/api/import/people-groups/validate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  importPeopleGroups: (formData) => api.post('/api/import/people-groups', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
}

// Export API
export const exportApi = {
  exportAll: (format = 'json') => api.get(`/api/export/all?format=${format}`, { responseType: 'blob' }),
  exportVillages: (data) => api.post('/api/export/villages', data, { responseType: 'blob' }),
  exportPeopleGroups: (format = 'csv') => api.get(`/api/export/people-groups?format=${format}`, { responseType: 'blob' }),
  exportGeoJSON: (params) => api.get('/api/export/geojson', { params, responseType: 'blob' }),
  exportKML: (params) => api.get('/api/export/kml', { params, responseType: 'blob' }),
  exportExcel: (params) => api.get('/api/export/excel', { params, responseType: 'blob' }),
}

// Search API
export const searchApi = {
  /**
   * Unified search across villages, people groups, and churches
   * @param {Object} params - Search parameters
   * @param {string} params.q - Search query
   * @param {string} params.type - Type filter (village|people|church|status|all)
   * @param {number} params.limit - Max results per type
   * @returns {Promise} Search results
   */
  search: (params) => api.get('/api/search', { params }),
  
  /**
   * Get search suggestions for autocomplete
   * @param {string} q - Query string
   * @param {number} limit - Max suggestions
   * @returns {Promise} Suggestions array
   */
  getSuggestions: (q, limit = 5) => api.get('/api/search/suggestions', { params: { q, limit } }),
  
  /**
   * Search near a location
   * @param {Object} params - Search parameters
   * @param {number} params.lng - Longitude
   * @param {number} params.lat - Latitude
   * @param {number} params.radius - Search radius in meters
   * @param {string} params.type - Type filter
   * @returns {Promise} Nearby results
   */
  searchNearby: (params) => api.get('/api/search/nearby', { params }),
  
  /**
   * Advanced proximity search with fuzzy name matching
   * Returns suggestions when no exact match is found
   * @param {Object} params - Search parameters
   * @param {number} params.lng - Center longitude
   * @param {number} params.lat - Center latitude
   * @param {number} params.radius - Search radius in meters
   * @param {string} params.name - Village name to search for
   * @param {number} params.limit - Max results
   * @param {boolean} params.fuzzy - Enable fuzzy matching
   * @returns {Promise} Results with suggestions if no exact match
   */
  proximitySearch: (params) => api.get('/api/search/proximity', { params }),
  
  /**
   * Search for villages with similar names
   * @param {Object} data - Search data
   * @param {string} data.name - Village name to search for
   * @param {number} data.lat - Center latitude (optional)
   * @param {number} data.lng - Center longitude (optional)
   * @param {number} data.radius - Search radius in meters
   * @param {number} data.minSimilarity - Minimum similarity percentage
   * @param {number} data.limit - Max results
   * @returns {Promise} Similar name suggestions
   */
  searchSimilarNames: (data) => api.post('/api/search/similar-names', data),
}

// Dashboard API
export const dashboardApi = {
  /**
   * Get KPI summary with status counts and percentages
   * @param {Object} params - Query parameters
   * @param {boolean} params.includeJoshuaProject - Include Joshua Project data (default: false)
   * @returns {Promise} KPI data including status counts, percentages, coverage metrics
   */
  getKPISummary: (params = {}) => api.get('/api/dashboard/kpi-summary', { params }),
  
  /**
   * Get status distribution for donut chart
   * @param {Object} params - Query parameters
   * @param {boolean} params.includeJoshuaProject - Include Joshua Project data (default: false)
   * @returns {Promise} Distribution data with counts and percentages per status
   */
  getStatusDistribution: (params = {}) => api.get('/api/dashboard/status-distribution', { params }),
  
  /**
   * Get coverage gauge data
   * @param {Object} params - Query parameters
   * @param {boolean} params.includeJoshuaProject - Include Joshua Project data (default: false)
   * @returns {Promise} Coverage metrics including villages with data and saturation
   */
  getCoverageGauge: (params = {}) => api.get('/api/dashboard/coverage-gauge', { params }),
  
  /**
   * Get hierarchical data for drill-down table
   * @param {Object} params - Query parameters
   * @param {string} params.level - Hierarchy level (country, region, department, district, village)
   * @param {string} params.parent - Parent name for filtering
   * @param {number} params.page - Page number
   * @param {number} params.limit - Items per page
   * @param {string} params.sortBy - Sort field
   * @param {string} params.sortOrder - Sort order (asc/desc)
   * @param {boolean} params.includeJoshuaProject - Include Joshua Project data (default: false)
   * @returns {Promise} Hierarchical data with pagination
   */
  getHierarchicalData: (params) => api.get('/api/dashboard/hierarchical-data', { params }),
  
  /**
   * Get village details by name (for polygon clicks)
   * @param {string} name - Village name
   * @returns {Promise} Village details including population and people groups
   */
  getVillageDetailsByName: (name) => api.get(`/api/villages/details/by-name/${encodeURIComponent(name)}`),

  // Joshua Project coverage vs DMM engagement
  getJPCoverage: (params = {}) => api.get('/api/analytics/jp-coverage', { params }),
}

// Church Population Ratio API
export const churchPopulationRatioApi = {
  /**
   * Get API information and available endpoints
   * @returns {Promise} API info with color legend
   */
  getInfo: () => api.get('/api/church-population-ratio'),
  
  /**
   * Get church population ratio data for Admin 1 (Regions)
   * @returns {Promise} Ratio data for all regions with colors and categories
   */
  getAdmin1: () => api.get('/api/church-population-ratio/admin1'),
  
  /**
   * Get church population ratio data for Admin 2 (Departments)
   * @param {string} region - Optional filter by region name
   * @returns {Promise} Ratio data for departments with colors and categories
   */
  getAdmin2: (region) => api.get('/api/church-population-ratio/admin2', { 
    params: region ? { region } : {} 
  }),
  
  /**
   * Get church population ratio for a specific administrative unit by name
   * @param {string} name - Administrative unit name
   * @param {string} level - Admin level: 'admin1' or 'admin2' (default: 'admin1')
   * @returns {Promise} Ratio data for the specific unit
   */
  getByAdminName: (name, level = 'admin1') => 
    api.get('/api/church-population-ratio/by-admin-name', { params: { name, level } }),
}

// Joshua Project API
export const joshuaProjectApi = {
  /**
   * Sync Joshua Project data for a specific country
   * @param {string} countryCode - ISO country code (e.g., 'CM' for Cameroon)
   * @returns {Promise} Sync result with imported data summary
   */
  syncJoshuaProjectData: async (countryCode) => {
    return api.post(`/api/joshua-project/sync/${countryCode}`)
  },
  
  /**
   * Get Joshua Project sync status
   * @returns {Promise} Status object with last sync time and data counts
   */
  getJoshuaProjectStatus: async () => {
    return api.get('/api/joshua-project/status')
  },
  
  /**
   * Clear all Joshua Project data
   * @returns {Promise} Confirmation of data deletion
   */
  clearJoshuaProjectData: async () => {
    return api.delete('/api/joshua-project/clear')
  },
}

// Qualitative Analysis API
export const qualitativeAnalysisApi = {
  /**
   * Get DMM DNA criteria definitions
   * @returns {Promise} Criteria definitions
   */
  getCriteria: () => api.get('/api/qualitative-analysis/criteria'),
  
  /**
   * Generate AI insights for analysis data (without saving)
   * @param {Object} data - Analysis data including scores
   * @returns {Promise} AI-generated interpretation and recommendations
   */
  generateAIInsights: (data) => api.post('/api/qualitative-analysis/ai-insights', data, { timeout: 90000 }),
  
  /**
   * Save a qualitative analysis
   * @param {Object} data - Analysis data to save
   * @returns {Promise} Saved analysis
   */
  save: (data) => api.post('/api/qualitative-analysis', data),
  
  /**
   * Get analysis by people group ID
   * @param {string} peopleGroupId - People group ID
   * @returns {Promise} Analysis for the people group
   */
  getByPeopleGroup: (peopleGroupId) => 
    api.get(`/api/qualitative-analysis/people-group/${peopleGroupId}`),
  
  /**
   * Get all analyses grouped by country
   * @returns {Promise} Analyses grouped by country
   */
  getByCountry: () => api.get('/api/qualitative-analysis/by-country'),
  
  /**
   * Get analyses for a specific country
   * @param {string} countryCode - Country code
   * @returns {Promise} Analyses for the country
   */
  getForCountry: (countryCode) => 
    api.get(`/api/qualitative-analysis/country/${countryCode}`),
  
  /**
   * Get analysis statistics
   * @returns {Promise} Statistics
   */
  getStats: () => api.get('/api/qualitative-analysis/stats'),
  
  /**
   * Delete an analysis
   * @param {string} id - Analysis ID
   * @returns {Promise} Deletion confirmation
   */
  delete: (id) => api.delete(`/api/qualitative-analysis/${id}`),
}

// IMB / PeopleGroups.org API
export const imbApi = {
  /**
   * Get IMB/PeopleGroups.org import status
   * @returns {Promise} Status object with count and lastSync
   */
  getStatus: () => api.get('/api/imb/status'),

  /**
   * Import a CSV file into IMB/PeopleGroups.org data
   * @param {File} file - CSV file to import
   * @param {Function} onUploadProgress - optional axios progress callback
   * @returns {Promise} Import result with count imported
   */
  importCSV: (file, onUploadProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/imb/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    })
  },

  /**
   * Get all IMB/PeopleGroups.org people groups
   * @param {Object} params - Query params (page, limit, country, status)
   * @returns {Promise} List of people groups
   */
  getPeopleGroups: (params = {}) => api.get('/api/imb/people-groups', { params }),

  /**
   * Get unreached people groups from IMB/PeopleGroups.org
   * @returns {Promise} List of unreached groups
   */
  getUnreached: () => api.get('/api/imb/people-groups/unreached'),

  /**
   * Clear all IMB/PeopleGroups.org data
   * @returns {Promise} Confirmation
   */
  clearData: () => api.delete('/api/imb/clear'),
}

// Finishing the Task API
export const fttApi = {
  /**
   * Get Finishing the Task import status
   * @returns {Promise} Status object with count and lastSync
   */
  getStatus: () => api.get('/api/ftt/status'),

  /**
   * Import a CSV file into Finishing the Task data
   * @param {File} file - CSV file to import
   * @param {Function} onUploadProgress - optional axios progress callback
   * @returns {Promise} Import result with count imported
   */
  importCSV: (file, onUploadProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/ftt/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    })
  },

  /**
   * Get all Finishing the Task people groups
   * @param {Object} params - Query params (page, limit, country, status)
   * @returns {Promise} List of people groups
   */
  getPeopleGroups: (params = {}) => api.get('/api/ftt/people-groups', { params }),

  /**
   * Get unreached UUPGs from Finishing the Task
   * @returns {Promise} List of unreached groups
   */
  getUnreached: () => api.get('/api/ftt/people-groups/unreached'),

  /**
   * Clear all Finishing the Task data
   * @returns {Promise} Confirmation
   */
  clearData: () => api.delete('/api/ftt/clear'),
}
// ============================================
// Master People API (unified canonical people-graph)
// ============================================
export const masterPeopleApi = {
  getMarkers: (params) => api.get('/api/master-people/map/markers', { params }),
  getDmmVillages: (params) => api.get('/api/master-people/map/dmm-villages', { params }),
  getDmmPeoples: (params) => api.get('/api/master-people/map/dmm-peoples', { params }),
  // ONE marker per DMM engagement (village-level) — matches the Villages/DMM
  // status layer population (e.g. 80 for Cameroon), labelled "nom, Village".
  getDmmEngagements: (params) => api.get('/api/master-people/map/dmm-engagements', { params }),
  getPlanterEngagements: (name) => api.get(`/api/master-people/planters/${encodeURIComponent(name)}/engagements`),
  addVillage: (id, data) => api.post(`/api/master-people/${id}/villages`, data),
  updateVillage: (id, villageId, data) => api.put(`/api/master-people/${id}/villages/${villageId}`, data),
  deleteVillage: (id, villageId) => api.delete(`/api/master-people/${id}/villages/${villageId}`),
  recomputeRollups: () => api.post('/api/master-people/recompute-rollups'),
  getAll: (params) => api.get('/api/master-people', { params }),
  getById: (id) => api.get(`/api/master-people/${id}`),
  getSources: (id) => api.get(`/api/master-people/${id}/sources`),
  getAliases: (id) => api.get(`/api/master-people/${id}/aliases`),
  getCoordinates: (id) => api.get(`/api/master-people/${id}/coordinates`),
  getMatches: (id) => api.get(`/api/master-people/${id}/matches`),
  getProfile: (id) => api.get(`/api/master-people/${id}/profile`),
  getCoverage: (id) => api.get(`/api/master-people/${id}/coverage`),
  getActivities: (id) => api.get(`/api/master-people/${id}/activities`),
}

// ============================================
// DMM Pillars API â€” Persons of Peace, Discovery Groups, DBS, iGROW Coaching, Reporting
// ============================================

// Pilier â‘  / carte â€” Personnes de paix
export const personsOfPeaceApi = {
  list: (params) => api.get('/api/persons-of-peace', { params }),
  get: (id) => api.get(`/api/persons-of-peace/${id}`),
  create: (data) => api.post('/api/persons-of-peace', data),
  update: (id, data) => api.put(`/api/persons-of-peace/${id}`, data),
  remove: (id) => api.delete(`/api/persons-of-peace/${id}`),
}

// Pilier â‘¢ â€” Groupes de dÃ©couverte (DBS)
export const discoveryGroupsApi = {
  list: (params) => api.get('/api/discovery-groups', { params }),
  get: (id) => api.get(`/api/discovery-groups/${id}`),
  getSessions: (id) => api.get(`/api/discovery-groups/${id}/sessions`),
  create: (data) => api.post('/api/discovery-groups', data),
  update: (id, data) => api.put(`/api/discovery-groups/${id}`, data),
  remove: (id) => api.delete(`/api/discovery-groups/${id}`),
}

// Pilier â‘¢ â€” Sessions DBS (Ã©tude 3 colonnes)
export const dbsSessionsApi = {
  list: (params) => api.get('/api/dbs-sessions', { params }),
  get: (id) => api.get(`/api/dbs-sessions/${id}`),
  create: (data) => api.post('/api/dbs-sessions', data),
  update: (id, data) => api.put(`/api/dbs-sessions/${id}`, data),
  remove: (id) => api.delete(`/api/dbs-sessions/${id}`),
}

// Pilier â‘¡ â€” Coaching iGROW
export const coachingSessionsApi = {
  list: (params) => api.get('/api/coaching-sessions', { params }),
  get: (id) => api.get(`/api/coaching-sessions/${id}`),
  getDimensions: () => api.get('/api/coaching-sessions/dimensions'),
  create: (data) => api.post('/api/coaching-sessions', data),
  update: (id, data) => api.put(`/api/coaching-sessions/${id}`, data),
  remove: (id) => api.delete(`/api/coaching-sessions/${id}`),
}

// Pilier â‘£ â€” Reporting (format numÃ©rique Cityteam)
export const reportingApi = {
  numerical: (params) => api.get('/api/reporting/numerical', { params }),
  quarterly: (params) => api.get('/api/reporting/quarterly', { params }),
  peoples: (params) => api.get('/api/reporting/peoples', { params }),
}

