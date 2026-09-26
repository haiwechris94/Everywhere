/**
 * mergeCM0922IntoOriginals.js
 * The 2Q26 import created 80 NEW rows (2026-09-22) carrying the metrics, instead
 * of updating the 80 originals (2026-09-17) that hold villageName/coords/master
 * links. This merges each 09-22 row's metrics INTO its same-name 09-17 original,
 * then deletes the 09-22 duplicate. Dry-run unless --apply.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const APPLY = process.argv.includes('--apply');
const norm = (s)=>String(s||'').trim().toLowerCase();

// Metric fields written by the quarterly import.
const METRICS = ['numberOfChurches','churchGeneration','dbs','com','cat','avgChurchSize',
  'newDisciples','newBaptisms','leadersInTraining','activeCoaches','trainingsHeld',
  'lostChurches','mergedChurches','reportPeriod','engagementStatus','status','notes','peopleGroup'];

async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const start = new Date('2026-09-22T00:00:00.000Z');
  const dupes = await PeopleGroup.find({ countryCode:'CM', source:{ $in:['DMM','Survey','manual'] }, createdAt:{ $gte:start } }).lean();
  const origs = await PeopleGroup.find({ countryCode:'CM', source:{ $in:['DMM','Survey','manual'] }, createdAt:{ $lt:start } });
  const origByName = new Map(); origs.forEach(o=>{ const k=norm(o.name); if(!origByName.has(k)) origByName.set(k,o); });

  let merged=0, noMatch=0, deleted=0; const noMatchNames=[];
  for(const d of dupes){
    const o = origByName.get(norm(d.name));
    if(!o){ noMatch++; noMatchNames.push(d.name); continue; }
    for(const f of METRICS){ if(d[f]!==undefined && d[f]!==null && d[f]!=='') o[f]=d[f]; }
    merged++;
    if(APPLY){ await o.save(); await PeopleGroup.deleteOne({_id:d._id}); deleted++; }
  }
  console.log(`09-22 duplicates: ${dupes.length}`);
  console.log(`matched to a 09-17 original: ${merged}`);
  console.log(`no original match (kept, NOT deleted): ${noMatch}`);
  if(noMatchNames.length) noMatchNames.forEach(n=>console.log('   - '+n));
  console.log(APPLY ? `\nAPPLIED: merged ${merged}, deleted ${deleted} duplicates.` : '\nDRY RUN — pass --apply to merge + delete.');
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
