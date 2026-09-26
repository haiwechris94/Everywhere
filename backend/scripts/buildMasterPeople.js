/**
 * buildMasterPeople.js — Master People merge loader (Phases A–E)
 * =============================================================================
 * Transforms the two raw source datasets (Joshua Project + CPPI/PeopleGroups.org)
 * plus the authoritative JP↔CPPI cross-reference into the six canonical people-graph
 * collections. Implements the 5-tier match model and 0–100 confidence scoring from
 * docs/architecture/03-merge-algorithm.md, following the Phase A–E workflow from
 * docs/architecture/05-migration-workflows.md.
 *
 * WRITES ONLY to these six collections (never touches any other collection):
 *   master_people, people_sources, people_matches, people_aliases,
 *   people_locations, people_statuses
 *
 * SOURCES (on disk, relative to backend/):
 *   JP    data/AllPeoplesInCountry.csv       ';'-delimited, header line 3, data line 4+,
 *                                            trailing blank/footer ignored (~line 16440+).
 *                                            sourceType 'JP', sourceRecordId = PeopleID3.
 *                                            ROG3 is a 2-letter FIPS/GEC country code (e.g.
 *                                            'AF' Afghanistan, 'OD' South Sudan) — NOT ISO.
 *   CPPI  data/people_groups.csv             RFC-4180 (quoted fields, embedded ""), ';'-delimited,
 *                                            header line 1. sourceType 'CPPI',
 *                                            sourceRecordId = PEID. ISOalpha3 is ISO-3.
 *   XREF  data/jp-cppi-cross-reference.xlsx  sheet 'CrossRefJP_CPPI'. Authoritative Tier-1
 *                                            PEID↔PeopleID3 links (union only when BOTH ids
 *                                            present; ~10148 links, all Type=1).
 *
 * USAGE:
 *   node backend/scripts/buildMasterPeople.js --dry-run [--limit=N]
 *       Full in-memory merge + RECONCILIATION REPORT. ZERO writes, no reset.
 *   node backend/scripts/buildMasterPeople.js --reset
 *       Delete ONLY the six collections, then load everything (idempotent upserts).
 *   node backend/scripts/buildMasterPeople.js
 *       Load/refresh via idempotent upserts (no delete).
 *   node backend/scripts/buildMasterPeople.js --limit=500
 *       Load only the first 500 rows of each source (smoke test).
 *   node backend/scripts/buildMasterPeople.js --verify
 *       Print per-collection document counts and exit (no load).
 *
 * FLAGS may be combined, e.g. `--dry-run --limit=500`.
 *
 * IDEMPOTENCY:
 *   people_sources  upsert key: (sourceType, sourceRecordId)
 *   master_people   upsert key: groupNaturalKey (sorted 'JP:<id>'/'CPPI:<id>' tokens joined '|')
 *   people_statuses upsert key: masterPeopleId
 *   people_matches / people_aliases / people_locations are rebuilt per master on each run
 *   (removed-by-master then re-inserted) so re-runs converge and never duplicate.
 *
 * Connection: require('dotenv').config() + mongoose.connect(process.env.MONGODB_URI).
 * =============================================================================
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const MasterPeople = require('../models/MasterPeople');
const PeopleSource = require('../models/PeopleSource');
const PeopleMatch = require('../models/PeopleMatch');
const PeopleAlias = require('../models/PeopleAlias');
const PeopleLocation = require('../models/PeopleLocation');
const PeopleStatus = require('../models/PeopleStatus');

// Shared matching primitives (normalization/similarity/distance/scoring bands) and
// the 0–100 confidence scoring constants. Extracted into ./lib/peopleMatcher.js so
// this loader and the DMM ingestion script share one canonical copy.
const {
  AUTO_MERGE,
  MANUAL_LOW,
  PROX_RADIUS_KM,
  PTS_ROP3_MATCH,
  PTS_ROP3_CONFLICT,
  PTS_COUNTRY_MATCH,
  PTS_COUNTRY_MISMATCH,
  PTS_NAME_HIGH,
  PTS_NAME_MED,
  PTS_GEO,
  normName,
  trigrams,
  trigramSimilarity,
  haversineKm,
  clamp,
  bandFor,
  tierName,
} = require('./lib/peopleMatcher');

// ─────────────────────────────────────────────────────────────────────────────
// PATHS & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', 'data');
const JP_CSV = path.join(DATA_DIR, 'AllPeoplesInCountry.csv');
const CPPI_CSV = path.join(DATA_DIR, 'people_groups.csv');
const XREF_XLSX = path.join(DATA_DIR, 'jp-cppi-cross-reference.xlsx');
const XREF_SHEET = 'CrossRefJP_CPPI';

const MIGRATION_VERSION = 1;

const BULK = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// COUNTRY CODE NORMALIZATION
// JP ROG3 is FIPS/GEC 2-letter (not ISO alpha-2). CPPI ISOalpha3 is ISO alpha-3
// (except Kosovo which CPPI/PeopleGroups codes 'KOS'). We normalize BOTH sides to a
// single dataset-internal alpha-3 for Tier-3 country comparison: JP ROG3 -> ISO3 via
// ROG3_TO_ISO3 (covers all 238 distinct ROG3 present + standard ISO alpha-2 fallbacks);
// CPPI codes pass through (already alpha-3 / 'KOS'). Kosovo is mapped ROG3 'KV' -> 'KOS'
// to align with CPPI. This map was verified against the ROG3/ISOalpha3 values actually
// present in both CSVs.
// ─────────────────────────────────────────────────────────────────────────────
const ROG3_TO_ISO3 = {
  // FIPS/GEC codes that differ from ISO alpha-2 (present in JP data)
  AA: 'ABW', AC: 'ATG', AG: 'DZA', AJ: 'AZE', AN: 'AND', AQ: 'ASM', AS: 'AUS',
  AU: 'AUT', AV: 'AIA', BA: 'BHR', BB: 'BRB', BC: 'BWA', BD: 'BMU', BF: 'BHS',
  BG: 'BGD', BH: 'BLZ', BK: 'BIH', BL: 'BOL', BM: 'MMR', BN: 'BEN', BO: 'BLR',
  BP: 'SLB', BR: 'BRA', BT: 'BTN', BU: 'BGR', BX: 'BRN', BY: 'BDI', CB: 'KHM',
  CD: 'TCD', CE: 'LKA', CF: 'COG', CG: 'COD', CH: 'CHN', CI: 'CHL', CJ: 'CYM',
  CN: 'COM', CQ: 'MNP', CS: 'CRI', CT: 'CAF', CW: 'COK', DA: 'DNK', DR: 'DOM',
  EI: 'IRL', EK: 'GNQ', EN: 'EST', EZ: 'CZE', FG: 'GUF', FP: 'PYF', GA: 'GMB',
  GB: 'GAB', GG: 'GEO', GJ: 'GRD', GM: 'DEU', GP: 'GLP', GQ: 'GUM', GV: 'GIN',
  HA: 'HTI', HO: 'HND', IC: 'ISL', IS: 'ISR', IV: 'CIV', IZ: 'IRQ', JA: 'JPN',
  KN: 'PRK', KR: 'KIR', KS: 'KOR', KT: 'CXR', KU: 'KWT', KV: 'KOS', LE: 'LBN',
  LG: 'LVA', LH: 'LTU', LO: 'SVK', LS: 'LIE', MB: 'MTQ', MC: 'MAC', MG: 'MNG',
  MH: 'MSR', MI: 'MWI', MJ: 'MNE', MP: 'MUS', MU: 'OMN', NE: 'NIU', NH: 'VUT',
  NL: 'NLD', NN: 'SXM', NS: 'SUR', NU: 'NIC', OD: 'SSD', PC: 'PCN', PO: 'PRT',
  PP: 'PNG', PU: 'GNB', RI: 'SRB', RM: 'MHL', RP: 'PHL', RQ: 'PRI', RS: 'RUS',
  SB: 'SPM', SC: 'KNA', SF: 'ZAF', SP: 'ESP', ST: 'LCA', SU: 'SDN', SW: 'SWE',
  TD: 'TTO', TI: 'TJK', TK: 'TCA', TN: 'TON', TO: 'TGO', TP: 'STP', TS: 'TUN',
  TT: 'TLS', TU: 'TUR', TX: 'TKM', UC: 'CUW', UK: 'GBR', UP: 'UKR', UV: 'BFA',
  VC: 'VCT', VI: 'VGB', VM: 'VNM', VQ: 'VIR', VT: 'VAT', WA: 'NAM', WF: 'WLF',
  WI: 'ESH', WZ: 'SWZ', XP: 'PSE', YM: 'YEM', ZA: 'ZMB', ZI: 'ZWE',
  // Codes where ROG3 == ISO alpha-2 (standard mapping, present in JP data)
  AF: 'AFG', AE: 'ARE', AL: 'ALB', AM: 'ARM', AO: 'AGO', AR: 'ARG', AW: 'ABW',
  AZ: 'AZE', BE: 'BEL', BG_ISO: 'BGR', BJ: 'BEN', BS: 'BHS', BW: 'BWA',
  CA: 'CAN', CM: 'CMR', CO: 'COL', CU: 'CUB', CV: 'CPV', CY: 'CYP', DJ: 'DJI',
  DO: 'DMA', EC: 'ECU', EG: 'EGY', ER: 'ERI', ES: 'ESP', ET: 'ETH', FI: 'FIN',
  FJ: 'FJI', FK: 'FLK', FM: 'FSM', FO: 'FRO', FR: 'FRA', GH: 'GHA', GI: 'GIB',
  GL: 'GRL', GR: 'GRC', GT: 'GTM', GY: 'GUY', HK: 'HKG', HR: 'HRV', HU: 'HUN',
  ID: 'IDN', IM: 'IMN', IN: 'IND', IO: 'IOT', IR: 'IRN', IT: 'ITA', JM: 'JAM',
  JO: 'JOR', KE: 'KEN', KG: 'KGZ', KZ: 'KAZ', LA: 'LAO', LI: 'LBR', LT: 'LSO',
  LU: 'LUX', LY: 'LBY', MA: 'MDG', MD: 'MDA', MF: 'MYT', MK: 'MKD', ML: 'MLI',
  MN: 'MCO', MO: 'MAR', MR: 'MRT', MT: 'MLT', MV: 'MDV', MX: 'MEX', MY: 'MYS',
  MZ: 'MOZ', NC: 'NCL', NF: 'NFK', NG: 'NER', NI: 'NGA', NO: 'NOR', NP: 'NPL',
  NR: 'NRU', NZ: 'NZL', PA: 'PAN', PE: 'PER', PK: 'PAK', PL: 'POL', PM: 'PAN',
  PS: 'PLW', QA: 'QAT', RE: 'REU', RO: 'ROU', RW: 'RWA', SA: 'SAU', SE: 'SYC',
  SG: 'SEN', SH: 'SHN', SI: 'SVN', SL: 'SLE', SM: 'SMR', SN: 'SGP', SO: 'SOM',
  SV: 'SJM', SY: 'SYR', SZ: 'CHE', TH: 'THA', TV: 'TUV', TW: 'TWN', TZ: 'TZA',
  UG: 'UGA', US: 'USA', UY: 'URY', UZ: 'UZB', VE: 'VEN', WS: 'WSM', YT: 'MYT',
  ZW: 'ZWE',
};
// Note: JP 'PM' resolves to Panama in JP data; JP 'MU' -> Oman; JP 'PA' -> Paraguay.
// These are handled explicitly above (FIPS/GEC), matching the observed JP Ctry values.
const JP_ROG3_OVERRIDES = { PM: 'PAN', PA: 'PRY', MU: 'OMN', NL: 'NLD' };

/** Normalize a JP ROG3 (FIPS/GEC 2-letter) to the dataset-internal alpha-3 code. */
function jpCountryToIso3(rog3) {
  if (!rog3) return null;
  const k = String(rog3).trim().toUpperCase();
  if (JP_ROG3_OVERRIDES[k]) return JP_ROG3_OVERRIDES[k];
  return ROG3_TO_ISO3[k] || (k.length === 3 ? k : null);
}

