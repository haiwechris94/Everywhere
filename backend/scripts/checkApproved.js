require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const all = await PeopleGroup.find({ countryCode:'CM', source:{$in:['DMM','Survey','manual']} }).select('approved').lean();
  const approved = all.filter(r=>r.approved===true).length;
  const notApproved = all.filter(r=>r.approved!==true).length;
  const undef = all.filter(r=>r.approved===undefined).length;
  console.log(`CM engagements: ${all.length}  approved:true=${approved}  approved!=true=${notApproved}  (undefined=${undef})`);
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
