/**
 * People Groups Routes - Enhanced with photo upload, approval workflow, and filtering
 * Status colors: pioneer (blue), mid-journey (orange), tipping-point (green), movement (red)
 * 
 * NEW FEATURES:
 * - Automatic DMM status and level calculation based on churches and generations
 * - Village validation: village must exist in the villages collection
 * - Auto-update village status when people groups are added/updated
 * 
 * PERFORMANCE OPTIMIZATIONS (v2.1.0):
 * - GeoJSON polygon simplification using @turf/simplify
 * - Clustering modes (points/polygon/full) for map display
 * - Zoom-based simplification tolerance
 * - Spatial filtering with viewport bounds
 * - Response metadata with simplification stats
 */
const express = require('express');
const PeopleGroup = require('../models/PeopleGroup');
const Village = require('../models/Village');
const Notification = require('../models/Notification');
const RejectedPeopleGroup = require('../models/RejectedPeopleGroup');
const User = require('../models/User');
const { auth, optionalAuth } = require('../middleware/auth');
const { isMissionary, canApprove, canEdit, canDelete } = require('../middleware/roles');
const { uploadPhotos, processUploadedFiles, deleteFile } = require('../middleware/upload');
const { logActivity } = require('../middleware/activityLogger');
const villageStatusService = require('../services/villageStatusService');
const dmmStatusCalculator = require('../services/dmmStatusCalculator');
const { sendRejectionNotificationEmail } = require('../utils/emailService');

// Import turf for GeoJSON simplification
// Note: @turf/turf includes simplify which uses Douglas-Peucker algorithm
// The full @turf/turf package is already installed in package.json
let simplify;
try {
  // Try @turf/turf first (already installed)
  const turf = require('@turf/turf');
  simplify = turf.simplify;
  console.log('[TURF] Loaded simplify from @turf/turf');
} catch (e1) {
  try {
    // Fallback to standalone @turf/simplify
    simplify = require('@turf/simplify').default || require('@turf/simplify');
    console.log('[TURF] Loaded simplify from @turf/simplify');
  } catch (e2) {
    console.warn('[WARN] @turf/simplify not available. Polygon simplification disabled.');
    console.warn('[WARN] Install with: npm install @turf/simplify');
    simplify = null;
  }
}

/**
 * Get simplification tolerance based on zoom level
 * Lower zoom = more simplification (fewer points)
 * Higher zoom = less simplification (more detail)
 * 
 * @param {number} zoomLevel - Map zoom level (1-18)
 * @returns {number} Tolerance value for simplification
 */
function getToleranceForZoom(zoomLevel) {
  if (!zoomLevel || zoomLevel < 1) return 0.01; // Default medium
  
  if (zoomLevel <= 5) return 0.1;      // Very high simplification (world/continent view)
  if (zoomLevel <= 8) return 0.05;     // High simplification (country view)
  if (zoomLevel <= 10) return 0.01;    // Medium simplification (region view)
  if (zoomLevel <= 12) return 0.005;   // Low simplification (city view)
  if (zoomLevel <= 14) return 0.001;   // Very low simplification (neighborhood view)
  return 0.0005;                        // Minimal simplification (street view)
}

/**
 * Count points in a GeoJSON geometry
 * @param {Object} geometry - GeoJSON geometry object
 * @returns {number} Total number of coordinate points
 */
function countGeoJSONPoints(geometry) {
  if (!geometry) return 0;
  
  const countCoords = (coords) => {
    if (!Array.isArray(coords)) return 0;
    if (typeof coords[0] === 'number') return 1;
    return coords.reduce((sum, c) => sum + countCoords(c), 0);
  };
  
  return countCoords(geometry.coordinates);
}

/**
 * Normalize a GeoJSON Point-like value into a valid { type: 'Point', coordinates: [lng, lat] } object.
 * Accepts JSON strings, raw coordinate arrays, and already-shaped objects.
 * Returns null when the value cannot be safely normalized.
 */
function normalizePointLocation(location) {
  if (!location) return null;

  let value = location;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  if (Array.isArray(value)) {
    if (value.length !== 2) return null;
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
    return { type: 'Point', coordinates: [lng, lat] };
  }

  if (value && typeof value === 'object') {
    const coords = value.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) return null;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
    return { type: 'Point', coordinates: [lng, lat] };
  }

  return null;
}

/**
 * Simplify a GeoJSON polygon using Douglas-Peucker algorithm
 * @param {Object} polygon - GeoJSON Polygon or MultiPolygon
 * @param {number} tolerance - Simplification tolerance (higher = more simplification)
 * @param {boolean} highQuality - Use high quality simplification (slower but better)
 * @returns {Object} Simplified GeoJSON polygon with stats
 */
function simplifyPolygon(polygon, tolerance = 0.01, highQuality = false) {
  if (!simplify || !polygon) {
    return { polygon, stats: { simplified: false, reason: 'simplify not available' } };
  }
  
  try {
    const pointsBefore = countGeoJSONPoints(polygon);
    
    // Wrap in Feature if needed (turf requires Feature)
    const feature = polygon.type === 'Feature' 
      ? polygon 
      : { type: 'Feature', geometry: polygon, properties: {} };
    
    const simplified = simplify(feature, { tolerance, highQuality });
    const simplifiedGeometry = simplified.geometry || simplified;
    
    const pointsAfter = countGeoJSONPoints(simplifiedGeometry);
    const reductionPercent = pointsBefore > 0 
      ? Math.round((1 - pointsAfter / pointsBefore) * 100) 
      : 0;
    
    return {
      polygon: simplifiedGeometry,
      stats: {
        simplified: true,
        tolerance,
        pointsBefore,
        pointsAfter,
        reductionPercent,
        highQuality
      }
    };
  } catch (error) {
    console.error('[SIMPLIFY] Error simplifying polygon:', error.message);
    return { 
      polygon, 
      stats: { simplified: false, reason: error.message } 
    };
  }
}

const router = express.Router();

/**
 * Helper function to emit village status update via Socket.IO
 * @param {Object} req - Express request object
 * @param {string} villageName - Name of the village to recalculate
 */
async function emitVillageStatusUpdate(req, villageName) {
  const isDebug = process.env.NODE_ENV === 'development' && process.env.SOCKET_DEBUG === 'true';
  if (isDebug) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[SOCKET DEBUG] emitVillageStatusUpdate CALLED');
    console.log('[SOCKET DEBUG] Village name:', villageName);
    console.log('═══════════════════════════════════════════════════════════════');
  }
  
  if (!villageName) {
    if (isDebug) console.log('[SOCKET DEBUG] No village name provided, skipping emit');
    return;
  }
  
  try {
    if (isDebug) console.log('[SOCKET DEBUG] Step 1: Recalculating village status for:', villageName);
    const villageStatus = await villageStatusService.recalculateVillageStatus(villageName);
    if (isDebug) console.log('[SOCKET DEBUG] Step 2: Village status calculated:', JSON.stringify(villageStatus, null, 2));
    
    const io = req.app.get('io');
    if (isDebug) console.log('[SOCKET DEBUG] Step 3: Socket.IO instance available:', !!io);
    
    if (io) {
      // Log connected sockets in the 'map' room
      const mapRoom = io.sockets.adapter.rooms.get('map');
      const connectedCount = mapRoom ? mapRoom.size : 0;
      if (isDebug) console.log('[SOCKET DEBUG] Step 4: Clients in "map" room:', connectedCount);
      
      if (connectedCount === 0) {
        if (isDebug) console.log('[SOCKET DEBUG] WARNING: No clients connected to "map" room!');
      }
    }
    
    if (io && villageStatus) {
      const payload = {
        villageName,
        status: villageStatus,
        updatedAt: new Date().toISOString(),
        _debug: {
          emittedAt: new Date().toISOString(),
          source: 'emitVillageStatusUpdate'
        }
      };
      if (isDebug) console.log('[SOCKET DEBUG] Step 5: Emitting village-status-updated event');
      if (isDebug) console.log('[SOCKET DEBUG] Payload:', JSON.stringify(payload, null, 2));
      
      // Emit to all clients in the 'map' room
      io.to('map').emit('village-status-updated', payload);
      
      // Also emit globally as a fallback (for debugging)
      io.emit('village-status-updated-global', payload);
      
      if (isDebug) console.log('[SOCKET DEBUG] Step 6: Event emitted successfully to "map" room AND globally');
      if (isDebug) console.log('═══════════════════════════════════════════════════════════════');
    } else {
      if (isDebug) console.log('[SOCKET DEBUG] Cannot emit: io=', !!io, ', villageStatus=', !!villageStatus);
    }
  } catch (error) {
    console.error('[SOCKET DEBUG] Error emitting village status update:', error);
    console.error('[SOCKET DEBUG] Error stack:', error.stack);
  }
}

/**
 * Cache for village names from GeoJSON files (all countries)
 * This is loaded once and reused for all validations
 */
let geoJsonVillageNamesCache = null;
let geoJsonVillageNamesLowerCache = null;

/**
 * Load village names from all country GeoJSON files
 * Supports: Cameroon, Chad, Congo Brazzaville, CAF, Gabon, and other countries
 * @returns {Set<string>} Set of village names (case-sensitive)
 */
