/**
 * linkOrphanDmmEngagements.js — attach every DMM/Survey PeopleGroup engagement
 * that has NO masterPeopleId to a MasterPeople, so it becomes visible in
 * Data Reporting / Régions / fiches peuples (all of which query via
 * MasterPeople.primaryCountryCode + PeopleGroup.masterPeopleId).
 *
 * Why a focused script (vs. ingestDmmPeople.js): the full loader reprocesses
 * ALL DMM groups and can create many masters from uncertain matches. This one
 * ONLY touches orphans (masterPeopleId == null) and is conservative + idempotent:
 *
 *   For each orphan engagement:
 *     1. Resolve its ISO-3 country code from countryCode (alpha-2) via the
 *        Country collection (same source the reporting endpoint uses).
 *     2. LINK: if exactly ONE existing MasterPeople in that country has the same
 *        canonical name (case-insensitive, on canonicalName), reuse it.
 *     3. CREATE: otherwise create a new MasterPeople { canonicalName, rop3,
 *        primaryCountryCode (ISO-3), primaryLocation, sourceTypes:['DMM'] }.
 *     4. Set PeopleGroup.masterPeopleId (+ approved:true, isNGEngaged:true).
 *   Finally recompute dmmRollup for every touched master.
 *
 * Usage:
 *   node backend/scripts/linkOrphanDmmEngagements.js --dry-run   # preview
 *   node backend/scripts/linkOrphanDmmEngagements.js             # apply
 *   node backend/scripts/linkOrphanDmmEngagements.js --country=CM
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const Country = require('../models/Country');
const { recomputeDmmRollup } = require('../services/dmmRollup');

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const COUNTRY = (() => {
  const a = ARGS.find((x) => x.startsWith('--country='));
  return a ? a.split('=')[1].trim().toUpperCase() : null;
})();

const s = (v) => (v == null ? '' : String(v).trim());
const escapeRe = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  console.log(`Connecting to MongoDB${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  await mongoose.connect(uri);
  console.log('Connected.\n');

  // alpha-2 -> alpha-3 map from the Country collection (reporting source of truth)
  const countries = await Country.find({}).select('code code3').lean();
  const A2_TO_A3 = {};
  countries.forEach((c) => { if (c.code && c.code3) A2_TO_A3[c.code.toUpperCase()] = c.code3.toUpperCase(); });

  const orphanQuery = {
    source: { $in: ['DMM', 'Survey', 'manual'] },
    $or: [{ masterPeopleId: null }, { masterPeopleId: { $exists: false } }],
  };
  if (COUNTRY) orphanQuery.countryCode = COUNTRY;

  const orphans = await PeopleGroup.find(orphanQuery)
    .select('name villageName countryCode country region admin2 admin3 numberOfChurches churchGeneration location engagementStatus')
    .lean();

  console.log(`Orphan DMM engagements (no masterPeopleId): ${orphans.length}\n`);

  let linked = 0;
  let created = 0;
  let skippedNoIso3 = 0;
  const touchedMasters = new Set();

  for (const pg of orphans) {
    const a2 = s(pg.countryCode).toUpperCase();
    const iso3 = A2_TO_A3[a2] || null;
    if (!iso3) {
      skippedNoIso3++;
      continue; // can't place it in the country funnel — leave untouched
    }

    const name = s(pg.name);
    if (!name) continue;

    // 1) Try to LINK to an existing master in the same country with same name.
    const nameRx = new RegExp(`^${escapeRe(name)}$`, 'i');
    const matches = await MasterPeople.find({
      primaryCountryCode: iso3,
      canonicalName: nameRx,
    }).select('_id').lean();

    let masterId = null;
    if (matches.length === 1) {
      masterId = matches[0]._id;
      linked++;
    } else if (matches.length === 0) {
      // 2) CREATE a new master people for this engagement.
      // groupNaturalKey MUST be unique (unique index) — use the current-import
      // DMM convention "DMM:<normalizedName>:<iso3>" and upsert on it so re-runs
      // are idempotent and never collide on a null key.
      created++;
      if (!DRY_RUN) {
        const normalizedName = name.toLowerCase().replace(/\s+/g, ' ');
        const naturalKey = `DMM:${normalizedName}:${iso3}`;
        const doc = await MasterPeople.findOneAndUpdate(
          { groupNaturalKey: naturalKey },
          {
            $setOnInsert: {
              canonicalName: name,
              primaryCountryCode: iso3,
              primaryLocation: pg.location && Array.isArray(pg.location.coordinates) ? pg.location : null,
              groupNaturalKey: naturalKey,
            },
            $addToSet: { sourceTypes: 'DMM' },
          },
          { upsert: true, new: true },
        );
        masterId = doc._id;
      }
    } else {
      // Ambiguous (>1 master same name/country): link to the first
      // deterministically to keep it visible; rollups still aggregate correctly.
      masterId = matches[0]._id;
      linked++;
    }

    if (!DRY_RUN && masterId) {
      await PeopleGroup.updateOne(
        { _id: pg._id },
        { $set: { masterPeopleId: masterId, approved: true, isNGEngaged: true } },
      );
      touchedMasters.add(String(masterId));
    }
  }

  console.log('──────── Linking summary ────────');
  console.log(`${DRY_RUN ? 'Would link to existing master' : 'Linked to existing master'}: ${linked}`);
  console.log(`${DRY_RUN ? 'Would create new master' : 'Created new master'}:        ${created}`);
  console.log(`Skipped (no ISO-3 country):        ${skippedNoIso3}`);

  if (!DRY_RUN && touchedMasters.size) {
    console.log(`\nRecomputing dmmRollup for ${touchedMasters.size} master(s)...`);
    let done = 0;
    for (const id of touchedMasters) {
      await recomputeDmmRollup(id);
      done++;
    }
    console.log(`Rollups recomputed: ${done}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch((e) => { console.error('Linking failed:', e); process.exit(1); });
