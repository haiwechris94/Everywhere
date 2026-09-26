require('dotenv').config();
const mongoose = require('mongoose');
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const db = mongoose.connection.db;
  // Village collection: does it have coordinates and CM entries?
  const has = async(n)=>(await db.listCollections({name:n}).toArray()).length>0;
  if(await has('villages')){
    const total = await db.collection('villages').countDocuments({});
    const sample = await db.collection('villages').find({}).limit(3).toArray();
    console.log(`villages: ${total}`);
    sample.forEach(v=>console.log('  ', JSON.stringify({name:v.name, countryCode:v.countryCode, location:v.location, coordinates:v.coordinates})));
    // try to find one of our target villages
    for(const vn of ['Amsa','Aissa-Harde','Diako','Guka','Boboyo']){
      const hit = await db.collection('villages').findOne({ name: { $regex: new RegExp('^'+vn+'$','i') } });
      console.log(`  lookup "${vn}": ${hit? 'FOUND '+JSON.stringify(hit.location||hit.coordinates) : 'not found'}`);
    }
  } else console.log('no villages collection');
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
