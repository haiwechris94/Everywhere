/**
 * enrichDmmMastersFromReference.js — enrich the kept DMM master-peoples with
 * Joshua Project (JP) + IMB/PeopleGroups.org (CPPI) reference attributes.
 *
 * Target masters: every MasterPeople referenced by a remaining DMM/Survey
 * PeopleGroup of the given country (default CM -> CMR). These are the "54"
 * DMM-only masters, currently carrying no reference attributes.
 *
 * Reference sources (in priority order per master):
 *   1. Existing reference MasterPeople in the SAME country (sourceTypes JP/CPPI),
 *      matched by canonicalName (case-insensitive, exact then normalized).
 *   2. IMB CSV rows for the country (backend/data/people_groups.csv, ';' delim),
 *      matched by Name/NmDisp/NmAlt.
 *   3. JP↔CPPI cross-reference (backend/data/jp-cppi-cross-reference.xlsx),
 *      matched by JPPeopleGroup / CPPIPeopleGroup for the country.
 *
 * What it writes on the DMM master (NEVER touches dmmRollup / status.status
 * reached-value unless empty):
 *   - referenceData: { source, rop3, population, primaryLanguage, primaryReligion,
 *       jpScale, leastReached, percentChristian, percentEvangelical, latitude,
 *       longitude, matchedName, matchedBy, updatedAt }
 *   - rop3 (if empty), totalPopulation (if 0), primaryLanguageName (if empty)
 *
 * Usage:
 *   node backend/scripts/enrichDmmMastersFromReference.js --dry-run [--country=CM]
 *   node backend/scripts/enrichDmmMastersFromReference.js            [--country=CM]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const { COUNTRY_CONFIG } = require('../routes/countries');
const { trigramSimilarity } = require('./lib/peopleMatcher');

// Minimum trigram similarity for a fuzzy name match fallback (0..1).
const FUZZY_THRESHOLD = 0.6;

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const COUNTRY = (() => {
  const a = ARGS.find((x) => x.startsWith('--country='));
  return (a ? a.split('=')[1] : 'CM').trim().toUpperCase();
})();

const IMB_CSV = path.join(__dirname, '..', 'data', 'people_groups.csv');
const XREF_XLSX = path.join(__dirname, '..', 'data', 'jp-cppi-cross-reference.xlsx');

const norm = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = (v) => { const n = Number(String(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : null; };

// ── Parse the IMB CSV (semicolon-delimited) into rows keyed by normalized name.
function loadImbByName(iso3) {
  if (!fs.existsSync(IMB_CSV)) return new Map();
  const raw = fs.readFileSync(IMB_CSV, 'utf8').replace(/^\ufeff/, '');
  const lines = raw.split(/\r?\n/);
  const header = lines[0].split(';');
  const idx = (name) => header.indexOf(name);
  const iName = idx('Name'), iDisp = idx('NmDisp'), iAlt = idx('NmAlt'), iIso = idx('ISOalpha3');
  const iPop = idx('Pop'), iRol = idx('ROL'), iLang = idx('Lang'), iRlgn = idx('Rlgn');
  const iRop3 = idx('ROP3'), iLat = idx('Latitude'), iLng = idx('Longitude'), iPEID = idx('PEID');
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    // naive split is fine for the columns we read (they precede the quoted photo blob)
    const cols = lines[i].split(';');
    if ((cols[iIso] || '').toUpperCase() !== iso3) continue;
    const rec = {
      source: 'PeopleGroups.org',
      peid: cols[iPEID],
      rop3: cols[iRop3] || null,
      population: num(cols[iPop]),
      primaryLanguage: cols[iLang] || null,
      primaryReligion: cols[iRlgn] || null,
      latitude: num(cols[iLat]),
      longitude: num(cols[iLng]),
      matchedName: cols[iName],
    };
    [cols[iName], cols[iDisp], cols[iAlt]].forEach((n) => {
      const key = norm(n);
      if (key && !map.has(key)) map.set(key, rec);
    });
  }
  return map;
}

// ── Parse the XLSX cross-reference into rows keyed by normalized JP & CPPI names.
function loadXrefByName(iso3) {
  const map = new Map();
  let XLSX;
  try { XLSX = require('xlsx'); } catch { return map; }
  if (!fs.existsSync(XREF_XLSX)) return map;
  const wb = XLSX.readFile(XREF_XLSX);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  // Country in the xref is by name (Ctry) or ROG3 code; match on config name/alpha-2.
  const cfg = Object.values(COUNTRY_CONFIG).find((c) => c.code3 === iso3);
  const wantNames = new Set([cfg && cfg.nameEn, cfg && cfg.name].filter(Boolean).map((s) => s.toLowerCase()));
  const wantA2 = cfg ? cfg.code : null;
  for (const r of rows) {
    const ctry = String(r.Ctry || '').toLowerCase();
    const rog3 = String(r.ROG3 || '').toUpperCase();
    if (!(wantNames.has(ctry) || rog3 === wantA2)) continue;
    const rec = {
      source: 'JP+CPPI(xref)',
      rop3: r.ROP3 ? String(r.ROP3) : null,
      population: num(r.JPPopulation) ?? num(r.CPPIPopulation),
      primaryLanguage: r.JPPrimaryLanguage || r.CPPIPrimaryLanguage || null,
      primaryReligion: r.JPPrimaryReligion || r.CPPIPrimaryReligion || null,
      jpScale: num(r.JPScale),
      leastReached: r.JPLeastReached === 'Y',
      percentChristian: num(r['JP%ChristianAdherent']),
      percentEvangelical: num(r['JP%Evangelical']),
      matchedName: r.JPPeopleGroup || r.CPPIPeopleGroup,
    };
    [r.JPPeopleGroup, r.CPPIPeopleGroup].forEach((n) => {
      const key = norm(n);
      if (key && !map.has(key)) map.set(key, rec);
    });
  }
  return map;
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  console.log(`Connecting${DRY_RUN ? ' (DRY-RUN)' : ''}... country=${COUNTRY}`);
  await mongoose.connect(uri);
  console.log('Connected.\n');

  const cfg = COUNTRY_CONFIG[COUNTRY];
  const iso3 = cfg ? cfg.code3 : null;
  if (!iso3) { console.error(`Unknown country ${COUNTRY}`); process.exit(1); }

  // Kept DMM masters = referenced by remaining DMM engagements of this country.
  const engs = await PeopleGroup.find({ countryCode: COUNTRY, source: { $in: ['DMM', 'Survey', 'manual'] }, masterPeopleId: { $ne: null } })
    .select('masterPeopleId').lean();
  const ids = [...new Set(engs.map((e) => String(e.masterPeopleId)))].map((s) => new mongoose.Types.ObjectId(s));
  const masters = await MasterPeople.find({ _id: { $in: ids } })
    .select('canonicalName rop3 primaryCountryCode sourceTypes totalPopulation primaryLanguageName status').lean();
  console.log(`Kept DMM masters to enrich: ${masters.length}`);

  // Reference source 1: existing JP/CPPI masters in same country, by name.
  const refMasters = await MasterPeople.find({
    primaryCountryCode: iso3,
    sourceTypes: { $in: ['JP', 'CPPI'] },
  }).select('canonicalName rop3 totalPopulation primaryLanguageName status primaryLocation').lean();
  const refByName = new Map();
  for (const m of refMasters) {
    const key = norm(m.canonicalName);
    if (key && !refByName.has(key)) refByName.set(key, m);
  }
  console.log(`Reference JP/CPPI masters (${iso3}): ${refMasters.length}`);

  const imbByName = loadImbByName(iso3);
  console.log(`IMB CSV rows indexed (${iso3}): ${imbByName.size}`);
  const xrefByName = loadXrefByName(iso3);
  console.log(`Cross-ref rows indexed (${iso3}): ${xrefByName.size}\n`);

  // Shape a reference master (JP/CPPI MasterPeople doc) into the referenceData record.
  const refFromMaster = (rm) => ({
    source: 'MasterPeople(JP/CPPI)',
    rop3: rm.rop3 || null,
    population: rm.totalPopulation || null,
    primaryLanguage: rm.primaryLanguageName || null,
    primaryReligion: null,
    jpScale: rm.status ? rm.status.jpScale : null,
    leastReached: rm.status ? rm.status.leastReached : null,
    percentChristian: null,
    percentEvangelical: null,
    reachedStatus: rm.status ? rm.status.status : null,
    latitude: rm.primaryLocation ? rm.primaryLocation.coordinates[1] : null,
    longitude: rm.primaryLocation ? rm.primaryLocation.coordinates[0] : null,
    matchedName: rm.canonicalName,
  });

  // Best fuzzy match over a Map<normName, record>; returns { rec, score } or null.
  const bestFuzzy = (map, key) => {
    let best = null;
    let bestScore = 0;
    for (const [k, rec] of map) {
      const score = trigramSimilarity(key, k);
      if (score > bestScore) { bestScore = score; best = rec; }
    }
    return bestScore >= FUZZY_THRESHOLD ? { rec: best, score: bestScore } : null;
  };

  let enriched = 0, noMatch = 0;
  let fuzzyCount = 0;
  const noMatchNames = [];

  for (const m of masters) {
    const key = norm(m.canonicalName);
    let ref = null;
    let matchedBy = null;

    // 1) exact name — existing reference master (JP/CPPI)
    if (refByName.get(key)) { ref = refFromMaster(refByName.get(key)); matchedBy = 'ref-master-name'; }
    // 2) exact name — cross-reference
    if (!ref && xrefByName.get(key)) { ref = xrefByName.get(key); matchedBy = 'xref-name'; }
    // 3) exact name — IMB CSV
    if (!ref && imbByName.get(key)) { ref = imbByName.get(key); matchedBy = 'imb-name'; }

    // 4) FUZZY fallback (handles spelling variants: Toupouri/Tupuri, Mofou/Mofu,
    //    Guiziga/Giziga, Moudang/Moundang, ...). Try ref-masters, then xref, then IMB.
    if (!ref) {
      const fm = bestFuzzy(refByName, key);
      if (fm) { ref = refFromMaster(fm.rec); matchedBy = `ref-master-fuzzy(${fm.score.toFixed(2)})`; }
    }
    if (!ref) {
      const fx = bestFuzzy(xrefByName, key);
      if (fx) { ref = fx.rec; matchedBy = `xref-fuzzy(${fx.score.toFixed(2)})`; }
    }
    if (!ref) {
      const fi = bestFuzzy(imbByName, key);
      if (fi) { ref = fi.rec; matchedBy = `imb-fuzzy(${fi.score.toFixed(2)})`; }
    }
    if (ref && /fuzzy/.test(matchedBy)) fuzzyCount++;

    if (!ref) { noMatch++; noMatchNames.push(m.canonicalName); continue; }

    enriched++;
    if (!DRY_RUN) {
      const set = {
        referenceData: { ...ref, matchedBy, updatedAt: new Date() },
      };
      if (!m.rop3 && ref.rop3) set.rop3 = ref.rop3;
      if ((!m.totalPopulation || m.totalPopulation === 0) && ref.population) set.totalPopulation = ref.population;
      if ((!m.primaryLanguageName || /non déterminé/i.test(m.primaryLanguageName)) && ref.primaryLanguage) set.primaryLanguageName = ref.primaryLanguage;
      // Only fill reached-status when currently UNKNOWN/empty (never overwrite).
      if (ref.reachedStatus && (!m.status || !m.status.status || m.status.status === 'UNKNOWN')) {
        set['status.status'] = ref.reachedStatus;
      }
      await MasterPeople.updateOne({ _id: m._id }, { $set: set });
    }
  }

  console.log('──────── Enrichment summary ────────');
  console.log(`${DRY_RUN ? 'Would enrich' : 'Enriched'}: ${enriched}`);
  console.log(`No reference match:  ${noMatch}`);
  if (noMatchNames.length) {
    console.log('\nMasters without a reference match:');
    noMatchNames.forEach((n) => console.log(`   - ${n}`));
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}
run().catch((e) => { console.error('Enrichment failed:', e); process.exit(1); });
