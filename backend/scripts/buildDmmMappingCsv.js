/**
 * buildDmmMappingCsv.js — produce a manual mapping worksheet for the DMM masters
 * that could NOT be auto-matched to a JP/IMB reference. For each unmatched master
 * it lists the top candidate reference names (with ROP3 + similarity) so a human
 * can pick the right one, then feed it back via applyDmmMapping.js.
 *
 * Output CSV columns (';' delimiter):
 *   dmmName ; chosenRop3 ; chosenName ; candidate1 ; candidate2 ; candidate3
 * Fill `chosenRop3` (preferred) or `chosenName` for each row you can resolve;
 * leave blank to skip. Candidates are suggestions only.
 *
 * Usage:
 *   node backend/scripts/buildDmmMappingCsv.js [--country=CM] [--out=data/dmm_cm_mapping.csv]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const { COUNTRY_CONFIG } = require('../routes/countries');
const { trigramSimilarity } = require('./lib/peopleMatcher');

const ARGS = process.argv.slice(2);
const COUNTRY = (() => { const a = ARGS.find((x) => x.startsWith('--country=')); return (a ? a.split('=')[1] : 'CM').trim().toUpperCase(); })();
const OUT = (() => { const a = ARGS.find((x) => x.startsWith('--out=')); return a ? a.split('=')[1] : path.join('data', `dmm_${COUNTRY.toLowerCase()}_mapping.csv`); })();

const IMB_CSV = path.join(__dirname, '..', 'data', 'people_groups.csv');
const norm = (v) => String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function loadImbNames(iso3) {
  const out = []; // { name, rop3 }
  if (!fs.existsSync(IMB_CSV)) return out;
  const lines = fs.readFileSync(IMB_CSV, 'utf8').replace(/^\ufeff/, '').split(/\r?\n/);
  const h = lines[0].split(';');
  const iName = h.indexOf('Name'), iIso = h.indexOf('ISOalpha3'), iRop3 = h.indexOf('ROP3');
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = lines[i].split(';');
    if ((c[iIso] || '').toUpperCase() !== iso3) continue;
    if (c[iName]) out.push({ name: c[iName], rop3: c[iRop3] || '' });
  }
  return out;
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  await mongoose.connect(uri);
  const iso3 = (COUNTRY_CONFIG[COUNTRY] || {}).code3;

  const engs = await PeopleGroup.find({ countryCode: COUNTRY, source: { $in: ['DMM','Survey','manual'] }, masterPeopleId: { $ne: null } }).select('masterPeopleId').lean();
  const ids = [...new Set(engs.map((e) => String(e.masterPeopleId)))].map((s) => new mongoose.Types.ObjectId(s));
  const masters = await MasterPeople.find({ _id: { $in: ids } }).select('canonicalName referenceData').lean();
  const unmatched = masters.filter((m) => !m.referenceData);

  // Candidate pool: JP/CPPI reference masters + IMB names for this country.
  const refMasters = await MasterPeople.find({ primaryCountryCode: iso3, sourceTypes: { $in: ['JP','CPPI'] } }).select('canonicalName rop3').lean();
  const pool = [
    ...refMasters.map((r) => ({ name: r.canonicalName, rop3: r.rop3 || '' })),
    ...loadImbNames(iso3),
  ];

  const rows = ['dmmName;chosenRop3;chosenName;candidate1;candidate2;candidate3'];
  for (const m of unmatched) {
    const key = norm(m.canonicalName);
    const scored = pool
      .map((p) => ({ ...p, s: trigramSimilarity(key, norm(p.name)) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((c) => `${c.name} [${c.rop3 || '-'}] (${c.s.toFixed(2)})`);
    rows.push([m.canonicalName, '', '', ...scored].join(';'));
  }

  const outPath = path.join(__dirname, '..', OUT);
  fs.writeFileSync(outPath, '\ufeff' + rows.join('\n'), 'utf8');
  console.log(`Wrote ${unmatched.length} unmatched rows to ${outPath}`);
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
