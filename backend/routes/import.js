/**
 * Import Routes - CSV Import for People Groups
 * Enhanced with robust error handling, encoding support, and data sanitization
 */
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const PeopleGroup = require('../models/PeopleGroup');
const Village = require('../models/Village');
const MasterPeople = require('../models/MasterPeople');
const { auth } = require('../middleware/auth');
const { isMissionary } = require('../middleware/roles');
const { COUNTRY_CONFIG } = require('./countries');

const router = express.Router();

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Configure multer for file upload with enhanced validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    // Accept CSV files with various MIME types
    const allowedMimes = [
      'text/csv',
      'text/plain',
      'application/csv',
      'application/vnd.ms-excel',
      'text/x-csv',
      'application/x-csv',
    ];
    const isCSV = allowedMimes.includes(file.mimetype) || 
                  file.originalname.toLowerCase().endsWith('.csv');
    
    if (isCSV) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed. Please upload a .csv file.'), false);
    }
  },
});

/**
 * Remove BOM (Byte Order Mark) from string
 * Handles UTF-8 BOM, UTF-16 LE/BE BOMs
 */
const removeBOM = (str) => {
  if (!str) return str;
  // UTF-8 BOM
  if (str.charCodeAt(0) === 0xFEFF) {
    return str.slice(1);
  }
  // UTF-8 BOM as bytes
  if (str.startsWith('\ufeff')) {
    return str.slice(1);
  }
  // Handle EF BB BF (UTF-8 BOM bytes)
  if (str.charCodeAt(0) === 0xEF && str.charCodeAt(1) === 0xBB && str.charCodeAt(2) === 0xBF) {
    return str.slice(3);
  }
  return str;
};

/**
 * Sanitize and clean string values
 */
