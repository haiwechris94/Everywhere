/** DRY: match CSV engagement names to existing CM engagements by NAME only. */
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const FILE = process.argv[2] || 'data/template-cameroun-CM.csv';
const norm = (v)=>String(v==null?'':v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function parse(file){
  const raw = fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/^\ufeff/,'');
  const lines = raw.split(/\r?\n/).filter(l=>l.trim());
  const header = lines[0].split(';').map(h=>h.trim());
  const i = header.indexOf('NG_Engagment_Name');
  return lines.slice(1).map(l=>(l.split(';')[i]||'').trim()).filter(Boolean);
}
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const names = parse(FILE);
  const existing = await PeopleGroup.find({countryCode:'CM',source:{$in:['DMM','Survey','manual']}}).select('name').lean();
  const set = new Map(existing.map(e=>[norm(e.name),e.name]));
  let matched=0; const noMatch=[];
  for(const n of names){ if(set.has(norm(n))) matched++; else noMatch.push(n); }
  console.log(`CSV names: ${names.length}  Existing: ${existing.length}`);
  console.log(`Matched by normalized name: ${matched}`);
  console.log(`CSV names NOT matching any existing engagement: ${noMatch.length}`);
  noMatch.forEach(n=>console.log('   - '+n));
  const csvSet = new Set(names.map(norm));
  const dbNoCsv = existing.filter(e=>!csvSet.has(norm(e.name))).map(e=>e.name);
  console.log(`\nExisting engagements with NO CSV row: ${dbNoCsv.length}`);
  dbNoCsv.forEach(n=>console.log('   - '+n));
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
