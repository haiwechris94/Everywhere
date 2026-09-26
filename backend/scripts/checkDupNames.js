require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
async function run(){
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  await mongoose.connect(uri);
  const rows = await PeopleGroup.aggregate([
    { $match: { countryCode:'CM', source:{ $in:['DMM','Survey','manual'] } } },
    { $group: { _id: { $toLower: '$name' }, n: { $sum: 1 }, villages: { $push: '$villageName' } } },
    { $match: { n: { $gt: 1 } } },
    { $sort: { n: -1 } },
  ]);
  console.log(`Engagement names appearing more than once in CM: ${rows.length}`);
  rows.forEach(r => console.log(`   - "${r._id}" x${r.n} villages=[${r.villages.join(' | ')}]`));
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