const sanitizeString = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .trim()
    .replace(/^["']+|["']+$/g, '') // Remove surrounding quotes
    .replace(/\s+/g, ' '); // Normalize whitespace
};

/**
 * Parse numeric value safely
 */
const parseNumber = (value, defaultValue = 0) => {
  if (value === null || value === undefined || value === '') return defaultValue;
  let str = String(value).trim();
  // Remove spaces and non-breaking spaces used as thousands separators (e.g. "1 234,5")
  str = str.replace(/[\s\u00A0]/g, '');
  // French decimals: if there's a comma and no dot, treat comma as decimal separator.
  if (str.indexOf(',') !== -1 && str.indexOf('.') === -1) {
    str = str.replace(',', '.');
  } else if (str.indexOf(',') !== -1 && str.indexOf('.') !== -1) {
    // Both present: assume comma is a thousands separator (e.g. "1,234.5")
    str = str.replace(/,/g, '');
  }
  const cleaned = str.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Parse integer value safely
 */
const parseInt = (value, defaultValue = 0) => {
  const num = parseNumber(value, defaultValue);
  return Math.floor(num);
};

/**
 * Canonical header -> internal field map.
 * Keys are the header label lowercased with all non-alphanumeric chars removed.
 * Handles the new 20-column DMM template (incl. the source misspelling
 * "NG_Engagment_Name") as well as the legacy coordinate-based template.
 */
const HEADER_MAP = {
  // identity
  name: 'name',
  peoplegroupname: 'name',
  peoplename: 'name',
  groupname: 'name',
  ngengagmentname: 'name',   // NG_Engagment_Name (source misspelling)
  ngengagementname: 'name',
  peoplegroup: 'peopleGroup',
  villagename: 'villageName',
  // churches
  numberofchurches: 'numberOfChurches',
  total: 'numberOfChurches',
  churches: 'numberOfChurches',
  churchgeneration: 'churchGeneration',
  maxgen: 'churchGeneration',
  generation: 'churchGeneration',
  avgchurchsize: 'avgChurchSize',
  // discovery / metrics
  dbs: 'dbs',
  com: 'com',
  cat: 'cat',
  newdisciples: 'newDisciples',
  newbaptisms: 'newBaptisms',
  newbaptized: 'newBaptisms',
  leadersintraining: 'leadersInTraining',
  activetrainerscoaches: 'activeCoaches',
  activecoaches: 'activeCoaches',
  oftrainingsheldinquarter: 'trainingsHeld',
  trainingsheld: 'trainingsHeld',
  lostchs: 'lostChurches',
  mergedchs: 'mergedChurches',
  notes: 'notes',
  // status / period / geo
  reportperiod: 'reportPeriod',
  reportingperiod: 'reportPeriod',
  engagementstatus: 'engagementStatus',
  engagementlevel: 'engagementLevel',
  region: 'region',
  country: 'country',
  population: 'population',
  language: 'language',
  religion: 'religion',
  description: 'description',
  // Cameroon / reporting aliases used by the import templates and reporting views
  peoplegroupname: 'name',
  peoplesgroup: 'peopleGroup',
  peoplesgroupname: 'name',
  ngengangementname: 'name',
  ngengagementname: 'name',
  ngengagmentname: 'name',
  peoplegroupstatus: 'engagementStatus',
  status: 'status',
  reportingperiod: 'reportPeriod',
  source: 'source',
  village: 'villageName',
  // country code + administrative levels (department / arrondissement)
  countrycode: 'countryCode',
  isocountrycode: 'countryCode',
  admin2: 'admin2',
  admin3: 'admin3',
  departement: 'admin2',
  department: 'admin2',
  province: 'admin2',
  arrondissement: 'admin3',
  district: 'admin3',
  subdivision: 'admin3',
  commune: 'admin3',
  // coordinates
  lat: 'latitude',
  latitude: 'latitude',
  lng: 'longitude',
  lon: 'longitude',
  longitude: 'longitude',
};

/**
 * Normalize a raw CSV header to an internal field name using HEADER_MAP.
 * Falls back to the alphanumeric-only key when no mapping exists.
 */
const normalizeHeaderKey = (rawKey) => {
  const k = removeBOM(String(rawKey || '')).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return HEADER_MAP[k] || k;
};

/**
 * Detect file encoding and convert to UTF-8
 */
const normalizeEncoding = (buffer) => {
  let content = buffer.toString('utf8');
  
  // Remove BOM if present
  content = removeBOM(content);
  
  // Try to detect and handle common encoding issues
  // Replace common problematic characters
  content = content
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n');
  
  return content;
};

/**
 * Calculate engagement status based on number of churches
 */
const calculateEngagementStatus = (numberOfChurches) => {
  const churches = parseInt(numberOfChurches, 0);
  if (churches === 0) return 'unreached';
  if (churches <= 33) return 'pioneer';
  if (churches <= 66) return 'midway';
  if (churches <= 99) return 'tipping-point';
  return 'dmm';
};

// ── Historique trimestriel (accumulation) ───────────────────────────────────
// Convertit un libellé de période « <q>Q<yy> » (ex. « 2Q26 ») en un entier
// ordonnable (année*4 + trimestre) pour comparer la récence des trimestres.
const quarterOrder = (period) => {
  const m = /^\s*([1-4])\s*Q\s*(\d{2,4})\s*$/i.exec(String(period || ''));
  if (!m) return -1;
  const q = parseInt(m[1], 10);
  let yy = parseInt(m[2], 10);
  if (yy < 100) yy = 2000 + yy;
  return yy * 4 + q;
};

// Métriques trimestrielles portées par une entrée d'historique.
const QUARTERLY_METRIC_KEYS = [
  'numberOfChurches', 'churchGeneration', 'dbs', 'com', 'cat',
  'newDisciples', 'newBaptisms', 'leadersInTraining', 'activeCoaches', 'trainingsHeld',
];

/**
 * Insère/actualise l'entrée d'historique trimestriel d'un engagement puis
 * recopie, dans les champs de premier niveau, les valeurs du trimestre LE PLUS
 * RÉCENT (afin que le stade DMM progresse). Garantit l'absence de doublon de
 * trimestre : réimporter le même « reportPeriod » met à jour l'entrée existante.
 *
 * @param {object} doc      - document PeopleGroup (mongoose) ou newDoc (objet brut)
 * @param {string} period   - libellé de période, ex. « 2Q26 »
 * @param {object} metrics  - { numberOfChurches, churchGeneration, dbs, com, cat, newDisciples, newBaptisms, leadersInTraining, activeCoaches, trainingsHeld }
 * @returns {object} les métriques du trimestre le plus récent (pour miroir top-level)
 */
const upsertQuarterlyReport = (doc, period, metrics) => {
  const entry = { reportPeriod: period || '', importedAt: new Date() };
  for (const k of QUARTERLY_METRIC_KEYS) entry[k] = Number(metrics[k]) || 0;

  if (!Array.isArray(doc.quarterlyReports)) doc.quarterlyReports = [];

  if (period) {
    const norm = String(period).trim().toLowerCase();
    const idx = doc.quarterlyReports.findIndex(
      (q) => String(q.reportPeriod || '').trim().toLowerCase() === norm
    );
    if (idx >= 0) {
      // Même trimestre réimporté → correction en place (pas de doublon).
      doc.quarterlyReports[idx] = { ...(doc.quarterlyReports[idx].toObject ? doc.quarterlyReports[idx].toObject() : doc.quarterlyReports[idx]), ...entry };
    } else {
      doc.quarterlyReports.push(entry);
    }
  } else {
    // Pas de période fournie : on garde une seule entrée « sans période ».
    const idx = doc.quarterlyReports.findIndex((q) => !q.reportPeriod);
    if (idx >= 0) doc.quarterlyReports[idx] = entry;
    else doc.quarterlyReports.push(entry);
  }

  // Détermine le trimestre le plus récent (ordre max). À défaut d'ordre, on
  // prend la dernière entrée insérée.
  let latest = null;
  let bestOrder = -Infinity;
  doc.quarterlyReports.forEach((q, i) => {
    const o = quarterOrder(q.reportPeriod);
    const rank = o >= 0 ? o : -1 + i / 1000; // garde l'ordre d'insertion si non parsable
    if (rank >= bestOrder) { bestOrder = rank; latest = q; }
  });
  return latest || entry;
};

/**
 * Determine whether an imported people group should be linked into the DMM
 * reporting/query chain.
 *
 * We keep the existing import behavior intact, but for Cameroon DMM rows we
 * need the backend to persist the linkage fields used by reporting and detail
 * pages:
 * - source: must be DMM (or Survey for legacy trusted imports)
 * - approved: must be true so report queries do not filter it out
 * - masterPeopleId: optional but required when the row is part of the NG chain
 * - isNGEngaged: compatibility flag for downstream consumers that still inspect
 *   the legacy boolean
 */
const isReportingVisibleDmmSource = (source) => ['DMM', 'Survey', 'manual'].includes(source);

/**
 * Build a lookup table that maps every known country identifier (alpha-2,
 * alpha-3, French name, English name) to its canonical ISO 3166-1 alpha-2 code.
 * Built once from COUNTRY_CONFIG (the same source of truth used by the
 * reporting / countries / regions endpoints) so imported PeopleGroups end up
 * with a countryCode the funnel can actually filter on.
 */
const COUNTRY_LOOKUP = (() => {
  const map = {};
  const norm = (s) => sanitizeString(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  Object.values(COUNTRY_CONFIG || {}).forEach((cfg) => {
    if (!cfg || !cfg.code) return;
    const code2 = cfg.code.toUpperCase();
    [cfg.code, cfg.code3, cfg.name, cfg.nameEn].forEach((alias) => {
      const key = norm(alias);
      if (key) map[key] = code2;
    });
  });
  return map;
})();

/**
 * Resolve a raw CSV country value (e.g. "Cameroon", "Cameroun", "CMR", "CM")
 * to its ISO 3166-1 alpha-2 code (e.g. "CM"). Returns '' when it can't be
 * resolved so we never persist an invalid > 2-char value that would break the
 * schema (countryCode maxlength: 2) and the reporting/country/region filters.
 */
const normalizeCountryCode = (country) => {
  const raw = sanitizeString(country);
  if (!raw) return '';
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (COUNTRY_LOOKUP[key]) return COUNTRY_LOOKUP[key];
  // If it is already a valid 2-letter code we know about, keep it.
  const upper = raw.toUpperCase();
  if (upper.length === 2 && COUNTRY_CONFIG[upper]) return upper;
  return '';
};

/**
 * Resolve a single canonical (English) country name for storage so the same
 * engagement is not split across FR/EN spellings (e.g. "Cameroun" vs
 * "Cameroon") in the `country` string field. Prefers the name from
 * COUNTRY_CONFIG (keyed by alpha-3) via a small alpha-2 -> alpha-3 bridge, and
 * falls back to the raw value when the country is unknown.
 */
const canonicalCountryName = (countryCode, rawCountry) => {
  const fallback = sanitizeString(rawCountry);
  const code2 = sanitizeString(countryCode).toUpperCase();
  if (!code2) return fallback;
  // Find the COUNTRY_CONFIG entry (keyed by alpha-3) whose derived alpha-2
  // matches, and use its canonical English `name`.
  for (const [alpha3, cfg] of Object.entries(COUNTRY_CONFIG)) {
    const derived2 = normalizeCountryCode(alpha3) || normalizeCountryCode(cfg && cfg.name);
    if (derived2 === code2 && cfg && cfg.name) return cfg.name;
  }
  return fallback;
};

const inferMasterPeopleLink = ({ source, name, country, villageName, peopleGroup }) => {
  if (!isReportingVisibleDmmSource(source)) return null;

  const rawName = sanitizeString(peopleGroup || name);
  const rawCountry = normalizeCountryCode(country);
  const rawVillage = sanitizeString(villageName);

  return {
    // Preserve the existing import behavior while exposing the minimal fields
    // required by reporting/detail queries to treat Cameroon DMM rows as part
    // of the DMM chain.
    approved: true,
    masterPeopleId: null,
    isNGEngaged: source === 'DMM' || source === 'Survey',
    countryCode: rawCountry || undefined,
    peopleGroup: rawName || undefined,
    villageName: rawVillage || undefined,
  };
};

const applyReportingVisibilityPatch = (doc) => {
  if (!doc) return;

  const isVisibleSource = isReportingVisibleDmmSource(doc.source);
  if (!isVisibleSource) return;

  doc.approved = true;
  if (doc.masterPeopleId === undefined) doc.masterPeopleId = null;
  if (doc.isNGEngaged === undefined) doc.isNGEngaged = doc.source === 'DMM' || doc.source === 'Survey';
  if (!doc.peopleGroup && doc.name) doc.peopleGroup = doc.name;
};

/**
 * Validate coordinates
 */
const validateCoordinates = (lat, lng) => {
  const errors = [];
  
  if (isNaN(lat)) {
    errors.push('Latitude must be a valid number');
  } else if (lat < -90 || lat > 90) {
    errors.push('Latitude must be between -90 and 90');
  }
  
  if (isNaN(lng)) {
    errors.push('Longitude must be a valid number');
  } else if (lng < -180 || lng > 180) {
    errors.push('Longitude must be between -180 and 180');
  }
  
  return errors;
};

const buildGeoPoint = (latitude, longitude) => {
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { type: 'Point', coordinates: [longitude, latitude] };
  }
  return undefined;
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeMatchToken = (value) => sanitizeString(value).toLowerCase().replace(/\s+/g, ' ');

const buildMasterPeopleMatchCandidates = ({ source, name, country, villageName, peopleGroup }) => {
  if (!isReportingVisibleDmmSource(source)) return [];

  const normalizedName = normalizeMatchToken(peopleGroup || name);
  const normalizedCountry = sanitizeString(country).toUpperCase();
  const normalizedVillage = normalizeMatchToken(villageName);
  const nameRegex = new RegExp(`^${escapeRegExp(normalizedName)}$`, 'i');
  const candidates = [];

  if (!normalizedName) return candidates;

  if (normalizedCountry && normalizedVillage) {
    candidates.push({
      type: 'country+name+village',
      query: {
        canonicalName: nameRegex,
        primaryCountryCode: normalizedCountry.length === 2 ? normalizedCountry : undefined,
      },
    });
  }

  if (normalizedCountry) {
    candidates.push({
      type: 'country+name',
      query: {
        canonicalName: nameRegex,
        primaryCountryCode: normalizedCountry.length === 2 ? normalizedCountry : undefined,
      },
    });
  }

  candidates.push({
    type: 'name-only',
    query: {
      $or: [{ canonicalName: nameRegex }, { name: nameRegex }],
    },
  });

  return candidates;
};

const findMatchingMasterPeople = async ({ source, name, country, villageName, peopleGroup }) => {
  const candidates = buildMasterPeopleMatchCandidates({ source, name, country, villageName, peopleGroup });

  for (const candidate of candidates) {
    const query = { ...candidate.query };
    if (query.primaryCountryCode === undefined) delete query.primaryCountryCode;
    const matches = await MasterPeople.find(query)
      .select('_id canonicalName primaryCountryCode name')
      .lean();

    if (matches.length === 1) {
      return { master: matches[0], strategy: candidate.type };
    }
  }

  return { master: null, strategy: null };
};

/**
 * GET /import/people-groups/template - Download CSV template
 * NOTE: No authentication required - templates are public resources
 */
router.get('/people-groups/template', (req, res) => {
  const headers = [
    'name',
    'latitude',
    'longitude',
    'villageName',
    'population',
    'numberOfChurches',
    'churchGeneration',
    'engagementStatus',
    'region',
    'country',
    'countryCode',
    'admin2',
    'admin3',
    'language',
    'religion',
    'description'
  ];

  const exampleRows = [
    [
      'Massa',
      '10.3417',
      '15.2372',
      'Yagoua',
      '15000',
      '120',
      '8',
      'dmm',
      'Extrême-Nord',
      'Cameroon',
      'CM',
      'Mayo-Danay',
      'Yagoua',
      'Massa',
      'Christianity',
      'Established DMM with strong multiplication'
    ],
    [
      'Fulani',
      '9.3011',
      '13.3964',
      'Garoua',
      '25000',
      '0',
      '0',
      'unreached',
      'Nord',
      'Cameroon',
      'CM',
      'Bénoué',
      'Garoua',
      'Fulfulde',
      'Islam',
      'Nomadic group - no engagement yet'
    ]
  ];

  const csvContent = headers.join(',') + '\n' + exampleRows.map(row => row.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="people-groups-template.csv"');
  res.send('\ufeff' + csvContent); // BOM for Excel UTF-8 compatibility
});

/**
 * Multer error handler middleware
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: `File size exceeds the limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB. Please upload a smaller file.`,
        code: 'FILE_TOO_LARGE'
      });
    }
    return res.status(400).json({
      error: 'Upload error',
      message: err.message,
      code: err.code
    });
  }
  if (err) {
    return res.status(400).json({
      error: 'Upload error',
      message: err.message
    });
  }
  next();
};

/**
 * POST /import/people-groups - Import people groups from CSV
 * Enhanced with robust error handling and data sanitization
 */
router.post('/people-groups', auth, isMissionary, upload.single('file'), handleMulterError, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded',
      message: 'Please select a CSV file to upload.',
      code: 'NO_FILE'
    });
  }

  const results = [];
  const errors = [];
  let rowNumber = 0;

  try {
    // Normalize encoding and remove BOM
    const fileContent = normalizeEncoding(req.file.buffer);
    
    // Check if file is empty
    if (!fileContent.trim()) {
      return res.status(400).json({
        error: 'Empty file',
        message: 'The uploaded file is empty. Please upload a CSV file with data.',
        code: 'EMPTY_FILE'
      });
    }
    
    // Detect delimiter (comma or semicolon)
    const firstLine = fileContent.split('\n')[0] || '';
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';
    
    console.log(`📊 CSV Import: Detected delimiter "${delimiter === ';' ? 'semicolon' : 'comma'}", file size: ${req.file.size} bytes`);
    
    // Skip comment lines (lines starting with #)
    const lines = fileContent.split('\n').filter(line => !line.trim().startsWith('#'));
    const cleanedContent = lines.join('\n');
    
    const stream = Readable.from(cleanedContent);
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({ 
          separator: delimiter,
          skipLines: 0,
          strict: false, // Don't fail on inconsistent column counts
          relaxColumnCount: true
        }))
        .on('data', (row) => {
          rowNumber++;
          // Normalize column names via the shared HEADER_MAP and keep a
          // field -> original-header map so errors can name the exact column.
          const normalizedRow = {};
          const headerByField = {};
          Object.keys(row).forEach(key => {
            const normalizedKey = normalizeHeaderKey(key);
            normalizedRow[normalizedKey] = sanitizeString(row[key]);
            if (!headerByField[normalizedKey]) headerByField[normalizedKey] = removeBOM(key).trim();
          });
          results.push({ rowNumber, data: { ...row, ...normalizedRow }, headerByField });
        })
        .on('end', resolve)
        .on('error', (err) => {
          console.error('CSV parsing error:', err);
          reject(new Error(`CSV parsing failed: ${err.message}`));
        });
    });

    if (results.length === 0) {
      return res.status(400).json({
        error: 'No data found',
        message: 'The CSV file contains no data rows. Make sure your file has a header row and at least one data row.',
        code: 'NO_DATA'
      });
    }

    const imported = [];
    const skipped = [];

    for (const { rowNumber, data, headerByField } of results) {
      try {
        // Skip empty rows
        const hasData = Object.values(data).some(v => v && v.trim());
        if (!hasData) {
          continue; // Skip silently
        }
        
        // Spreadsheet line the user sees (header = line 1, first data row = 2)
        const line = rowNumber + 1;
        const colOf = (field, fallback) => (headerByField && headerByField[field]) || fallback;

        // Validate required fields
        const name = sanitizeString(data.name);
        if (!name) {
          errors.push({
            row: line,
            line,
            column: colOf('name', 'NG_Engagment_Name'),
            field: 'name',
            value: '',
            error: 'Le nom (NG_Engagment_Name) est obligatoire',
            suggestion: 'Renseignez la colonne NG_Engagment_Name pour cette ligne'
          });
          skipped.push({ row: line, reason: 'Le nom (NG_Engagment_Name) est obligatoire', field: 'name' });
          continue;
        }

        // Coordinates are OPTIONAL. Only validate when at least one is provided.
        const hasLat = data.latitude !== undefined && String(data.latitude).trim() !== '';
        const hasLng = data.longitude !== undefined && String(data.longitude).trim() !== '';
        const latitude = parseNumber(data.latitude, NaN);
        const longitude = parseNumber(data.longitude, NaN);
        let hasValidCoords = false;

        if (hasLat || hasLng) {
          const coordErrors = validateCoordinates(latitude, longitude);
          if (coordErrors.length > 0) {
            errors.push({
              row: line,
              line,
              column: colOf('latitude', 'latitude') + '/' + colOf('longitude', 'longitude'),
              field: 'coordinates',
              value: `lat: ${data.latitude}, lng: ${data.longitude}`,
              error: 'Coordonnées invalides : ' + coordErrors.join('; '),
              suggestion: 'Les coordonnées doivent être des nombres décimaux (ex. latitude 5.9631, longitude 10.1591), ou laissez ces colonnes vides'
            });
            skipped.push({ row: line, reason: 'Coordonnées invalides', field: 'coordinates' });
            continue;
          }
          hasValidCoords = true;
        }

        // Validate numeric metric fields BEFORE parsing — reject non-numeric text
        // (e.g. "xyz") with a per-cell error instead of silently coercing to 0.
        const numericFields = [
          ['numberOfChurches', 'TOTAL'],
          ['churchGeneration', 'Max GEN'],
          ['dbs', 'DBS'],
          ['com', 'COM'],
          ['cat', 'CAT'],
          ['avgChurchSize', 'Avg church size'],
          ['newDisciples', '# New Disciples'],
          ['newBaptisms', '# New Baptisms'],
          ['leadersInTraining', 'LEADERS IN TRAINING'],
          ['activeCoaches', 'ACTIVE TRAINERS/COACHES'],
          ['trainingsHeld', '# OF TRAININGS HELD IN QUARTER'],
          ['lostChurches', 'LOST CHS'],
          ['mergedChurches', 'MERGED CHS'],
        ];
        let numericError = null;
        for (const [field, fallbackHeader] of numericFields) {
          const raw = data[field];
          if (raw === undefined || String(raw).trim() === '') continue; // blank allowed
          if (Number.isNaN(parseNumber(raw, NaN))) {
            const label = colOf(field, fallbackHeader);
            errors.push({
              row: line,
              line,
              column: label,
              field,
              value: raw,
              error: `Valeur numérique invalide pour ${label}`,
              suggestion: 'Saisissez un nombre (les décimales avec , ou . sont acceptées), ou laissez la case vide'
            });
            skipped.push({ row: line, reason: `Valeur numérique invalide pour ${label}`, field });
            numericError = true;
            break;
          }
        }
        if (numericError) continue;

        // Parse numeric fields with defaults
        const numberOfChurches = parseNumber(data.numberOfChurches, 0);
        const churchGeneration = parseNumber(data.churchGeneration, 0);
        const population = parseNumber(data.population, 0);
        const dbs = parseNumber(data.dbs, 0) || 0;
        const com = parseNumber(data.com, 0) || 0;
        const cat = parseNumber(data.cat, 0) || 0;
        const reportPeriod = sanitizeString(data.reportPeriod);
        // New quarterly metric columns (blank => 0). avgChurchSize may be decimal.
        const avgChurchSize = parseNumber(data.avgChurchSize, 0) || 0;
        const newDisciples = parseInt(data.newDisciples, 0) || 0;
        const newBaptisms = parseInt(data.newBaptisms, 0) || 0;
        const leadersInTraining = parseInt(data.leadersInTraining, 0) || 0;
        const activeCoaches = parseInt(data.activeCoaches, 0) || 0;
        const trainingsHeld = parseInt(data.trainingsHeld, 0) || 0;
        const lostChurches = parseInt(data.lostChurches, 0) || 0;
        const mergedChurches = parseInt(data.mergedChurches, 0) || 0;
        const peopleGroupLabel = sanitizeString(data.peopleGroup);
        const notes = sanitizeString(data.notes);

        // Determine engagement status - auto-calculate if not provided or invalid
        const validEngagementStatuses = ['pioneer', 'midway', 'tipping-point', 'dmm', 'unreached'];
        let engagementStatus = sanitizeString(data.engagementStatus).toLowerCase();
        
        if (!engagementStatus || !validEngagementStatuses.includes(engagementStatus)) {
          // Auto-calculate based on number of churches
          engagementStatus = calculateEngagementStatus(numberOfChurches);
          console.log(`📊 Row ${rowNumber}: Auto-calculated engagement status as "${engagementStatus}" (${numberOfChurches} churches)`);
        }

        // Validate status field - default to engagement status
        const validStatuses = ['pioneer', 'mid-journey', 'tipping-point', 'movement', 'unreached', 'midway', 'dmm'];
        let status = sanitizeString(data.status).toLowerCase() || engagementStatus;
        if (!validStatuses.includes(status)) {
          status = engagementStatus;
        }

        // Look up village if villageId or villageName provided
        let villageRef = null;
        const villageName = sanitizeString(data.villageName);
        const villageId = sanitizeString(data.villageId);
        
        if (villageId) {
          try {
            const village = await Village.findById(villageId);
            if (village) {
              villageRef = village._id;
            }
          } catch (e) {
            // Invalid ObjectId format - ignore
          }
        } else if (villageName) {
          const village = await Village.findOne({ 
            name: { $regex: new RegExp(`^${villageName}$`, 'i') } 
          });
          if (village) {
            villageRef = village._id;
          }
        }

        // Determine source based on user and CSV data
        // If user is chrishaiwe@gmail.com, default to 'DMM' unless CSV explicitly sets 'Survey'
        const csvSource = sanitizeString(data.source);
        let source = 'Survey'; // Default for most users
        if (req.user.email === 'chrishaiwe@gmail.com') {
          source = csvSource === 'Survey' ? 'Survey' : 'DMM';
        } else if (csvSource && ['DMM', 'Survey', 'Joshua Project'].includes(csvSource)) {
          source = csvSource;
        }

        const country = sanitizeString(data.country);
        // Resolve the ISO 3166-1 alpha-2 code the reporting/country/region
        // funnel filters on. Prefer an explicit countryCode column, else derive
        // it from the country name/alpha-3 value.
        const countryCode = normalizeCountryCode(data.countryCode) || normalizeCountryCode(country);
        // Canonical (English) country name so the stored `country` string stays
        // consistent across quarters (e.g. "Cameroun"/"Cameroon" -> "Cameroon").
        // Prevents the FR/EN spelling split that previously defeated dedupe.
        const canonicalCountry = canonicalCountryName(countryCode, country);
        const admin2 = sanitizeString(data.admin2);
        const admin3 = sanitizeString(data.admin3);
        const description = sanitizeString(data.description);
        const region = sanitizeString(data.region);
        const language = sanitizeString(data.language);
        const religion = sanitizeString(data.religion);
        const engagementLevel = sanitizeString(data.engagementLevel);
        const normalizedPeopleGroup = sanitizeString(data.peopleGroup || data.name);

        // QUARTERLY UPSERT: for DMM data, update an existing people group instead of
        // creating a duplicate. Match key is (name + villageName + country), case-insensitive,
        // restricted to DMM/Survey field data. This lets a people group evolve quarter over
        // quarter AND supports the same people existing in several villages (e.g. "Bana" in
        // Mahaou vs Gamboura), aligned with the geographic reference import.
        const escapeRe = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // NAME-FIRST, COUNTRY-TOLERANT match. The free-text `country` field is NOT
        // reliable for dedupe: the same engagement was stored as "Cameroun" in one
        // quarter and "Cameroon" in the next, so a strict country string regex
        // created 80 duplicates. Match on the normalized ISO alpha-2 `countryCode`
        // instead (both "Cameroun" and "Cameroon" -> "CM"). Fall back to a
        // normalized country-name compare (covers legacy docs saved before
        // countryCode existed / null countryCode).
        const upsertQuery = {
          name: { $regex: new RegExp(`^${escapeRe(name)}$`, 'i') },
          source: { $in: ['DMM', 'Survey', 'manual'] },
        };
        if (countryCode) {
          // Same country by code, tolerating legacy docs that have no code yet
          // (they get repaired below on write).
          upsertQuery.$or = [
            { countryCode },
            { countryCode: { $in: [null, ''] } },
            ...(country ? [{ country: { $regex: new RegExp(`^${escapeRe(country)}$`, 'i') } }] : []),
          ];
        } else if (country) {
          upsertQuery.country = { $regex: new RegExp(`^${escapeRe(country)}$`, 'i') };
        }
        // Include villageName in the match key when provided so metrics attach to the
        // correct village-level people group.
        let existing = null;
        if (villageName) {
          // CSV specifies a village -> match on (name + village + country).
          existing = await PeopleGroup.findOne({
            ...upsertQuery,
            villageName: { $regex: new RegExp(`^${escapeRe(villageName)}$`, 'i') },
          });
          // Fallback: if no village-level match but exactly one same-name engagement
          // exists in this country, update it (avoids creating a duplicate on a village
          // spelling difference).
          if (!existing) {
            const sameName = await PeopleGroup.find(upsertQuery).select('_id').limit(2);
            if (sameName.length === 1) existing = await PeopleGroup.findById(sameName[0]._id);
          }
        } else {
          // CSV has NO village column (quarterly report case). The engagement name is
          // the stable key. If exactly one engagement with this name exists in the
          // country, update it in place and PRESERVE its existing village. Only when
          // the name is ambiguous (0 or >1 matches) do we fall back to create/empty-village.
          const sameName = await PeopleGroup.find(upsertQuery).select('_id').limit(2);
          if (sameName.length === 1) {
            existing = await PeopleGroup.findById(sameName[0]._id);
          } else {
            existing = await PeopleGroup.findOne({ ...upsertQuery, villageName: { $in: [null, ''] } });
          }
        }

        let peopleGroup;
        let action = 'created';
        let prevPeriodForReport;

        if (existing) {
          // ---- UPDATE existing people group with this quarter's snapshot ----
          action = 'updated';
          const prevPeriod = existing.reportPeriod || 'previous';
          prevPeriodForReport = prevPeriod;

          // ACCUMULATION TRIMESTRIELLE : au lieu d'écraser les chiffres du
          // trimestre précédent, on insère/actualise une entrée d'historique
          // pour CE trimestre (réimporter le même trimestre = correction en
          // place, pas de doublon), puis on recopie dans les champs top-level
          // les valeurs du trimestre LE PLUS RÉCENT pour que le stade DMM
          // progresse (églises/génération qui montent au fil des trimestres).
          const latestQ = upsertQuarterlyReport(existing, reportPeriod, {
            numberOfChurches, churchGeneration, dbs, com, cat,
            newDisciples, newBaptisms, leadersInTraining, activeCoaches, trainingsHeld,
          });
          existing.numberOfChurches = Number(latestQ.numberOfChurches) || 0;
          existing.churchGeneration = Number(latestQ.churchGeneration) || 0;
          existing.dbs = Number(latestQ.dbs) || 0;
          existing.com = Number(latestQ.com) || 0;
          existing.cat = Number(latestQ.cat) || 0;
          existing.newDisciples = Number(latestQ.newDisciples) || 0;
          existing.newBaptisms = Number(latestQ.newBaptisms) || 0;
          existing.leadersInTraining = Number(latestQ.leadersInTraining) || 0;
          existing.activeCoaches = Number(latestQ.activeCoaches) || 0;
          existing.trainingsHeld = Number(latestQ.trainingsHeld) || 0;
          existing.avgChurchSize = avgChurchSize;
          existing.lostChurches = lostChurches;
          existing.mergedChurches = mergedChurches;
          if (normalizedPeopleGroup) existing.peopleGroup = normalizedPeopleGroup;
          if (notes) existing.notes = notes;
          // reportPeriod top-level = trimestre le plus récent de l'historique.
          existing.reportPeriod = latestQ.reportPeriod || reportPeriod || existing.reportPeriod;
          // Statut recalculé d'après les églises du trimestre le plus récent
          // (il suit le tableau DMM après accumulation).
          existing.engagementStatus = calculateEngagementStatus(existing.numberOfChurches);
          existing.status = status;
          if (engagementLevel) existing.engagementLevel = engagementLevel;
          if (population) existing.population = population;
          if (description) existing.description = description;
          if (region) existing.region = region;
          if (canonicalCountry) existing.country = canonicalCountry;
          if (countryCode) existing.countryCode = countryCode;
          if (admin2) existing.admin2 = admin2;
          if (admin3) existing.admin3 = admin3;
          if (language) existing.language = language;
          if (religion) existing.religion = religion;
          if (villageName) existing.villageName = villageName;
          if (villageRef) existing.village = villageRef;
          // Only move the marker if the incoming coordinates are meaningful (not a country-centroid placeholder)
          const location = buildGeoPoint(latitude, longitude);
          if (location) {
            existing.location = location;
          } else {
            delete existing.location;
          }
          // Record a timeline point for this quarter (the pre-save hook also captures status changes).
          existing.progressNotes = reportPeriod
            ? `Import ${reportPeriod}: ${numberOfChurches} églises, gén ${churchGeneration}, DBS ${dbs}/COM ${com}/CAT ${cat}`
            : existing.progressNotes;
          existing.progressDate = new Date();
          existing.progressHistory.push({
            date: new Date(),
            percentage: existing.progressPercentage,
            status: status,
            notes: reportPeriod
              ? `Trimestre ${reportPeriod} (précédent: ${prevPeriod}) — ${numberOfChurches} églises, ${churchGeneration} gén, DBS ${dbs}, COM ${com}, CAT ${cat}`
              : `Mise à jour import — ${numberOfChurches} églises, ${churchGeneration} gén`,
            updatedBy: req.user._id,
          });
          existing.updatedBy = req.user._id;
          applyReportingVisibilityPatch(existing);
          peopleGroup = existing;
          await peopleGroup.save();
        } else {
          // ---- CREATE new people group ----
          const newDoc = {
            name: name,
            description: description,
            status: status,
            engagementStatus: engagementStatus,
            engagementLevel: engagementLevel,
            population: population,
            numberOfChurches: numberOfChurches,
            churchGeneration: churchGeneration,
            dbs: dbs,
            com: com,
            cat: cat,
            avgChurchSize: avgChurchSize,
            newDisciples: newDisciples,
            newBaptisms: newBaptisms,
            leadersInTraining: leadersInTraining,
            activeCoaches: activeCoaches,
            trainingsHeld: trainingsHeld,
            lostChurches: lostChurches,
            mergedChurches: mergedChurches,
            // Première entrée d'historique trimestriel (accumulation). Les
            // imports suivants ajouteront/mettront à jour les trimestres via
            // upsertQuarterlyReport sans écraser celui-ci.
            quarterlyReports: reportPeriod ? [{
              reportPeriod,
              numberOfChurches, churchGeneration, dbs, com, cat,
              newDisciples, newBaptisms, leadersInTraining, activeCoaches, trainingsHeld,
              importedAt: new Date(),
            }] : [],
            peopleGroup: normalizedPeopleGroup || undefined,
            notes: notes || undefined,
            reportPeriod: reportPeriod,
            villageName: villageName,
            village: villageRef,
            region: region,
            country: canonicalCountry || country,
            language: language,
            religion: religion,
            source: source,
            ...(source === 'DMM' || source === 'Survey'
              ? inferMasterPeopleLink({ source, name, country, villageName, peopleGroup: normalizedPeopleGroup })
              : {}),
            // Explicit geographic keys (set AFTER the spread so they always win):
            // countryCode drives the reporting/country/region funnel filters and
            // admin2/admin3 drive the department/arrondissement detail pages.
            countryCode: countryCode || undefined,
            admin2: admin2 || undefined,
            admin3: admin3 || undefined,
            createdBy: req.user._id,
            approved: ['admin', 'supervisor'].includes(req.user.role),
            approvedBy: ['admin', 'supervisor'].includes(req.user.role) ? req.user._id : undefined,
            approvedAt: ['admin', 'supervisor'].includes(req.user.role) ? new Date() : undefined,
          };
          applyReportingVisibilityPatch(newDoc);
          // Location is optional: only set it when valid coordinates were provided.
          const location = buildGeoPoint(latitude, longitude);
          if (location) {
            newDoc.location = location;
          }
          peopleGroup = new PeopleGroup(newDoc);
          await peopleGroup.save();
        }

        if (source === 'DMM' || source === 'Survey') {
          console.log(
            `[IMPORT] DMM visibility check row ${rowNumber}: ` +
            `source=${peopleGroup.source || 'n/a'}, ` +
            `approved=${peopleGroup.approved === true}, ` +
            `masterPeopleId=${peopleGroup.masterPeopleId ? 'set' : 'missing'}, ` +
            `isNGEngaged=${peopleGroup.isNGEngaged === true ? 'true' : 'false'}`
          );
        }

        // Ensure people-group imports that participate in the DMM chain are linked
        // back to their master people using deterministic matching.
        if ((source === 'DMM' || source === 'Survey') && !peopleGroup.masterPeopleId) {
          const { master: matchingMaster, strategy } = await findMatchingMasterPeople({
            source,
            name,
            country,
            villageName,
            peopleGroup: normalizedPeopleGroup,
          });

          if (matchingMaster) {
            peopleGroup.masterPeopleId = matchingMaster._id;
            peopleGroup.approved = true;
            peopleGroup.isNGEngaged = true;
            peopleGroup.peopleGroup = peopleGroup.peopleGroup || matchingMaster.canonicalName || name;
            await peopleGroup.save();
            console.log(
              `[IMPORT] Linked DMM row ${rowNumber} to master people ${matchingMaster._id} via ${strategy}`
            );
          } else {
            console.warn(
              `[IMPORT] Unresolved DMM row ${rowNumber}: name="${name}", country="${country}", village="${villageName || ''}"`
            );
            skipped.push({
              row: rowNumber,
              reason: `Unresolved DMM masterPeople link for "${name}"`,
              fields: ['name', 'country', 'villageName'],
            });
          }
        }

        imported.push({
          row: rowNumber,
          id: peopleGroup._id,
          name: peopleGroup.name,
          action,
          engagementStatus: peopleGroup.engagementStatus,
          reportPeriod: peopleGroup.reportPeriod,
          previousReportPeriod: action === 'updated' ? prevPeriodForReport : undefined,
        });

      } catch (err) {
        // Handle Mongoose validation errors with detailed field-level information
        if (err.name === 'ValidationError') {
          const fieldErrors = Object.keys(err.errors).map(field => {
            const fieldError = err.errors[field];
            return {
              row: rowNumber,
              field: field,
              message: fieldError.message,
              value: fieldError.value !== undefined ? fieldError.value : data[field],
              kind: fieldError.kind || 'validation'
            };
          });
          
          fieldErrors.forEach(fieldErr => {
            errors.push({
              row: fieldErr.row,
              field: fieldErr.field,
              error: fieldErr.message,
              value: fieldErr.value,
              errorType: 'validation',
              kind: fieldErr.kind,
              suggestion: `Check the ${fieldErr.field} field value`
            });
          });
          
          skipped.push({
            row: rowNumber,
            reason: `Validation failed: ${fieldErrors.map(e => `${e.field} - ${e.message}`).join('; ')}`,
            fields: fieldErrors.map(e => e.field)
          });
        } else if (err.name === 'CastError') {
          // Handle type casting errors
          errors.push({
            row: rowNumber,
            field: err.path,
            error: `Invalid value for ${err.path}`,
            value: err.value,
            errorType: 'cast',
            suggestion: `Expected ${err.kind} type for ${err.path}`
          });
          skipped.push({
            row: rowNumber,
            reason: `Invalid value for ${err.path}: expected ${err.kind}`,
            fields: [err.path]
          });
        } else if (err.code === 11000) {
          // Handle duplicate key errors
          const duplicateField = Object.keys(err.keyPattern || {})[0] || 'unknown';
          const duplicateValue = err.keyValue ? err.keyValue[duplicateField] : 'unknown';
          errors.push({
            row: rowNumber,
            field: duplicateField,
            error: `"${duplicateValue}" already exists`,
            value: duplicateValue,
            errorType: 'duplicate',
            suggestion: 'Use a unique value or update the existing record'
          });
          skipped.push({
            row: rowNumber,
            reason: `Duplicate: "${duplicateValue}" already exists`,
            fields: [duplicateField]
          });
        } else {
          // Handle other errors
          console.error(`Row ${rowNumber} error:`, err);
          errors.push({
            row: rowNumber,
            field: null,
            error: err.message,
            value: null,
            errorType: 'unknown'
          });
          skipped.push({ row: rowNumber, reason: err.message });
        }
      }
    }

    // Split imported into created vs updated for a clearer quarterly report
    const createdCount = imported.filter(i => i.action === 'created').length;
    const updatedCount = imported.filter(i => i.action === 'updated').length;

    // Build response message
    let message = `Import completed: ${imported.length} traités (${createdCount} créés, ${updatedCount} mis à jour)`;
    if (skipped.length > 0) {
      message += `, ${skipped.length} skipped`;
    }

    // Notify connected clients (map + dashboards) so they refresh live after a bulk import.
    try {
      const io = req.app.get('io');
      if (io && imported.length > 0) {
        io.to('map').emit('people-group-added', { bulk: true, count: imported.length });
        io.emit('people-groups-imported', {
          total: imported.length,
          created: createdCount,
          updated: updatedCount,
          at: new Date().toISOString(),
        });
      }
    } catch (emitErr) {
      console.error('[IMPORT] Socket emit failed:', emitErr.message);
    }

    // Minimal verification hook: confirm imported DMM people are queryable by reporting views.
    if (imported.length > 0) {
      const verifyIds = imported.slice(0, 5).map(item => item.id);
      const reportingVisible = await PeopleGroup.countDocuments({
        _id: { $in: verifyIds },
        $or: [
          { source: 'DMM' },
          { engagementStatus: 'dmm' },
          { status: 'dmm' },
        ],
      });
      console.log(
        `[IMPORT] Reporting visibility check: ${reportingVisible}/${verifyIds.length} recently imported record(s) match DMM reporting filters`
      );
    }

    // Consolidated, human-readable post-import report.
    const report = {
      totalRows: results.length,
      counts: {
        created: createdCount,
        updated: updatedCount,
        skipped: skipped.length,
        errors: errors.length,
      },
      created: imported
        .filter(i => i.action === 'created')
        .map(i => ({ row: i.row, name: i.name, reportPeriod: i.reportPeriod })),
      updated: imported
        .filter(i => i.action === 'updated')
        .map(i => ({
          row: i.row,
          name: i.name,
          previousReportPeriod: i.previousReportPeriod || null,
          newReportPeriod: i.reportPeriod || null,
        })),
      skipped: skipped.map(s => ({
        row: s.row,
        reason: s.reason,
        field: s.field || (Array.isArray(s.fields) ? s.fields.join(', ') : undefined),
      })),
    };

    res.json({
      success: imported.length > 0,
      message,
      summary: {
        total: results.length,
        imported: imported.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skipped.length,
        errors: errors.length
      },
      report,
      imported,
      skipped,
      errors
    });

  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({
      error: 'Import failed',
      message: error.message || 'An unexpected error occurred during import',
      code: 'IMPORT_ERROR',
      suggestion: 'Please check your CSV file format and try again'
    });
  }
});

