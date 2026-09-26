/**
 * Delete ONLY the Gabon *DMM* data from the Church Planting Map database.
 *
 * Scope (IMPORTANT): this removes the DMM ENGAGEMENT data for Gabon only —
 * the user-entered "terrain" layer (DMM PeopleGroups, villages, persons of
 * peace, discovery groups, churches). It deliberately does NOT touch the
 * reference / canonical people-graph (MasterPeople, PeopleSource, PeopleAlias,
 * PeopleLocation, PeopleStatus, PeopleMatch) nor Joshua Project / IMB /
 * PeopleGroups.org / Finishing the Task source rows. Those stay intact so the
 * reference layer is preserved and only the DMM engagements disappear from the
 * map.
 *
 * HOW GABON *DMM* RECORDS ARE IDENTIFIED
 * --------------------------------------
 *   - PeopleGroup with source === 'DMM'  (the DMM engagement records) AND Gabon:
 *       countryCode === 'GA'  OR  country matches /gabon/i  OR  inside Gabon bbox.
 *   - PersonOfPeace / DiscoveryGroup / Church linked (peopleGroup ref) to one of
 *     those Gabon DMM PeopleGroups, OR located inside the Gabon bbox.
 *   - Village located inside the Gabon bbox (villages have no country field and
 *     are pure DMM/engagement geography).
 *
 * NOTE ON THE BOUNDING BOX: the Gabon and Cameroon boxes overlap slightly in
 * latitude near the shared border (Gabon maxLat 2.3226 vs Cameroon minLat
 * 1.6559). To avoid ever deleting a Cameroon record, bounding-box-ONLY matches
 * (rows with no country field and no link to a Gabon DMM PeopleGroup) are shown
 * in a SEPARATE bucket and are removed only when you pass --include-bbox.
 *
 * SAFETY: DRY-RUN by default. Pass --confirm to actually delete.
 *
 * Usage:
 *   node scripts/deleteGabonDmmData.js                       # dry-run preview (safe)
 *   node scripts/deleteGabonDmmData.js --confirm             # delete Gabon DMM (country-tagged + linked)
 *   node scripts/deleteGabonDmmData.js --confirm --include-bbox  # also delete bbox-only Gabon DMM entities
 */

require('dotenv').config();
const mongoose = require('mongoose');

const PeopleGroup = require('../models/PeopleGroup');
const Village = require('../models/Village');
const PersonOfPeace = require('../models/PersonOfPeace');
const DiscoveryGroup = require('../models/DiscoveryGroup');
const Church = require('../models/Church');
const Activity = require('../models/Activity');

// Gabon bounding box [minLng, minLat, maxLng, maxLat] (matches supportedCountries.js GAB).
const GAB_BOUNDS = [8.6954, -3.9785, 14.5024, 2.3226];

const CONFIRM = process.argv.includes('--confirm');
const INCLUDE_BBOX = process.argv.includes('--include-bbox');

const MONGO_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting-map';

function bboxLocationQuery() {
  const [minLng, minLat, maxLng, maxLat] = GAB_BOUNDS;
  return { location: { $geoWithin: { $box: [[minLng, minLat], [maxLng, maxLat]] } } };
}

async function idsOf(model, query) {
  const docs = await model.find(query).select('_id').lean();
  return docs.map((d) => d._id);
}

