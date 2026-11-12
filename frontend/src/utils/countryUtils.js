/**
 * Country Utilities
 * 
 * Helper functions for country-related operations
 * 
 * @author Church Planting Map Team
 * @version 1.0.0
 */

/**
 * Convert ISO 3166-1 alpha-2 code to flag emoji
 * @param {string} code - ISO country code (e.g., 'CM', 'TD')
 * @returns {string} Flag emoji or globe emoji if invalid
 */
export const getCountryFlag = (code) => {
  if (!code || code.length !== 2) return '🌍'
  
  const codePoints = code
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0))
  
  return String.fromCodePoint(...codePoints)
}

/**
 * Convert country code to database-friendly name
 * @param {string} code - ISO country code
 * @returns {string|null} Country name in French (for database)
 */
export const countryCodeToDbName = (code) => {
  const countryMap = {
    'CM': 'Cameroun',
    'CMR': 'Cameroun',
    'TD': 'Tchad',
    'TCD': 'Tchad',
    'CF': 'République centrafricaine',
    'CAF': 'République centrafricaine',
    'CG': 'Congo',
    'COG': 'Congo',
    'CD': 'RD Congo',
    'COD': 'RD Congo',
    'GA': 'Gabon',
    'GAB': 'Gabon',
    'GQ': 'Guinée équatoriale',
    'GNQ': 'Guinée équatoriale',
    'ST': 'Sao Tomé-et-Príncipe',
    'STP': 'Sao Tomé-et-Príncipe',
  }
  
  return countryMap[code?.toUpperCase()] || null
}

/**
 * Localized display name for a country code (alpha-2 or alpha-3).
 * One country = one label. The label follows the UI language so that the
 * same country (e.g. CM) never shows twice as "Cameroun" + "Cameroon".
 * @param {string} code - ISO country code (e.g., 'CM', 'CMR')
 * @param {boolean} isFrench - true for the French label, false for English
 * @returns {string|null} Localized country name, or null if unknown
 */
export const countryCodeToDisplayName = (code, isFrench = true) => {
  const fr = {
    CM: 'Cameroun', CMR: 'Cameroun',
    TD: 'Tchad', TCD: 'Tchad',
    CF: 'République centrafricaine', CAF: 'République centrafricaine',
    CG: 'Congo', COG: 'Congo',
    CD: 'RD Congo', COD: 'RD Congo',
    GA: 'Gabon', GAB: 'Gabon',
    GQ: 'Guinée équatoriale', GNQ: 'Guinée équatoriale',
    ST: 'Sao Tomé-et-Príncipe', STP: 'Sao Tomé-et-Príncipe',
  }
  const en = {
    CM: 'Cameroon', CMR: 'Cameroon',
    TD: 'Chad', TCD: 'Chad',
    CF: 'Central African Republic', CAF: 'Central African Republic',
    CG: 'Congo', COG: 'Congo',
    CD: 'DR Congo', COD: 'DR Congo',
    GA: 'Gabon', GAB: 'Gabon',
    GQ: 'Equatorial Guinea', GNQ: 'Equatorial Guinea',
    ST: 'São Tomé and Príncipe', STP: 'São Tomé and Príncipe',
  }
  const key = code?.toUpperCase()
  if (!key) return null
  return (isFrench ? fr : en)[key] || null
}

/**
 * Convert database country name to ISO code
 * @param {string} name - Country name in database
 * @returns {string|null} ISO country code
 */
export const dbNameToCountryCode = (name) => {
  const nameMap = {
    'Cameroun': 'CM',
    'Cameroon': 'CM',
    'Tchad': 'TD',
    'Chad': 'TD',
    'République centrafricaine': 'CF',
    'Central African Republic': 'CF',
    'Congo': 'CG',
    'Republic of the Congo': 'CG',
    'RD Congo': 'CD',
    'Democratic Republic of the Congo': 'CD',
    'Gabon': 'GA',
    'Guinée équatoriale': 'GQ',
    'Equatorial Guinea': 'GQ',
    'Sao Tomé-et-Príncipe': 'ST',
    'São Tomé and Príncipe': 'ST',
  }
  
  return nameMap[name] || null
}

/**
 * Format country bounds for Leaflet
 * @param {Array} bounds - Bounds array [[south, west], [north, east]]
 * @returns {Array} Leaflet-compatible bounds
 */
export const formatBoundsForLeaflet = (bounds) => {
  if (!bounds || !Array.isArray(bounds) || bounds.length !== 2) {
    return null
  }
  
  return [
    [bounds[0][0], bounds[0][1]], // Southwest
    [bounds[1][0], bounds[1][1]], // Northeast
  ]
}

/**
 * Check if coordinates are within bounds
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Array} bounds - Bounds array [[south, west], [north, east]]
 * @returns {boolean} True if within bounds
 */
export const isWithinBounds = (lat, lng, bounds) => {
  if (!bounds || !Array.isArray(bounds) || bounds.length !== 2) {
    return true // Allow if no bounds
  }
  
  const [sw, ne] = bounds
  return (
    lat >= sw[0] && lat <= ne[0] &&
    lng >= sw[1] && lng <= ne[1]
  )
}

/**
 * Get center point of bounds
 * @param {Array} bounds - Bounds array [[south, west], [north, east]]
 * @returns {Array} Center coordinates [lat, lng]
 */
export const getBoundsCenter = (bounds) => {
  if (!bounds || !Array.isArray(bounds) || bounds.length !== 2) {
    return null
  }
  
  const [sw, ne] = bounds
  return [
    (sw[0] + ne[0]) / 2,
    (sw[1] + ne[1]) / 2,
  ]
}

/**
 * Calculate appropriate zoom level for bounds
 * @param {Array} bounds - Bounds array [[south, west], [north, east]]
 * @param {number} mapWidth - Map container width in pixels
 * @param {number} mapHeight - Map container height in pixels
 * @returns {number} Recommended zoom level
 */
export const calculateZoomForBounds = (bounds, mapWidth = 800, mapHeight = 600) => {
  if (!bounds || !Array.isArray(bounds) || bounds.length !== 2) {
    return 6 // Default zoom
  }
  
  const [sw, ne] = bounds
  const latDiff = Math.abs(ne[0] - sw[0])
  const lngDiff = Math.abs(ne[1] - sw[1])
  
  // Approximate zoom calculation
  const latZoom = Math.log2(180 / latDiff) + 1
  const lngZoom = Math.log2(360 / lngDiff) + 1
  
  return Math.min(Math.floor(Math.min(latZoom, lngZoom)), 18)
}

export default {
  getCountryFlag,
  countryCodeToDbName,
  dbNameToCountryCode,
  formatBoundsForLeaflet,
  isWithinBounds,
  getBoundsCenter,
  calculateZoomForBounds,
}
