/**
 * pruneTestRecords.js — remove obvious test/seed pollution that inflates region KPIs.
 * Targets DMM/Survey/manual PeopleGroups literally named "Test" (case-insensitive),
 * and the orphan CoachingSession with no village/peopleGroup link.
 * Dry-run by default; pass --apply to delete.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const APPLY = process.argv.includes('--apply');

async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const db = mongoose.connection.db;

  const pgQuery = { source:{ $in:['DMM','Survey','manual'] }, name:{ $regex:/^\s*test\s*$/i } };
  const pgs = await PeopleGroup.find(pgQuery).select('name countryCode source numberOfChurches churchGeneration').lean();
  console.log(`PeopleGroups named "Test" (DMM/Survey/manual): ${pgs.length}`);
  pgs.forEach(p=>console.log(`   [${p.countryCode}/${p.source}] ${p.name} churches=${p.numberOfChurches||0} gen=${p.churchGeneration||0}`));

  const orphanCoach = { $and:[ { $or:[ {village:{$in:[null]}}, {village:{$exists:false}} ] }, { $or:[ {peopleGroup:{$in:[null]}}, {peopleGroup:{$exists:false}} ] } ] };
  const coaches = await db.collection('coachingsessions').find(orphanCoach).toArray();
  console.log(`\nOrphan CoachingSessions (no village & no peopleGroup): ${coaches.length}`);
  coaches.forEach(c=>console.log(`   _id=${c._id} coach=${c.coach} date=${c.date}`));

  if(!APPLY){ console.log('\nDRY RUN — pass --apply to delete.'); await mongoose.disconnect(); return; }

  const delPg = await PeopleGroup.deleteMany(pgQuery);
  const delCoach = await db.collection('coachingsessions').deleteMany(orphanCoach);
  console.log(`\nDELETED PeopleGroups: ${delPg.deletedCount}  CoachingSessions: ${delCoach.deletedCount}`);
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