async function main() {
  console.log('──────────────────────────────────────────────────────────────');
  console.log('  Suppression des données DMM du Gabon (uniquement)');
  console.log(`  Mode : ${CONFIRM ? 'SUPPRESSION RÉELLE' : 'DRY-RUN (aperçu seulement)'}`);
  console.log(`  Entités DMM par bounding box : ${INCLUDE_BBOX ? 'INCLUSES' : 'exclues (par défaut)'}`);
  console.log('  (Les données de référence JP/IMB et le people-graph ne sont PAS touchés.)');
  console.log('──────────────────────────────────────────────────────────────\n');

  await mongoose.connect(MONGO_URI);
  console.log(`Connecté à ${MONGO_URI}\n`);

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

  // ── 1. Gabon DMM PeopleGroups (source === 'DMM' + Gabon) ───────────────────
  const bbox = bboxLocationQuery();
  const gabonDmmPgQuery = {
    source: 'DMM',
    $or: [
      { countryCode: 'GA' },
      { country: { $regex: /gabon/i } },
      bbox,
    ],
  };
  // For linked-entity cascades, only use the STRONG (country-tagged) Gabon DMM
  // PeopleGroups, plus (optionally) the bbox ones.
  const strongGabonDmmPgIds = await idsOf(PeopleGroup, {
    source: 'DMM',
    $or: [{ countryCode: 'GA' }, { country: { $regex: /gabon/i } }],
  });
  const bboxGabonDmmPgIds = await idsOf(PeopleGroup, { source: 'DMM', ...bbox });

  const cascadePgIds = [
    ...new Set(
      [
        ...strongGabonDmmPgIds,
        ...(INCLUDE_BBOX ? bboxGabonDmmPgIds : []),
      ].map(String),
    ),
  ].map((s) => new mongoose.Types.ObjectId(s));

  console.log(`PeopleGroups DMM Gabon (pays 'GA'/'Gabon') : ${strongGabonDmmPgIds.length}`);
  console.log(`PeopleGroups DMM dans la bbox Gabon        : ${bboxGabonDmmPgIds.length}`);
  console.log(`→ Utilisés pour les cascades               : ${cascadePgIds.length}\n`);

  console.log('── Suppression / aperçu ──\n');

  // ── 2. DMM engagement entities linked to those Gabon DMM PeopleGroups ──────
  if (cascadePgIds.length) {
    const byPg = { peopleGroup: { $in: cascadePgIds } };
    await preview('PersonOfPeace (lié à un PeopleGroup DMM Gabon)', PersonOfPeace, byPg);
    await preview('DiscoveryGroup (lié à un PeopleGroup DMM Gabon)', DiscoveryGroup, byPg);
    await preview('Church (liée à un PeopleGroup DMM Gabon)', Church, byPg);
    await preview('Activity (liée à un PeopleGroup DMM Gabon)', Activity, byPg);
  } else {
    console.log('  • Aucun PeopleGroup DMM Gabon (pays) — pas de cascade par lien.');
  }

  // ── 3. The Gabon DMM PeopleGroups themselves ───────────────────────────────
  // Strong matches always; bbox matches only with --include-bbox.
  const pgDeleteQuery = INCLUDE_BBOX
    ? gabonDmmPgQuery
    : { source: 'DMM', $or: [{ countryCode: 'GA' }, { country: { $regex: /gabon/i } }] };
  await preview('PeopleGroup DMM Gabon', PeopleGroup, pgDeleteQuery);

  // ── 4. Bounding-box-only DMM engagement entities (no country field) ────────
  console.log('\n── Entités DMM par bounding box Gabon (sans champ pays) ──');
  const bboxTargets = [
    ['Village (bbox Gabon)', Village],
    ['PersonOfPeace (bbox Gabon)', PersonOfPeace],
    ['DiscoveryGroup (bbox Gabon)', DiscoveryGroup],
  ];
  for (const [label, model] of bboxTargets) {
    const count = await model.countDocuments(bbox);
    report[label] = count;
    if (CONFIRM && INCLUDE_BBOX && count > 0) {
      const res = await model.deleteMany(bbox);
      console.log(`  ✓ ${label}: supprimé ${res.deletedCount}`);
    } else {
      const suffix = INCLUDE_BBOX
        ? (CONFIRM ? '' : 'seraient supprimés')
        : '(ignoré — utilisez --include-bbox)';
      console.log(`  • ${label}: ${count} document(s) ${suffix}`);
    }
  }

  // Churches have no location; when bbox mode is on, remove churches whose
  // village fell inside the Gabon bbox.
  if (INCLUDE_BBOX) {
    const gabonVillageIds = await idsOf(Village, bbox);
    if (gabonVillageIds.length) {
      const q = { village: { $in: gabonVillageIds } };
      const count = await Church.countDocuments(q);
      report['Church (village bbox Gabon)'] = count;
      if (CONFIRM && count > 0) {
        const res = await Church.deleteMany(q);
        console.log(`  ✓ Church (village bbox Gabon): supprimé ${res.deletedCount}`);
      } else {
        console.log(`  • Church (village bbox Gabon): ${count} document(s) ${CONFIRM ? '' : 'seraient supprimés'}`);
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('  Récapitulatif');
  console.log('──────────────────────────────────────────────────────────────');
  for (const [k, v] of Object.entries(report)) {
    console.log(`  ${k.padEnd(48)} ${v}`);
  }
  const total = Object.values(report).reduce((a, b) => a + b, 0);
  console.log(`  ${'TOTAL'.padEnd(48)} ${total}`);
  console.log('──────────────────────────────────────────────────────────────');

  if (!CONFIRM) {
    console.log('\nDRY-RUN terminé. Aucune donnée supprimée.');
    console.log('Pour supprimer réellement : node scripts/deleteGabonDmmData.js --confirm');
    console.log('Pour inclure les entités DMM par géographie : ajoutez --include-bbox');
  } else {
    console.log('\nSuppression des données DMM du Gabon terminée.');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Erreur :', err);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