/**
 * POST /import/people-groups/validate - Validate CSV without importing
 * Enhanced with better error messages and suggestions
 */
router.post('/people-groups/validate', auth, isMissionary, upload.single('file'), handleMulterError, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded',
      message: 'Please select a CSV file to validate.',
      code: 'NO_FILE'
    });
  }

  const results = [];
  let rowNumber = 0;

  try {
    // Normalize encoding and remove BOM
    const fileContent = normalizeEncoding(req.file.buffer);
    
    // Check if file is empty
    if (!fileContent.trim()) {
      return res.status(400).json({
        error: 'Empty file',
        message: 'The uploaded file is empty.',
        code: 'EMPTY_FILE'
      });
    }
    
    // Detect delimiter
    const firstLine = fileContent.split('\n')[0] || '';
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';
    
    // Skip comment lines
    const lines = fileContent.split('\n').filter(line => !line.trim().startsWith('#'));
    const cleanedContent = lines.join('\n');
    
    const stream = Readable.from(cleanedContent);
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({ 
          separator: delimiter,
          strict: false,
          relaxColumnCount: true
        }))
        .on('data', (row) => {
          rowNumber++;
          // Normalize column names via the shared HEADER_MAP + keep original headers.
          const normalizedRow = {};
          const headerByField = {};
          Object.keys(row).forEach(key => {
            const normalizedKey = normalizeHeaderKey(key);
            normalizedRow[normalizedKey] = sanitizeString(row[key]);
            if (!headerByField[normalizedKey]) headerByField[normalizedKey] = removeBOM(key).trim();
          });
          results.push({ rowNumber, data: { ...row, ...normalizedRow }, headerByField });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (results.length === 0) {
      return res.status(400).json({
        error: 'No data found',
        message: 'The CSV file contains no data rows.',
        code: 'NO_DATA'
      });
    }

    const validRows = [];
    const invalidRows = [];
    const warnings = [];

    for (const { rowNumber, data, headerByField } of results) {
      const rowErrors = [];
      const rowWarnings = [];

      // Map an internal field to its original CSV header label for the report.
      const colOf = (field, fallback) => (headerByField && headerByField[field]) || fallback;

      // Skip empty rows
      const hasData = Object.values(data).some(v => v && v.trim());
      if (!hasData) {
        continue;
      }

      // Validate name
      const name = sanitizeString(data.name);
      if (!name) {
        rowErrors.push({
          field: 'name',
          column: colOf('name', 'NG_Engagment_Name'),
          message: 'Le nom est requis',
          suggestion: 'Renseignez la colonne NG_Engagment_Name pour cette ligne'
        });
      }

      // Validate coordinates — OPTIONAL. Only flag when a value was provided but
      // is not a valid number. Rows without coordinates (DMM templates) are OK.
      const latRaw = data.latitude;
      const lngRaw = data.longitude;
      const hasLat = latRaw !== undefined && String(latRaw).trim() !== '';
      const hasLng = lngRaw !== undefined && String(lngRaw).trim() !== '';
      if (hasLat || hasLng) {
        const latitude = parseNumber(latRaw, NaN);
        const longitude = parseNumber(lngRaw, NaN);
        const coordErrors = validateCoordinates(latitude, longitude);
        if (coordErrors.length > 0) {
          rowErrors.push({
            field: 'coordinates',
            column: colOf('latitude', 'latitude') + '/' + colOf('longitude', 'longitude'),
            message: coordErrors.join('; '),
            value: `lat: ${latRaw}, lng: ${lngRaw}`,
            suggestion: 'Les coordonnées doivent être des nombres décimaux (ex. 5.9631, 10.1591), ou laissez ces colonnes vides'
          });
        }
      }

      // Validate numeric metric fields — flag non-numeric text (e.g. "xyz").
      const numericFields = [
        ['numberOfChurches', 'TOTAL'],
        ['churchGeneration', 'Max GEN'],
        ['dbs', 'DBS'],
        ['com', 'COM'],
        ['cat', 'CAT'],
        ['avgChurchSize', 'Avg church size'],
        ['newDisciples', '# New Disciples'],
        ['newBaptisms', '# New Baptisms'],
        ['leadersInTraining', 'LEADERS IN TRAINING'],
        ['activeCoaches', 'ACTIVE TRAINERS/COACHES'],
        ['trainingsHeld', '# OF TRAININGS HELD IN QUARTER'],
        ['lostChurches', 'LOST CHS'],
        ['mergedChurches', 'MERGED CHS'],
      ];
      for (const [field, fallbackHeader] of numericFields) {
        const raw = data[field];
        if (raw === undefined || String(raw).trim() === '') continue; // blank is allowed
        const parsed = parseNumber(raw, NaN);
        if (Number.isNaN(parsed)) {
          rowErrors.push({
            field,
            column: colOf(field, fallbackHeader),
            message: `Valeur numérique invalide pour ${colOf(field, fallbackHeader)}`,
            value: raw,
            suggestion: 'Saisissez un nombre (les décimales avec , ou . sont acceptées), ou laissez la case vide'
          });
        }
      }

      // Check engagement status - add warning if will be auto-calculated
      const validEngagementStatuses = ['pioneer', 'midway', 'tipping-point', 'dmm', 'unreached'];
      const engagementStatus = sanitizeString(data.engagementStatus).toLowerCase();
      const numberOfChurches = parseNumber(data.numberOfChurches, 0);
      
      if (!engagementStatus || !validEngagementStatuses.includes(engagementStatus)) {
        const calculatedStatus = calculateEngagementStatus(numberOfChurches);
        rowWarnings.push({
          field: 'engagementStatus',
          message: `Status will be auto-calculated as "${calculatedStatus}" based on ${numberOfChurches} churches`,
          type: 'info'
        });
      }

      if (rowErrors.length > 0) {
        invalidRows.push({ 
          row: rowNumber, 
          data, 
          errors: rowErrors.map(e => typeof e === 'string' ? e : e.message),
          details: rowErrors
        });
      } else {
        validRows.push({ 
          row: rowNumber, 
          data,
          warnings: rowWarnings
        });
      }
      
      if (rowWarnings.length > 0) {
        warnings.push({ row: rowNumber, warnings: rowWarnings });
      }
    }

    res.json({
      success: true,
      message: `Validation completed: ${validRows.length} valid, ${invalidRows.length} invalid`,
      summary: {
        total: results.length,
        valid: validRows.length,
        invalid: invalidRows.length,
        warnings: warnings.length
      },
      validRows,
      invalidRows,
      warnings
    });

  } catch (error) {
    console.error('Error validating CSV:', error);
    res.status(500).json({
      error: 'Validation failed',
      message: error.message || 'An error occurred during validation',
      code: 'VALIDATION_ERROR'
    });
  }
});

