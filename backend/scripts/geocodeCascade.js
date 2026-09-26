/**
 * geocodeCascade.js — locate the CM engagements still at (0,0) using a 4-level
 * cascade, writing location.coordinates ([lng,lat]) and marking approximate.
 *
 *   L1  master referenceData / primaryLocation coords (exact-ish)
 *   L2  Nominatim on admin3 → admin2 (+ region + Cameroun)  [approximate]
 *   L3  Nominatim on region (+ Cameroun)                     [approximate]
 *   L4  no usable hint → left for manual CSV (geoloc_a_completer.csv)
 *
 * Dry-run by default; pass --apply to persist. Nominatim: <=1 req/s + UA.
 */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const APPLY = process.argv.includes('--apply');
const UA = 'church-planting-map/1.0 (DMM cascade geocoding; contact: chrishaiwe@gmail.com)';
const UNKNOWN = /non\s*(identifi|précis|precis|détermin|determin)|multi-?sites/i;
const clean = (s) => String(s||'').replace(/\([^)]*\)/g,'').replace(/\bou\b.*$/i,'').replace(/\s+/g,' ').trim();
const usable = (s) => { const c = clean(s); return c && !UNKNOWN.test(String(s)) ? c : ''; };
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

async function geocode(q){
  const url=`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q+', Cameroun')}&format=json&limit=1&countrycodes=cm`;
  const res=await fetch(url,{headers:{'User-Agent':UA,'Accept-Language':'fr'}});
  if(!res.ok) return null;
  const a=await res.json();
  if(!Array.isArray(a)||!a.length) return null;
  const la=Number(a[0].lat), lo=Number(a[0].lon);
  return Number.isFinite(la)&&Number.isFinite(lo)?{coordinates:[lo,la],display:a[0].display_name}:null;
}
const validCoord=(c)=>Array.isArray(c)&&c.length===2&&!(Number(c[0])===0&&Number(c[1])===0)&&Number.isFinite(+c[0])&&Number.isFinite(+c[1]);

async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const all=await PeopleGroup.find({countryCode:'CM',source:{$in:['DMM','Survey','manual']}});
  const targets=all.filter(r=>!validCoord(r.location&&r.location.coordinates));
  console.log(`Targets (no exact coords): ${targets.length}\n`);

  let l1=0,l2=0,l3=0,l4=0; const manual=[];
  for(const r of targets){
    // L1: master coords
    let coord=null, level=null, note='';
    if(r.masterPeopleId){
      const mp=await MasterPeople.findById(r.masterPeopleId).select('referenceData primaryLocation').lean();
      const rd=mp&&mp.referenceData;
      if(rd&&rd.latitude!=null&&rd.longitude!=null&&!(rd.latitude===0&&rd.longitude===0)) coord=[rd.longitude,rd.latitude];
      else if(mp&&mp.primaryLocation&&validCoord(mp.primaryLocation.coordinates)) coord=mp.primaryLocation.coordinates;
      if(coord){ level='L1-master'; l1++; }
    }
    // L2: admin3 then admin2
    if(!coord){
      const a3=usable(r.admin3), a2=usable(r.admin2), reg=usable(r.region);
      for(const unit of [a3,a2]){
        if(!unit) continue;
        const q=[unit, reg].filter(Boolean).join(', ');
        const g=await geocode(q); await sleep(1100);
        if(g){ coord=g.coordinates; level='L2-admin'; note=g.display; l2++; break; }
      }
    }
    // L3: region
    if(!coord){
      const reg=usable(r.region);
      if(reg){ const g=await geocode(reg); await sleep(1100); if(g){ coord=g.coordinates; level='L3-region'; note=g.display; l3++; } }
    }
    if(!coord){ l4++; manual.push(r); console.log(`L4 MANUAL  ${r.name}`); continue; }
    const approximate = level!=='L1-master';
    console.log(`${level}  ${r.name} -> [${coord[0].toFixed(4)}, ${coord[1].toFixed(4)}]${approximate?' (approx)':''}${note?'  '+note:''}`);
    if(APPLY){
      r.location={type:'Point',coordinates:[Number(coord[0]),Number(coord[1])]};
      if(r.set) { try { r.set('locationApproximate', approximate); } catch(e){} }
      await r.save();
    }
  }
  console.log(`\nL1=${l1} L2=${l2} L3=${l3} L4(manual)=${l4}`);

  // Write manual worksheet for the L4 leftovers.
  if(manual.length){
    const header='name;villageName;region;admin2;admin3;latitude;longitude';
    const lines=manual.map(r=>[r.name,r.villageName||'',r.region||'',r.admin2||'',r.admin3||'','',''].join(';'));
    const out=path.join(__dirname,'..','data','geoloc_a_completer.csv');
    if(APPLY){ fs.writeFileSync(out,[header,...lines].join('\n'),'utf8'); console.log(`\nManual worksheet written: ${out} (${manual.length} rows to fill lat/lng)`); }
    else console.log(`\n(${manual.length} rows would be written to data/geoloc_a_completer.csv on --apply)`);
  }
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
