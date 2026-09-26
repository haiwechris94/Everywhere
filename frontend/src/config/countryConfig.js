/**
 * Country Configuration
 * 
 * Contains configuration for all supported countries including:
 * - ISO codes (alpha-2 and alpha-3)
 * - Names in French and English
 * - Geographic center coordinates
 * - Default zoom levels
 * - Bounding boxes for map fitting
 * 
 * @author Church Planting Map Team
 * @version 1.0.0
 */

// Default country code
export const DEFAULT_COUNTRY = 'CM'

// Cameroon-specific exports for backward compatibility
export const CAMEROON_CENTER = [7.3697, 12.3547]
export const CAMEROON_ZOOM = 6

// Country configurations
export const COUNTRY_CONFIG = {
  CM: {
    code: 'CM',
    code3: 'CMR',
    name: 'Cameroun',
    nameEn: 'Cameroon',
    capital: 'Yaoundé',
    region: 'Central Africa',
    center: [7.3697, 12.3547],
    zoom: 6,
    bounds: [
      [1.6559, 8.4944],   // Southwest corner [lat, lng]
      [13.0833, 16.1921]  // Northeast corner [lat, lng]
    ],
    languages: ['fr', 'en'],
    currency: 'XAF',
    timezone: 'Africa/Douala',
  },
  
  TD: {
    code: 'TD',
    code3: 'TCD',
    name: 'Tchad',
    nameEn: 'Chad',
    capital: "N'Djamena",
    region: 'Central Africa',
    center: [15.4542, 18.7322],
    zoom: 5,
    bounds: [
      [7.4419, 13.4734],
      [23.4503, 24.0000]
    ],
    languages: ['fr', 'ar'],
    currency: 'XAF',
    timezone: 'Africa/Ndjamena',
  },
  
  CF: {
    code: 'CF',
    code3: 'CAF',
    name: 'République centrafricaine',
    nameEn: 'Central African Republic',
    capital: 'Bangui',
    region: 'Central Africa',
    center: [6.6111, 20.9394],
    zoom: 6,
    bounds: [
      [2.2207, 14.4200],
      [11.0078, 27.4583]
    ],
    languages: ['fr', 'sg'],
    currency: 'XAF',
    timezone: 'Africa/Bangui',
  },
  
  CG: {
    code: 'CG',
    code3: 'COG',
    name: 'Congo',
    nameEn: 'Republic of the Congo',
    capital: 'Brazzaville',
    region: 'Central Africa',
    center: [-0.2280, 15.8277],
    zoom: 6,
    bounds: [
      [-5.0269, 11.2050],
      [3.7031, 18.6500]
    ],
    languages: ['fr'],
    currency: 'XAF',
    timezone: 'Africa/Brazzaville',
  },
  
  CD: {
    code: 'CD',
    code3: 'COD',
    name: 'RD Congo',
    nameEn: 'Democratic Republic of the Congo',
    capital: 'Kinshasa',
    region: 'Central Africa',
    center: [-4.0383, 21.7587],
    zoom: 5,
    bounds: [
      [-13.4559, 12.2044],
      [5.3920, 31.3056]
    ],
    languages: ['fr'],
    currency: 'CDF',
    timezone: 'Africa/Kinshasa',
  },
  
  GA: {
    code: 'GA',
    code3: 'GAB',
    name: 'Gabon',
    nameEn: 'Gabon',
    capital: 'Libreville',
    region: 'Central Africa',
    center: [-0.8037, 11.6094],
    zoom: 7,
    bounds: [
      [-3.9783, 8.6958],
      [2.3226, 14.5025]
    ],
    languages: ['fr'],
    currency: 'XAF',
    timezone: 'Africa/Libreville',
  },
  
  GQ: {
    code: 'GQ',
    code3: 'GNQ',
    name: 'Guinée équatoriale',
    nameEn: 'Equatorial Guinea',
    capital: 'Malabo',
    region: 'Central Africa',
    center: [1.6508, 10.2679],
    zoom: 8,
    bounds: [
      [0.9200, 5.6147],
      [2.3469, 11.3376]
    ],
    languages: ['es', 'fr', 'pt'],
    currency: 'XAF',
    timezone: 'Africa/Malabo',
  },
  
  ST: {
    code: 'ST',
    code3: 'STP',
    name: 'Sao Tomé-et-Príncipe',
    nameEn: 'São Tomé and Príncipe',
    capital: 'São Tomé',
    region: 'Central Africa',
    center: [0.1864, 6.6131],
    zoom: 10,
    bounds: [
      [-0.0142, 6.4700],
      [1.7014, 7.4633]
    ],
    languages: ['pt'],
    currency: 'STN',
    timezone: 'Africa/Sao_Tome',
  },
  
  // Additional countries can be added here
  NG: {
    code: 'NG',
    code3: 'NGA',
    name: 'Nigeria',
    nameEn: 'Nigeria',
    capital: 'Abuja',
    region: 'West Africa',
    center: [9.0820, 8.6753],
    zoom: 6,
    bounds: [
      [4.2771, 2.6683],
      [13.8920, 14.6800]
    ],
    languages: ['en'],
    currency: 'NGN',
    timezone: 'Africa/Lagos',
  },
  
  SN: {
    code: 'SN',
    code3: 'SEN',
    name: 'Sénégal',
    nameEn: 'Senegal',
    capital: 'Dakar',
    region: 'West Africa',
    center: [14.4974, -14.4524],
    zoom: 7,
    bounds: [
      [12.3072, -17.5353],
      [16.6919, -11.3558]
    ],
    languages: ['fr'],
    currency: 'XOF',
    timezone: 'Africa/Dakar',
  },

  GH: { code: 'GH', code3: 'GHA', name: 'Ghana', nameEn: 'Ghana', capital: 'Accra', region: 'West Africa', center: [7.9465, -1.0232], zoom: 7, bounds: [[4.7388, -3.2607], [11.1733, 1.1993]], languages: ['en'], currency: 'GHS', timezone: 'Africa/Accra' },
  SL: { code: 'SL', code3: 'SLE', name: 'Sierra Leone', nameEn: 'Sierra Leone', capital: 'Freetown', region: 'West Africa', center: [8.4606, -11.7799], zoom: 8, bounds: [[6.9285, -13.3079], [9.9992, -10.2640]], languages: ['en'], currency: 'SLL', timezone: 'Africa/Freetown' },
  LR: { code: 'LR', code3: 'LBR', name: 'Libéria', nameEn: 'Liberia', capital: 'Monrovia', region: 'West Africa', center: [6.4281, -9.4295], zoom: 7, bounds: [[4.3554, -11.4924], [8.5519, -7.3651]], languages: ['en'], currency: 'LRD', timezone: 'Africa/Monrovia' },
  GM: { code: 'GM', code3: 'GMB', name: 'Gambie', nameEn: 'Gambia', capital: 'Banjul', region: 'West Africa', center: [13.4432, -15.3101], zoom: 8, bounds: [[13.0648, -16.8251], [13.8264, -13.7979]], languages: ['en'], currency: 'GMD', timezone: 'Africa/Banjul' },
  GW: { code: 'GW', code3: 'GNB', name: 'Guinée-Bissau', nameEn: 'Guinea-Bissau', capital: 'Bissau', region: 'West Africa', center: [11.8037, -15.1804], zoom: 8, bounds: [[10.9242, -16.7177], [12.6807, -13.6365]], languages: ['pt'], currency: 'XOF', timezone: 'Africa/Bissau' },
  GN: { code: 'GN', code3: 'GIN', name: 'Guinée', nameEn: 'Guinea', capital: 'Conakry', region: 'West Africa', center: [9.9456, -9.6966], zoom: 7, bounds: [[7.1906, -15.0779], [12.6764, -7.6411]], languages: ['fr'], currency: 'GNF', timezone: 'Africa/Conakry' },
  CI: { code: 'CI', code3: 'CIV', name: "Côte d'Ivoire", nameEn: "Côte d'Ivoire", capital: 'Yamoussoukro', region: 'West Africa', center: [7.5400, -5.5471], zoom: 7, bounds: [[4.3577, -8.6020], [10.7400, -2.4940]], languages: ['fr'], currency: 'XOF', timezone: 'Africa/Abidjan' },
  BJ: { code: 'BJ', code3: 'BEN', name: 'Bénin', nameEn: 'Benin', capital: 'Porto-Novo', region: 'West Africa', center: [9.3077, 2.3158], zoom: 7, bounds: [[6.2359, 0.7766], [12.4183, 3.8517]], languages: ['fr'], currency: 'XOF', timezone: 'Africa/Porto-Novo' },
  TG: { code: 'TG', code3: 'TGO', name: 'Togo', nameEn: 'Togo', capital: 'Lomé', region: 'West Africa', center: [8.6195, 0.8248], zoom: 7, bounds: [[6.1004, -0.1440], [11.1391, 1.8083]], languages: ['fr'], currency: 'XOF', timezone: 'Africa/Lome' },
  NE: { code: 'NE', code3: 'NER', name: 'Niger', nameEn: 'Niger', capital: 'Niamey', region: 'West Africa', center: [17.6078, 8.0817], zoom: 5, bounds: [[11.6935, 0.1667], [23.5170, 15.9960]], languages: ['fr'], currency: 'XOF', timezone: 'Africa/Niamey' },
  ML: { code: 'ML', code3: 'MLI', name: 'Mali', nameEn: 'Mali', capital: 'Bamako', region: 'West Africa', center: [17.5707, -3.9962], zoom: 5, bounds: [[10.1596, -12.2402], [25.0000, 4.2455]], languages: ['fr'], currency: 'XOF', timezone: 'Africa/Bamako' },
  BF: { code: 'BF', code3: 'BFA', name: 'Burkina Faso', nameEn: 'Burkina Faso', capital: 'Ouagadougou', region: 'West Africa', center: [12.2383, -1.5616], zoom: 6, bounds: [[9.4011, -5.5188], [15.0850, 2.4054]], languages: ['fr'], currency: 'XOF', timezone: 'Africa/Ouagadougou' },
  UG: { code: 'UG', code3: 'UGA', name: 'Ouganda', nameEn: 'Uganda', capital: 'Kampala', region: 'East Africa', center: [1.2533, 32.7433], zoom: 7, bounds: [[-1.4823, 29.5794], [4.2340, 35.0361]], languages: ['en'], currency: 'UGX', timezone: 'Africa/Kampala' },
}

