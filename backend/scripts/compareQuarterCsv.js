/**
 * compareQuarterCsv.js — DRY compare of a quarterly CSV vs existing CM engagements.
 * Reports, per CSV row, whether the import upsert would UPDATE an existing
 * engagement or CREATE a new one — WITHOUT writing anything.
 *
 * The import upsert key is (name + villageName + country), case-insensitive,
 * source in {DMM,Survey,manual}. This CSV has NO village column, so villageName
 * is treated as empty -> it can only match existing rows that ALSO have empty
 * villageName. We report that risk explicitly.
 *
 * Usage: node backend/scripts/compareQuarterCsv.js data/template-cameroun-CM.csv
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');

const FILE = process.argv[2] || 'data/template-cameroun-CM.csv';
const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

function parse(file) {
  const raw = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/^\ufeff/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  const header = lines[0].split(';').map((h) => h.trim());
  const iName = header.indexOf('NG_Engagment_Name');
  const iPg = header.indexOf('People_Group');
  const iVillage = header.findIndex((h) => /village/i.test(h));
  return lines.slice(1).map((l) => {
    const c = l.split(';');
    return { name: (c[iName] || '').trim(), peopleGroup: (c[iPg] || '').trim(), village: iVillage >= 0 ? (c[iVillage] || '').trim() : '' };
  }).filter((r) => r.name);
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  await mongoose.connect(uri);

  const rows = parse(FILE);
  console.log(`CSV data rows: ${rows.length}  (village column present: ${rows.some((r) => r.village) ? 'yes' : 'NO'})\n`);

  const existing = await PeopleGroup.find({ countryCode: 'CM', source: { $in: ['DMM','Survey','manual'] } })
    .select('name villageName').lean();
  const byName = new Map();
  existing.forEach((e) => {
    const k = norm(e.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(e);
  });

  let willUpdate = 0, willCreate = 0, ambiguous = 0;
  const creates = [], ambig = [];
  for (const r of rows) {
    const matches = byName.get(norm(r.name)) || [];
    if (matches.length === 0) { willCreate++; creates.push(r.name); continue; }
    // Upsert also keys on villageName. CSV village empty -> matches rows with empty village.
    const csvV = norm(r.village);
    const exact = matches.filter((m) => norm(m.villageName) === csvV);
    if (exact.length >= 1) { willUpdate++; }
    else { ambiguous++; ambig.push(`${r.name} (csv village="${r.village||''}" vs existing villages=[${matches.map((m)=>m.villageName||'').join(', ')}])`); }
  }

  console.log(`WILL UPDATE existing engagement: ${willUpdate}`);
  console.log(`WILL CREATE new (name not found): ${willCreate}`);
  console.log(`AMBIGUOUS (name matches but village differs -> would CREATE a duplicate): ${ambiguous}`);
  if (creates.length) { console.log('\nNames not found in DB (new rows):'); creates.forEach((n) => console.log('   - ' + n)); }
  if (ambig.length) { console.log('\nVillage mismatch (duplicate risk):'); ambig.slice(0, 100).forEach((n) => console.log('   - ' + n)); }

  // Existing engagements NOT present in the CSV (would stay empty / not updated)
  const csvNames = new Set(rows.map((r) => norm(r.name)));
  const missing = existing.filter((e) => !csvNames.has(norm(e.name)));
  console.log(`\nExisting engagements with NO matching CSV row: ${missing.length}`);
  missing.slice(0, 100).forEach((m) => console.log('   - ' + m.name + (m.villageName ? ', ' + m.villageName : '')));

  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
