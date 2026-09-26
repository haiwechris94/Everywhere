/**
 * Purge the ENTIRE DMM layer so it can be cleanly re-imported.
 * =============================================================================
 * This script wipes the WHOLE DMM engagement layer of the map:
 *   • ALL DMM engagement PeopleGroups (`source: 'DMM'`), regardless of master.
 *   • ALL "pure" DMM masters — MasterPeople whose sourceTypes is EXACTLY
 *     ['DMM'] — are DELETED outright, together with their DMM people-graph
 *     cascade (PeopleSource / PeopleMatch / PeopleLocation).
 *   • MIXED masters — MasterPeople whose sourceTypes INCLUDE 'DMM' but ALSO
 *     include at least one reference source (JP/CPPI/SURVEY/FTT/MANUAL) — are
 *     NEVER deleted. They carry reference data, so only their DMM contribution
 *     is stripped: 'DMM' is $pull-ed from sourceTypes and dmmRollup is $unset.
 *     Their DMM PeopleSource/PeopleMatch/PeopleLocation artifacts are removed,
 *     but their JP/CPPI/SURVEY sources/matches/locations are left untouched.
 *
 * This NEVER deletes JP/CPPI/SURVEY/FTT/MANUAL reference masters, nor any of
 * their non-DMM sources, matches or locations.
 *
 * The point is to fully wipe the user-entered DMM engagements before a clean
 * re-import from backend/data/With_PGs_infos_completed.xlsx.
 *
 * SAFETY: DRY-RUN by default. Pass --confirm to actually delete.
 *
 * Usage (run from the backend directory):
 *   node scripts/purgeAllDmmMasters.js            # dry-run preview (safe)
 *   node scripts/purgeAllDmmMasters.js --confirm  # actually purge the DMM layer
 *
 * After a --confirm purge, re-import the DMM peoples with:
 *   node scripts/importDmmMasterPeople.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const PeopleSource = require('../models/PeopleSource');
const PeopleMatch = require('../models/PeopleMatch');
const PeopleLocation = require('../models/PeopleLocation');

const CONFIRM = process.argv.includes('--confirm');

const MONGO_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting-map';

// PURE DMM master: sourceTypes is EXACTLY ['DMM'] — fully deleted.
const PURE_DMM_MASTER_QUERY = { sourceTypes: ['DMM'] };

// MIXED master: sourceTypes contains 'DMM' AND has more than one source type
// (i.e. also carries JP/CPPI/SURVEY/FTT/MANUAL) — DMM stripped, never deleted.
const MIXED_DMM_MASTER_QUERY = {
  sourceTypes: 'DMM',
  $expr: { $gt: [{ $size: '$sourceTypes' }, 1] },
};

async function idsOf(model, query) {
  const docs = await model.find(query).select('_id').lean();
  return docs.map((d) => d._id);
}

async function main() {
  console.log('──────────────────────────────────────────────────────────────');
  console.log('  Purge TOTALE de la couche DMM (avant réimport propre)');
  console.log(`  Mode : ${CONFIRM ? 'SUPPRESSION RÉELLE' : 'DRY-RUN (aperçu seulement)'}`);
  console.log('  Supprime TOUS les engagements DMM + les masters DMM purs,');
  console.log("  retire 'DMM' des masters mixtes (JP/CPPI/SURVEY/FTT/MANUAL).");
  console.log('  Les masters de référence et leurs données ne sont PAS touchés.');
  console.log('──────────────────────────────────────────────────────────────\n');

  await mongoose.connect(MONGO_URI);
  console.log(`Connecté à ${MONGO_URI}\n`);

  // ── 1. Classify DMM masters into pure (delete) vs mixed (strip DMM). ───────
  const pureMasters = await MasterPeople.find(PURE_DMM_MASTER_QUERY)
    .select('_id canonicalName sourceTypes')
    .lean();
  const pureMasterIds = pureMasters.map((m) => m._id);

  const mixedMasterIds = await idsOf(MasterPeople, MIXED_DMM_MASTER_QUERY);

  console.log(`Masters DMM purs (à SUPPRIMER)             : ${pureMasterIds.length}`);
  console.log(`Masters mixtes (DMM retiré, conservés)     : ${mixedMasterIds.length}`);
  console.log(`Total masters touchés par DMM              : ${pureMasterIds.length + mixedMasterIds.length}\n`);

  if (!CONFIRM && pureMasters.length) {
    console.log('── Aperçu des masters DMM purs (20 premiers) ──');
    for (const m of pureMasters.slice(0, 20)) {
      console.log(`  • ${String(m.canonicalName || '(sans nom)').padEnd(40)} ${String(m._id)}`);
    }
    if (pureMasters.length > 20) {
      console.log(`  … et ${pureMasters.length - 20} autre(s).`);
    }
    console.log('');
  }

  // ── Collect the DMM PeopleSource ids of ALL DMM-touched masters (pure +
  //    mixed) so matches/locations that reference sources can be cascaded. ────
  const allDmmMasterIds = [...pureMasterIds, ...mixedMasterIds];
  const dmmSourceIds = await idsOf(PeopleSource, {
    sourceType: 'DMM',
    masterPeopleId: { $in: allDmmMasterIds },
  });

  console.log(`Sources DMM liées aux masters DMM          : ${dmmSourceIds.length}\n`);

  // ── Cascade queries (verified field names). ────────────────────────────────
  const pgQuery = { source: 'DMM' };

  const matchQuery = {
    $or: [
      { masterPeopleId: { $in: pureMasterIds } },
      ...(dmmSourceIds.length
        ? [
            { fromSourceId: { $in: dmmSourceIds } },
            { toSourceId: { $in: dmmSourceIds } },
          ]
        : []),
    ],
  };

  const locationQuery = {
    $or: [
      { masterPeopleId: { $in: pureMasterIds } },
      ...(dmmSourceIds.length ? [{ sourceId: { $in: dmmSourceIds } }] : []),
    ],
  };

  const sourceQuery = {
    sourceType: 'DMM',
    masterPeopleId: { $in: allDmmMasterIds },
  };

  const pureMasterQuery = { _id: { $in: pureMasterIds } };

  const report = {};

  console.log('── Suppression / aperçu (couche DMM) ──\n');

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

  if (CONFIRM) {
    // IMPORTANT ORDER — dmmSourceIds already captured above.
    // (2) PeopleGroup DMM, (3) PeopleMatch, (4) PeopleLocation,
    // (5) PeopleSource DMM, (6) pure MasterPeople, (7) update mixed masters.
    await preview('PeopleGroup DMM supprimés', PeopleGroup, pgQuery);
    await preview('PeopleMatch DMM', PeopleMatch, matchQuery);
    await preview('PeopleLocation DMM', PeopleLocation, locationQuery);
    await preview('PeopleSource DMM', PeopleSource, sourceQuery);
    await preview('MasterPeople DMM purs supprimés', MasterPeople, pureMasterQuery);

    let cleaned = 0;
    if (mixedMasterIds.length) {
      const res = await MasterPeople.updateMany(
        { _id: { $in: mixedMasterIds } },
        { $pull: { sourceTypes: 'DMM' }, $unset: { dmmRollup: '' } }
      );
      cleaned = res.modifiedCount != null ? res.modifiedCount : res.nModified || 0;
      console.log(`  ✓ Masters mixtes nettoyés (DMM retiré): ${cleaned}`);
    } else {
      console.log('  • Masters mixtes nettoyés (DMM retiré): 0');
    }
    report['Masters mixtes nettoyés (DMM retiré)'] = cleaned;
  } else {
    // Dry-run: count each deleteMany's matching query.
    await preview('PeopleGroup DMM supprimés', PeopleGroup, pgQuery);
    await preview('PeopleMatch DMM', PeopleMatch, matchQuery);
    await preview('PeopleLocation DMM', PeopleLocation, locationQuery);
    await preview('PeopleSource DMM', PeopleSource, sourceQuery);
    await preview('MasterPeople DMM purs supprimés', MasterPeople, pureMasterQuery);
    report['Masters mixtes nettoyés (DMM retiré)'] = mixedMasterIds.length;
    console.log(`  • Masters mixtes nettoyés (DMM retiré): ${mixedMasterIds.length} master(s) seraient mis à jour`);
  }

  // ── Final recap table. ─────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('  Récapitulatif');
  console.log('──────────────────────────────────────────────────────────────');
  for (const [k, v] of Object.entries(report)) {
    console.log(`  ${k.padEnd(48)} ${v}`);
  }
  // TOTAL deleted excludes mixed-master updates (those are not deletions).
  const total = Object.entries(report).reduce(
    (a, [k, v]) => (k === 'Masters mixtes nettoyés (DMM retiré)' ? a : a + v),
    0
  );
  console.log(`  ${(CONFIRM ? 'TOTAL supprimé' : 'TOTAL à supprimer').padEnd(48)} ${total}`);
  console.log('──────────────────────────────────────────────────────────────');

  if (!CONFIRM) {
    console.log('\nDRY-RUN terminé. Aucune donnée supprimée.');
    console.log('Pour supprimer réellement : node scripts/purgeAllDmmMasters.js --confirm');
    console.log('Les masters JP/CPPI/SURVEY/FTT/MANUAL et leurs données restent intacts.');
  } else {
    console.log('\nPurge TOTALE de la couche DMM terminée.');
    console.log('Les masters de référence JP/CPPI/SURVEY/FTT/MANUAL sont intacts.');
    console.log('Réimportez les peuples DMM avec : node scripts/importDmmMasterPeople.js');
  }

  await mongoose.disconnect();
  console.log('\nTerminé.');
}

main().catch(async (err) => {
  console.error('Erreur :', err);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