// List of available country codes for selection components
export const AVAILABLE_COUNTRIES = Object.keys(COUNTRY_CONFIG)

/**
 * Get country configuration by code
 * @param {string} code - ISO 3166-1 alpha-2 or alpha-3 code
 * @returns {Object|null} Country configuration or null if not found
 */
export const getCountryConfig = (code) => {
  if (!code) return null
  
  const upperCode = code.toUpperCase()
  
  // Try direct match (alpha-2)
  if (COUNTRY_CONFIG[upperCode]) {
    return COUNTRY_CONFIG[upperCode]
  }
  
  // Try alpha-3 match
  const country = Object.values(COUNTRY_CONFIG).find(c => c.code3 === upperCode)
  return country || null
}

/**
 * Get all countries in a specific region
 * @param {string} region - Region name (e.g., 'Central Africa')
 * @returns {Array} Array of country configurations
 */
export const getCountriesByRegion = (region) => {
  return Object.values(COUNTRY_CONFIG).filter(c => c.region === region)
}

/**
 * Get country name by code
 * @param {string} code - ISO country code
 * @param {string} language - Language code ('en' or 'fr')
 * @returns {string} Country name
 */
export const getCountryName = (code, language = 'fr') => {
  const config = getCountryConfig(code)
  if (!config) return code
  return language === 'en' ? config.nameEn : config.name
}

