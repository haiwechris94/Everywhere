/**
 * simulateQuarterImport.js — DRY RUN of the new name+country upsert logic.
 * Mirrors the updated import.js matching to prove: 80 updates, 0 duplicates.
 * WRITES NOTHING.
 */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const FILE = process.argv[2] || 'data/template-cameroun-CM.csv';
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parse(file){
  const raw = fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/^\ufeff/,'');
  const lines = raw.split(/\r?\n/).filter(l=>l.trim());
  const header = lines[0].split(';').map(h=>h.trim());
  const iName = header.indexOf('NG_Engagment_Name');
  const iV = header.findIndex(h=>/village/i.test(h));
  return lines.slice(1).map(l=>{const c=l.split(';');return {name:(c[iName]||'').trim(), village: iV>=0?(c[iV]||'').trim():''};}).filter(r=>r.name);
}

async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const rows = parse(FILE);
  let update=0, create=0, ambiguous=0; const createNames=[], ambigNames=[];
  for(const r of rows){
    const base = {
      name: { $regex: new RegExp(`^${escapeRe(r.name)}$`,'i') },
      country: { $regex: new RegExp(`^cameroun$|^cameroon$`,'i') },
      source: { $in:['DMM','Survey','manual'] },
    };
    let existing=null;
    if(r.village){
      existing = await PeopleGroup.findOne({...base, villageName:{ $regex:new RegExp(`^${escapeRe(r.village)}$`,'i')}});
      if(!existing){ const s=await PeopleGroup.find(base).select('_id').limit(2); if(s.length===1) existing=s[0]; }
    } else {
      const s = await PeopleGroup.find(base).select('_id').limit(2);
      if(s.length===1) existing=s[0];
      else if(s.length===0) existing=null;
      else { ambiguous++; ambigNames.push(r.name); continue; }
    }
    if(existing) update++; else { create++; createNames.push(r.name); }
  }
  console.log(`=== SIMULATION (new name+country upsert) ===`);
  console.log(`CSV rows: ${rows.length}`);
  console.log(`WILL UPDATE: ${update}`);
  console.log(`WILL CREATE (duplicate/new): ${create}`);
  console.log(`AMBIGUOUS (name appears >1x): ${ambiguous}`);
  if(createNames.length) console.log('Creates:\n  '+createNames.join('\n  '));
  if(ambigNames.length) console.log('Ambiguous:\n  '+ambigNames.join('\n  '));
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