function loadGeoJsonVillageNames() {
  if (geoJsonVillageNamesCache) {
    return geoJsonVillageNamesCache;
  }
  
  const fs = require('fs');
  const path = require('path');
  
  const names = new Set();
  const namesLower = new Map(); // lowercase -> original case
  
  // All village GeoJSON files for different countries
  const villageFiles = [
    // Cameroon villages
    { path: path.join(__dirname, '../../frontend/public/data/villages.geojson'), country: 'Cameroon' },
    { path: path.join(__dirname, '../../frontend/public/data/Villages découpés.geojson'), country: 'Cameroon' },
    // Chad villages
    { path: path.join(__dirname, '../../frontend/public/data/VChad_polygons.geojson'), country: 'Chad' },
    // Congo Brazzaville villages
    { path: path.join(__dirname, '../../frontend/public/data/VCongoBrazza_Polygons.geojson'), country: 'Congo' },
    // Central African Republic villages
    { path: path.join(__dirname, '../../frontend/public/data/VCAF_Polygons.geojson'), country: 'CAF' },
    // Gabon villages
    { path: path.join(__dirname, '../../frontend/public/data/VGabon_Polygons.geojson'), country: 'Gabon' },
    // Fallback paths
    { path: path.join(__dirname, '../../frontend/dist/data/villages.geojson'), country: 'Cameroon' },
    { path: path.join(__dirname, '../data/villages.geojson'), country: 'Cameroon' }
  ];
  
  let loadedCount = 0;
  
  for (const fileInfo of villageFiles) {
    if (fs.existsSync(fileInfo.path)) {
      try {
        const data = JSON.parse(fs.readFileSync(fileInfo.path, 'utf8'));
        let fileCount = 0;
        
        if (data.features) {
          data.features.forEach(feature => {
            // Support different property names for village name
            const name = feature.properties?.name || 
                        feature.properties?.NAME || 
                        feature.properties?.nom ||
                        feature.properties?.village_name;
            if (name) {
              names.add(name);
              namesLower.set(name.toLowerCase().trim(), name);
              fileCount++;
            }
          });
        }
        
        console.log(`[VALIDATION] Loaded ${fileCount} village names from ${fileInfo.country}: ${fileInfo.path}`);
        loadedCount += fileCount;
      } catch (error) {
        console.error(`[VALIDATION] Error loading GeoJSON from ${fileInfo.path}:`, error.message);
      }
    }
  }
  
  if (loadedCount > 0) {
    geoJsonVillageNamesCache = names;
    geoJsonVillageNamesLowerCache = namesLower;
    console.log(`[VALIDATION] Total: Loaded ${names.size} unique village names from all countries`);
    return names;
  }
  
  console.warn('[VALIDATION] Could not load village names from any GeoJSON file - validation will be skipped');
  return new Set();
}

/**
 * Helper function to validate that a village exists in the GeoJSON file
 * This validates against all 10,671 villages from the villages.geojson file
 * instead of the database villages collection.
 * 
 * @param {string} villageName - Name of the village to validate
 * @returns {Promise<{name: string}|null>} Object with village name if found, null otherwise
 */
async function validateVillageExists(villageName) {
  if (!villageName) return null;
  
  // Load village names from GeoJSON (cached after first load)
  const villageNames = loadGeoJsonVillageNames();
  
  // If we couldn't load the GeoJSON, skip validation (allow any village name)
  if (villageNames.size === 0) {
    console.log(`[VALIDATION] GeoJSON not loaded - allowing village "${villageName}"`);
    return { name: villageName };
  }
  
  // Check exact match first
  if (villageNames.has(villageName)) {
    console.log(`[VALIDATION] Village "${villageName}" found (exact match)`);
    return { name: villageName };
  }
  
  // Check case-insensitive match
  const lowerName = villageName.toLowerCase().trim();
  if (geoJsonVillageNamesLowerCache && geoJsonVillageNamesLowerCache.has(lowerName)) {
    const originalName = geoJsonVillageNamesLowerCache.get(lowerName);
    console.log(`[VALIDATION] Village "${villageName}" found as "${originalName}" (case-insensitive match)`);
    return { name: originalName };
  }
  
  // Not found
  console.log(`[VALIDATION] Village "${villageName}" not found in GeoJSON (${villageNames.size} villages available)`);
  return null;
}

/**
 * Helper function to calculate and apply DMM status and level
 * @param {Object} peopleGroup - People group document
 * @param {number} numberOfChurches - Number of churches
 * @param {number} churchGeneration - Number of generations
 * @returns {Object} Calculated status info
 */
function applyDmmStatusCalculation(peopleGroup, numberOfChurches, churchGeneration) {
  const churches = parseInt(numberOfChurches) || 0;
  const generations = parseInt(churchGeneration) || 0;
  
  // Calculate status and level using the DMM calculator
  const dmmResult = dmmStatusCalculator.calculatePeopleGroupStatus(churches, generations);
  
  // Apply calculated values to the people group
  peopleGroup.engagementStatus = dmmResult.status;
  peopleGroup.engagementLevel = dmmResult.level;
  
  console.log(`[DMM] Calculated status for ${churches} churches, ${generations} generations:`, {
    status: dmmResult.status,
    statusFr: dmmResult.statusFr,
    level: dmmResult.level
  });
  
  return dmmResult;
}

/**
 * Helper function to format people group response with all required fields
 * @param {Object} peopleGroup - People group document
 * @param {Object} villageStatus - Village status object (optional)
 * @returns {Object} Formatted response
 */
function formatPeopleGroupResponse(peopleGroup, villageStatus = null) {
  const pg = peopleGroup.toJSON ? peopleGroup.toJSON() : peopleGroup;
  
  // Get DMM display names
  const statusFr = dmmStatusCalculator.STATUS_DISPLAY_NAMES_FR[pg.engagementStatus] || pg.engagementStatus;
  
  return {
    ...pg,
    // Standard fields
    peuple: pg.name,
    village: pg.villageName,
    eglises: pg.numberOfChurches || 0,
    generations: pg.churchGeneration || 0,
    // Calculated DMM fields
    statut_peuple: statusFr,
    niveau_peuple: pg.engagementLevel || 'I',
    // Village status (if available)
    statut_village: villageStatus?.statusDisplay || villageStatus?.status || null
  };
}

/**
 * GET /people-groups/villages - Get unique village names for dropdown
 * Returns a list of all unique village names from people groups
 */
