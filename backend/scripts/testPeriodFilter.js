require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const FCA=['CM','TD','CG','CD','GA','CF','GQ','UG'];
async function agg(period){
  const m = { countryCode:{$in:FCA}, source:{$in:['DMM','Survey','manual']}, approved:true };
  if(period) m.reportPeriod = { $regex: new RegExp('^'+period+'$','i') };
  const [r] = await PeopleGroup.aggregate([
    { $match:m },
    { $group:{ _id:null, engagements:{$sum:1}, churches:{$sum:{$ifNull:['$numberOfChurches',0]}}, maxGen:{$max:{$ifNull:['$churchGeneration',0]}}, dbs:{$sum:{$ifNull:['$dbs',0]}}, com:{$sum:{$ifNull:['$com',0]}}, cat:{$sum:{$ifNull:['$cat',0]}} } },
  ]);
  return r||{};
}
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  console.log('FCA no period :', JSON.stringify(await agg(null)));
  console.log('FCA 2Q26      :', JSON.stringify(await agg('2Q26')));
  console.log('FCA 3Q26      :', JSON.stringify(await agg('3Q26')));
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