/**
 * Get country bounds as Leaflet LatLngBounds
 * @param {string} code - ISO country code
 * @returns {Array|null} Bounds array [[south, west], [north, east]]
 */
export const getCountryBounds = (code) => {
  const config = getCountryConfig(code)
  return config?.bounds || null
}

/**
 * Get country center coordinates
 * @param {string} code - ISO country code
 * @returns {Array|null} Center coordinates [lat, lng]
 */
export const getCountryCenter = (code) => {
  const config = getCountryConfig(code)
  return config?.center || null
}

/**
 * Convert country code to name for database queries
 * @param {string} code - ISO country code
 * @returns {string|null} Country name in French (for database)
 */
export const countryCodeToDbName = (code) => {
  const config = getCountryConfig(code)
  return config?.name || null
}

export default COUNTRY_CONFIG

/**
 * Zoom-aware Voronoi/admin display configuration.
 * Each level defines the inclusive zoom range at which it should be rendered.
 *
 * - village        : finest level — actual Voronoi polygons around villages
 * - arrondissement : admin level 3 (commune / sub-prefecture)
 * - departement    : admin level 2 (department / prefecture)
 * - region         : admin level 1 (region / province)
 */
export const VORONOI_ZOOM_CONFIG = {
  village:        { minZoom: 10, maxZoom: 22, label: 'Village' },
  arrondissement: { minZoom: 9,  maxZoom: 9,  label: 'Arrondissement' },
  departement:    { minZoom: 7,  maxZoom: 8,  label: 'Département' },
  region:         { minZoom: 0,  maxZoom: 6,  label: 'Région' },
}

/**
 * Returns the Voronoi/admin display level for a given map zoom.
 * Falls back to 'region' for any zoom that doesn't match (defensive).
 * @param {number} zoom - current Leaflet map zoom
 * @returns {'village'|'arrondissement'|'departement'|'region'}
 */
export function getVoronoiLevelForZoom(zoom) {
  const z = Number(zoom)
  if (!Number.isFinite(z)) return 'region'
  for (const level of Object.keys(VORONOI_ZOOM_CONFIG)) {
    const { minZoom, maxZoom } = VORONOI_ZOOM_CONFIG[level]
    if (z >= minZoom && z <= maxZoom) return level
  }
  return 'region'
}

/**
 * Returns true when the given level should be visible at the given zoom.
 * @param {'village'|'arrondissement'|'departement'|'region'} level
 * @param {number} zoom
 * @returns {boolean}
 */
export function shouldShowVoronoiAtLevel(level, zoom) {
  const cfg = VORONOI_ZOOM_CONFIG[level]
  if (!cfg) return false
  const z = Number(zoom)
  if (!Number.isFinite(z)) return false
  return z >= cfg.minZoom && z <= cfg.maxZoom
}