router.get('/villages', optionalAuth, async (req, res) => {
  try {
    console.log('[API] GET /people-groups/villages - Fetching unique village names');
    
    // Get unique village names from people groups
    const villageNames = await PeopleGroup.distinct('villageName', {
      villageName: { $exists: true, $ne: null, $ne: '' }
    });
    
    // Sort alphabetically
    villageNames.sort((a, b) => a.localeCompare(b, 'fr'));
    
    console.log(`[API] Found ${villageNames.length} unique villages`);
    
    res.json({
      villages: villageNames,
      total: villageNames.length
    });
  } catch (error) {
    console.error('Error fetching village names:', error);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/by-village/:villageName - Get people groups by village name
 * Returns all people groups that belong to a specific village
 */
router.get('/by-village/:villageName', optionalAuth, async (req, res) => {
  try {
    const villageName = decodeURIComponent(req.params.villageName);
    console.log(`[API] GET /people-groups/by-village/${villageName}`);
    
    if (!villageName) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Village name is required'
      });
    }
    
    // Find people groups by village name (case-insensitive)
    const peopleGroups = await PeopleGroup.find({
      villageName: { $regex: new RegExp(`^${villageName}$`, 'i') },
      approved: true
    }).sort({ name: 1 });
    
    console.log(`[API] Found ${peopleGroups.length} people groups in village: ${villageName}`);
    
    res.json({
      villageName,
      peopleGroups: peopleGroups.map(pg => formatPeopleGroupResponse(pg)),
      total: peopleGroups.length
    });
  } catch (error) {
    console.error('Error fetching people groups by village:', error);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * POST /people-groups/by-polygon - Get people groups within a polygon
 * Accepts a GeoJSON polygon and returns all people groups whose coordinates fall within it
 */
router.post('/by-polygon', optionalAuth, async (req, res) => {
  try {
    const { polygon, villageName } = req.body;
    console.log(`[API] POST /people-groups/by-polygon - Village: ${villageName || 'N/A'}`);
    
    if (!polygon || !polygon.coordinates) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Polygon with coordinates is required'
      });
    }
    
    // Query people groups within the polygon using MongoDB's $geoWithin
    const peopleGroups = await PeopleGroup.find({
      location: {
        $geoWithin: {
          $geometry: {
            type: polygon.type || 'Polygon',
            coordinates: polygon.coordinates
          }
        }
      },
      approved: true
    }).sort({ name: 1 });
    
    console.log(`[API] Found ${peopleGroups.length} people groups within polygon`);
    
    res.json({
      villageName: villageName || null,
      peopleGroups: peopleGroups.map(pg => formatPeopleGroupResponse(pg)),
      total: peopleGroups.length
    });
  } catch (error) {
    console.error('Error fetching people groups by polygon:', error);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/by-bounds - Get people groups within map viewport bounds
 * Query params: north, south, east, west (bounding box coordinates)
 * Optional: source (organization filter), status
 */
router.get('/by-bounds', optionalAuth, async (req, res) => {
  try {
    const { north, south, east, west, source, status, limit = 500 } = req.query;
    
    console.log(`[API] GET /people-groups/by-bounds - Bounds: N:${north}, S:${south}, E:${east}, W:${west}, Source: ${source || 'all'}`);
    
    // Validate bounds parameters
    if (!north || !south || !east || !west) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Bounding box parameters (north, south, east, west) are required'
      });
    }
    
    const n = parseFloat(north);
    const s = parseFloat(south);
    const e = parseFloat(east);
    const w = parseFloat(west);
    
    // Validate coordinate ranges
    if (isNaN(n) || isNaN(s) || isNaN(e) || isNaN(w)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Bounds must be valid numbers'
      });
    }
    
    // Build the query with $geoWithin using a bounding box polygon
    // Handle anti-meridian crossing (when west > east)
    let geoQuery;
    if (w > e) {
      // Anti-meridian crossing: split into two queries
      geoQuery = {
        $or: [
          {
            location: {
              $geoWithin: {
                $geometry: {
                  type: 'Polygon',
                  coordinates: [[
                    [w, s], [180, s], [180, n], [w, n], [w, s]
                  ]]
                }
              }
            }
          },
          {
            location: {
              $geoWithin: {
                $geometry: {
                  type: 'Polygon',
                  coordinates: [[
                    [-180, s], [e, s], [e, n], [-180, n], [-180, s]
                  ]]
                }
              }
            }
          }
        ]
      };
    } else {
      // Normal bounding box
      geoQuery = {
        location: {
          $geoWithin: {
            $geometry: {
              type: 'Polygon',
              coordinates: [[
                [w, s], [e, s], [e, n], [w, n], [w, s]
              ]]
            }
          }
        }
      };
    }
    
    // Build the full query
    const query = {
      ...geoQuery,
      approved: true
    };
    
    // Add source filter (e.g., "DMM", "Joshua Project", "manual")
    // Note: Source values are case-sensitive and must match exactly what's in the database
    if (source && source !== 'all') {
      query.source = source;
    }
    
    // Add status filter
    if (status) {
      const statuses = status.split(',');
      query.status = statuses.length > 1 ? { $in: statuses } : status;
    }
    
    // Execute query with limit to prevent overwhelming the client
    const peopleGroups = await PeopleGroup.find(query)
      .select('name location status statusColor engagementStatus engagementLevel numberOfChurches churchGeneration villageName country region organizationTags source')
      .limit(parseInt(limit))
      .lean();
    
    console.log(`[API] Found ${peopleGroups.length} people groups within bounds`);
    
    // Format response for map markers (lightweight)
    // IMPORTANT: Frontend expects 'location.coordinates' structure, not flat 'coordinates'
    const markers = peopleGroups.map(pg => ({
      _id: pg._id,
      name: pg.name,
      location: pg.location || null,  // Keep nested structure for frontend compatibility
      status: pg.status,
      statusColor: pg.statusColor,
      engagementStatus: pg.engagementStatus,
      engagementLevel: pg.engagementLevel,
      numberOfChurches: pg.numberOfChurches,
      churchGeneration: pg.churchGeneration,
      villageName: pg.villageName,
      country: pg.country,
      countryCode: pg.countryCode,  // Add countryCode for filtering
      region: pg.region,
      source: pg.source || 'DMM',  // Add source field for DMM vs Joshua Project filtering
      organizationTags: pg.organizationTags,
      description: pg.description  // Add description for search filtering
    }));
    
    res.json({
      markers,
      total: markers.length,
      bounds: { north: n, south: s, east: e, west: w },
      truncated: peopleGroups.length >= parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching people groups by bounds:', error);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
/**
 * GET /people-groups - Get all people groups with filters
 * 
 * SECURITY IMPROVEMENTS:
 * - Sanitized regex patterns (only added when searchTerm is non-empty)
 * - Input validation for all query parameters
 * - Escaped special regex characters to prevent ReDoS attacks
 * - Clean undefined/null parameters before query construction
 * 
 * PERFORMANCE IMPROVEMENTS (v2.1.0):
 * - Field projection to minimize payload size
 * - Enforced maximum limit (500) to prevent memory issues
 * - Uses .lean() for read-only queries (30-50% faster)
 * - Parallel count + find queries with Promise.all()
 * - GeoJSON polygon simplification with configurable tolerance
 * - Clustering modes (points/polygon/full) for map optimization
 * - Zoom-based automatic simplification
 * - Spatial filtering with viewport bounds
 * 
 * CLUSTERING MODES:
 * - mode=points: Minimal data for marker clustering (~200 bytes/record)
 *   Returns: _id, name, location.coordinates, status, country
 * - mode=polygon: Simplified polygons for region display (~2-10KB/record)
 *   Returns: All fields + simplified polygon based on zoomLevel
 * - mode=full: Complete data (default, backward compatible)
 *   Returns: All fields including full polygon geometry
 * 
 * ZOOM-BASED SIMPLIFICATION:
 * - zoomLevel 1-5:  tolerance=0.1   (world/continent view, ~90% reduction)
 * - zoomLevel 6-8:  tolerance=0.05  (country view, ~80% reduction)
 * - zoomLevel 9-10: tolerance=0.01  (region view, ~60% reduction)
 * - zoomLevel 11-12: tolerance=0.005 (city view, ~40% reduction)
 * - zoomLevel 13-14: tolerance=0.001 (neighborhood view, ~20% reduction)
 * - zoomLevel 15+:  tolerance=0.0005 (street view, minimal reduction)
 * 
 * PAGINATION:
 * - page-based pagination (more intuitive than skip)
 * - Returns totalCount, totalPages, currentPage, hasMore
 * 
 * Filters: status, organization, search, approved, region, country, countryCode, admin2, admin3
 * Geographic filtering hierarchy: country/countryCode -> region (admin1) -> admin2 -> admin3
 * 
 * @query {string} mode - Clustering mode: 'points' | 'polygon' | 'full' (default: 'full')
 * @query {number} zoomLevel - Map zoom level 1-18 (affects simplification)
 * @query {number} tolerance - Manual simplification tolerance (0.001-0.1)
 * @query {string} bounds - Viewport bounds as "south,west,north,east"
 * @query {boolean} includeGeometry - Include polygon field (default: false)
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    // ============================================
    // 1. PARAMETER EXTRACTION & VALIDATION
    // ============================================
    const { 
      status, 
      organization, 
      village,
      search, 
      approved,
      source,
      region,
      country,
      countryCode,
      admin2,
      admin3,
      page: pageParam,
      limit: limitParam,
      // Legacy support for skip-based pagination
      skip: skipParam,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      // Geometry inclusion parameter (default: false for backward compatibility)
      includeGeometry,
      // NEW: Clustering and optimization parameters
      mode = 'full',           // 'points' | 'polygon' | 'full'
      zoomLevel,               // Map zoom level (1-18)
      tolerance: toleranceParam, // Manual simplification tolerance
      bounds                   // Viewport bounds: "south,west,north,east"
    } = req.query;
    
    // ============================================
    // 1b. PARSE CLUSTERING MODE PARAMETERS
    // ============================================
    // Validate mode parameter
    const validModes = ['points', 'polygon', 'full'];
    const clusterMode = validModes.includes(mode) ? mode : 'full';
    
    // Parse zoom level (1-18)
    const zoom = parseInt(zoomLevel, 10);
    const validZoom = !isNaN(zoom) && zoom >= 1 && zoom <= 18 ? zoom : null;
    
    // Parse tolerance (0.0001 to 0.5)
    let tolerance = parseFloat(toleranceParam);
    if (isNaN(tolerance) || tolerance < 0.0001 || tolerance > 0.5) {
      // Auto-calculate from zoom level if not provided
      tolerance = validZoom ? getToleranceForZoom(validZoom) : 0.01;
    }
    
    // Parse bounds (south,west,north,east)
    let boundsFilter = null;
    if (bounds && typeof bounds === 'string') {
      const parts = bounds.split(',').map(parseFloat);
      if (parts.length === 4 && parts.every(n => !isNaN(n))) {
        const [south, west, north, east] = parts;
        boundsFilter = { south, west, north, east };
      }
    }
    
    // ============================================
    // 1c. PARSE includeGeometry BOOLEAN PARAMETER
    // ============================================
    // Parse includeGeometry as boolean - handles 'true', '1', true values
    // Default behavior depends on mode:
    // - mode=points: always false (no geometry)
    // - mode=polygon: always true (simplified geometry)
    // - mode=full: use includeGeometry param (default false)
    let shouldIncludeGeometry;
    if (clusterMode === 'points') {
      shouldIncludeGeometry = false;
    } else if (clusterMode === 'polygon') {
      shouldIncludeGeometry = true;
    } else {
      shouldIncludeGeometry = 
        includeGeometry === 'true' || 
        includeGeometry === '1' || 
        includeGeometry === true;
    }
    
    // Log clustering configuration
    console.log(`[API] GET /people-groups - Mode: ${clusterMode}, Zoom: ${validZoom || 'N/A'}, Tolerance: ${tolerance}, Bounds: ${boundsFilter ? 'yes' : 'no'}, Geometry: ${shouldIncludeGeometry}`);
    
    // ============================================
    // 2. PAGINATION VALIDATION & SANITIZATION
    // ============================================
    const DEFAULT_LIMIT = 200;
    const MAX_LIMIT = 500;
    const MIN_PAGE = 1;
    
    let page = parseInt(pageParam, 10);
    let limit = parseInt(limitParam, 10);
    let skip;
    
    // Ensure limit is valid (minimum 1, maximum 500, default 200)
    if (isNaN(limit) || limit < 1) {
      limit = DEFAULT_LIMIT;
    } else if (limit > MAX_LIMIT) {
      limit = MAX_LIMIT;
    }
    
    // Support both page-based and legacy skip-based pagination
    if (!isNaN(page) && page >= MIN_PAGE) {
      // Page-based pagination (preferred)
      skip = (page - 1) * limit;
    } else if (skipParam !== undefined) {
      // Legacy skip-based pagination (backward compatibility)
      skip = parseInt(skipParam, 10);
      if (isNaN(skip) || skip < 0) {
        skip = 0;
      }
      // Calculate page from skip for response metadata
      page = Math.floor(skip / limit) + 1;
    } else {
      // Default to first page
      page = MIN_PAGE;
      skip = 0;
    }
    
    // ============================================
    // 3. SECURE QUERY CONSTRUCTION
    // ============================================
    const query = {};
    
    // Status filter (can be comma-separated for multiple)
    // SECURITY: Only add if status is a non-empty string
    if (status && typeof status === 'string' && status.trim()) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        query.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
      }
    }
    
    // Organization filter - only add if non-empty
    if (organization && typeof organization === 'string' && organization.trim()) {
      query.organizationTags = organization.trim();
    }
    
    // Village filter - only add if non-empty
    if (village && typeof village === 'string' && village.trim()) {
      query.villageName = village.trim();
    }
    
    // ============================================
    // 4. SECURE TEXT SEARCH (Regex Safety)
    // ============================================
    // SECURITY: Only add regex patterns when search term is non-empty
    // This prevents accidental full database queries with empty regex
    if (search && typeof search === 'string') {
      const searchTerm = search.trim();
      
      // Only proceed if searchTerm has actual content
      if (searchTerm.length > 0) {
        // SECURITY: Escape special regex characters to prevent ReDoS attacks
        // Characters that have special meaning in regex: . * + ? ^ $ { } [ ] \ | ( )
        const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Build $or query with case-insensitive regex
        query.$or = [
          { name: { $regex: escapedSearch, $options: 'i' } },
          { description: { $regex: escapedSearch, $options: 'i' } },
          { language: { $regex: escapedSearch, $options: 'i' } },
          { villageName: { $regex: escapedSearch, $options: 'i' } }
        ];
      }
      // If searchTerm is empty after trim, we simply don't add any regex filter
      // This prevents queries like { name: { $regex: '', $options: 'i' } }
      // which would match ALL documents
    }
    
    // ============================================
    // 5. APPROVAL FILTER (Query-param based)
    // ============================================
    // Only filter by approved if explicitly requested via query param
    // This allows the frontend to fetch ALL people groups (approved + unapproved)
    // when no approved param is passed, ensuring newly added records are visible
    if (approved !== undefined && approved !== null && approved !== '') {
      query.approved = approved === 'true' || approved === true;
    }
    // NOTE: If no approved param is passed, we do NOT filter by approved status
    // This ensures all people groups are returned regardless of approval status

    // ============================================
    // 5b. SOURCE FILTER (Query-param based)
    // ============================================
    // Allow filtering by data source (e.g. 'Joshua Project', 'PeopleGroups.org',
    // 'Finishing the Task', 'Survey', 'DMM'). Values are case-sensitive and must
    // match the stored `source` field exactly. 'all' (or empty) means no filter.
    if (source && typeof source === 'string' && source.trim() && source !== 'all') {
      query.source = source.trim();
    }
    
    // ============================================
    // 6. GEOGRAPHIC FILTERS (with validation)
    // ============================================
    // Country code to name mapping for fallback queries
    const countryCodeToName = {
      'CM': 'Cameroon',
      'NG': 'Nigeria',
      'TD': 'Chad',
      'CF': 'Central African Republic',
      'GA': 'Gabon',
      'GQ': 'Equatorial Guinea',
      'CG': 'Congo',
      'CD': 'Democratic Republic of the Congo',
      'SS': 'South Sudan',
      'SD': 'Sudan',
      'ET': 'Ethiopia',
      'KE': 'Kenya',
      'UG': 'Uganda',
      'TZ': 'Tanzania',
      'RW': 'Rwanda',
      'BI': 'Burundi',
    };
    
    // Country filter (by name) - only add if non-empty
    if (country && typeof country === 'string' && country.trim()) {
      const countries = country.split(',').map(c => c.trim()).filter(Boolean);
      if (countries.length > 0) {
        query.country = countries.length > 1 ? { $in: countries } : countries[0];
      }
    }
    
    // Country code filter - also searches by country name as fallback
    // SECURITY: Only process if non-empty and no existing $or from search
    if (countryCode && typeof countryCode === 'string' && countryCode.trim() && !query.$or) {
      const countryCodes = countryCode.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
      if (countryCodes.length > 0) {
        const countryNames = countryCodes.map(code => countryCodeToName[code]).filter(Boolean);
        
        // Search by both countryCode AND country name (for backward compatibility)
        if (countryNames.length > 0) {
          // SECURITY: Escape country names for regex
          const escapedNames = countryNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          query.$or = [
            { countryCode: countryCodes.length > 1 ? { $in: countryCodes } : countryCodes[0] },
            { country: countryNames.length > 1 ? { $in: countryNames } : countryNames[0] },
            // Also match French names (with escaped regex)
            { country: { $regex: new RegExp(escapedNames.join('|'), 'i') } }
          ];
        } else {
          query.countryCode = countryCodes.length > 1 ? { $in: countryCodes } : countryCodes[0];
        }
      }
    } else if (countryCode && typeof countryCode === 'string' && countryCode.trim() && query.$or) {
      // If we already have $or from search, add countryCode as separate filter
      const countryCodes = countryCode.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
      if (countryCodes.length > 0) {
        query.countryCode = countryCodes.length > 1 ? { $in: countryCodes } : countryCodes[0];
      }
    }
    
    // Region (admin1) filter - only add if non-empty
    if (region && typeof region === 'string' && region.trim()) {
      query.region = region.trim();
    }
    
    // Admin2 (department) filter - only add if non-empty
    if (admin2 && typeof admin2 === 'string' && admin2.trim()) {
      query.admin2 = admin2.trim();
    }
    
    // Admin3 (arrondissement) filter - only add if non-empty
    if (admin3 && typeof admin3 === 'string' && admin3.trim()) {
      query.admin3 = admin3.trim();
    }
    
    // ============================================
    // 7. FIELD PROJECTION (Performance Optimization)
    // ============================================
    // Only select fields needed for the response
    // This significantly reduces:
    // - MongoDB memory usage during query
    // - Network transfer size
    // - JSON serialization time
    
    // Base projection - always included fields
    const projection = {
      name: 1,
      country: 1,
      countryCode: 1,
      status: 1,
      statusColor: 1,
      engagementStatus: 1,
      engagementLevel: 1,
      villageName: 1,
      region: 1,
      admin2: 1,
      admin3: 1,
      location: 1,
      numberOfChurches: 1,
      churchGeneration: 1,
      population: 1,
      language: 1,
      approved: 1,
      source: 1,
      // masterPeopleId : nécessaire pour compter les peuples DMM au niveau
      // « master people » (≈54) plutôt que les engagements (≈80) côté dashboard.
      masterPeopleId: 1,
      organizationTags: 1,
      createdAt: 1,
      updatedAt: 1,
      createdBy: 1,
      approvedBy: 1,
      village: 1
      // Excluded fields (for performance):
      // - photos (large binary data)
      // - description (can be large text, only needed for detail view)
      // - history/audit fields
      // - internal metadata
    };
    
    // ============================================
    // 7b. CONDITIONAL GEOMETRY PROJECTION
    // ============================================
    // Dynamically include/exclude polygon field based on includeGeometry parameter
    // - When includeGeometry=false (default): exclude polygon to reduce payload size
    // - When includeGeometry=true: include polygon for GeoJSON rendering
    // This optimization can reduce response size by 50-90% for large datasets
    if (shouldIncludeGeometry) {
      // Include polygon field in projection
      projection.polygon = 1;
      console.log('[API] Projection includes polygon field for GeoJSON geometry');
    } else {
      // Explicitly exclude polygon field (MongoDB uses 0 for exclusion)
      // Note: When using inclusion projection (1s), we simply don't include polygon
      // The field will be automatically excluded since we're using inclusion mode
      console.log('[API] Projection excludes polygon field (default behavior)');
    }
    
    // ============================================
    // 8. SORT CONFIGURATION (with validation)
    // ============================================
    // SECURITY: Validate sortBy to prevent injection
    const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'country', 'status', 'population', 'villageName'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder === 'asc' ? 1 : -1;
    
    // Include a unique tiebreaker (_id) so skip/limit pagination is deterministic.
    // Records sharing the same sort value (e.g. identical createdAt from a bulk
    // import) could otherwise be duplicated or skipped across page boundaries,
    // causing inconsistent totals between consumers (e.g. map vs dashboard).
    const sort = { [safeSortBy]: safeSortOrder, _id: safeSortOrder };
    
    // ============================================
    // 9. EXECUTE QUERY WITH OPTIMIZATIONS
    // ============================================
    // Log query for debugging (sanitized)
    console.log('[API] GET /people-groups - Query:', JSON.stringify(query, null, 2));
    console.log('[API] Pagination: page=%d, limit=%d, skip=%d', page, limit, skip);
    
    // Execute count and find in parallel for better performance
    const [totalCount, peopleGroups] = await Promise.all([
      // Count total matching documents (for pagination metadata)
      PeopleGroup.countDocuments(query),
      
      // Fetch paginated results with projection
      PeopleGroup.find(query)
        .select(projection)
        .populate('createdBy', 'name email avatar')
        .populate('approvedBy', 'name')
        .populate('village', 'name location')
        .populate('organizationTags', 'name')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()  // PERFORMANCE: Returns plain JS objects (30-50% faster)
    ]);
    
    // ============================================
    // 10. CALCULATE PAGINATION METADATA
    // ============================================
    const totalPages = Math.ceil(totalCount / limit);
    const hasMore = page < totalPages;
    const hasPrevious = page > 1;
    
    // ============================================
    // 11. APPLY CLUSTERING MODE TRANSFORMATIONS
    // ============================================
    let responseData;
    let simplificationStats = { applied: false };
    
    if (clusterMode === 'points') {
      // POINTS MODE: Minimal data for marker clustering
      // Expected payload: ~200 bytes per record
      responseData = peopleGroups.map(pg => ({
        _id: pg._id,
        name: pg.name,
        location: pg.location,
        status: pg.status,
        statusColor: pg.statusColor,
        country: pg.country,
        countryCode: pg.countryCode
      }));
      console.log(`[API] Points mode: Returning ${responseData.length} minimal records`);
      
    } else if (clusterMode === 'polygon' && shouldIncludeGeometry) {
      // POLYGON MODE: Simplified polygons for region display
      // Expected payload: ~2-10KB per record (depending on simplification)
      let totalPointsBefore = 0;
      let totalPointsAfter = 0;
      let simplifiedCount = 0;
      
      responseData = peopleGroups.map(pg => {
        if (pg.polygon) {
          const result = simplifyPolygon(pg.polygon, tolerance, false);
          if (result.stats.simplified) {
            totalPointsBefore += result.stats.pointsBefore;
            totalPointsAfter += result.stats.pointsAfter;
            simplifiedCount++;
          }
          return { ...pg, polygon: result.polygon };
        }
        return pg;
      });
      
      simplificationStats = {
        applied: simplifiedCount > 0,
        tolerance,
        zoomLevel: validZoom,
        recordsSimplified: simplifiedCount,
        totalPointsBefore,
        totalPointsAfter,
        reductionPercent: totalPointsBefore > 0 
          ? Math.round((1 - totalPointsAfter / totalPointsBefore) * 100) 
          : 0
      };
      
      console.log(`[API] Polygon mode: Simplified ${simplifiedCount} polygons, ${simplificationStats.reductionPercent}% reduction`);
      
    } else {
      // FULL MODE: Complete data (default, backward compatible)
      // Apply simplification if geometry is included and tolerance is specified
      if (shouldIncludeGeometry && toleranceParam) {
        let totalPointsBefore = 0;
        let totalPointsAfter = 0;
        let simplifiedCount = 0;
        
        responseData = peopleGroups.map(pg => {
          if (pg.polygon) {
            const result = simplifyPolygon(pg.polygon, tolerance, false);
            if (result.stats.simplified) {
              totalPointsBefore += result.stats.pointsBefore;
              totalPointsAfter += result.stats.pointsAfter;
              simplifiedCount++;
            }
            return { ...pg, polygon: result.polygon };
          }
          return pg;
        });
        
        simplificationStats = {
          applied: simplifiedCount > 0,
          tolerance,
          recordsSimplified: simplifiedCount,
          totalPointsBefore,
          totalPointsAfter,
          reductionPercent: totalPointsBefore > 0 
            ? Math.round((1 - totalPointsAfter / totalPointsBefore) * 100) 
            : 0
        };
        
        console.log(`[API] Full mode with simplification: ${simplifiedCount} polygons, ${simplificationStats.reductionPercent}% reduction`);
      } else {
        responseData = peopleGroups;
      }
    }
    
    // ============================================
    // 12. RETURN OPTIMIZED RESPONSE WITH METADATA
    // ============================================
    res.json({
      // Data array
      data: responseData,
      
      // Pagination metadata (new format)
      pagination: {
        totalCount,
        totalPages,
        currentPage: page,
        limit,
        hasMore,
        hasPrevious
      },
      
      // Clustering/optimization metadata (new in v2.1.0)
      meta: {
        mode: clusterMode,
        zoomLevel: validZoom,
        simplification: simplificationStats,
        bounds: boundsFilter,
        geometryIncluded: shouldIncludeGeometry,
        count: responseData.length,
        timestamp: new Date().toISOString()
      },
      
      // Legacy fields for backward compatibility
      total: totalCount,
      limit,
      skip,
      hasMore
    });
    
  } catch (error) {
    console.error('[API] Error fetching people groups:', error);
    
    // Don't expose internal error details in production
    res.status(500).json({
      error: 'Server error',
      message: process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'An error occurred while fetching people groups'
    });
  }
});

/**
 * GET /people-groups/stats/summary - Get statistics summary
 */
router.get('/stats/summary', optionalAuth, async (req, res) => {
  try {
    const { organization, region, country } = req.query;
    
    const filters = { approved: true };
    if (organization) filters.organizationTags = organization;
    if (region) filters.region = region;
    if (country) filters.country = country;

    const stats = await PeopleGroup.getStatusStats(filters);
    const total = await PeopleGroup.countDocuments(filters);

    // Calculate totals
    const totals = stats.reduce((acc, s) => ({
      population: acc.population + (s.totalPopulation || 0),
      believers: acc.believers + (s.totalBelievers || 0),
      churches: acc.churches + (s.totalChurches || 0),
    }), { population: 0, believers: 0, churches: 0 });

    res.json({
      total,
      byStatus: stats,
      totals,
      statusColors: {
        'pioneer': 'blue',
        'mid-journey': 'orange',
        'tipping-point': 'green',
        'movement': 'red',
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/nearby/:lng/:lat - Find nearby people groups
 */
router.get('/nearby/:lng/:lat', optionalAuth, async (req, res) => {
  try {
    const { lng, lat } = req.params;
    const { maxDistance = 10000, status } = req.query;

    const query = {
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      },
      approved: true
    };

    if (status) {
      query.status = status;
    }

    const peopleGroups = await PeopleGroup.find(query)
      .populate('createdBy', 'name email')
      .populate('village', 'name');

    res.json({
      data: peopleGroups,
      total: peopleGroups.length,
      center: { lng: parseFloat(lng), lat: parseFloat(lat) },
      maxDistance: parseInt(maxDistance)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/pending - Get pending approval items (supervisor only)
 */
router.get('/pending', auth, canApprove, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;

    const query = { approved: false };
    
    // Supervisors only see their organization's pending items
    if (req.user.role === 'supervisor' && req.user.organization) {
      query.organizationTags = req.user.organization;
    }

    const peopleGroups = await PeopleGroup.find(query)
      .populate('createdBy', 'name email avatar')
      .populate('village', 'name')
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ createdAt: -1 });

    const total = await PeopleGroup.countDocuments(query);

    res.json({
      data: peopleGroups,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/rejected - Get rejected people groups (supervisor/admin only)
 * Returns list of rejected people groups with rejection details
 * NOTE: This route must be defined BEFORE /:id to avoid conflicts
 */
router.get('/rejected', auth, canApprove, async (req, res) => {
  try {
    const { limit = 50, skip = 0, status, search } = req.query;
    
    const options = {
      limit: parseInt(limit),
      skip: parseInt(skip),
      status,
      search,
    };
    
    const rejectedPeopleGroups = await RejectedPeopleGroup.getAll(options);
    const total = await RejectedPeopleGroup.getCount(
      status ? { resubmissionStatus: status } : {}
    );
    
    res.json({
      data: rejectedPeopleGroups,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      hasMore: parseInt(skip) + rejectedPeopleGroups.length < total,
    });
  } catch (error) {
    console.error('[REJECTED] Error fetching rejected people groups:', error);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/rejected/count - Get count of rejected people groups
 */
router.get('/rejected/count', auth, canApprove, async (req, res) => {
  try {
    const total = await RejectedPeopleGroup.getCount();
    const byStatus = {
      rejected: await RejectedPeopleGroup.getCount({ resubmissionStatus: 'rejected' }),
      resubmitted: await RejectedPeopleGroup.getCount({ resubmissionStatus: 'resubmitted' }),
      archived: await RejectedPeopleGroup.getCount({ resubmissionStatus: 'archived' }),
    };
    
    res.json({ total, byStatus });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/rejected/:id - Get a single rejected people group
 */
router.get('/rejected/:id', auth, canApprove, async (req, res) => {
  try {
    const rejectedPeopleGroup = await RejectedPeopleGroup.findById(req.params.id)
      .populate('createdBy', 'name email avatar')
      .populate('rejectedBy', 'name email avatar');
    
    if (!rejectedPeopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Rejected people group not found'
      });
    }
    
    res.json(rejectedPeopleGroup);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'The rejected people group ID is invalid'
      });
    }
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * PUT /people-groups/rejected/:id/archive - Archive a rejected people group
 */
router.put('/rejected/:id/archive', auth, canApprove, async (req, res) => {
  try {
    const rejectedPeopleGroup = await RejectedPeopleGroup.findByIdAndUpdate(
      req.params.id,
      { resubmissionStatus: 'archived' },
      { new: true }
    );
    
    if (!rejectedPeopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Rejected people group not found'
      });
    }
    
    res.json({
      message: 'Rejected people group archived',
      data: rejectedPeopleGroup,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/by-country - Get people groups grouped by country
 * Query params:
 *   - includeJoshuaProject: boolean (default false) - include Joshua Project sourced data
 */
router.get('/by-country', auth, async (req, res) => {
  try {
    const includeJoshuaProject = req.query.includeJoshuaProject === 'true';

    // Build match stage based on includeJoshuaProject
    const matchStage = {};
    if (!includeJoshuaProject) {
      matchStage.source = { $not: { $regex: /^joshua project$/i } };
    }

    const countries = await PeopleGroup.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$country',
          total: { $sum: 1 },
          unreached: {
            $sum: { $cond: [{ $eq: ['$engagementStatus', 'unreached'] }, 1, 0] }
          },
          pioneer: {
            $sum: { $cond: [{ $eq: ['$engagementStatus', 'pioneer'] }, 1, 0] }
          },
          midway: {
            $sum: { $cond: [{ $eq: ['$engagementStatus', 'midway'] }, 1, 0] }
          },
          tippingPoint: {
            $sum: { $cond: [{ $eq: ['$engagementStatus', 'tipping-point'] }, 1, 0] }
          },
          dmm: {
            $sum: { $cond: [{ $eq: ['$engagementStatus', 'dmm'] }, 1, 0] }
          },
          peoples: { $push: '$$ROOT' }
        }
      },
      {
        $project: {
          _id: 0,
          country: '$_id',
          total: 1,
          unreached: 1,
          pioneer: 1,
          midway: 1,
          tippingPoint: 1,
          dmm: 1,
          peoples: 1
        }
      },
      { $sort: { country: 1 } }
    ]);

    res.json({ countries });
  } catch (error) {
    console.error('[BY-COUNTRY] Error:', error);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/:id - Get a single people group (requires authentication)
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const peopleGroup = await PeopleGroup.findById(req.params.id)
      .populate('createdBy', 'name email avatar')
      .populate('approvedBy', 'name')
      .populate('village', 'name location')
      .populate('organizationTags', 'name')
      .populate('photos.uploadedBy', 'name')
      .populate('progressHistory.updatedBy', 'name');

    if (!peopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'People group not found'
      });
    }

    // Check visibility
    if (!peopleGroup.approved && (!req.user || req.user.role === 'guest')) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'This content is pending approval'
      });
    }

    res.json(peopleGroup);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'The people group ID is invalid'
      });
    }
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * POST /people-groups - Create a new people group (with photo upload)
 */
router.post('/', auth, isMissionary, uploadPhotos, processUploadedFiles, 
  logActivity('create', 'PeopleGroup', (req, data) => ({ entityId: data.id, entityName: data.name })),
  async (req, res) => {
  try {
    const { 
      name, 
      description, 
      status, 
      location, 
      population, 
      language, 
      religion,
      believersCount,
      churchesCount,
      village,
      organizationTags,
      progressPercentage,
      progressNotes,
      region,
      country,
      // New fields for peoples page
      villageName,
      numberOfChurches,
      churchGeneration,
      engagementStatus,
      engagementLevel,
      source,
      // Reference/engagement metadata
      donor,
      nationalCoordinator,
      churchPlanter,
      affinityGroup,
      urbanRural,
      startYear
    } = req.body;

    // ═══════════════════════════════════════════════════════════════════════
    // REQUIRED FIELD VALIDATION: name and location.coordinates
    // ═══════════════════════════════════════════════════════════════════════
    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'People group name is required and must be at least 2 characters.',
        code: 'NAME_REQUIRED',
      });
    }

    const parsedLocationEarly = normalizePointLocation(location);

    if (!parsedLocationEarly) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Location coordinates are required. Provide { type: "Point", coordinates: [longitude, latitude] }.',
        code: 'LOCATION_REQUIRED',
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VILLAGE VALIDATION: Ensure village exists in the database
    // ═══════════════════════════════════════════════════════════════════════
    if (villageName) {
      const existingVillage = await validateVillageExists(villageName);
      if (!existingVillage) {
        console.log(`[VALIDATION] Village "${villageName}" not found in database`);
        return res.status(400).json({
          error: 'Village invalide',
          message: `Le village "${villageName}" n'existe pas dans la base de données. Veuillez sélectionner un village existant.`,
          code: 'VILLAGE_NOT_FOUND'
        });
      }
      console.log(`[VALIDATION] Village "${villageName}" validated successfully`);
    }

    // Process uploaded photos
    const photos = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        photos.push({
          url: file.url,
          filename: file.filename,
          uploadedBy: req.user._id,
        });
      });
    }

    // Use already-parsed location from early validation
    let parsedLocation = parsedLocationEarly;

    // Parse organizationTags if it's a string
    let parsedOrgTags = organizationTags;
    if (typeof organizationTags === 'string') {
      parsedOrgTags = JSON.parse(organizationTags);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DMM STATUS CALCULATION: Auto-calculate status and level
    // ═══════════════════════════════════════════════════════════════════════
    const churches = parseInt(numberOfChurches) || 0;
    const generations = parseInt(churchGeneration) || 0;
    const dmmResult = dmmStatusCalculator.calculatePeopleGroupStatus(churches, generations);
    
    console.log(`[DMM CREATE] Calculating status for ${churches} churches, ${generations} generations`);
    console.log(`[DMM CREATE] Result: status=${dmmResult.status} (${dmmResult.statusFr}), level=${dmmResult.level}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SOURCE DETERMINATION: Use client-provided source, default to 'DMM'
    // ═══════════════════════════════════════════════════════════════════════
    const validSources = ['DMM', 'Survey', 'Joshua Project'];
    const determinedSource = (source && validSources.includes(source)) ? source : 'DMM';
    console.log(`[DMM CREATE] Source: ${determinedSource} (user: ${req.user.email})`);

    const peopleGroup = new PeopleGroup({
      name,
      description,
      status: status || 'pioneer',
      location: parsedLocation,
      population: parseInt(population) || 0,
      language,
      religion,
      believersCount: parseInt(believersCount) || 0,
      churchesCount: parseInt(churchesCount) || 0,
      village,
      organizationTags: parsedOrgTags || [],
      progressPercentage: parseInt(progressPercentage) || 0,
      progressNotes,
      region,
      country,
      photos,
      // Reference/engagement metadata
      donor,
      nationalCoordinator,
      churchPlanter,
      affinityGroup,
      urbanRural,
      startYear: (startYear !== undefined && startYear !== null && startYear !== '')
        ? parseInt(startYear, 10)
        : undefined,
      // New fields for peoples page
      villageName,
      numberOfChurches: churches,
      churchGeneration: generations,
      // AUTO-CALCULATED: Status and level from DMM table
      engagementStatus: dmmResult.status,
      engagementLevel: dmmResult.level,
      // Source based on user
      source: determinedSource,
      createdBy: req.user._id,
      // Auto-approve DMM people groups for all authenticated users
      // Survey data requires manual review; DMM data is trusted from field workers
      // Nouveaux engagements : toujours "en attente de validation" (approved:false),
      // quel que soit le rôle ou la source, afin qu'un administrateur les valide
      // avant qu'ils ne comptent dans le reporting région et n'apparaissent sur la carte.
      approved: false,
      approvedBy: (determinedSource === 'DMM' || ['admin', 'supervisor'].includes(req.user.role)) ? req.user._id : undefined,
      approvedAt: (determinedSource === 'DMM' || ['admin', 'supervisor'].includes(req.user.role)) ? new Date() : undefined,
    });

    await peopleGroup.save();

    // Send proximity notifications
    if (parsedLocation?.coordinates) {
      try {
        await Notification.notifyNearbyUsers({
          coordinates: parsedLocation.coordinates,
          maxDistance: 10000,
          title: 'New People Group Added Nearby',
          message: `${name} has been added near your location`,
          relatedEntity: {
            entityType: 'PeopleGroup',
            entityId: peopleGroup._id,
          },
          sender: req.user._id,
          excludeUserId: req.user._id,
        });
      } catch (notifError) {
        console.error('Error sending proximity notifications:', notifError);
      }
    }

    // Notify supervisors if approval required
    if (!peopleGroup.approved) {
      try {
        const supervisors = await User.find({ role: { $in: ['admin', 'supervisor'] } }).select('_id');
        if (supervisors.length > 0) {
          const notifications = supervisors.map(supervisor => ({
            recipient: supervisor._id,
            sender: req.user._id,
            type: 'approval_required',
            title: 'Nouveau peuple à approuver',
            message: `${req.user.name || req.user.email} a soumis "${peopleGroup.name}" (${peopleGroup.villageName || 'village inconnu'}) pour approbation.`,
            relatedEntity: {
              entityType: 'PeopleGroup',
              entityId: peopleGroup._id,
            },
          }));
          await Notification.insertMany(notifications);
          console.log(`[NOTIFY] Sent approval notifications to ${supervisors.length} supervisor(s) for "${peopleGroup.name}"`);

          // Emit real-time notification via Socket.IO
          const io = req.app.get('io');
          if (io) {
            supervisors.forEach(supervisor => {
              io.to(`user:${supervisor._id}`).emit('notification', {
                type: 'approval_required',
                title: 'Nouveau peuple à approuver',
                message: `"${peopleGroup.name}" attend votre approbation.`,
                entityId: peopleGroup._id,
              });
            });
          }
        }
      } catch (notifError) {
        console.error('[NOTIFY] Error sending supervisor notifications:', notifError.message);
      }
    }

    // Emit people-group-added event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to('map').emit('people-group-added', {
        id: peopleGroup._id,
        name: peopleGroup.name,
        villageName: villageName,
        engagementStatus: peopleGroup.engagementStatus,
        createdAt: new Date().toISOString()
      });
    }

    // Recalculate and emit village status update
    if (villageName) {
      // Await the emit to ensure it completes before response
      await emitVillageStatusUpdate(req, villageName);
    }

    // Get village status for response
    let villageStatus = null;
    if (villageName) {
      villageStatus = await villageStatusService.recalculateVillageStatus(villageName);
    }

    // Format response with all required fields
    const response = formatPeopleGroupResponse(peopleGroup, villageStatus);

    res.status(201).json({
      message: 'People group created successfully',
      id: peopleGroup._id,
      ...response,
      needsApproval: !peopleGroup.approved,
      // DMM calculation info
      dmmCalculation: {
        churches: dmmResult.churches,
        generations: dmmResult.generations,
        status: dmmResult.status,
        statusFr: dmmResult.statusFr,
        level: dmmResult.level,
        description: dmmResult.description
      }
    });
  } catch (error) {
    console.error('Error creating people group:', error);
    
    // Handle Mongoose validation errors with detailed field-level information
    if (error.name === 'ValidationError') {
      const fieldErrors = Object.keys(error.errors).map(field => {
        const fieldError = error.errors[field];
        return {
          field: field,
          message: fieldError.message,
          value: fieldError.value,
          kind: fieldError.kind || 'validation'
        };
      });
      
      return res.status(400).json({
        error: 'Validation failed',
        message: 'One or more fields failed validation',
        validationErrors: fieldErrors,
        fields: fieldErrors.map(e => e.field)
      });
    }
    
    // Handle type casting errors (e.g., invalid ObjectId, wrong data type)
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid data type',
        message: `Invalid value for ${error.path}: expected ${error.kind}`,
        field: error.path,
        value: error.value,
        expectedType: error.kind
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'unknown';
      const duplicateValue = error.keyValue ? error.keyValue[duplicateField] : 'unknown';
      return res.status(409).json({
        error: 'Duplicate entry',
        message: `A people group with this ${duplicateField} already exists`,
        field: duplicateField,
        value: duplicateValue
      });
    }
    
    // Handle other errors
    res.status(400).json({
      error: 'Creation failed',
      message: error.message
    });
  }
});

/**
 * PUT /people-groups/:id - Update a people group
 */
router.put('/:id', auth, isMissionary,
  logActivity('update', 'PeopleGroup', (req, data) => ({ entityId: req.params.id, entityName: data.name })),
  async (req, res) => {
  try {
    const peopleGroup = await PeopleGroup.findById(req.params.id);
    
    if (!peopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'People group not found'
      });
    }

    // Check edit permission
    if (!req.user.canEdit(peopleGroup)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only edit your own content'
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VILLAGE VALIDATION: Ensure village exists in the database (if changing)
    // ═══════════════════════════════════════════════════════════════════════
    const newVillageName = req.body.villageName;
    if (newVillageName && newVillageName !== peopleGroup.villageName) {
      const existingVillage = await validateVillageExists(newVillageName);
      if (!existingVillage) {
        console.log(`[VALIDATION] Village "${newVillageName}" not found in GeoJSON`);
        return res.status(400).json({
          error: 'Village invalide',
          message: `Le village "${newVillageName}" n'existe pas dans la liste des villages. Veuillez sélectionner un village existant depuis le menu déroulant.`,
          code: 'VILLAGE_NOT_FOUND'
        });
      }
      console.log(`[VALIDATION] Village "${newVillageName}" validated successfully`);
    }

    // Store old village name before update to handle village changes
    const oldVillageName = peopleGroup.villageName;

    const allowedUpdates = [
      'name', 'description', 'status', 'location', 'population',
      'language', 'religion', 'believersCount', 'churchesCount',
      'village', 'organizationTags', 'progressPercentage', 'progressNotes',
      'region', 'country', 'isPublic',
      // New fields for peoples page (excluding engagementStatus and engagementLevel - auto-calculated)
      'villageName', 'numberOfChurches', 'churchGeneration',
      // NG field-report metrics
      'dbs', 'com', 'cat',
      // Reference/engagement metadata (from Cameroon_PGs.xlsx)
      'donor', 'nationalCoordinator', 'churchPlanter', 'affinityGroup', 'urbanRural', 'startYear'
    ];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        peopleGroup[field] = field === 'location' ? normalizePointLocation(req.body[field]) : req.body[field];
      }
    });

    if (req.body.location !== undefined && !peopleGroup.location) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Location coordinates are required. Provide { type: "Point", coordinates: [longitude, latitude] }.',
        code: 'LOCATION_REQUIRED',
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DMM STATUS CALCULATION: Auto-recalculate status and level if churches or generations changed
    // ═══════════════════════════════════════════════════════════════════════
    const churches = parseInt(peopleGroup.numberOfChurches) || 0;
    const generations = parseInt(peopleGroup.churchGeneration) || 0;
    const dmmResult = dmmStatusCalculator.calculatePeopleGroupStatus(churches, generations);
    
    // Always recalculate to ensure consistency
    peopleGroup.engagementStatus = dmmResult.status;
    peopleGroup.engagementLevel = dmmResult.level;
    
    console.log(`[DMM UPDATE] Recalculating status for ${churches} churches, ${generations} generations`);
    console.log(`[DMM UPDATE] Result: status=${dmmResult.status} (${dmmResult.statusFr}), level=${dmmResult.level}`);

    // Track who made the update
    peopleGroup.updatedBy = req.user._id;

    await peopleGroup.save();
    
    await peopleGroup.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'village', select: 'name' },
      { path: 'organizationTags', select: 'name' }
    ]);

    // Emit people-group-updated event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to('map').emit('people-group-updated', {
        id: peopleGroup._id,
        name: peopleGroup.name,
        villageName: peopleGroup.villageName,
        engagementStatus: peopleGroup.engagementStatus,
        updatedAt: new Date().toISOString()
      });
    }

    // Recalculate and emit village status update
    // If village changed, update both old and new villages
    if (oldVillageName && oldVillageName !== newVillageName) {
      await emitVillageStatusUpdate(req, oldVillageName);
    }
    if (peopleGroup.villageName) {
      await emitVillageStatusUpdate(req, peopleGroup.villageName);
    }

    // Get village status for response
    let villageStatus = null;
    if (peopleGroup.villageName) {
      villageStatus = await villageStatusService.recalculateVillageStatus(peopleGroup.villageName);
    }

    // Format response with all required fields
    const response = formatPeopleGroupResponse(peopleGroup, villageStatus);

    res.json({
      message: 'People group updated successfully',
      ...response,
      // DMM calculation info
      dmmCalculation: {
        churches: dmmResult.churches,
        generations: dmmResult.generations,
        status: dmmResult.status,
        statusFr: dmmResult.statusFr,
        level: dmmResult.level,
        description: dmmResult.description
      }
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'The people group ID is invalid'
      });
    }
    res.status(400).json({
      error: 'Update failed',
      message: error.message
    });
  }
});

