/**
 * applyDmmMapping.js — apply the human-completed mapping worksheet produced by
 * buildDmmMappingCsv.js. For each row where chosenRop3 (preferred) or chosenName
 * is filled, resolve the reference attributes (from JP/CPPI master, cross-ref
 * XLSX, or IMB CSV) and write them onto the matching DMM master's referenceData.
 *
 * CSV (';' delimiter): dmmName;chosenRop3;chosenName;candidate1;candidate2;candidate3
 *
 * Usage:
 *   node backend/scripts/applyDmmMapping.js --country=CM [--file=data/dmm_cm_mapping.csv] [--dry-run]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const { COUNTRY_CONFIG } = require('../routes/countries');

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const COUNTRY = (() => { const a = ARGS.find((x) => x.startsWith('--country=')); return (a ? a.split('=')[1] : 'CM').trim().toUpperCase(); })();
const FILE = (() => { const a = ARGS.find((x) => x.startsWith('--file=')); return a ? a.split('=')[1] : path.join('data', `dmm_${COUNTRY.toLowerCase()}_mapping.csv`); })();

const IMB_CSV = path.join(__dirname, '..', 'data', 'people_groups.csv');
const XREF_XLSX = path.join(__dirname, '..', 'data', 'jp-cppi-cross-reference.xlsx');
const norm = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = (v) => { const n = Number(String(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : null; };

function loadImb(iso3) {
  const byRop3 = new Map(); const byName = new Map();
  if (!fs.existsSync(IMB_CSV)) return { byRop3, byName };
  const lines = fs.readFileSync(IMB_CSV, 'utf8').replace(/^\ufeff/, '').split(/\r?\n/);
  const h = lines[0].split(';');
  const gi = (n) => h.indexOf(n);
  const iName = gi('Name'), iIso = gi('ISOalpha3'), iPop = gi('Pop'), iLang = gi('Lang'), iRlgn = gi('Rlgn'), iRop3 = gi('ROP3'), iLat = gi('Latitude'), iLng = gi('Longitude');
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = lines[i].split(';');
    if ((c[iIso] || '').toUpperCase() !== iso3) continue;
    const rec = { source: 'PeopleGroups.org', rop3: c[iRop3] || null, population: num(c[iPop]), primaryLanguage: c[iLang] || null, primaryReligion: c[iRlgn] || null, latitude: num(c[iLat]), longitude: num(c[iLng]), matchedName: c[iName] };
    if (rec.rop3) byRop3.set(String(rec.rop3), rec);
    if (c[iName]) byName.set(norm(c[iName]), rec);
  }
  return { byRop3, byName };
}

function loadXref(iso3) {
  const byRop3 = new Map(); const byName = new Map();
  let XLSX; try { XLSX = require('xlsx'); } catch { return { byRop3, byName }; }
  if (!fs.existsSync(XREF_XLSX)) return { byRop3, byName };
  const wb = XLSX.readFile(XREF_XLSX);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
  const cfg = Object.values(COUNTRY_CONFIG).find((c) => c.code3 === iso3);
  const wantNames = new Set([cfg && cfg.nameEn, cfg && cfg.name].filter(Boolean).map((s) => s.toLowerCase()));
  const wantA2 = cfg ? cfg.code : null;
  for (const r of rows) {
    if (!(wantNames.has(String(r.Ctry || '').toLowerCase()) || String(r.ROG3 || '').toUpperCase() === wantA2)) continue;
    const rec = { source: 'JP+CPPI(xref)', rop3: r.ROP3 ? String(r.ROP3) : null, population: num(r.JPPopulation) ?? num(r.CPPIPopulation), primaryLanguage: r.JPPrimaryLanguage || r.CPPIPrimaryLanguage || null, primaryReligion: r.JPPrimaryReligion || r.CPPIPrimaryReligion || null, jpScale: num(r.JPScale), leastReached: r.JPLeastReached === 'Y', percentChristian: num(r['JP%ChristianAdherent']), percentEvangelical: num(r['JP%Evangelical']), matchedName: r.JPPeopleGroup || r.CPPIPeopleGroup };
    if (rec.rop3) byRop3.set(String(rec.rop3), rec);
    [r.JPPeopleGroup, r.CPPIPeopleGroup].forEach((n) => { const k = norm(n); if (k && !byName.has(k)) byName.set(k, rec); });
  }
  return { byRop3, byName };
}

function parseCsv(file) {
  const p = path.join(__dirname, '..', file);
  const lines = fs.readFileSync(p, 'utf8').replace(/^\ufeff/, '').split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((l) => { const c = l.split(';'); return { dmmName: c[0], chosenRop3: (c[1] || '').trim(), chosenName: (c[2] || '').trim() }; });
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  await mongoose.connect(uri);
  const iso3 = (COUNTRY_CONFIG[COUNTRY] || {}).code3;
  const imb = loadImb(iso3);
  const xref = loadXref(iso3);
  const refMasters = await MasterPeople.find({ primaryCountryCode: iso3, sourceTypes: { $in: ['JP','CPPI'] } }).select('canonicalName rop3 totalPopulation primaryLanguageName status primaryLocation').lean();
  const refByRop3 = new Map(); const refByName = new Map();
  refMasters.forEach((m) => { if (m.rop3) refByRop3.set(String(m.rop3), m); refByName.set(norm(m.canonicalName), m); });

  const rows = parseCsv(FILE).filter((r) => r.chosenRop3 || r.chosenName);
  console.log(`Mapping rows with a choice: ${rows.length}`);

  let applied = 0; const unresolved = [];
  for (const r of rows) {
    let ref = null;
    if (r.chosenRop3) {
      const rm = refByRop3.get(r.chosenRop3);
      if (rm) ref = { source: 'MasterPeople(JP/CPPI)', rop3: rm.rop3, population: rm.totalPopulation || null, primaryLanguage: rm.primaryLanguageName || null, jpScale: rm.status && rm.status.jpScale, leastReached: rm.status && rm.status.leastReached, reachedStatus: rm.status && rm.status.status, matchedName: rm.canonicalName };
      if (!ref && xref.byRop3.get(r.chosenRop3)) ref = xref.byRop3.get(r.chosenRop3);
      if (!ref && imb.byRop3.get(r.chosenRop3)) ref = imb.byRop3.get(r.chosenRop3);
    }
    if (!ref && r.chosenName) {
      const k = norm(r.chosenName);
      const rm = refByName.get(k);
      if (rm) ref = { source: 'MasterPeople(JP/CPPI)', rop3: rm.rop3, population: rm.totalPopulation || null, primaryLanguage: rm.primaryLanguageName || null, jpScale: rm.status && rm.status.jpScale, leastReached: rm.status && rm.status.leastReached, reachedStatus: rm.status && rm.status.status, matchedName: rm.canonicalName };
      if (!ref && xref.byName.get(k)) ref = xref.byName.get(k);
      if (!ref && imb.byName.get(k)) ref = imb.byName.get(k);
    }
    if (!ref) { unresolved.push(r.dmmName); continue; }

    const master = await MasterPeople.findOne({ primaryCountryCode: iso3, canonicalName: r.dmmName, sourceTypes: 'DMM' });
    if (!master) { unresolved.push(`${r.dmmName} (master not found)`); continue; }
    applied++;
    if (!DRY_RUN) {
      const set = { referenceData: { ...ref, matchedBy: 'manual-mapping', updatedAt: new Date() } };
      if (!master.rop3 && ref.rop3) set.rop3 = ref.rop3;
      if ((!master.totalPopulation) && ref.population) set.totalPopulation = ref.population;
      if ((!master.primaryLanguageName || /non déterminé/i.test(master.primaryLanguageName)) && ref.primaryLanguage) set.primaryLanguageName = ref.primaryLanguage;
      if (ref.reachedStatus && (!master.status || !master.status.status || master.status.status === 'UNKNOWN')) set['status.status'] = ref.reachedStatus;
      await MasterPeople.updateOne({ _id: master._id }, { $set: set });
    }
  }
  console.log(`${DRY_RUN ? 'Would apply' : 'Applied'}: ${applied}`);
  if (unresolved.length) { console.log('Unresolved:'); unresolved.forEach((u) => console.log('   - ' + u)); }
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
