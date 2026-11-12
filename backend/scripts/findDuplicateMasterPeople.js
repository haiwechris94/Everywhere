/**
 * findDuplicateMasterPeople.js — detect likely-duplicate master peoples that were
 * never linked (e.g. "Cameroun" DMM vs "Cameroon" JP) because they share no
 * masterPeopleId, no common ROP3, and have divergent FR/EN names.
 *
 * Strategy (read-only — proposes, never mutates):
 *   1. Group candidate masters by primaryCountryCode.
 *   2. Within each country, compare every pair with the SAME name-matching
 *      primitives the ingestion loader uses (scripts/lib/peopleMatcher.js):
 *        - ROP3 equality         -> very strong signal
 *        - trigram name similarity (diacritic-insensitive, so Cameroun≈Cameroon)
 *      and (optionally) geo proximity via primaryLocation.
 *   3. Emit ranked candidate pairs with a confidence band so an admin can call
 *      POST /api/master-people/:survivorId/merge { loserIds: [...] }.
 *
 * Usage:
 *   node scripts/findDuplicateMasterPeople.js [--country=CMR] [--min-sim=0.6] [--json]
 *   node scripts/findDuplicateMasterPeople.js --json > candidates.json
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MasterPeople = require('../models/MasterPeople');
const {
  trigramSimilarity,
  haversineKm,
  PROX_RADIUS_KM,
} = require('./lib/peopleMatcher');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const COUNTRY = getArg('country', null);
const MIN_SIM = parseFloat(getArg('min-sim', '0.6'));
const AS_JSON = args.includes('--json');

function bandForPair({ sim, sameRop3, sameCountry, withinGeo }) {
  // Lightweight scoring aligned with the loader's intent (name + country + geo).
  let score = 0;
  if (sameRop3) score += 55;
  if (sameCountry) score += 20;
  if (sim >= 0.85) score += 15;
  else if (sim >= 0.6) score += 8;
  if (withinGeo) score += 10;
  const band = score >= 90 ? 'AUTO_MERGE' : score >= 70 ? 'MANUAL_REVIEW' : 'KEEP_SEPARATE';
  return { score, band };
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  await mongoose.connect(uri);

  const filter = {};
  if (COUNTRY) filter.primaryCountryCode = COUNTRY.toUpperCase();

  const masters = await MasterPeople.find(filter)
    .select('canonicalName primaryCountryCode rop3 sourceTypes primaryLocation totalPopulation')
    .lean();

  // Bucket by country so we only compare within the same country.
  const byCountry = new Map();
  for (const m of masters) {
    const key = m.primaryCountryCode || '__none__';
    if (!byCountry.has(key)) byCountry.set(key, []);
    byCountry.get(key).push(m);
  }

  const candidates = [];
  for (const [country, group] of byCountry.entries()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        const sim = trigramSimilarity(a.canonicalName, b.canonicalName);
        const sameRop3 = !!(a.rop3 && b.rop3 && a.rop3 === b.rop3);

        // geo proximity when both have a primary point
        let withinGeo = false;
        let distanceKm = null;
        const ac = a.primaryLocation && a.primaryLocation.coordinates;
        const bc = b.primaryLocation && b.primaryLocation.coordinates;
        if (Array.isArray(ac) && Array.isArray(bc)) {
          distanceKm = haversineKm(ac[1], ac[0], bc[1], bc[0]);
          withinGeo = distanceKm <= PROX_RADIUS_KM;
        }

        // Keep a pair if names are similar enough OR share a ROP3.
        if (!sameRop3 && sim < MIN_SIM) continue;

        // Only surface cross-source duplicates (the actual "DMM vs JP" problem):
        // skip pairs that come from the exact same single source set.
        const aTypes = (a.sourceTypes || []).slice().sort().join(',');
        const bTypes = (b.sourceTypes || []).slice().sort().join(',');
        const crossSource = aTypes !== bTypes || aTypes === '' || bTypes === '';

        const { score, band } = bandForPair({
          sim,
          sameRop3,
          sameCountry: country !== '__none__',
          withinGeo,
        });
        if (band === 'KEEP_SEPARATE' && !crossSource) continue;

        // Suggest the master with the richer source set as survivor; tie -> larger pop.
        let survivor = a;
        let loser = b;
        const aRank = (a.sourceTypes || []).length;
        const bRank = (b.sourceTypes || []).length;
        if (bRank > aRank || (bRank === aRank && (b.totalPopulation || 0) > (a.totalPopulation || 0))) {
          survivor = b;
          loser = a;
        }

        candidates.push({
          country,
          similarity: Number(sim.toFixed(3)),
          sameRop3,
          distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(1)),
          score,
          band,
          survivor: {
            id: String(survivor._id),
            name: survivor.canonicalName,
            sources: survivor.sourceTypes || [],
          },
          loser: {
            id: String(loser._id),
            name: loser.canonicalName,
            sources: loser.sourceTypes || [],
          },
          mergeCall: `POST /api/master-people/${String(survivor._id)}/merge  body: { "loserIds": ["${String(loser._id)}"] }`,
        });
      }
    }
  }

  candidates.sort((x, y) => y.score - x.score);

  if (AS_JSON) {
    console.log(JSON.stringify({ count: candidates.length, candidates }, null, 2));
  } else {
    console.log(`\nDuplicate master-people candidates: ${candidates.length}` +
      (COUNTRY ? ` (country=${COUNTRY.toUpperCase()})` : '') +
      ` [min-sim=${MIN_SIM}]\n`);
    for (const c of candidates) {
      console.log(
        `[${c.band}] score=${c.score} sim=${c.similarity}` +
        (c.sameRop3 ? ' ROP3✓' : '') +
        (c.distanceKm != null ? ` ${c.distanceKm}km` : '') +
        ` (${c.country})`
      );
      console.log(`   survivor: "${c.survivor.name}" [${c.survivor.sources.join('/') || '—'}] ${c.survivor.id}`);
      console.log(`   loser:    "${c.loser.name}" [${c.loser.sources.join('/') || '—'}] ${c.loser.id}`);
      console.log(`   → ${c.mergeCall}\n`);
    }
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