/**
 * POST /people-groups/:id/photos - Add photos to a people group
 */
router.post('/:id/photos', auth, isMissionary, uploadPhotos, processUploadedFiles, async (req, res) => {
  try {
    const peopleGroup = await PeopleGroup.findById(req.params.id);
    
    if (!peopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'People group not found'
      });
    }

    // Check edit permission
    if (!req.user.canEdit(peopleGroup)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only edit your own content'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files',
        message: 'No photos provided'
      });
    }

    const newPhotos = req.files.map(file => ({
      url: file.url,
      filename: file.filename,
      caption: req.body.caption || '',
      uploadedBy: req.user._id,
    }));

    peopleGroup.photos.push(...newPhotos);
    await peopleGroup.save();

    res.json({
      message: 'Photos added successfully',
      photos: peopleGroup.photos
    });
  } catch (error) {
    res.status(400).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});

/**
 * DELETE /people-groups/:id/photos/:photoId - Remove a photo
 */
router.delete('/:id/photos/:photoId', auth, isMissionary, async (req, res) => {
  try {
    const peopleGroup = await PeopleGroup.findById(req.params.id);
    
    if (!peopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'People group not found'
      });
    }

    // Check edit permission
    if (!req.user.canEdit(peopleGroup)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only edit your own content'
      });
    }

    const photo = peopleGroup.photos.id(req.params.photoId);
    if (!photo) {
      return res.status(404).json({
        error: 'Not found',
        message: 'Photo not found'
      });
    }

    // Delete file from disk
    if (photo.url) {
      try {
        await deleteFile(photo.url);
      } catch (err) {
        console.error('Error deleting photo file:', err);
      }
    }

    peopleGroup.photos.pull(req.params.photoId);
    await peopleGroup.save();

    res.json({
      message: 'Photo removed successfully'
    });
  } catch (error) {
    res.status(400).json({
      error: 'Delete failed',
      message: error.message
    });
  }
});

