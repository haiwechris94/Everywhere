require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const FCA = ['CM','TD','CG','CD','GA','CF','GQ','UG'];
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  for (const [label, q] of [['CM',{countryCode:'CM'}],['FCA',{countryCode:{$in:FCA}}]]){
    const [agg] = await PeopleGroup.aggregate([
      { $match: { ...q, source:{ $in:['DMM','Survey','manual'] } } },
      { $group: { _id:null,
        n:{ $sum:1 },
        totalChurches:{ $sum:{ $ifNull:['$numberOfChurches',0] } },
        maxGen:{ $max:{ $ifNull:['$churchGeneration',0] } },
        dbs:{ $sum:{ $ifNull:['$dbs',0] } },
        com:{ $sum:{ $ifNull:['$com',0] } },
        cat:{ $sum:{ $ifNull:['$cat',0] } },
        newDisciples:{ $sum:{ $ifNull:['$newDisciples',0] } },
        newBaptisms:{ $sum:{ $ifNull:['$newBaptisms',0] } },
        leadersInTraining:{ $sum:{ $ifNull:['$leadersInTraining',0] } },
        activeCoaches:{ $sum:{ $ifNull:['$activeCoaches',0] } },
      } },
    ]);
    console.log(label, JSON.stringify(agg||{}));
  }
  // distinct reportPeriods present
  const periods = await PeopleGroup.distinct('reportPeriod', { countryCode:'CM', source:{ $in:['DMM','Survey','manual'] } });
  console.log('CM reportPeriods:', JSON.stringify(periods));
  // a few sample rows
  const sample = await PeopleGroup.find({ countryCode:'CM', source:{$in:['DMM','Survey','manual']} }).select('name numberOfChurches churchGeneration dbs com cat reportPeriod').sort({numberOfChurches:-1}).limit(5).lean();
  sample.forEach(s=>console.log('  ', JSON.stringify(s)));
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
