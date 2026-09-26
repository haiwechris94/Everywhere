require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const all = await PeopleGroup.find({ countryCode:'CM', source:{ $in:['DMM','Survey','manual'] } })
    .select('name villageName location createdAt source').lean();
  const hasCoord = (r)=>{const c=r.location&&r.location.coordinates;return Array.isArray(c)&&c.length>=2&&!(Number(c[0])===0&&Number(c[1])===0);};
  const withCoord = all.filter(hasCoord);
  const zero = all.filter(r=>!hasCoord(r));
  const withVillage = all.filter(r=>r.villageName && String(r.villageName).trim());
  const zeroButVillage = zero.filter(r=>r.villageName && String(r.villageName).trim());
  console.log(`Total CM DMM/Survey/manual: ${all.length}`);
  console.log(`  with valid coords: ${withCoord.length}`);
  console.log(`  at (0,0)/no coords: ${zero.length}`);
  console.log(`  with villageName (any): ${withVillage.length}`);
  console.log(`  at (0,0) BUT have villageName (geocodable): ${zeroButVillage.length}`);
  // created-date buckets
  const byDate = {}; all.forEach(r=>{const d=new Date(r.createdAt).toISOString().slice(0,10);byDate[d]=(byDate[d]||0)+1;});
  console.log('  by createdAt:', JSON.stringify(byDate));
  console.log('\nGeocodable (0,0 + village):');
  zeroButVillage.slice(0,100).forEach(r=>console.log(`   - ${r.name}  ->  village="${r.villageName}"`));
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
