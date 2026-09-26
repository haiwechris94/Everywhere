/** Inspect the 14 CM engagements at (0,0): what geo hints do they carry? READ ONLY. */
require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const all = await PeopleGroup.find({ countryCode:'CM', source:{ $in:['DMM','Survey','manual'] } })
    .select('name villageName region admin2 admin3 location').lean();
  const zero = all.filter(r=>{
    const c = r.location && r.location.coordinates;
    return !Array.isArray(c) || c.length<2 || (Number(c[0])===0 && Number(c[1])===0);
  });
  console.log(`Engagements at (0,0) or no coords: ${zero.length}`);
  zero.forEach(r=>console.log(JSON.stringify({name:r.name, village:r.villageName||null, region:r.region||null, admin2:r.admin2||null, admin3:r.admin3||null})));
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
