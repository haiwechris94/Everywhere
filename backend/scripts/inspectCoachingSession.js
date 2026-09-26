require('dotenv').config();
const mongoose = require('mongoose');
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const db = mongoose.connection.db;
  const docs = await db.collection('coachingsessions').find({}).limit(10).toArray();
  console.log(`CoachingSession total: ${docs.length}`);
  docs.forEach(d=>console.log(JSON.stringify({_id:String(d._id), coach:d.coach, village:d.village, peopleGroup:d.peopleGroup, date:d.date, createdAt:d.createdAt, notes:d.notes})));
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
