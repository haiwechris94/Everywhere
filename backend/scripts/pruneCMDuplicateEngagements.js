/**
 * pruneCMDuplicateEngagements.js — keep the ORIGINAL Cameroon DMM set
 * (54 masters + 80 engagements created 2026-09-17) and remove the later
 * duplicate set (80 engagements created 2026-09-19 + the 34 masters created
 * that day that are exclusively DMM and have no other engagements left).
 *
 * SAFETY:
 *  - Runs in DRY-RUN by default. Pass --apply to actually delete.
 *  - Only touches CM (countryCode) DMM/Survey/manual engagements.
 *  - Only deletes masters that: were created on the DELETE day, have a DMM-only
 *    groupNaturalKey, and end up with ZERO remaining linked engagements.
 *  - Recomputes dmmRollup for any master that kept/lost engagements.
 *
 * Usage:
 *   node backend/scripts/pruneCMDuplicateEngagements.js            # dry-run
 *   node backend/scripts/pruneCMDuplicateEngagements.js --apply    # execute
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const { recomputeDmmRollup } = require('../services/dmmRollup');

const APPLY = process.argv.includes('--apply');

// Date windows (UTC). KEEP = 2026-09-17, DELETE = 2026-09-19.
const DELETE_FROM = new Date('2026-09-19T00:00:00.000Z');
const DELETE_TO = new Date('2026-09-20T00:00:00.000Z');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  console.log(`Connecting${APPLY ? ' (APPLY)' : ' (DRY-RUN)'}...`);
  await mongoose.connect(uri);
  console.log('Connected.\n');

  // 1) Engagements to delete: CM DMM engagements created in the DELETE window.
  const toDelete = await PeopleGroup.find({
    countryCode: 'CM',
    source: { $in: ['DMM', 'Survey', 'manual'] },
    createdAt: { $gte: DELETE_FROM, $lt: DELETE_TO },
  }).select('_id name villageName masterPeopleId createdAt').lean();

  console.log(`Engagements to DELETE (CM, created ${DELETE_FROM.toISOString().slice(0,10)}): ${toDelete.length}`);
  toDelete.slice(0, 200).forEach((e) => console.log(`   - ${e.name}${e.villageName ? ', ' + e.villageName : ''}`));

  const affectedMasterIds = [...new Set(toDelete.map((e) => String(e.masterPeopleId)).filter(Boolean))];

  // Sanity: what remains after deletion for CM?
  const remaining = await PeopleGroup.countDocuments({
    countryCode: 'CM',
    source: { $in: ['DMM', 'Survey', 'manual'] },
    createdAt: { $lt: DELETE_FROM },
  });
  console.log(`\nEngagements that will REMAIN (created before ${DELETE_FROM.toISOString().slice(0,10)}): ${remaining}`);

  if (!APPLY) {
    console.log('\nDRY-RUN: no changes made. Re-run with --apply to execute.');
    await mongoose.disconnect();
    return;
  }

  // 2) Delete the duplicate engagements.
  const delIds = toDelete.map((e) => e._id);
  const res = await PeopleGroup.deleteMany({ _id: { $in: delIds } });
  console.log(`\nDeleted engagements: ${res.deletedCount}`);

  // 3) For each affected master: if it is a DMM-only master created in the
  //    DELETE window and now has zero linked engagements, delete it too.
  let deletedMasters = 0;
  let recomputed = 0;
  for (const mid of affectedMasterIds) {
    const master = await MasterPeople.findById(mid).select('_id sourceTypes groupNaturalKey createdAt').lean();
    if (!master) continue;
    const stillLinked = await PeopleGroup.countDocuments({ source: 'DMM', masterPeopleId: mid });
    const isDmmOnly = (master.sourceTypes || []).every((s) => s === 'DMM') && (master.sourceTypes || []).includes('DMM');
    const createdInWindow = master.createdAt >= DELETE_FROM && master.createdAt < DELETE_TO;
    if (stillLinked === 0 && isDmmOnly && createdInWindow) {
      await MasterPeople.deleteOne({ _id: mid });
      deletedMasters++;
    } else {
      await recomputeDmmRollup(mid);
      recomputed++;
    }
  }
  console.log(`Deleted orphaned DMM-only masters (created in window, 0 links): ${deletedMasters}`);
  console.log(`Recomputed rollups for masters still in use: ${recomputed}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}
run().catch((e) => { console.error('Prune failed:', e); process.exit(1); });