/**
 * POST /people-groups/:id/approve - Approve a people group (supervisor only)
 */
router.post('/:id/approve', auth, canApprove,
  logActivity('approve', 'PeopleGroup', (req, data) => ({ entityId: req.params.id, entityName: data.name })),
  async (req, res) => {
  try {
    const peopleGroup = await PeopleGroup.findById(req.params.id);
    
    if (!peopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'People group not found'
      });
    }

    // Idempotent: if it's already approved, return success (200) so the client
    // can simply drop it from the pending list instead of surfacing an error.
    if (peopleGroup.approved) {
      return res.json({
        message: 'People group is already approved',
        alreadyApproved: true,
        ...peopleGroup.toJSON()
      });
    }

    // Only block approval when a location value is present but malformed.
    // Reference/location-less records (e.g. country-level people groups) can
    // still be approved; they simply won't render as a point on the map.
    if (peopleGroup.location && !normalizePointLocation(peopleGroup.location)) {
      return res.status(400).json({
        error: 'Approval failed',
        message: 'This people group has invalid location data and must be corrected before approval.',
        code: 'INVALID_LOCATION',
      });
    }

    peopleGroup.approved = true;
    peopleGroup.approvedBy = req.user._id;
    peopleGroup.approvedAt = new Date();
    await peopleGroup.save();

    // Effets de bord NON bloquants : une notification ou une émission de statut
    // qui échoue ne doit JAMAIS faire échouer l'approbation (sinon le client
    // reçoit une erreur alors que l'enregistrement est bel et bien approuvé —
    // c'était la cause du bug "erreur puis déjà approuvé").
    try {
      if (peopleGroup.createdBy) {
        await Notification.create({
          user: peopleGroup.createdBy,
          type: 'approval-granted',
          title: 'Content Approved',
          message: `Your people group "${peopleGroup.name}" has been approved`,
          relatedEntity: {
            entityType: 'PeopleGroup',
            entityId: peopleGroup._id,
          },
          sender: req.user._id,
        });
      }
    } catch (notifyErr) {
      console.warn('[approve] notification non critique ignorée:', notifyErr.message);
    }

    try {
      if (peopleGroup.villageName) {
        await emitVillageStatusUpdate(req, peopleGroup.villageName);
      }
    } catch (emitErr) {
      console.warn('[approve] emitVillageStatusUpdate non critique ignoré:', emitErr.message);
    }

    res.json({
      message: 'People group approved successfully',
      ...peopleGroup.toJSON()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Approval failed',
      message: error.message
    });
  }
});