/** Normalize a CPPI ISOalpha3 to the dataset-internal alpha-3 code (pass-through). */
function cppiCountryToIso3(iso) {
  if (!iso) return null;
  return String(iso).trim().toUpperCase() || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const FLAG_DRY_RUN = ARGS.includes('--dry-run');
const FLAG_RESET = ARGS.includes('--reset');
const FLAG_VERIFY = ARGS.includes('--verify');
const LIMIT = (() => {
  const a = ARGS.find((x) => x.startsWith('--limit='));
  if (!a) return null;
  const n = parseInt(a.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  const n = toNumber(v);
  return n === null ? null : Math.round(n);
}

function validLat(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= -90 && n <= 90;
}
function validLng(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= -180 && n <= 180;
}

function s(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Blank / placeholder detector for CPPI values like 'None'. */
function isBlank(v) {
  const t = s(v);
  return t === '' || t.toLowerCase() === 'none';
}

// normName, trigrams, trigramSimilarity, haversineKm, clamp and bandFor are now
// imported from ./lib/peopleMatcher (see require at the top of this file).

// ─────────────────────────────────────────────────────────────────────────────
// CSV PARSERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse JP AllPeoplesInCountry.csv.
 * - Simple ';' split (JP data has no quoted fields).
 * - Header on line 3 (index 2); data from line 4 (index 3).
 * - Stop at first blank/short row (footer starts ~line 16440).
 * Returns array of { record: {header->value}, iso3 } capped to LIMIT.
 */
function parseJP(limit) {
  const raw = fs.readFileSync(JP_CSV, 'utf8');
  const lines = raw.split(/\r?\n/);
  const header = lines[2].split(';').map((h) => h.trim());
  const NCOLS = header.length; // 39
  const idx = {};
  header.forEach((h, i) => (idx[h] = i));

  const rows = [];
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim() === '') break; // trailing blank -> end of data
    const cols = line.split(';');
    // Footer rows are short / lack a PeopleID3; data rows have full column count.
    if (cols.length < NCOLS) break;
    const rog3 = s(cols[idx.ROG3]);
    const peopleId3 = s(cols[idx.PeopleID3]);
    if (!rog3 || !peopleId3) break; // reached footer
    const record = {};
    for (let c = 0; c < NCOLS; c++) record[header[c]] = cols[c] !== undefined ? cols[c].trim() : '';
    rows.push({ record, iso3: jpCountryToIso3(rog3) });
    if (limit && rows.length >= limit) break;
  }
  return rows;
}

/**
 * RFC-4180 state-machine parser for one CPPI line-set. CPPI has quoted fields with
 * embedded "" and (rarely) embedded newlines inside quotes, so we parse the whole
 * file char-by-char rather than splitting on newlines.
 * Delimiter ';', header on line 1.
 * Returns array of { record, iso3 } capped to LIMIT.
 */
function parseCPPI(limit) {
  const raw = fs.readFileSync(CPPI_CSV, 'utf8');
  const records = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let i = 0;
  const n = raw.length;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    records.push(row);
    row = [];
  };

  while (i < n) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ';') {
      pushField();
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      // finish the row (ignore empty trailing rows)
      if (field !== '' || row.length > 0) pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // flush last field/row if file doesn't end with newline
  if (field !== '' || row.length > 0) pushRow();

  if (records.length === 0) return [];
  const header = records[0].map((h) => h.trim());
  const NCOLS = header.length; // 67

  const out = [];
  for (let r = 1; r < records.length; r++) {
    const cols = records[r];
    if (!cols || cols.length === 0) continue;
    if (cols.length === 1 && cols[0].trim() === '') continue;
    const record = {};
    for (let c = 0; c < NCOLS; c++) record[header[c]] = cols[c] !== undefined ? String(cols[c]).trim() : '';
    if (!record.PEID) continue;
    out.push({ record, iso3: cppiCountryToIso3(record.ISOalpha3) });
    if (limit && out.length >= limit) break;
  }
  return out;
}

/**
 * Parse the XREF XLSX. Trim header keys (' CPPIPopulation ' has spaces).
 * Build authoritative links ONLY when BOTH PEID and PeopleID3 are present.
 * Returns array of { peid, peopleId3, type }.
 */
function parseXref(limit) {
  const wb = XLSX.readFile(XREF_XLSX);
  const ws = wb.Sheets[XREF_SHEET];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const links = [];
  for (const r of rows) {
    // trim header keys
    const rec = {};
    for (const k of Object.keys(r)) rec[k.trim()] = r[k];
    const peid = rec.PEID !== null && rec.PEID !== undefined ? s(rec.PEID) : '';
    const pid3 = rec.PeopleID3 !== null && rec.PeopleID3 !== undefined ? s(rec.PeopleID3) : '';
    if (!peid || !pid3) continue; // both ids required
    links.push({ peid, peopleId3: pid3, type: rec.Type !== null && rec.Type !== undefined ? String(rec.Type) : null });
    if (limit && links.length >= limit) break;
  }
  return links;
}

// ─────────────────────────────────────────────────────────────────────────────
// UNION-FIND
// ─────────────────────────────────────────────────────────────────────────────
class UnionFind {
  constructor() {
    this.parent = new Map();
  }
  add(x) {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }
  find(x) {
    this.add(x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    // path compression
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur);
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
  groups() {
    const map = new Map();
    for (const node of this.parent.keys()) {
      const root = this.find(node);
      if (!map.has(root)) map.set(root, []);
      map.get(root).push(node);
    }
    return map;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD ACCESSORS (per source)
// ─────────────────────────────────────────────────────────────────────────────
function jpBestName(rec) {
  return s(rec.PeopNameAcrossCountries) || s(rec.PeopNameInCountry) || '';
}
function cppiBestName(rec) {
  return (!isBlank(rec.NmDisp) && s(rec.NmDisp)) || (!isBlank(rec.Name) && s(rec.Name)) || '';
}

function jpGeo(rec) {
  const lat = toNumber(rec.Latitude);
  const lng = toNumber(rec.Longitude);
  if (validLat(lat) && validLng(lng)) return { lat, lng };
  return null;
}
function cppiGeo(rec) {
  const lat = toNumber(rec.Latitude);
  const lng = toNumber(rec.Longitude);
  if (validLat(lat) && validLng(lng)) return { lat, lng };
  return null;
}

// Reached-status derivation (JP authoritative for reached-status; CPPI EngStat for engagement).
// JP scale 1–2 (or LeastReached/Frontier) => UNREACHED (FRONTIER when Frontier flag set);
// scale 3 => MINIMALLY_REACHED; scale 4 => MINIMALLY_REACHED; scale 5 => REACHED.
function deriveStatus(jpRec, cppiRec) {
  let status = 'UNKNOWN';
  let jpScale = null;
  let leastReached = null;
  let frontier = null;
  let percentEvangelical = null;
  let percentChristian = null;
  let engagementStatus = null;
  let bibleStatus = null;
  let derivedFromSource = null;

  if (jpRec) {
    jpScale = toInt(jpRec.JPScale);
    leastReached = s(jpRec.LeastReached).toUpperCase() === 'Y';
    frontier = s(jpRec.Frontier).toUpperCase() === 'Y';
    percentEvangelical = toNumber(jpRec.PercentEvangelical);
    percentChristian = toNumber(jpRec.PercentAdherents);
    bibleStatus = !isBlank(jpRec.BibleStatus) ? s(jpRec.BibleStatus) : null;
    derivedFromSource = 'JP';

    if (frontier) status = 'FRONTIER';
    else if (leastReached) status = 'UNREACHED';
    else if (jpScale !== null) {
      if (jpScale <= 2) status = 'UNREACHED';
      else if (jpScale === 3) status = 'MINIMALLY_REACHED';
      else if (jpScale === 4) status = 'MINIMALLY_REACHED';
      else status = 'REACHED';
    }
  }

  if (cppiRec) {
    engagementStatus = !isBlank(cppiRec.EngStat) ? s(cppiRec.EngStat) : engagementStatus;
    if (percentEvangelical === null) {
      const ev = toNumber(cppiRec.EvngLvl);
      if (ev !== null) percentEvangelical = ev;
    }
    if (!derivedFromSource) derivedFromSource = 'CPPI';
    if (status === 'UNKNOWN' && bibleStatus === null) {
      // If no JP present, leave status UNKNOWN (CPPI has no JPScale) but keep engagement.
    }
  }

  return {
    status,
    jpScale,
    leastReached,
    frontier,
    percentEvangelical,
    percentChristian,
    engagementStatus,
    bibleStatus,
    derivedFromSource: derivedFromSource || 'UNKNOWN',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const started = Date.now();

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('FATAL: MONGODB_URI is not set (check backend/.env).');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  try {
    // ── --verify: print per-collection counts and exit ─────────────────────
    if (FLAG_VERIFY) {
      await printVerify();
      return;
    }

    console.log(
      `Mode: ${FLAG_DRY_RUN ? 'DRY-RUN (no writes)' : FLAG_RESET ? 'RESET + LOAD' : 'LOAD (upsert)'}` +
        (LIMIT ? ` | limit=${LIMIT}` : '')
    );

    // ── PARSE SOURCES (Phase A + B ingestion, Phase C xref) ────────────────
    console.log('Parsing sources…');
    const jpRows = parseJP(LIMIT); // [{record, iso3}]
    const cppiRows = parseCPPI(LIMIT);
    const xrefLinks = parseXref(null); // xref always parsed in full

    console.log(`  JP rows:   ${jpRows.length}`);
    console.log(`  CPPI rows: ${cppiRows.length}`);
    console.log(`  XREF links (both ids present): ${xrefLinks.length}`);

    // Index sources by natural key
    const jpById = new Map(); // PeopleID3 -> {record, iso3}
    for (const r of jpRows) {
      const id = s(r.record.PeopleID3);
      if (id && !jpById.has(id)) jpById.set(id, r);
    }
    const cppiById = new Map(); // PEID -> {record, iso3}
    for (const r of cppiRows) {
      const id = s(r.record.PEID);
      if (id && !cppiById.has(id)) cppiById.set(id, r);
    }

    // ── PHASE C: union-find over authoritative xref links ──────────────────
    const uf = new UnionFind();
    // Seed every source node so standalones get their own component.
    for (const id of jpById.keys()) uf.add(`JP:${id}`);
    for (const id of cppiById.keys()) uf.add(`CPPI:${id}`);

    let effectiveXrefLinks = 0;
    const xrefTypeByPair = new Map(); // 'JP:x|CPPI:y' -> type
    for (const link of xrefLinks) {
      const jpNode = `JP:${link.peopleId3}`;
      const cppiNode = `CPPI:${link.peid}`;
      // Only union when BOTH sides are actually present in the (possibly limited) load.
      if (jpById.has(link.peopleId3) && cppiById.has(link.peid)) {
        uf.union(jpNode, cppiNode);
        effectiveXrefLinks++;
        xrefTypeByPair.set(`${jpNode}|${cppiNode}`, link.type);
      }
    }

    // ── PHASE D: build master groups ───────────────────────────────────────
    // Each connected component that contains a cross-referenced pair is a Tier-1
    // AUTO_MERGE group. Components that are a single source node are standalones.
    // For standalone CPPI (and JP), we then apply Tiers 2–5 scoring against JP
    // candidates via blocking to (a) attach AUTO_MERGE (>=90) and (b) flag
    // MANUAL_REVIEW (70–89) without merging, else KEEP_SEPARATE.
    const components = uf.groups(); // Map<root, node[]>

    // Blocking indexes over JP for tiers 2–5 (only JP nodes not already xref-merged
    // with a CPPI node are merge targets, but we still allow scoring against any JP).
    const jpByRop3 = new Map(); // rop3 -> [PeopleID3]
    const jpByIso3 = new Map(); // iso3 -> [PeopleID3]
    for (const [id, r] of jpById) {
      const rop3 = s(r.record.ROP3);
      if (rop3) {
        if (!jpByRop3.has(rop3)) jpByRop3.set(rop3, []);
        jpByRop3.get(rop3).push(id);
      }
      const iso3 = r.iso3;
      if (iso3) {
        if (!jpByIso3.has(iso3)) jpByIso3.set(iso3, []);
        jpByIso3.get(iso3).push(id);
      }
    }

    // Determine which nodes are already in a multi-source (xref) component.
    const nodeComponent = new Map(); // node -> rootKey
    for (const [root, members] of components) {
      for (const m of members) nodeComponent.set(m, root);
    }
    const componentIsMulti = new Map(); // root -> bool (has both JP and CPPI)
    for (const [root, members] of components) {
      const hasJP = members.some((m) => m.startsWith('JP:'));
      const hasCPPI = members.some((m) => m.startsWith('CPPI:'));
      componentIsMulti.set(root, hasJP && hasCPPI);
    }

    // Build the final list of masters. We key each master by groupNaturalKey.
    // matchRecords: per-master audit rows (Phase E writes them).
    const masters = []; // { groupNaturalKey, jpIds:[], cppiIds:[], matches:[], primaryTier, band }
    const consumedCppi = new Set();
    const consumedJp = new Set();

    // Counters for the reconciliation report.
    let cntAutoMerge = 0;
    let cntManualReview = 0;
    let cntKeepSeparate = 0;

    // 1) Tier-1 groups (xref multi-source components) → one master each.
    for (const [root, members] of components) {
      if (!componentIsMulti.get(root)) continue;
      const jpIds = members.filter((m) => m.startsWith('JP:')).map((m) => m.slice(3));
      const cppiIds = members.filter((m) => m.startsWith('CPPI:')).map((m) => m.slice(5));
      jpIds.forEach((id) => consumedJp.add(id));
      cppiIds.forEach((id) => consumedCppi.add(id));

      const tokens = [...jpIds.map((id) => `JP:${id}`), ...cppiIds.map((id) => `CPPI:${id}`)].sort();
      const groupNaturalKey = tokens.join('|');

      // Tier-1 audit rows: each CPPI ↔ (matched JP) link with confidence 100.
      const matches = [];
      // Represent the cross-reference decisions. Pair each cppi with a jp in the group.
      for (const cppiId of cppiIds) {
        // find a jp partner (prefer one with an explicit xref type)
        let partnerJp = null;
        let xtype = null;
        for (const jpId of jpIds) {
          const t = xrefTypeByPair.get(`JP:${jpId}|CPPI:${cppiId}`);
          if (t !== undefined) {
            partnerJp = jpId;
            xtype = t;
            break;
          }
        }
        if (!partnerJp && jpIds.length) partnerJp = jpIds[0];
        matches.push({
          fromJpId: partnerJp,
          toCppiId: cppiId,
          matchType: 'CROSS_REFERENCE',
          matchTier: 1,
          confidence: 100,
          confidenceBand: 'AUTO_MERGE',
          crossReferenceType: xtype !== null && xtype !== undefined ? `PEID<->PeopleID3 (Type ${xtype})` : 'PEID<->PeopleID3',
        });
      }
      cntAutoMerge++;
      masters.push({ groupNaturalKey, jpIds, cppiIds, matches, primaryBand: 'AUTO_MERGE' });
    }

    // 2) Tiers 2–5 for CPPI singletons not consumed by xref.
    for (const [cppiId, cppiRow] of cppiById) {
      if (consumedCppi.has(cppiId)) continue;
      const cppiRec = cppiRow.record;
      const cppiRop3 = s(cppiRec.ROP3);
      const cppiIso3 = cppiRow.iso3;

      // Blocking candidate JP ids: same ROP3, or same country.
      const candidateIds = new Set();
      if (cppiRop3 && jpByRop3.has(cppiRop3)) jpByRop3.get(cppiRop3).forEach((id) => candidateIds.add(id));
      if (cppiIso3 && jpByIso3.has(cppiIso3)) jpByIso3.get(cppiIso3).forEach((id) => candidateIds.add(id));

      let best = null; // { jpId, score, tier }
      for (const jpId of candidateIds) {
        if (consumedJp.has(jpId)) continue; // don't steal a JP from a Tier-1 group
        const jpRow = jpById.get(jpId);
        const scored = scorePair(jpRow, cppiRow);
        if (!best || scored.score > best.score) best = { jpId, score: scored.score, tier: scored.tier, matchType: scored.matchType };
      }

      if (best && best.score >= AUTO_MERGE) {
        // AUTO_MERGE: fold cppi into a master with the chosen jp.
        const jpId = best.jpId;
        consumedJp.add(jpId);
        consumedCppi.add(cppiId);
        const tokens = [`JP:${jpId}`, `CPPI:${cppiId}`].sort();
        cntAutoMerge++;
        masters.push({
          groupNaturalKey: tokens.join('|'),
          jpIds: [jpId],
          cppiIds: [cppiId],
          matches: [
            {
              fromJpId: jpId,
              toCppiId: cppiId,
              matchType: best.matchType,
              matchTier: best.tier,
              confidence: best.score,
              confidenceBand: 'AUTO_MERGE',
              crossReferenceType: null,
            },
          ],
          primaryBand: 'AUTO_MERGE',
        });
      } else if (best && best.score >= MANUAL_LOW) {
        // MANUAL_REVIEW: still merge, but flag. (Per spec: 70–89 merge + flag.)
        const jpId = best.jpId;
        consumedJp.add(jpId);
        consumedCppi.add(cppiId);
        const tokens = [`JP:${jpId}`, `CPPI:${cppiId}`].sort();
        cntManualReview++;
        masters.push({
          groupNaturalKey: tokens.join('|'),
          jpIds: [jpId],
          cppiIds: [cppiId],
          matches: [
            {
              fromJpId: jpId,
              toCppiId: cppiId,
              matchType: best.matchType,
              matchTier: best.tier,
              confidence: best.score,
              confidenceBand: 'MANUAL_REVIEW',
              crossReferenceType: null,
            },
          ],
          primaryBand: 'MANUAL_REVIEW',
        });
      } else {
        // KEEP_SEPARATE: standalone CPPI master.
        consumedCppi.add(cppiId);
        cntKeepSeparate++;
        const gk = `CPPI:${cppiId}`;
        const audit = best
          ? {
              fromJpId: best.jpId,
              toCppiId: cppiId,
              matchType: best.matchType,
              matchTier: best.tier,
              confidence: best.score,
              confidenceBand: 'KEEP_SEPARATE',
              crossReferenceType: null,
            }
          : {
              fromJpId: null,
              toCppiId: cppiId,
              matchType: 'COUNTRY',
              matchTier: 3,
              confidence: 0,
              confidenceBand: 'KEEP_SEPARATE',
              crossReferenceType: null,
            };
        masters.push({ groupNaturalKey: gk, jpIds: [], cppiIds: [cppiId], matches: [audit], primaryBand: 'KEEP_SEPARATE' });
      }
    }

    // 3) JP singletons never consumed → standalone masters.
    for (const [jpId] of jpById) {
      if (consumedJp.has(jpId)) continue;
      consumedJp.add(jpId);
      cntKeepSeparate++;
      masters.push({
        groupNaturalKey: `JP:${jpId}`,
        jpIds: [jpId],
        cppiIds: [],
        matches: [], // JP-only standalone has no cross-source decision to audit
        primaryBand: 'KEEP_SEPARATE',
      });
    }

    console.log(`Planned masters: ${masters.length}`);

    // ── DRY-RUN: report only, ZERO writes ──────────────────────────────────
    if (FLAG_DRY_RUN) {
      const stats = {
        jpRows: jpRows.length,
        cppiRows: cppiRows.length,
        xrefLinks: xrefLinks.length,
        effectiveXrefLinks,
        mastersCreated: masters.length,
        autoMerge: cntAutoMerge,
        manualReview: cntManualReview,
        keepSeparate: cntKeepSeparate,
        sourcesWritten: 0,
        aliasesWritten: 0,
        locationsWritten: 0,
        statusesWritten: 0,
      };
      // Estimate child-collection volumes without writing.
      let est = { sources: 0, aliases: 0, locations: 0, statuses: 0 };
      for (const m of masters) {
        est.sources += m.jpIds.length + m.cppiIds.length;
        est.statuses += 1;
        for (const jpId of m.jpIds) {
          const rec = jpById.get(jpId).record;
          if (jpGeo(rec)) est.locations += 1;
          est.aliases += countJpAliases(rec);
        }
        for (const cppiId of m.cppiIds) {
          const rec = cppiById.get(cppiId).record;
          if (cppiGeo(rec)) est.locations += 1;
          est.aliases += countCppiAliases(rec);
        }
      }
      stats.sourcesWritten = est.sources;
      stats.aliasesWritten = est.aliases;
      stats.locationsWritten = est.locations;
      stats.statusesWritten = est.statuses;
      printReport(stats, started, true);
      return;
    }

    // ── --reset: delete ONLY the six collections ───────────────────────────
    if (FLAG_RESET) {
      console.log('RESET: clearing the six collections…');
      await Promise.all([
        MasterPeople.deleteMany({}),
        PeopleSource.deleteMany({}),
        PeopleMatch.deleteMany({}),
        PeopleAlias.deleteMany({}),
        PeopleLocation.deleteMany({}),
        PeopleStatus.deleteMany({}),
      ]);
    }

    // ── WRITE PHASE D: upsert masters keyed by groupNaturalKey ─────────────
    console.log('Writing master_people…');
    const masterIdByKey = new Map();
    let masterOps = [];
    const flushMasters = async () => {
      if (!masterOps.length) return;
      await MasterPeople.bulkWrite(masterOps, { ordered: false });
      masterOps = [];
    };

    for (const m of masters) {
      const jpRecs = m.jpIds.map((id) => jpById.get(id).record);
      const cppiRecs = m.cppiIds.map((id) => cppiById.get(id).record);
      const jpRows2 = m.jpIds.map((id) => jpById.get(id));
      const cppiRows2 = m.cppiIds.map((id) => cppiById.get(id));

      const canonicalName =
        (jpRecs[0] && s(jpRecs[0].PeopNameAcrossCountries)) ||
        (cppiRecs[0] && !isBlank(cppiRecs[0].NmDisp) && s(cppiRecs[0].NmDisp)) ||
        (jpRecs[0] && s(jpRecs[0].PeopNameInCountry)) ||
        (cppiRecs[0] && !isBlank(cppiRecs[0].Name) && s(cppiRecs[0].Name)) ||
        'Unknown';

      const rop3 = (jpRecs[0] && s(jpRecs[0].ROP3)) || (cppiRecs[0] && s(cppiRecs[0].ROP3)) || null;
      const rop2 = (jpRecs[0] && s(jpRecs[0].ROP2)) || (cppiRecs[0] && s(cppiRecs[0].ROP2)) || null;
      const rop1 = (jpRecs[0] && s(jpRecs[0].ROP1)) || (cppiRecs[0] && s(cppiRecs[0].ROP1)) || null;
      const primaryCountryCode = (jpRows2[0] && jpRows2[0].iso3) || (cppiRows2[0] && cppiRows2[0].iso3) || null;
      const primaryLanguageName =
        (jpRecs[0] && s(jpRecs[0].PrimaryLanguageName)) ||
        (cppiRecs[0] && s(cppiRecs[0].Lang)) ||
        null;
      const rol3 = (jpRecs[0] && s(jpRecs[0].ROL3)) || (cppiRecs[0] && s(cppiRecs[0].ROL)) || null;
      const affinityBloc = (jpRecs[0] && s(jpRecs[0].AffinityBloc)) || (cppiRecs[0] && s(cppiRecs[0].Affbloc)) || null;
      const peopleCluster = (jpRecs[0] && s(jpRecs[0].PeopleCluster)) || (cppiRecs[0] && s(cppiRecs[0].PplClstr)) || null;

      // Total population: JP-preferred → else most-recent CPPI (UpdatedDate) → else max.
      const totalPopulation = resolvePopulation(jpRecs, cppiRecs);

      const sourceTypes = [];
      if (m.jpIds.length) sourceTypes.push('JP');
      if (m.cppiIds.length) sourceTypes.push('CPPI');

      // Primary location: JP point preferred, else CPPI point.
      const primary = pickPrimaryPoint(jpRecs, cppiRecs);
      const primaryLocation = primary ? { type: 'Point', coordinates: [primary.lng, primary.lat] } : null;

      // Status summary (JP reached-status authoritative).
      const st = deriveStatus(jpRecs[0] || null, cppiRecs[0] || null);
      const statusSummary = { status: st.status, jpScale: st.jpScale, leastReached: st.leastReached };

      m._computed = { canonicalName, st, primary, sourceTypes, primaryLocation };

      masterOps.push({
        updateOne: {
          filter: { groupNaturalKey: m.groupNaturalKey },
          update: {
            $setOnInsert: { _id: new mongoose.Types.ObjectId() },
            $set: {
              groupNaturalKey: m.groupNaturalKey,
              canonicalName,
              rop3: rop3 || null,
              rop2: rop2 || null,
              rop1: rop1 || null,
              primaryCountryCode,
              primaryLanguageName,
              rol3: rol3 || null,
              affinityBloc: affinityBloc || null,
              peopleCluster: peopleCluster || null,
              totalPopulation: totalPopulation || 0,
              sourceTypes,
              primaryLocation,
              status: statusSummary,
              migrationRunId: `run-${started}`,
              version: MIGRATION_VERSION,
            },
          },
          upsert: true,
        },
      });
      if (masterOps.length >= BULK) await flushMasters();
    }
    await flushMasters();

    // Resolve master _ids by groupNaturalKey.
    console.log('Resolving master ids…');
    {
      const keys = masters.map((m) => m.groupNaturalKey);
      for (let i = 0; i < keys.length; i += 5000) {
        const chunk = keys.slice(i, i + 5000);
        const found = await MasterPeople.find({ groupNaturalKey: { $in: chunk } }, { _id: 1, groupNaturalKey: 1 }).lean();
        for (const d of found) masterIdByKey.set(d.groupNaturalKey, d._id);
      }
    }

    // ── WRITE PHASE E: sources, matches, aliases, locations, statuses ──────
    console.log('Writing people_sources…');
    let sourcesWritten = 0;
    let sourceOps = [];
    const flushSources = async () => {
      if (!sourceOps.length) return;
      await PeopleSource.bulkWrite(sourceOps, { ordered: false });
      sourcesWritten += sourceOps.length;
      sourceOps = [];
    };

    // source _id lookup after write (needed for matches/aliases/locations refs).
    for (const m of masters) {
      const masterId = masterIdByKey.get(m.groupNaturalKey);
      if (!masterId) continue;
      for (const jpId of m.jpIds) {
        const rec = jpById.get(jpId).record;
        const row = jpById.get(jpId);
        sourceOps.push(buildJpSourceOp(masterId, rec, row.iso3));
      }
      for (const cppiId of m.cppiIds) {
        const rec = cppiById.get(cppiId).record;
        const row = cppiById.get(cppiId);
        sourceOps.push(buildCppiSourceOp(masterId, rec, row.iso3));
      }
      if (sourceOps.length >= BULK) await flushSources();
    }
    await flushSources();

    // Build source _id lookup: (sourceType, sourceRecordId) -> _id
    console.log('Resolving source ids…');
    const sourceIdByKey = new Map();
    {
      const jpKeys = jpRows.map((r) => s(r.record.PeopleID3));
      const cppiKeys = cppiRows.map((r) => s(r.record.PEID));
      for (let i = 0; i < jpKeys.length; i += 5000) {
        const chunk = jpKeys.slice(i, i + 5000);
        const found = await PeopleSource.find({ sourceType: 'JP', sourceRecordId: { $in: chunk } }, { _id: 1, sourceRecordId: 1 }).lean();
        for (const d of found) sourceIdByKey.set(`JP:${d.sourceRecordId}`, d._id);
      }
      for (let i = 0; i < cppiKeys.length; i += 5000) {
        const chunk = cppiKeys.slice(i, i + 5000);
        const found = await PeopleSource.find({ sourceType: 'CPPI', sourceRecordId: { $in: chunk } }, { _id: 1, sourceRecordId: 1 }).lean();
        for (const d of found) sourceIdByKey.set(`CPPI:${d.sourceRecordId}`, d._id);
      }
    }

    // Rebuild matches/aliases/locations for the masters we touched (idempotent).
    const touchedMasterIds = masters.map((m) => masterIdByKey.get(m.groupNaturalKey)).filter(Boolean);
    console.log('Refreshing people_matches / people_aliases / people_locations for touched masters…');
    for (let i = 0; i < touchedMasterIds.length; i += 5000) {
      const chunk = touchedMasterIds.slice(i, i + 5000);
      await Promise.all([
        PeopleMatch.deleteMany({ masterPeopleId: { $in: chunk } }),
        PeopleAlias.deleteMany({ masterPeopleId: { $in: chunk } }),
        PeopleLocation.deleteMany({ masterPeopleId: { $in: chunk } }),
      ]);
    }

    console.log('Writing people_matches…');
    let matchesWritten = 0;
    let matchDocs = [];
    const flushMatches = async () => {
      if (!matchDocs.length) return;
      await PeopleMatch.insertMany(matchDocs, { ordered: false });
      matchesWritten += matchDocs.length;
      matchDocs = [];
    };
    for (const m of masters) {
      const masterId = masterIdByKey.get(m.groupNaturalKey);
      if (!masterId) continue;
      for (const mt of m.matches) {
        matchDocs.push({
          masterPeopleId: masterId,
          fromSourceId: mt.fromJpId ? sourceIdByKey.get(`JP:${mt.fromJpId}`) || null : null,
          toSourceId: mt.toCppiId ? sourceIdByKey.get(`CPPI:${mt.toCppiId}`) || null : null,
          matchType: mt.matchType,
          matchTier: mt.matchTier,
          confidence: mt.confidence,
          confidenceBand: mt.confidenceBand,
          crossReferenceType: mt.crossReferenceType || null,
          decidedBy: mt.confidenceBand === 'MANUAL_REVIEW' ? 'pending' : 'system',
        });
      }
      if (matchDocs.length >= BULK) await flushMatches();
    }
    // matches referencing a CPPI-only decision need a valid toSourceId; skip null toSource.
    matchDocs = matchDocs.filter((d) => d.toSourceId);
    await flushMatches();

    console.log('Writing people_aliases…');
    let aliasesWritten = 0;
    let aliasDocs = [];
    const flushAliases = async () => {
      if (!aliasDocs.length) return;
      await PeopleAlias.insertMany(aliasDocs, { ordered: false });
      aliasesWritten += aliasDocs.length;
      aliasDocs = [];
    };
    for (const m of masters) {
      const masterId = masterIdByKey.get(m.groupNaturalKey);
      if (!masterId) continue;
      const seen = new Set();
      const pushAlias = (alias, aliasType, sourceType, sourceId, languageCode) => {
        const val = s(alias);
        if (!val || isBlank(val)) return;
        const dedupe = `${aliasType}|${normName(val)}`;
        if (seen.has(dedupe)) return;
        seen.add(dedupe);
        aliasDocs.push({ masterPeopleId: masterId, sourceId: sourceId || null, alias: val, aliasType, sourceType: sourceType || null, languageCode: languageCode || null });
      };
      for (const jpId of m.jpIds) {
        const rec = jpById.get(jpId).record;
        const sid = sourceIdByKey.get(`JP:${jpId}`) || null;
        const lang = s(rec.ROL3) || null;
        pushAlias(rec.PeopNameAcrossCountries, 'NAME_ACROSS', 'JP', sid, lang);
        pushAlias(rec.PeopNameInCountry, 'NAME_IN_COUNTRY', 'JP', sid, lang);
        if (s(rec.ROP3)) pushAlias(rec.ROP3, 'ROP3', 'JP', sid, null);
      }
      for (const cppiId of m.cppiIds) {
        const rec = cppiById.get(cppiId).record;
        const sid = sourceIdByKey.get(`CPPI:${cppiId}`) || null;
        const lang = s(rec.ROL) || null;
        pushAlias(rec.Name, 'ALTERNATE', 'CPPI', sid, lang);
        pushAlias(rec.NmDisp, 'DISPLAY', 'CPPI', sid, lang);
        // NmAlt may hold multiple comma-separated alternates.
        if (!isBlank(rec.NmAlt)) {
          for (const alt of s(rec.NmAlt).split(',')) pushAlias(alt, 'ALTERNATE', 'CPPI', sid, lang);
        }
        if (s(rec.ROP3)) pushAlias(rec.ROP3, 'ROP3', 'CPPI', sid, null);
        if (s(rec.PGID)) pushAlias(rec.PGID, 'PGID', 'CPPI', sid, null);
        if (s(rec.PEID)) pushAlias(rec.PEID, 'PEID', 'CPPI', sid, null);
      }
      if (aliasDocs.length >= BULK) await flushAliases();
    }
    await flushAliases();

    console.log('Writing people_locations…');
    let locationsWritten = 0;
    let locDocs = [];
    const flushLocs = async () => {
      if (!locDocs.length) return;
      await PeopleLocation.insertMany(locDocs, { ordered: false });
      locationsWritten += locDocs.length;
      locDocs = [];
    };
    for (const m of masters) {
      const masterId = masterIdByKey.get(m.groupNaturalKey);
      if (!masterId) continue;
      const primary = m._computed ? m._computed.primary : pickPrimaryPoint(m.jpIds.map((id) => jpById.get(id).record), m.cppiIds.map((id) => cppiById.get(id).record));
      const isPrimaryPoint = (lat, lng, sourceType) =>
        !!primary && primary.lat === lat && primary.lng === lng && primary.sourceType === sourceType;
      for (const jpId of m.jpIds) {
        const rec = jpById.get(jpId).record;
        const row = jpById.get(jpId);
        const g = jpGeo(rec);
        if (!g) continue;
        locDocs.push({
          masterPeopleId: masterId,
          sourceId: sourceIdByKey.get(`JP:${jpId}`) || null,
          geom: { type: 'Point', coordinates: [g.lng, g.lat] },
          latitude: g.lat,
          longitude: g.lng,
          countryCode: row.iso3,
          isPrimary: isPrimaryPoint(g.lat, g.lng, 'JP'),
          sourceType: 'JP',
        });
      }
      for (const cppiId of m.cppiIds) {
        const rec = cppiById.get(cppiId).record;
        const row = cppiById.get(cppiId);
        const g = cppiGeo(rec);
        if (!g) continue;
        locDocs.push({
          masterPeopleId: masterId,
          sourceId: sourceIdByKey.get(`CPPI:${cppiId}`) || null,
          geom: { type: 'Point', coordinates: [g.lng, g.lat] },
          latitude: g.lat,
          longitude: g.lng,
          countryCode: row.iso3,
          isPrimary: isPrimaryPoint(g.lat, g.lng, 'CPPI'),
          sourceType: 'CPPI',
        });
      }
      if (locDocs.length >= BULK) await flushLocs();
    }
    await flushLocs();

    console.log('Writing people_statuses…');
    let statusesWritten = 0;
    let statusOps = [];
    const flushStatuses = async () => {
      if (!statusOps.length) return;
      await PeopleStatus.bulkWrite(statusOps, { ordered: false });
      statusesWritten += statusOps.length;
      statusOps = [];
    };
    for (const m of masters) {
      const masterId = masterIdByKey.get(m.groupNaturalKey);
      if (!masterId) continue;
      const jpRec = m.jpIds.length ? jpById.get(m.jpIds[0]).record : null;
      const cppiRec = m.cppiIds.length ? cppiById.get(m.cppiIds[0]).record : null;
      const st = deriveStatus(jpRec, cppiRec);
      statusOps.push({
        updateOne: {
          filter: { masterPeopleId: masterId },
          update: {
            $set: {
              masterPeopleId: masterId,
              status: st.status,
              jpScale: st.jpScale,
              leastReached: st.leastReached,
              frontier: st.frontier,
              percentEvangelical: st.percentEvangelical,
              percentChristian: st.percentChristian,
              engagementStatus: st.engagementStatus,
              bibleStatus: st.bibleStatus,
              derivedFromSource: st.derivedFromSource,
            },
          },
          upsert: true,
        },
      });
      if (statusOps.length >= BULK) await flushStatuses();
    }
    await flushStatuses();

    // ── RECONCILIATION REPORT ──────────────────────────────────────────────
    printReport(
      {
        jpRows: jpRows.length,
        cppiRows: cppiRows.length,
        xrefLinks: xrefLinks.length,
        effectiveXrefLinks,
        mastersCreated: masters.length,
        autoMerge: cntAutoMerge,
        manualReview: cntManualReview,
        keepSeparate: cntKeepSeparate,
        sourcesWritten,
        aliasesWritten,
        locationsWritten,
        statusesWritten,
      },
      started,
      false
    );
  } finally {
    await mongoose.disconnect();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING (Tiers 2–5; omits the +25 internal-id contribution)
// ─────────────────────────────────────────────────────────────────────────────
function scorePair(jpRow, cppiRow) {
  const jp = jpRow.record;
  const cppi = cppiRow.record;
  let sScore = 0;
  let dominantTier = 5;
  const jpRop3 = s(jp.ROP3);
  const cppiRop3 = s(cppi.ROP3);

  // Tier 2: exact ROP3 (internal-id +25 omitted by design for tiers 2–5).
  if (jpRop3 && cppiRop3) {
    if (jpRop3 === cppiRop3) {
      sScore += PTS_ROP3_MATCH;
      dominantTier = Math.min(dominantTier, 2);
    } else {
      sScore += PTS_ROP3_CONFLICT;
    }
  }

  // Tier 3: country
  if (jpRow.iso3 && cppiRow.iso3 && jpRow.iso3 === cppiRow.iso3) {
    sScore += PTS_COUNTRY_MATCH;
    dominantTier = Math.min(dominantTier, 3);
  } else {
    sScore += PTS_COUNTRY_MISMATCH;
  }

  // Tier 4: name similarity (SIGNAL ONLY; never decisive alone)
  const sim = trigramSimilarity(jpBestName(jp), cppiBestName(cppi));
  if (sim >= 0.85) {
    sScore += PTS_NAME_HIGH;
    dominantTier = Math.min(dominantTier, 4);
  } else if (sim >= 0.6) {
    sScore += PTS_NAME_MED;
    dominantTier = Math.min(dominantTier, 4);
  }

  // Tier 5: geographic proximity (<= 25km)
  const g1 = jpGeo(jp);
  const g2 = cppiGeo(cppi);
  if (g1 && g2 && haversineKm(g1.lat, g1.lng, g2.lat, g2.lng) <= PROX_RADIUS_KM) {
    sScore += PTS_GEO;
    dominantTier = Math.min(dominantTier, 5);
  }

  sScore = clamp(sScore, 0, 100);
  const matchType = tierName(dominantTier);
  return { score: sScore, tier: dominantTier, matchType };
}

// tierName is now imported from ./lib/peopleMatcher (see require at the top of this file).

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function resolvePopulation(jpRecs, cppiRecs) {
  // JP-preferred → else most-recent CPPI (UpdatedDate) → else max.
  const jpPops = jpRecs.map((r) => toNumber(r.Population)).filter((n) => n !== null && n > 0);
  if (jpPops.length) return Math.max(...jpPops);
  // most-recent CPPI
  let best = null;
  for (const r of cppiRecs) {
    const pop = toNumber(r.Pop);
    if (pop === null) continue;
    const t = Date.parse(s(r.UpdatedDate)) || 0;
    if (!best || t > best.t) best = { pop, t };
  }
  if (best) return best.pop;
  const cppiPops = cppiRecs.map((r) => toNumber(r.Pop)).filter((n) => n !== null && n > 0);
  return cppiPops.length ? Math.max(...cppiPops) : 0;
}

function pickPrimaryPoint(jpRecs, cppiRecs) {
  // JP geo preferred (most complete), else CPPI.
  for (const r of jpRecs) {
    const g = jpGeo(r);
    if (g) return { lat: g.lat, lng: g.lng, sourceType: 'JP' };
  }
  for (const r of cppiRecs) {
    const g = cppiGeo(r);
    if (g) return { lat: g.lat, lng: g.lng, sourceType: 'CPPI' };
  }
  return null;
}

function countJpAliases(rec) {
  let c = 0;
  if (!isBlank(rec.PeopNameAcrossCountries)) c++;
  if (!isBlank(rec.PeopNameInCountry)) c++;
  if (s(rec.ROP3)) c++;
  return c;
}
function countCppiAliases(rec) {
  let c = 0;
  if (!isBlank(rec.Name)) c++;
  if (!isBlank(rec.NmDisp)) c++;
  if (!isBlank(rec.NmAlt)) c += s(rec.NmAlt).split(',').filter((x) => s(x)).length;
  if (s(rec.ROP3)) c++;
  if (s(rec.PGID)) c++;
  if (s(rec.PEID)) c++;
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE UPSERT BUILDERS (Phase E) — full row into rawAttributes
// ─────────────────────────────────────────────────────────────────────────────
function buildJpSourceOp(masterId, rec, iso3) {
  const recordId = s(rec.PeopleID3);
  return {
    updateOne: {
      filter: { sourceType: 'JP', sourceRecordId: recordId },
      update: {
        $set: {
          masterPeopleId: masterId,
          sourceType: 'JP',
          sourceRecordId: recordId,
          peopleId3: s(rec.PeopleID3) || null,
          peopleId2: s(rec.PeopleID2) || null,
          peopleId1: s(rec.PeopleID1) || null,
          peid: null,
          pgid: null,
          rop3: s(rec.ROP3) || null,
          rop2: s(rec.ROP2) || null,
          rop1: s(rec.ROP1) || null,
          countryCode: iso3,
          countryName: s(rec.Ctry) || null,
          sourceName: s(rec.PeopNameInCountry) || null,
          population: toNumber(rec.Population),
          rawAttributes: rec,
          sourceUpdatedAt: null,
        },
        $setOnInsert: { importedAt: new Date() },
      },
      upsert: true,
    },
  };
}

function buildCppiSourceOp(masterId, rec, iso3) {
  const recordId = s(rec.PEID);
  const updated = s(rec.UpdatedDate);
  const updatedAt = updated && !Number.isNaN(Date.parse(updated)) ? new Date(updated) : null;
  return {
    updateOne: {
      filter: { sourceType: 'CPPI', sourceRecordId: recordId },
      update: {
        $set: {
          masterPeopleId: masterId,
          sourceType: 'CPPI',
          sourceRecordId: recordId,
          peopleId3: null,
          peopleId2: null,
          peopleId1: null,
          peid: s(rec.PEID) || null,
          pgid: s(rec.PGID) || null,
          rop3: s(rec.ROP3) || null,
          rop2: s(rec.ROP2) || null,
          rop1: s(rec.ROP1) || null,
          countryCode: iso3,
          countryName: s(rec.Ctry) || null,
          sourceName: (!isBlank(rec.NmDisp) && s(rec.NmDisp)) || (!isBlank(rec.Name) && s(rec.Name)) || null,
          population: toNumber(rec.Pop),
          rawAttributes: rec,
          sourceUpdatedAt: updatedAt,
        },
        $setOnInsert: { importedAt: new Date() },
      },
      upsert: true,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTING
// ─────────────────────────────────────────────────────────────────────────────
function printReport(stats, started, dryRun) {
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`RECONCILIATION REPORT${dryRun ? ' (DRY-RUN — no writes)' : ''}`);
  console.log(line);
  console.log(`  JP rows parsed:            ${stats.jpRows}`);
  console.log(`  CPPI rows parsed:          ${stats.cppiRows}`);
  console.log(`  XREF links (both ids):     ${stats.xrefLinks}`);
  console.log(`  XREF links applied:        ${stats.effectiveXrefLinks}`);
  console.log(`  Masters created:           ${stats.mastersCreated}`);
  console.log(`    AUTO_MERGE groups:       ${stats.autoMerge}`);
  console.log(`    MANUAL_REVIEW merges:    ${stats.manualReview}`);
  console.log(`    KEEP_SEPARATE masters:   ${stats.keepSeparate}`);
  console.log(`  people_sources written:    ${stats.sourcesWritten}`);
  console.log(`  people_aliases written:    ${stats.aliasesWritten}`);
  console.log(`  people_locations written:  ${stats.locationsWritten}`);
  console.log(`  people_statuses written:   ${stats.statusesWritten}`);
  console.log(line);
  console.log(`  Elapsed: ${secs}s`);
  console.log(`${line}\n`);
}

async function printVerify() {
  const line = '─'.repeat(60);
  const [mp, ps, pm, pa, pl, pst] = await Promise.all([
    MasterPeople.countDocuments({}),
    PeopleSource.countDocuments({}),
    PeopleMatch.countDocuments({}),
    PeopleAlias.countDocuments({}),
    PeopleLocation.countDocuments({}),
    PeopleStatus.countDocuments({}),
  ]);
  console.log(`\n${line}`);
  console.log('VERIFY — per-collection document counts');
  console.log(line);
  console.log(`  master_people:    ${mp}`);
  console.log(`  people_sources:   ${ps}`);
  console.log(`  people_matches:   ${pm}`);
  console.log(`  people_aliases:   ${pa}`);
  console.log(`  people_locations: ${pl}`);
  console.log(`  people_statuses:  ${pst}`);
  console.log(`${line}\n`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