/**
 * Country-specific CSV templates configuration
 * Each country has specific administrative divisions and example data
 */
const COUNTRY_TEMPLATES = {
  cameroun: {
    name: 'Cameroun',
    code: 'CM',
    adminLevels: {
      admin1: 'Région',
      admin2: 'Département',
      admin3: 'Arrondissement'
    },
    examples: [
      {
        name: 'Massa',
        villageName: '',
        latitude: '10.3417',
        longitude: '15.2372',
        population: '15000',
        numberOfChurches: '120',
        churchGeneration: '8',
        region: 'Extrême-Nord',
        department: 'Mayo-Danay',
        arrondissement: 'Yagoua',
        description: 'Mouvement DMM établi'
      },
      {
        name: 'Fulani',
        villageName: '',
        latitude: '9.3011',
        longitude: '13.3964',
        population: '25000',
        numberOfChurches: '0',
        churchGeneration: '0',
        region: 'Nord',
        department: 'Bénoué',
        arrondissement: 'Garoua 1er',
        description: 'Non atteint - nomade'
      }
    ]
  },
  'congo-brazzaville': {
    name: 'Congo Brazzaville',
    code: 'CG',
    adminLevels: {
      admin1: 'Département',
      admin2: 'District',
      admin3: 'Commune'
    },
    examples: [
      {
        name: 'Téké',
        villageName: '',
        latitude: '-4.2634',
        longitude: '15.2429',
        population: '8000',
        numberOfChurches: '45',
        churchGeneration: '4',
        region: 'Brazzaville',
        department: 'Brazzaville',
        arrondissement: 'Makélékélé',
        description: 'Engagement actif'
      }
    ]
  },
  'congo-rdc': {
    name: 'Congo RDC',
    code: 'CD',
    adminLevels: {
      admin1: 'Province',
      admin2: 'Territoire',
      admin3: 'Secteur/Chefferie'
    },
    examples: [
      {
        name: 'Luba',
        villageName: '',
        latitude: '-5.0380',
        longitude: '18.7828',
        population: '50000',
        numberOfChurches: '200',
        churchGeneration: '10',
        region: 'Kasaï-Central',
        department: 'Demba',
        arrondissement: 'Demba',
        description: 'Mouvement DMM fort'
      }
    ]
  },
  'centrafrique': {
    name: 'République Centrafricaine',
    code: 'CF',
    adminLevels: {
      admin1: 'Préfecture',
      admin2: 'Sous-préfecture',
      admin3: 'Commune'
    },
    examples: [
      {
        name: 'Gbaya',
        villageName: '',
        latitude: '4.3612',
        longitude: '18.5550',
        population: '30000',
        numberOfChurches: '75',
        churchGeneration: '5',
        region: 'Bangui',
        department: 'Bangui',
        arrondissement: 'Bangui 1er',
        description: 'Engagement en cours'
      }
    ]
  },
  tchad: {
    name: 'Tchad',
    code: 'TD',
    adminLevels: {
      admin1: 'Région',
      admin2: 'Département',
      admin3: 'Sous-préfecture'
    },
    examples: [
      {
        name: 'Sara',
        villageName: '',
        latitude: '8.5500',
        longitude: '16.0333',
        population: '40000',
        numberOfChurches: '150',
        churchGeneration: '7',
        region: 'Logone Oriental',
        department: 'Pendé',
        arrondissement: 'Doba',
        description: 'Mouvement DMM établi'
      },
      {
        name: 'Arabe Tchadien',
        villageName: '',
        latitude: '12.1348',
        longitude: '15.0557',
        population: '100000',
        numberOfChurches: '5',
        churchGeneration: '1',
        region: 'N\'Djamena',
        department: 'N\'Djamena',
        arrondissement: 'N\'Djamena 1er',
        description: 'Pioneer - début d\'engagement'
      }
    ]
  },
  gabon: {
    name: 'Gabon',
    code: 'GA',
    adminLevels: {
      admin1: 'Province',
      admin2: 'Département',
      admin3: 'District'
    },
    examples: [
      {
        name: 'Fang',
        villageName: '',
        latitude: '0.3924',
        longitude: '9.4536',
        population: '20000',
        numberOfChurches: '60',
        churchGeneration: '4',
        region: 'Estuaire',
        department: 'Libreville',
        arrondissement: 'Libreville 1er',
        description: 'Engagement actif'
      }
    ]
  },
  'guinee-equatoriale': {
    name: 'Guinée Équatoriale',
    code: 'GQ',
    adminLevels: {
      admin1: 'Province',
      admin2: 'District',
      admin3: 'Municipalité'
    },
    examples: [
      {
        name: 'Fang',
        villageName: '',
        latitude: '3.7500',
        longitude: '8.7833',
        population: '15000',
        numberOfChurches: '35',
        churchGeneration: '3',
        region: 'Litoral',
        department: 'Bata',
        arrondissement: 'Bata',
        description: 'Engagement en cours'
      }
    ]
  }
};

