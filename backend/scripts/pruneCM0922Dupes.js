/**
 * pruneCM0922Dupes.js — remove the 80 duplicate CM engagements created 2026-09-22
 * (blank villageName, no coords) that a prior failed import produced. Keeps the
 * original 80 from 2026-09-17. Dry-run unless --apply.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const APPLY = process.argv.includes('--apply');

async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const start = new Date('2026-09-22T00:00:00.000Z');
  const end   = new Date('2026-09-23T00:00:00.000Z');
  const q = { countryCode:'CM', source:{ $in:['DMM','Survey','manual'] }, createdAt: { $gte:start, $lt:end } };
  const dupes = await PeopleGroup.find(q).select('name villageName numberOfChurches masterPeopleId location createdAt').lean();
  console.log(`CM engagements created 2026-09-22: ${dupes.length}`);
  // safety: are the ORIGINAL (09-17) still present for each name?
  const originals = await PeopleGroup.find({ countryCode:'CM', source:{ $in:['DMM','Survey','manual'] }, createdAt:{ $lt:start } }).select('name').lean();
  const origNames = new Set(originals.map(o=>o.name.trim().toLowerCase()));
  const orphanDupes = dupes.filter(d=>!origNames.has((d.name||'').trim().toLowerCase()));
  const withMetrics = dupes.filter(d=>(d.numberOfChurches||0)>0);
  console.log(`  originals (pre-09-22) present: ${originals.length}`);
  console.log(`  09-22 rows whose name has NO pre-existing original (would lose data if deleted): ${orphanDupes.length}`);
  console.log(`  09-22 rows carrying metrics (>0 churches): ${withMetrics.length}`);
  if(orphanDupes.length){ console.log('  ⚠ names only present in 09-22 batch:'); orphanDupes.forEach(d=>console.log('     - '+d.name)); }

  if(!APPLY){ console.log('\nDRY RUN — pass --apply to delete the 09-22 duplicates.'); await mongoose.disconnect(); return; }
  if(orphanDupes.length){ console.log('\nABORT: some 09-22 rows are unique — refusing to auto-delete. Review first.'); await mongoose.disconnect(); return; }
  const del = await PeopleGroup.deleteMany(q);
  console.log(`\nDELETED 09-22 duplicates: ${del.deletedCount}`);
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
