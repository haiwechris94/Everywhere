require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const all = await PeopleGroup.find({ source:{ $in:['DMM','Survey','manual'] }, churchPlanter:{ $exists:true, $nin:[null,''] } })
    .select('name churchPlanter countryCode').lean();
  console.log(`Engagements with a churchPlanter: ${all.length}`);
  const byPlanter = {};
  all.forEach(r=>{ const p=r.churchPlanter.trim(); byPlanter[p]=(byPlanter[p]||0)+1; });
  const planters = Object.entries(byPlanter).sort((a,b)=>b[1]-a[1]);
  console.log(`Distinct planters: ${planters.length}`);
  planters.slice(0,40).forEach(([p,n])=>console.log(`   ${n}x  ${p}`));
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
