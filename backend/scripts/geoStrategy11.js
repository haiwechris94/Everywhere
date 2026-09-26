/** For the 11 CM engagements without exact coords, inventory what geo hints are
 * reachable: admin2/admin3, region, and the linked MasterPeople referenceData
 * (JP lat/lng) — to decide a geocoding strategy. READ ONLY. */
require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
async function run(){
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/church-planting');
  const all = await PeopleGroup.find({ countryCode:'CM', source:{$in:['DMM','Survey','manual']} })
    .select('name villageName region admin2 admin3 location masterPeopleId').lean();
  const noCoord = all.filter(r=>{const c=r.location&&r.location.coordinates;return !Array.isArray(c)||c.length<2||(Number(c[0])===0&&Number(c[1])===0);});
  console.log(`Engagements without exact coords: ${noCoord.length}\n`);
  for(const r of noCoord){
    let mpCoord=null, mpName=null;
    if(r.masterPeopleId){
      const mp = await MasterPeople.findById(r.masterPeopleId).select('referenceData primaryLocation name').lean();
      if(mp){
        mpName = mp.name;
        const rd = mp.referenceData;
        if(rd && rd.latitude!=null && rd.longitude!=null) mpCoord=[rd.longitude, rd.latitude];
        else if(mp.primaryLocation && Array.isArray(mp.primaryLocation.coordinates)) mpCoord=mp.primaryLocation.coordinates;
      }
    }
    console.log(`- ${r.name}`);
    console.log(`    village="${r.villageName||''}" region="${r.region||''}" admin2="${r.admin2||''}" admin3="${r.admin3||''}"`);
    console.log(`    master="${mpName||'(none)'}" masterCoord=${mpCoord?`[${mpCoord[0]}, ${mpCoord[1]}]`:'(none)'}`);
  }
  await mongoose.disconnect();
}
run().catch(e=>{console.error(e);process.exit(1);});
