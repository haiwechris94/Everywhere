/**
 * applyManualGeoloc.js — apply manually-filled coordinates from
 * data/geoloc_a_completer.csv (columns: name;villageName;region;admin2;admin3;latitude;longitude).
 * Only rows with BOTH latitude and longitude filled are written (as EXACT, not
 * approximate). Matches the engagement by name within CM. Dry-run unless --apply.
 */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const APPLY = process.argv.includes('--apply');

async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const file = path.join(__dirname,'..','data','geoloc_a_completer.csv');
  const raw = fs.readFileSync(file,'utf8').replace(/^\ufeff/,'');
  const lines = raw.split(/\r?\n/).filter(l=>l.trim());
  const header = lines[0].split(';').map(h=>h.trim());
  const iName=header.indexOf('name'), iLat=header.indexOf('latitude'), iLng=header.indexOf('longitude');
  let done=0, skip=0;
  for(const line of lines.slice(1)){
    const c=line.split(';');
    const name=(c[iName]||'').trim();
    const lat=parseFloat((c[iLat]||'').replace(',','.'));
    const lng=parseFloat((c[iLng]||'').replace(',','.'));
    if(!name){ continue; }
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||(lat===0&&lng===0)){ skip++; console.log(`SKIP  ${name} (lat/lng not filled)`); continue; }
    const doc=await PeopleGroup.findOne({ countryCode:'CM', source:{$in:['DMM','Survey','manual']}, name:{ $regex:new RegExp('^'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i') } });
    if(!doc){ skip++; console.log(`SKIP  ${name} (not found)`); continue; }
    console.log(`SET   ${name} -> [${lng}, ${lat}]`);
    if(APPLY){ doc.location={type:'Point',coordinates:[lng,lat]}; try{doc.set('locationApproximate',false);}catch(e){} await doc.save(); }
    done++;
  }
  console.log(`\n${APPLY?'APPLIED':'DRY RUN'} — set:${done} skipped:${skip}`);
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