/**
 * POST /people-groups/:id/reject - Reject a people group (supervisor only)
 * Stores the rejected people group with rejection reason and sends email notification
 */
router.post('/:id/reject', auth, canApprove, async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Rejection reason is required'
      });
    }
    
    const peopleGroup = await PeopleGroup.findById(req.params.id)
      .populate('createdBy', 'name email');
    
    if (!peopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'People group not found'
      });
    }

    const rejectedAt = new Date();
    
    // Store the rejected people group with all details
    const rejectedPeopleGroup = await RejectedPeopleGroup.create({
      // Original people group data
      name: peopleGroup.name,
      villageName: peopleGroup.villageName,
      description: peopleGroup.description,
      numberOfChurches: peopleGroup.numberOfChurches,
      churchGeneration: peopleGroup.churchGeneration,
      engagementStatus: peopleGroup.engagementStatus,
      engagementLevel: peopleGroup.engagementLevel,
      status: peopleGroup.status,
      location: peopleGroup.location,
      population: peopleGroup.population,
      language: peopleGroup.language,
      religion: peopleGroup.religion,
      believersCount: peopleGroup.believersCount,
      churchesCount: peopleGroup.churchesCount,
      region: peopleGroup.region,
      country: peopleGroup.country,
      photos: peopleGroup.photos?.map(p => ({
        url: p.url,
        filename: p.filename,
        caption: p.caption,
      })) || [],
      // Original submission info
      originalId: peopleGroup._id,
      createdBy: peopleGroup.createdBy._id,
      originalCreatedAt: peopleGroup.createdAt,
      // Rejection info
      rejectedBy: req.user._id,
      rejectedAt,
      rejectionReason: reason.trim(),
    });

    // Create in-app notification for the creator
    await Notification.create({
      user: peopleGroup.createdBy._id,
      type: 'approval-rejected',
      title: 'Content Rejected',
      message: `Your people group "${peopleGroup.name}" was not approved. Reason: ${reason}`,
      relatedEntity: {
        entityType: 'PeopleGroup',
        entityId: rejectedPeopleGroup._id,
      },
      sender: req.user._id,
      metadata: {
        rejectionReason: reason,
        rejectedPeopleGroupId: rejectedPeopleGroup._id,
      },
    });

    // Send email notification to the creator
    if (peopleGroup.createdBy?.email) {
      try {
        const formatDate = (date) => {
          return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        };
        
        await sendRejectionNotificationEmail(
          peopleGroup.createdBy.email,
          {
            userName: peopleGroup.createdBy.name || '',
            peopleGroupName: peopleGroup.name,
            villageName: peopleGroup.villageName || '',
            dateSubmitted: formatDate(peopleGroup.createdAt),
            dateRejected: formatDate(rejectedAt),
            rejectedByName: req.user.name || 'Supervisor',
            rejectionReason: reason,
          },
          'en' // Default to English, could be based on user preference
        );
        
        // Update notification status
        await RejectedPeopleGroup.findByIdAndUpdate(rejectedPeopleGroup._id, {
          notificationSent: true,
          notificationSentAt: new Date(),
        });
        
        console.log(`[REJECTION] Email notification sent to ${peopleGroup.createdBy.email}`);
      } catch (emailError) {
        console.error('[REJECTION] Failed to send email notification:', emailError.message);
        // Don't fail the rejection if email fails
      }
    }

    // Delete the original people group
    await PeopleGroup.findByIdAndDelete(req.params.id);

    console.log(`[REJECTION] People group "${peopleGroup.name}" rejected by ${req.user.name || req.user.email}`);

    res.json({
      message: 'People group rejected and archived',
      rejectedPeopleGroupId: rejectedPeopleGroup._id,
    });
  } catch (error) {
    console.error('[REJECTION] Error:', error);
    res.status(400).json({
      error: 'Rejection failed',
      message: error.message
    });
  }
});

