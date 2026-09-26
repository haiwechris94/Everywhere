/** List FCA DMM/Survey/manual peopleGroups with non-zero church metrics. READ ONLY. */
require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const FCA = ['CM','TD','CG','CD','GA','CF','GQ','UG'];
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const rows = await PeopleGroup.find({
    countryCode: { $in: FCA },
    source: { $in:['DMM','Survey','manual'] },
    $or: [
      { numberOfChurches: { $gt: 0 } },
      { churchGeneration: { $gt: 0 } },
      { activeCoaches: { $gt: 0 } },
    ],
  }).select('name countryCode source numberOfChurches churchGeneration activeCoaches reportPeriod villageName createdAt').lean();
  console.log(`FCA DMM/Survey/manual peopleGroups with non-zero metrics: ${rows.length}`);
  let sum=0, maxGen=0;
  rows.forEach(r=>{ sum+=r.numberOfChurches||0; maxGen=Math.max(maxGen,r.churchGeneration||0);
    console.log(`   [${r.countryCode}/${r.source}] ${r.name} | churches=${r.numberOfChurches||0} gen=${r.churchGeneration||0} coaches=${r.activeCoaches||0} period=${r.reportPeriod||'(none)'} created=${new Date(r.createdAt).toISOString().slice(0,10)}`);
  });
  console.log(`\nTotal churches from these: ${sum}  maxGen: ${maxGen}`);
  // Breakdown by country
  const byC = {}; rows.forEach(r=>{byC[r.countryCode]=(byC[r.countryCode]||0)+(r.numberOfChurches||0);});
  console.log('Churches by country:', JSON.stringify(byC));
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
