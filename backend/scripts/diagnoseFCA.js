/** Diagnose where FCA's phantom 100 churches / 4 gen / 1 coach come from. READ ONLY. */
require('dotenv').config();
const mongoose = require('mongoose');
const FCA = ['CM','TD','CG','CD','GA','CF','GQ','UG'];

async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const db = mongoose.connection;
  const has = async (n) => (await db.db.listCollections({name:n}).toArray()).length>0;

  // Resolve FCA villages + peopleGroups
  const PeopleGroup = require('../models/PeopleGroup');
  const Village = require('../models/Village');
  const pgs = await PeopleGroup.find({ countryCode: { $in: FCA } }).select('_id village source').lean();
  const vids = await Village.find({ countryCode: { $in: FCA } }).select('_id').lean().catch(()=>[]);
  const villageIds = [...new Set([...pgs.map(p=>p.village).filter(Boolean).map(String), ...vids.map(v=>String(v._id))])];
  const pgIds = pgs.map(p=>String(p._id));
  console.log(`FCA countries: ${FCA.join(',')}`);
  console.log(`FCA peopleGroups: ${pgs.length}  (villages resolved: ${villageIds.length})`);
  const bySource = {}; pgs.forEach(p=>{bySource[p.source]=(bySource[p.source]||0)+1;});
  console.log('PeopleGroup source breakdown:', JSON.stringify(bySource));

  const oid = (a)=>a.map(x=>new mongoose.Types.ObjectId(x));
  const geoOr = { $or: [ { village: { $in: oid(villageIds) } }, { peopleGroup: { $in: oid(pgIds) } } ] };

  // Church collection
  if (await has('churches')) {
    const Church = require('../models/Church');
    const total = await Church.countDocuments({});
    const active = await Church.countDocuments({ lifecycleStatus:'active' });
    const inFCA = await Church.countDocuments({ ...geoOr, lifecycleStatus:'active' });
    const inFCAany = await Church.countDocuments(geoOr);
    console.log(`\nChurch docs — total:${total} active(all):${active} active(FCA):${inFCA} any(FCA):${inFCAany}`);
    // sample a few FCA churches
    const sample = await Church.find(geoOr).select('name lifecycleStatus planterType village peopleGroup createdAt').limit(8).lean();
    sample.forEach(c=>console.log('   church:', c.name, '| status:', c.lifecycleStatus, '| planter:', c.planterType));
  } else console.log('\nNo churches collection.');

  // CoachingSession
  if (await has('coachingsessions')) {
    const CoachingSession = require('../models/CoachingSession');
    const total = await CoachingSession.countDocuments({});
    const coaches = await CoachingSession.distinct('coach', geoOr);
    console.log(`\nCoachingSession docs — total:${total}  distinct coaches(FCA):${coaches.length}`);
    const s = await CoachingSession.find(geoOr).select('coach village peopleGroup date').limit(5).lean();
    s.forEach(x=>console.log('   coach:', String(x.coach), '| village:', String(x.village), '| date:', x.date));
  } else console.log('\nNo coachingsessions collection.');

  // PeopleGroup DMM metric rollup for FCA
  const [agg] = await PeopleGroup.aggregate([
    { $match: { countryCode: { $in: FCA }, source: { $in:['DMM','Survey','manual'] } } },
    { $group: { _id:null, churches:{ $sum:{ $ifNull:['$numberOfChurches',0] } }, maxGen:{ $max:{ $ifNull:['$churchGeneration',0] } }, coaches:{ $sum:{ $ifNull:['$activeCoaches',0] } } } },
  ]);
  console.log('\nPeopleGroup DMM rollup (FCA):', JSON.stringify(agg||{}));

  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