/**
 * DELETE /people-groups/:id - Delete a people group
 */
router.delete('/:id', auth, isMissionary,
  logActivity('delete', 'PeopleGroup', (req) => ({ entityId: req.params.id })),
  async (req, res) => {
  try {
    const peopleGroup = await PeopleGroup.findById(req.params.id);

    if (!peopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'People group not found'
      });
    }

    // Check delete permission
    if (!req.user.canEdit(peopleGroup) && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own content'
      });
    }

    // Delete associated photos
    for (const photo of peopleGroup.photos) {
      if (photo.url) {
        try {
          await deleteFile(photo.url);
        } catch (err) {
          console.error('Error deleting photo:', err);
        }
      }
    }

    // Store village name before deletion for status recalculation
    const villageName = peopleGroup.villageName;

    await PeopleGroup.findByIdAndDelete(req.params.id);

    // Recalculate and emit village status update after deletion
    if (villageName) {
      emitVillageStatusUpdate(req, villageName);
    }

    res.json({
      message: 'People group deleted successfully',
      id: req.params.id
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'The people group ID is invalid'
      });
    }
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * DELETE /people-groups/delete-all-except-joshua - Delete all non-Joshua Project people groups
 * Also deletes all RejectedPeopleGroup documents and People documents
 */
router.delete('/delete-all-except-joshua', auth, async (req, res) => {
  try {
    // Delete all PeopleGroup documents where source is not 'Joshua Project' (case insensitive)
    const peopleGroupResult = await PeopleGroup.deleteMany({
      $and: [
        { source: { $not: { $regex: /^joshua project$/i } } }
      ]
    });

    // Delete all RejectedPeopleGroup documents
    const rejectedResult = await RejectedPeopleGroup.deleteMany({});

    // Check if People model exists and delete all People documents
    let peopleDeletedCount = 0;
    try {
      const People = require('../models/People');
      if (People) {
        const peopleResult = await People.deleteMany({});
        peopleDeletedCount = peopleResult.deletedCount;
      }
    } catch (modelError) {
      console.log('People model not found or error:', modelError.message);
    }

    res.json({
      message: 'Deletion completed successfully',
      deletedCounts: {
        peopleGroups: peopleGroupResult.deletedCount,
        rejectedPeopleGroups: rejectedResult.deletedCount,
        people: peopleDeletedCount
      }
    });
  } catch (error) {
    console.error('[DELETE-ALL-EXCEPT-JOSHUA] Error:', error);
    res.status(500).json({
      error: 'Deletion failed',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/:id/timeline - Get progress timeline
 */
router.get('/:id/timeline', optionalAuth, async (req, res) => {
  try {
    const peopleGroup = await PeopleGroup.findById(req.params.id)
      .select('progressHistory name')
      .populate('progressHistory.updatedBy', 'name');

    if (!peopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'People group not found'
      });
    }

    res.json({
      name: peopleGroup.name,
      timeline: peopleGroup.progressHistory.sort((a, b) => b.date - a.date)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /people-groups/:id/activities - Get activities for a people group
 */
router.get('/:id/activities', auth, async (req, res) => {
  try {
    const Activity = require('../models/Activity');
    const { limit = 20, skip = 0, type } = req.query;

    const peopleGroup = await PeopleGroup.findById(req.params.id);
    if (!peopleGroup) {
      return res.status(404).json({
        error: 'Not found',
        message: 'People group not found'
      });
    }

    const query = { peopleGroup: req.params.id };
    if (type) {
      query.type = type;
    }

    const activities = await Activity.find(query)
      .populate('user', 'name email avatar')
      .populate('village', 'name')
      .populate('church', 'name')
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ date: -1 });

    const total = await Activity.countDocuments(query);

    res.json({
      data: activities,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      hasMore: parseInt(skip) + activities.length < total
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid ID',
        message: 'The people group ID is invalid'
      });
    }
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * POST /people-groups/engage-from-jp
 * Crée un PeopleGroup DMM pré-rempli depuis les données Joshua Project.
 * Utilisé par le Proximity Alert — "Engager ce peuple" en 1 clic.
 *
 * Body: { jpPeopleGroupId, name, coordinates, population, language,
 *         religion, country, countryCode, jpData }
 */
router.post('/engage-from-jp', auth, isMissionary, async (req, res) => {
  try {
    const {
      jpPeopleGroupId,
      name,
      coordinates,   // [lng, lat]
      population,
      language,
      religion,
      country,
      countryCode,
      jpData,
    } = req.body;

    if (!name || !coordinates || coordinates.length !== 2) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'name et coordinates [lng, lat] sont requis',
      });
    }

    // Vérifier qu'un PeopleGroup DMM n'existe pas déjà pour ce peuple JP
    const existing = await PeopleGroup.findOne({
      source: 'DMM',
      approved: true,
      $or: [
        { name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }, country },
        { 'jpData.peopleId': jpPeopleGroupId },
      ],
    });

    if (existing) {
      return res.status(409).json({
        error: 'Déjà engagé',
        message: `Ce peuple (${name}) a déjà un engagement DMM actif.`,
        existingId: existing._id,
      });
    }

    // Créer le PeopleGroup DMM pré-rempli depuis JP
    const newPG = new PeopleGroup({
      name:             name.trim(),
      villageName:      '',
      description:      [
        `Engagement DMM initié depuis les données Joshua Project.`,
        religion  ? `Religion principale : ${religion}.`  : '',
        language  ? `Langue : ${language}.`               : '',
      ].filter(Boolean).join(' '),
      location: {
        type:        'Point',
        coordinates: [parseFloat(coordinates[0]), parseFloat(coordinates[1])],
      },
      population:       parseInt(population) || 0,
      language:         language     || '',
      religion:         religion     || '',
      country:          country      || '',
      countryCode:      countryCode  || '',
      numberOfChurches: 0,
      churchGeneration: 0,
      engagementStatus: 'pioneer',   // Premier statut DMM — l'équipe vient juste de s'engager
      engagementLevel:  'I',
      status:           'pioneer',
      source:           'DMM',
      // Toujours en attente de validation à la création (voir note ci-dessus).
      approved:         false,
      createdBy:        req.user._id,
      approvedBy:       ['admin', 'supervisor'].includes(req.user.role) ? req.user._id : undefined,
      approvedAt:       ['admin', 'supervisor'].includes(req.user.role) ? new Date() : undefined,
      // Lien vers les données JP d'origine
      jpData: {
        peopleId:          jpPeopleGroupId || '',
        rog3:              countryCode || '',
        jpScale:           jpData?.jpScale || '',
        percentEvangelical:jpData?.percentEvangelical || 0,
        percentChristian:  jpData?.percentChristian  || 0,
        leastReached:      jpData?.leastReached       || false,
        frontier:          jpData?.frontier           || false,
        peopleCluster:     jpData?.peopleCluster      || '',
        affinityBloc:      jpData?.affinityBloc       || '',
      },
    });

    await newPG.save();

    // Émettre un événement Socket.IO si disponible
    const io = req.app?.get('io');
    if (io) {
      io.to('map').emit('people-group-added', {
        id:     newPG._id,
        name:   newPG.name,
        status: 'pioneer',
        source: 'DMM',
        fromJP: true,
      });
    }

    res.status(201).json({
      success:  true,
      message:  `Engagement DMM créé pour "${name}" !`,
      data:     newPG,
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation', message: error.message });
    }
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
