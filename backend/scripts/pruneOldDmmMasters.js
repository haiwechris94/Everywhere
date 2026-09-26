/**
 * Prune the OLD DMM MasterPeople left over from previous imports.
 * =============================================================================
 * The current import (scripts/importDmmMasterPeople.js) rebuilds the canonical
 * DMM peoples from backend/data/With_PGs_infos_completed.xlsx. Each master it
 * creates gets `sourceTypes: ['DMM']`, `primaryCountryCode: 'CMR'`, and a
 * DISTINCTIVE `groupNaturalKey` of the form `"DMM:<normalizedName>"` (i.e. a
 * string that STARTS WITH "DMM:"). That "DMM:" prefix is the RELIABLE marker of
 * a master created by the CURRENT import.
 *
 * Previous imports (the linking loader scripts/ingestDmmPeople.js or older
 * scripts) created ~120 DMM masters that do NOT carry that marker — they either
 * lack a `groupNaturalKey` or use a different form (e.g. `JP:.../CPPI:...`).
 * This script removes ONLY those OLD DMM masters and their DMM-scoped cascade,
 * so the map is left with just the current-import DMM masters plus the untouched
 * JP/CPPI/SURVEY reference graph.
 *
 * WHICH MASTERS ARE TARGETED (the discriminator)
 * -----------------------------------------------
 * A master is a "DMM master" ONLY when `sourceTypes` is EXACTLY ['DMM'] (pure
 * DMM, no other source). A master whose sourceTypes also include 'JP'/'CPPI'/…
 * is a REFERENCE master and is NEVER touched, even if it also carries 'DMM'.
 *
 *   KEEP   (current import):  sourceTypes == ['DMM']  AND  groupNaturalKey =~ /^DMM:/
 *   DELETE (old imports):     sourceTypes == ['DMM']  AND  groupNaturalKey !~ /^DMM:/
 *                             (missing / null / non-"DMM:" key)
 *   NEVER TOUCH:              any master whose sourceTypes include JP/CPPI/SURVEY/…
 *
 * DELETION SCOPE for each OLD DMM master (DMM-only cascade — mirrors the --reset
 * scope documented in scripts/ingestDmmPeople.js):
 *   1. PeopleMatch    tied to the master (masterPeopleId ∈ oldMasterIds, OR
 *                     fromSourceId/toSourceId ∈ that master's DMM PeopleSource ids)
 *   2. PeopleLocation tied to the master (masterPeopleId ∈ oldMasterIds, OR
 *                     sourceId ∈ that master's DMM PeopleSource ids)
 *   3. PeopleSource   { sourceType: 'DMM', masterPeopleId ∈ oldMasterIds }
 *   4. PeopleGroup    { source: 'DMM', masterPeopleId ∈ oldMasterIds }  (the DMM
 *                     engagements that belonged to those old masters)
 *   5. MasterPeople   { _id ∈ oldMasterIds }
 *
 * The current-import DMM masters (groupNaturalKey starting with "DMM:") are left
 * completely untouched, so there is nothing to recompute.
 *
 * SAFETY: DRY-RUN by default. Pass --confirm to actually delete.
 *
 * Usage (run from the backend directory):
 *   node scripts/pruneOldDmmMasters.js            # dry-run preview (safe)
 *   node scripts/pruneOldDmmMasters.js --confirm  # actually delete old DMM masters
 *                                                 # + their DMM engagements/sources/matches/locations
 *
 * This script NEVER touches JP/CPPI/SURVEY reference masters and always KEEPS the
 * current-import DMM masters (groupNaturalKey starting with 'DMM:').
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MasterPeople = require('../models/MasterPeople');
const PeopleGroup = require('../models/PeopleGroup');
const PeopleSource = require('../models/PeopleSource');
const PeopleMatch = require('../models/PeopleMatch');
const PeopleLocation = require('../models/PeopleLocation');

const CONFIRM = process.argv.includes('--confirm');

const MONGO_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting-map';

// A master is a candidate OLD DMM master when it is PURE DMM (sourceTypes is
// EXACTLY ['DMM']) AND its groupNaturalKey does NOT start with "DMM:".
const OLD_DMM_MASTER_QUERY = {
  sourceTypes: ['DMM'],
  $or: [
    { groupNaturalKey: { $exists: false } },
    { groupNaturalKey: null },
    { groupNaturalKey: { $not: /^DMM:/ } },
  ],
};

// The current-import DMM masters we KEEP (pure DMM + groupNaturalKey "DMM:…").
const KEPT_DMM_MASTER_QUERY = {
  sourceTypes: ['DMM'],
  groupNaturalKey: { $regex: /^DMM:/ },
};

async function idsOf(model, query) {
  const docs = await model.find(query).select('_id').lean();
  return docs.map((d) => d._id);
}

async function main() {
  console.log('──────────────────────────────────────────────────────────────');
  console.log('  Purge des ANCIENS masters DMM (imports précédents)');
  console.log(`  Mode : ${CONFIRM ? 'SUPPRESSION RÉELLE' : 'DRY-RUN (aperçu seulement)'}`);
  console.log("  Discriminant : sourceTypes == ['DMM'] ET groupNaturalKey NE commence PAS par 'DMM:'");
  console.log("  (Les masters de l'import courant (groupNaturalKey 'DMM:…') et les masters");
  console.log('   de référence JP/CPPI/SURVEY ne sont PAS touchés.)');
  console.log('──────────────────────────────────────────────────────────────\n');

  await mongoose.connect(MONGO_URI);
  console.log(`Connecté à ${MONGO_URI}\n`);

  // ── 1. Identify OLD (to-delete) vs KEPT (current-import) DMM masters ────────
  const oldMasters = await MasterPeople.find(OLD_DMM_MASTER_QUERY)
    .select('_id canonicalName groupNaturalKey')
    .lean();
  const oldMasterIds = oldMasters.map((m) => m._id);
  const keptCount = await MasterPeople.countDocuments(KEPT_DMM_MASTER_QUERY);

  console.log(`Anciens masters DMM à supprimer            : ${oldMasterIds.length}`);
  console.log(`Masters DMM de l'import courant (conservés) : ${keptCount}\n`);

  if (!CONFIRM && oldMasters.length) {
    console.log("── Aperçu des anciens masters DMM (20 premiers) ──");
    for (const m of oldMasters.slice(0, 20)) {
      const key = m.groupNaturalKey == null ? '(aucune)' : m.groupNaturalKey;
      console.log(`  • ${String(m.canonicalName || '(sans nom)').padEnd(40)} ${String(m._id)}  key=${key}`);
    }
    if (oldMasters.length > 20) {
      console.log(`  … et ${oldMasters.length - 20} autre(s).`);
    }
    console.log('');
  }

  const report = {};
  const preview = async (label, model, query) => {
    const count = await model.countDocuments(query);
    report[label] = count;
    if (CONFIRM && count > 0) {
      const res = await model.deleteMany(query);
      console.log(`  ✓ ${label}: supprimé ${res.deletedCount}`);
    } else {
      console.log(`  • ${label}: ${count} document(s) ${CONFIRM ? '' : 'seraient supprimés'}`);
    }
  };

  if (!oldMasterIds.length) {
    console.log('Aucun ancien master DMM trouvé — rien à supprimer.\n');
    await mongoose.disconnect();
    console.log('Terminé.');
    return;
  }

  // ── Collect the DMM PeopleSource ids of the old masters (for match/location
  //    cascades that reference sources rather than the master directly). ──────
  const oldDmmSourceIds = await idsOf(PeopleSource, {
    sourceType: 'DMM',
    masterPeopleId: { $in: oldMasterIds },
  });

  // ── The DMM engagement PeopleGroups linked to those old masters. ───────────
  const oldPgIds = await idsOf(PeopleGroup, {
    source: 'DMM',
    masterPeopleId: { $in: oldMasterIds },
  });

  console.log(`Sources DMM liées aux anciens masters      : ${oldDmmSourceIds.length}`);
  console.log(`Engagements DMM (PeopleGroup) liés         : ${oldPgIds.length}\n`);

  console.log('── Suppression / aperçu (cascade DMM uniquement) ──\n');

  // ── 2. PeopleMatch — audit rows tied to the master directly OR via its DMM
  //       sources (fromSourceId / toSourceId). ────────────────────────────────
  const matchQuery = {
    $or: [
      { masterPeopleId: { $in: oldMasterIds } },
      ...(oldDmmSourceIds.length
        ? [
            { fromSourceId: { $in: oldDmmSourceIds } },
            { toSourceId: { $in: oldDmmSourceIds } },
          ]
        : []),
    ],
  };
  await preview('PeopleMatch (anciens masters DMM)', PeopleMatch, matchQuery);

  // ── 3. PeopleLocation — points tied to the master directly OR via its DMM
  //       sources (sourceId). ─────────────────────────────────────────────────
  const locationQuery = {
    $or: [
      { masterPeopleId: { $in: oldMasterIds } },
      ...(oldDmmSourceIds.length ? [{ sourceId: { $in: oldDmmSourceIds } }] : []),
    ],
  };
  await preview('PeopleLocation (anciens masters DMM)', PeopleLocation, locationQuery);

  // ── 4. PeopleSource — only the DMM sources of those masters. ───────────────
  await preview('PeopleSource DMM (anciens masters)', PeopleSource, {
    sourceType: 'DMM',
    masterPeopleId: { $in: oldMasterIds },
  });

  // ── 5. PeopleGroup — the DMM engagements of those old masters. ─────────────
  if (oldPgIds.length) {
    await preview('PeopleGroup DMM (engagements des anciens masters)', PeopleGroup, {
      _id: { $in: oldPgIds },
    });
  } else {
    report['PeopleGroup DMM (engagements des anciens masters)'] = 0;
    console.log('  • PeopleGroup DMM (engagements des anciens masters): 0 document(s)');
  }

  // ── 6. MasterPeople — the old DMM masters themselves. ──────────────────────
  await preview('MasterPeople DMM (anciens)', MasterPeople, {
    _id: { $in: oldMasterIds },
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('  Récapitulatif');
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`  ${'Anciens masters DMM trouvés'.padEnd(48)} ${oldMasterIds.length}`);
  console.log(`  ${"Masters DMM conservés (import courant)".padEnd(48)} ${keptCount}`);
  for (const [k, v] of Object.entries(report)) {
    console.log(`  ${k.padEnd(48)} ${v}`);
  }
  const total = Object.values(report).reduce((a, b) => a + b, 0);
  console.log(`  ${(CONFIRM ? 'TOTAL supprimé' : 'TOTAL à supprimer').padEnd(48)} ${total}`);
  console.log('──────────────────────────────────────────────────────────────');

  if (!CONFIRM) {
    console.log('\nDRY-RUN terminé. Aucune donnée supprimée.');
    console.log('Pour supprimer réellement : node scripts/pruneOldDmmMasters.js --confirm');
    console.log("Les masters JP/CPPI/SURVEY et l'import courant (groupNaturalKey 'DMM:…') restent intacts.");
  } else {
    console.log('\nPurge des anciens masters DMM terminée.');
    console.log("Les masters de l'import courant et la référence JP/CPPI/SURVEY sont intacts.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Erreur :', err);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
