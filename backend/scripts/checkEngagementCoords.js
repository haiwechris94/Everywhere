/** Check how many CM DMM engagements have valid coordinates + countryCode3. READ ONLY. */
require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
// CM bbox used by SUPPORTED_COUNTRIES (approx). We'll just report min/max to compare.
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const rows = await PeopleGroup.find({ countryCode:'CM', source:{ $in:['DMM','Survey','manual'] } })
    .select('name latitude longitude location coordinates masterPeopleId villageName').lean();
  console.log(`CM engagements: ${rows.length}`);
  let noCoord=0, zero=0, ok=0; let minLat=90,maxLat=-90,minLng=180,maxLng=-180;
  const bad=[];
  for(const r of rows){
    // try common shapes
    let lat = r.latitude, lng = r.longitude;
    if((lat==null||lng==null) && r.location && Array.isArray(r.location.coordinates)){ lng=r.location.coordinates[0]; lat=r.location.coordinates[1]; }
    if((lat==null||lng==null) && Array.isArray(r.coordinates)){ lng=r.coordinates[0]; lat=r.coordinates[1]; }
    if(lat==null||lng==null){ noCoord++; bad.push(r.name+' (no coord)'); continue; }
    if(Number(lat)===0 && Number(lng)===0){ zero++; bad.push(r.name+' (0,0)'); continue; }
    ok++;
    minLat=Math.min(minLat,lat); maxLat=Math.max(maxLat,lat); minLng=Math.min(minLng,lng); maxLng=Math.max(maxLng,lng);
  }
  console.log(`with valid coords: ${ok}  | missing: ${noCoord}  | (0,0): ${zero}`);
  console.log(`coord bounds lat[${minLat.toFixed(3)}..${maxLat.toFixed(3)}] lng[${minLng.toFixed(3)}..${maxLng.toFixed(3)}]`);
  if(bad.length){ console.log('\nEngagements dropped by a coordinate/bbox filter:'); bad.forEach(b=>console.log('   - '+b)); }
  const noCc3 = rows.filter(r=>!r.countryCode3 && r.countryCode3!=='CM').length;
  console.log(`\n(engagements missing countryCode3 field on PeopleGroup: not stored here, endpoint derives it)`);
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
