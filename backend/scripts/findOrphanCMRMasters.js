require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');

const APPLY = process.argv.includes('--apply');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  await mongoose.connect(uri);

  // All CMR masters flagged DMM
  const dmmMasters = await MasterPeople.find({ primaryCountryCode: 'CMR', sourceTypes: 'DMM' })
    .select('_id canonicalName sourceTypes groupNaturalKey').lean();

  // Which masters still have at least one linked DMM engagement?
  const linkedIds = new Set(
    (await PeopleGroup.distinct('masterPeopleId', { source: 'DMM', masterPeopleId: { $ne: null } }))
      .map((id) => String(id))
  );

  const orphans = dmmMasters.filter((m) => !linkedIds.has(String(m._id)));
  console.log(`CMR DMM masters: ${dmmMasters.length}`);
  console.log(`Orphan DMM masters (no linked engagement): ${orphans.length}`);
  orphans.forEach((m) => console.log(`   - ${m.canonicalName} [${(m.sourceTypes||[]).join('+')}] key=${m.groupNaturalKey||'-'}`));

  // Two kinds of orphan:
  //  - DMM-ONLY (no JP/CPPI): safe to DELETE (leftover empty DMM master).
  //  - JP/CPPI+DMM: a real reference people that kept a stale DMM flag after its
  //    engagements were removed. NEVER delete — just strip the DMM flag + rollup
  //    so it stops being counted as a "DMM-engaged people".
  const deletable = orphans.filter((m) => (m.sourceTypes || []).every((s) => s === 'DMM'));
  const stripFlag = orphans.filter((m) => (m.sourceTypes || []).some((s) => s !== 'DMM'));
  console.log(`\nDeletable (DMM-only) orphans:        ${deletable.length}`);
  console.log(`Strip stale DMM flag (JP/CPPI kept): ${stripFlag.length}`);

  if (APPLY) {
    if (deletable.length) {
      const res = await MasterPeople.deleteMany({ _id: { $in: deletable.map((m) => m._id) } });
      console.log(`Deleted ${res.deletedCount} orphan DMM-only masters.`);
    }
    if (stripFlag.length) {
      const res = await MasterPeople.updateMany(
        { _id: { $in: stripFlag.map((m) => m._id) } },
        { $pull: { sourceTypes: 'DMM' }, $unset: { dmmRollup: '' } },
      );
      console.log(`Stripped stale DMM flag from ${res.modifiedCount} reference masters.`);
    }
  } else {
    console.log('(dry-run — re-run with --apply to fix)');
  }

  await mongoose.disconnect();
}
run().catch((e)=>{console.error(e);process.exit(1);});