/**
 * GET /import/people-groups/template/:country - Download country-specific CSV template
 * @param country - Country code (cameroun, congo-brazzaville, congo-rdc, centrafrique, tchad, gabon, guinee-equatoriale)
 * NOTE: No authentication required - templates are public resources
 */
router.get('/people-groups/template/:country', async (req, res) => {
  const countryKey = req.params.country.toLowerCase();
  const countryConfig = COUNTRY_TEMPLATES[countryKey];

  if (!countryConfig) {
    return res.status(400).json({
      error: 'Invalid country',
      message: `Country "${req.params.country}" not found. Available countries: ${Object.keys(COUNTRY_TEMPLATES).join(', ')}`,
      availableCountries: Object.keys(COUNTRY_TEMPLATES).map(key => ({
        key,
        name: COUNTRY_TEMPLATES[key].name,
        code: COUNTRY_TEMPLATES[key].code
      }))
    });
  }

  // Canonical 20-column CMR Import Template model (English headers, exact order).
  // Identity/structure columns are filled per country; quarterly metric columns
  // are left blank in the template.
  const headers = [
    'Date',
    'Report period',
    'Region',
    'Country',
    'NG_Engagment_Name',
    'People_Group',
    'DBS',
    'COM',
    'CAT',
    'TOTAL',
    'Max GEN',
    'Avg church size',
    '# New Disciples',
    '# New Baptisms',
    'LEADERS IN TRAINING',
    'ACTIVE TRAINERS/COACHES',
    '# OF TRAININGS HELD IN QUARTER',
    'LOST CHS',
    'MERGED CHS',
    'NOTES'
  ];

  // Quote a CSV cell for ';'-delimited output (Excel FR).
  const q = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  // Build one blank-metrics row from an identity tuple.
  const buildRow = ({ region, ngName, peopleGroup }) => [
    '',              // Date
    '2Q26',          // Report period
    region || '',    // Region
    countryConfig.name, // Country
    ngName || '',    // NG_Engagment_Name
    peopleGroup || ngName || '', // People_Group
    '', '', '', '', '', '', '', '', '', '', '', '', '', '' // 14 blank metric columns
  ];

  let rows = [];
  try {
    // Pre-fill with the country's EXISTING DMM engagements so the user only fills metrics.
    // IMPORTANT: restrict to DMM-sourced engagements only. Joshua Project / IMB
    // reference people groups must NOT be included in the country template.
    const code = String(countryConfig.code || '').toUpperCase();
    const existing = await PeopleGroup.find({
      countryCode: code,
      source: { $in: ['DMM', 'Survey', 'manual'] },
    })
      .select('name peopleGroup region')
      .sort({ name: 1 })
      .lean();
    if (existing && existing.length > 0) {
      rows = existing.map((pg) => buildRow({
        region: pg.region,
        ngName: pg.name,
        peopleGroup: pg.peopleGroup || pg.name,
      }));
    }
  } catch (dbErr) {
    console.error('[TEMPLATE] Could not load existing engagements, using examples:', dbErr.message);
    rows = [];
  }

  // Fallback: never return an empty template.
  if (rows.length === 0) {
    rows = countryConfig.examples.map((ex) => buildRow({ region: ex.region, ngName: ex.name, peopleGroup: ex.name }));
  }

  const csvContent = headers.map(q).join(';') + '\n' + rows.map(row => row.map(q).join(';')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="template-${countryKey}-${countryConfig.code}.csv"`);
  res.send('\ufeff' + csvContent); // BOM for Excel UTF-8 compatibility
});

/**
 * GET /import/people-groups/templates - List all available country templates
 * NOTE: No authentication required - templates are public resources
 */
router.get('/people-groups/templates', (req, res) => {
  const templates = Object.keys(COUNTRY_TEMPLATES).map(key => ({
    key,
    name: COUNTRY_TEMPLATES[key].name,
    code: COUNTRY_TEMPLATES[key].code,
    adminLevels: COUNTRY_TEMPLATES[key].adminLevels,
    downloadUrl: `/api/import/people-groups/template/${key}`
  }));

  res.json({
    success: true,
    message: `${templates.length} country templates available`,
    templates
  });
});

/**
 * POST /import/people-groups/with-polygon-detection - Import with automatic village polygon detection
 * When villageName is empty, automatically detects the village polygon where lat/long falls
 */
router.post('/people-groups/with-polygon-detection', auth, isMissionary, upload.single('file'), handleMulterError, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded',
      message: 'Please select a CSV file to upload.',
      code: 'NO_FILE'
    });
  }

  const results = [];
  const errors = [];
  let rowNumber = 0;

  try {
    // Normalize encoding and remove BOM
    const fileContent = normalizeEncoding(req.file.buffer);
    
    if (!fileContent.trim()) {
      return res.status(400).json({
        error: 'Empty file',
        message: 'The uploaded file is empty.',
        code: 'EMPTY_FILE'
      });
    }
    
    // Detect delimiter
    const firstLine = fileContent.split('\n')[0] || '';
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';
    
    console.log(`📊 CSV Import with polygon detection: Detected delimiter "${delimiter === ';' ? 'semicolon' : 'comma'}"`);
    
    // Skip comment lines
    const lines = fileContent.split('\n').filter(line => !line.trim().startsWith('#'));
    const cleanedContent = lines.join('\n');
    
    const stream = Readable.from(cleanedContent);
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({ 
          separator: delimiter,
          strict: false,
          relaxColumnCount: true
        }))
        .on('data', (row) => {
          rowNumber++;
          // Normalize column names
          const normalizedRow = {};
          Object.keys(row).forEach(key => {
            const cleanKey = removeBOM(key).trim();
            let normalizedKey = cleanKey.toLowerCase()
              .replace(/\\s+/g, '')
              // New 20-column CMR Import Template headers (aliases)
              .replace('ng_engagment_name', 'name')
              .replace('ng_engagement_name', 'name')
              .replace('ngengagmentname', 'name')
              .replace('ngengagementname', 'name')
              .replace('people_group', 'peopleGroup')
              .replace('peoplegroup', 'peopleGroup')
              .replace('reportperiod', 'reportPeriod')
              .replace('reportingperiod', 'reportPeriod')
              .replace('total', 'numberOfChurches')
              .replace('#newdisciples', 'newDisciples')
              .replace('newdisciples', 'newDisciples')
              .replace('#newbaptisms', 'newBaptisms')
              .replace('newbaptisms', 'newBaptisms')
              .replace('maxgen', 'maxGen')
              .replace('avgchurchsize', 'avgChurchSize')
              .replace('leadersintraining', 'leadersInTraining')
              .replace('activetrainers/coaches', 'activeCoaches')
              .replace('activecoaches', 'activeCoaches')
              .replace('#oftrainingsheldinquarter', 'trainingsHeld')
              .replace('trainingsheld', 'trainingsHeld')
              .replace('lostchs', 'lostChurches')
              .replace('mergedchs', 'mergedChurches')
              .replace('notes', 'notes')
              // Legacy / generic header aliases
              .replace('peoplegroupname', 'name')
              .replace('peoplename', 'name')
              .replace('groupname', 'name')
              .replace('villagename', 'villageName')
              .replace('village_name', 'villageName')
              .replace('numberofchurches', 'numberOfChurches')
              .replace('number_of_churches', 'numberOfChurches')
              .replace('churches', 'numberOfChurches')
              .replace('churchgeneration', 'churchGeneration')
              .replace('church_generation', 'churchGeneration')
              .replace('generation', 'churchGeneration')
              .replace('engagementstatus', 'engagementStatus')
              .replace('engagement_status', 'engagementStatus')
              .replace('lat', 'latitude')
              .replace('lng', 'longitude')
              .replace('lon', 'longitude')
              // Handle admin level columns
              .replace(/region.*admin.*1.*/i, 'region')
              .replace(/department.*admin.*2.*/i, 'department')
              .replace(/arrondissement.*admin.*3.*/i, 'arrondissement');
            normalizedRow[normalizedKey] = sanitizeString(row[key]);
          });
          results.push({ rowNumber, data: { ...row, ...normalizedRow } });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (results.length === 0) {
      return res.status(400).json({
        error: 'No data found',
        message: 'The CSV file contains no data rows.',
        code: 'NO_DATA'
      });
    }

    const imported = [];
    const skipped = [];
    const polygonDetections = [];

    for (const { rowNumber, data } of results) {
      try {
        // Skip empty rows
        const hasData = Object.values(data).some(v => v && v.trim());
        if (!hasData) continue;
        
        // Validate required fields
        const name = sanitizeString(data.name);
        if (!name) {
          errors.push({ row: rowNumber, field: 'name', error: 'Name is required' });
          skipped.push({ row: rowNumber, reason: 'Name is required' });
          continue;
        }

        // Validate coordinates (MANDATORY)
        const latitude = parseNumber(data.latitude, NaN);
        const longitude = parseNumber(data.longitude, NaN);
        
        const coordErrors = validateCoordinates(latitude, longitude);
        if (coordErrors.length > 0) {
          errors.push({ row: rowNumber, field: 'coordinates', error: coordErrors.join('; ') });
          skipped.push({ row: rowNumber, reason: coordErrors.join('; ') });
          continue;
        }

        // Parse numeric fields
        const numberOfChurches = parseInt(data.numberOfChurches, 0);
        const churchGeneration = parseInt(data.churchGeneration, 0);
        const population = parseInt(data.population, 0);

        // Calculate engagement status
        const validEngagementStatuses = ['pioneer', 'midway', 'tipping-point', 'dmm', 'unreached'];
        let engagementStatus = sanitizeString(data.engagementStatus).toLowerCase();
        
        if (!engagementStatus || !validEngagementStatuses.includes(engagementStatus)) {
          engagementStatus = calculateEngagementStatus(numberOfChurches);
        }

        // Village name handling - OPTIONAL with polygon detection
        let villageName = sanitizeString(data.villageName);
        let villageRef = null;
        let detectedVillage = null;

        if (villageName) {
          // Try to find village by name
          const village = await Village.findOne({ 
            name: { $regex: new RegExp(`^${villageName}$`, 'i') } 
          });
          if (village) {
            villageRef = village._id;
          }
        } else {
          // AUTOMATIC POLYGON DETECTION
          // Find village polygon that contains the point
          try {
            const village = await Village.findOne({
              geometry: {
                $geoIntersects: {
                  $geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                  }
                }
              }
            });

            if (village) {
              villageRef = village._id;
              villageName = village.name;
              detectedVillage = {
                id: village._id,
                name: village.name,
                admin1: village.admin1,
                admin2: village.admin2,
                admin3: village.admin3
              };
              polygonDetections.push({
                row: rowNumber,
                peopleName: name,
                detectedVillage: village.name,
                coordinates: [latitude, longitude]
              });
              console.log(`📍 Row ${rowNumber}: Auto-detected village "${village.name}" for people group "${name}"`);
            }
          } catch (geoError) {
            console.warn(`⚠️ Row ${rowNumber}: Geo query failed for coordinates [${latitude}, ${longitude}]:`, geoError.message);
          }
        }

        // Create people group
        // Determine source based on user and CSV data
        // If user is chrishaiwe@gmail.com, default to 'DMM' unless CSV explicitly sets 'Survey'
        const csvSource = sanitizeString(data.source);
        let source = 'Survey'; // Default for most users
        if (req.user.email === 'chrishaiwe@gmail.com') {
          source = csvSource === 'Survey' ? 'Survey' : 'DMM';
        } else if (csvSource && ['DMM', 'Survey', 'Joshua Project'].includes(csvSource)) {
          source = csvSource;
        }

        const peopleGroup = new PeopleGroup({
          name: name,
          description: sanitizeString(data.description),
          status: engagementStatus,
          engagementStatus: engagementStatus,
          location: {
            type: 'Point',
            coordinates: [longitude, latitude]
          },
          population: population,
          numberOfChurches: numberOfChurches,
          churchGeneration: churchGeneration,
          dbs: dbs,
          com: com,
          cat: cat,
          villageName: villageName,
          village: villageRef,
          region: sanitizeString(data.region),
          country: sanitizeString(data.country),
          language: sanitizeString(data.language),
          religion: sanitizeString(data.religion),
          source: source,
          createdBy: req.user._id,
          approved: ['admin', 'supervisor'].includes(req.user.role),
          approvedBy: ['admin', 'supervisor'].includes(req.user.role) ? req.user._id : undefined,
          approvedAt: ['admin', 'supervisor'].includes(req.user.role) ? new Date() : undefined,
        });

        await peopleGroup.save();

        // If village was detected, update village status based on DMM calculation
        if (villageRef && detectedVillage) {
          try {
            // Recalculate village status based on all people groups in that village
            const allPeopleGroupsInVillage = await PeopleGroup.find({ village: villageRef });
            
            // Calculate the highest status among all people groups
            const statusPriority = { 'dmm': 5, 'tipping-point': 4, 'midway': 3, 'pioneer': 2, 'unreached': 1 };
            let highestStatus = 'unreached';
            let highestPriority = 0;
            
            for (const pg of allPeopleGroupsInVillage) {
              const priority = statusPriority[pg.engagementStatus] || 0;
              if (priority > highestPriority) {
                highestPriority = priority;
                highestStatus = pg.engagementStatus;
              }
            }

            // Update village status
            await Village.findByIdAndUpdate(villageRef, {
              dmmStatus: highestStatus,
              lastStatusUpdate: new Date()
            });

            console.log(`🎨 Updated village "${detectedVillage.name}" status to "${highestStatus}"`);
          } catch (updateError) {
            console.warn(`⚠️ Failed to update village status:`, updateError.message);
          }
        }

        imported.push({
          row: rowNumber,
          id: peopleGroup._id,
          name: peopleGroup.name,
          engagementStatus: peopleGroup.engagementStatus,
          villageName: villageName || 'Not detected',
          villageDetected: !!detectedVillage
        });

      } catch (err) {
        console.error(`Row ${rowNumber} error:`, err);
        errors.push({ row: rowNumber, error: err.message });
        skipped.push({ row: rowNumber, reason: err.message });
      }
    }

    res.json({
      success: imported.length > 0,
      message: `Import completed: ${imported.length} imported, ${skipped.length} skipped, ${polygonDetections.length} villages auto-detected`,
      summary: {
        total: results.length,
        imported: imported.length,
        skipped: skipped.length,
        errors: errors.length,
        polygonDetections: polygonDetections.length
      },
      imported,
      skipped,
      errors,
      polygonDetections
    });

  } catch (error) {
    console.error('Error importing CSV with polygon detection:', error);
    res.status(500).json({
      error: 'Import failed',
      message: error.message || 'An unexpected error occurred during import',
      code: 'IMPORT_ERROR'
    });
  }
});

module.exports = router;
