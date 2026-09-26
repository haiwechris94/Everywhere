/**
 * ingestDmmPeople.js — DMM PeopleGroup → MasterPeople ingestion / linking loader
 * =============================================================================
 * Reconciles user-entered DMM (Disciple Making Movement) PeopleGroups into the
 * canonical people-graph. For every `PeopleGroup { source: 'DMM' }` it decides
 * whether the group is the SAME ethnic people as an existing MasterPeople (LINK)
 * or a brand-new canonical group (NEW master, KEEP_SEPARATE), then records the
 * decision as PeopleSource / PeopleMatch / PeopleLocation documents and refreshes
 * an Option-B `MasterPeople.dmmRollup` engagement summary. See
 * docs/architecture/07-dmm-masterpeople-linking.md.
 *
 * This is the DMM counterpart to buildMasterPeople.js. It shares the SAME matching
 * primitives (normalization / similarity / distance / bands) from ./lib/peopleMatcher
 * so the two loaders never diverge, but layers DMM-specific rules on top:
 *
 *   HARD COUNTRY GATE  — a DMM group can only ever link to a master in the SAME
 *                        country (ISO-3). Different country ⇒ immediate KEEP_SEPARATE.
 *   STRICT BAND CAP    — a merge band (AUTO_MERGE / MANUAL_REVIEW) is only allowed
 *                        when NAME (strong/medium) AND COUNTRY AND GEO signals are
 *                        ALL present. Any missing signal ⇒ KEEP_SEPARATE regardless
 *                        of raw score. (DMM data is locality-scoped and noisy, so we
 *                        deliberately require all three signals before merging.)
 *   CANONICAL NAME     — DMM names often embed the locality ('Fulani Maroua'); we
 *                        strip locality tokens (village/admin/region/country) before
 *                        comparing, so 'Fulani Maroua' → 'fulani'.
 *
 * WRITES ONLY to: people_sources, people_matches, people_locations, master_people
 *   (dmmRollup + sourceTypes), and PeopleGroup.masterPeopleId. It NEVER deletes or
 *   modifies JP/CPPI sources, JP/CPPI masters, or their matches.
 *
 * USAGE:
 *   node scripts/ingestDmmPeople.js --dry-run
 *       Compute all decisions + print the reconciliation report. ZERO writes.
 *   node scripts/ingestDmmPeople.js --reset
 *       Remove ONLY DMM artifacts (see below) BEFORE processing, then ingest.
 *   node scripts/ingestDmmPeople.js --limit=N
 *       Process only the first N DMM PeopleGroups (smoke test).
 *   node scripts/ingestDmmPeople.js
 *       Idempotent ingest via upserts (no reset).
 *
 * FLAGS may be combined, e.g. `--dry-run --limit=100`.
 *
 * --reset scope (DMM-only, never touches JP/CPPI):
 *   1. capture the _ids of every PeopleSource { sourceType:'DMM' }
 *   2. delete PeopleMatch / PeopleLocation whose toSourceId / sourceId ∈ those ids
 *   3. delete those DMM PeopleSource docs
 *   4. $unset masterPeopleId on PeopleGroup { source:'DMM' }
 *   5. for masters that end up with NO remaining DMM sources: $pull 'DMM' from
 *      sourceTypes and $unset dmmRollup
 *
 * IDEMPOTENCY (re-run without --reset):
 *   people_sources  upsert key: (sourceType:'DMM', sourceRecordId: String(pg._id))
 *   For each touched master we deleteMany the DMM-scoped PeopleMatch/PeopleLocation
 *   (matches/locations whose source is a DMM source for that master) before
 *   recreating them, so re-runs converge and never duplicate — while leaving that
 *   master's JP/CPPI matches/locations untouched.
 *
 * Connection: require('dotenv').config({ path: '../.env' }) + mongoose.connect(MONGODB_URI).
 * =============================================================================
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const mongoose = require('mongoose');

const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const PeopleSource = require('../models/PeopleSource');
const PeopleMatch = require('../models/PeopleMatch');
const PeopleLocation = require('../models/PeopleLocation');
const Country = require('../models/Country');

const dmmStatusCalculator = require('../services/dmmStatusCalculator');

// Shared matching primitives + 0–100 scoring constants (one canonical copy shared
// with buildMasterPeople.js). See ./lib/peopleMatcher.js.
const {
  AUTO_MERGE,
  MANUAL_LOW,
  PROX_RADIUS_KM,
  PTS_COUNTRY_MATCH,
  PTS_GEO,
  normName,
  trigramSimilarity,
  haversineKm,
  clamp,
  bandFor,
  tierName,
} = require('./lib/peopleMatcher');

// ─────────────────────────────────────────────────────────────────────────────
// DMM-SPECIFIC SCORING CONSTANTS
// DMM names are locality-scoped, so a matching canonical name is a much stronger
// signal here than in the JP↔CPPI merge — we weight name higher accordingly. The
// STRICT band cap (name+country+geo all required) keeps this from over-merging.
// ─────────────────────────────────────────────────────────────────────────────
const DMM_PTS_NAME_HIGH = 45; // sim >= NAME_SIM_HIGH
const DMM_PTS_NAME_MED = 25;  // NAME_SIM_MED <= sim < NAME_SIM_HIGH
const NAME_SIM_HIGH = 0.85;
const NAME_SIM_MED = 0.6;

// DMM-LOCAL proximity radius (km). Wider than the shared PROX_RADIUS_KM (25km)
// because a DMM engagement is recorded at a specific VILLAGE point, which can sit
// several tens of km from the JP/CPPI people-group CENTROID for the same ethnic
// people (large territories). The STRICT band cap still requires a name signal +
// same country, so widening geo only helps genuine same-people village entries
// (e.g. 'Bangolang' at 31km) link to their existing master instead of duplicating.
// Kept local so the shared JP<->CPPI matcher and its 25km radius are untouched.
const DMM_PROX_RADIUS_KM = 40;

const MIGRATION_VERSION = 1;
const BULK = 500;

// ─────────────────────────────────────────────────────────────────────────────
// CLI (parsed like buildMasterPeople.js)
// ─────────────────────────────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const FLAG_DRY_RUN = ARGS.includes('--dry-run');
const FLAG_RESET = ARGS.includes('--reset');
const LIMIT = (() => {
  const a = ARGS.find((x) => x.startsWith('--limit='));
  if (!a) return null;
  const n = parseInt(a.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function s(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** GeoJSON Point → { lat, lng } (coordinates are [lng, lat]). */
function pointToLatLng(pt) {
  if (!pt || !Array.isArray(pt.coordinates) || pt.coordinates.length !== 2) return null;
  const [lng, lat] = pt.coordinates;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}

// ─────────────────────────────────────────────────────────────────────────────
// DMM CANONICAL NAME — strip locality tokens from the group name.
// DMM entries frequently qualify a people name with its locality, e.g.
// 'Fulani Maroua' (region/village 'Maroua'). For matching we want just the ethnic
// name ('fulani'), so we remove any name token that also appears in the group's
// locality fields (villageName / admin3 / admin2 / region / country).
// ─────────────────────────────────────────────────────────────────────────────
function dmmCanonicalName(pg) {
  const localityTokens = new Set();
  for (const field of [pg.villageName, pg.admin3, pg.admin2, pg.region, pg.country]) {
    const norm = normName(field);
    if (!norm) continue;
    for (const tok of norm.split(/\s+/)) {
      if (tok) localityTokens.add(tok);
    }
  }
  const nameNorm = normName(pg.name);
  const kept = nameNorm.split(/\s+/).filter((tok) => tok && !localityTokens.has(tok));
  const canon = kept.join(' ').trim();
  return canon || nameNorm; // fall back to full normalized name if nothing remains
}

// ─────────────────────────────────────────────────────────────────────────────
// ISO-3 RESOLUTION — DMM pg.countryCode is ISO alpha-2, pg.country is a name.
// Resolve to the dataset-internal ISO alpha-3 (matching MasterPeople.primaryCountryCode).
// Cached per (countryCode|country) so repeat groups don't re-query.
// ─────────────────────────────────────────────────────────────────────────────
function makeResolveIso3() {
  const cache = new Map(); // key -> iso3|null
  return async function resolveIso3(pg) {
    const code = s(pg.countryCode);
    const name = s(pg.country);
    const key = `${code.toUpperCase()}|${name.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key);

    let iso3 = null;
    // 1) by code (getByCode matches either ISO-2 code OR ISO-3 code3)
    if (code) {
      const byCode = await Country.getByCode(code);
      if (byCode && byCode.code3) iso3 = String(byCode.code3).toUpperCase();
    }
    // 2) fall back to name / nameFr (case-insensitive) if code didn't resolve
    if (!iso3 && name) {
      const rx = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const byName = await Country.findOne({ $or: [{ name: rx }, { nameFr: rx }] });
      if (byName && byName.code3) iso3 = String(byName.code3).toUpperCase();
    }

    cache.set(key, iso3);
    return iso3;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING — DMM group vs a candidate MasterPeople.
// Returns { score, tier, matchType, band }. Applies the HARD COUNTRY GATE up front
// and the STRICT BAND CAP (name+country+geo all required) at the end.
// ─────────────────────────────────────────────────────────────────────────────
function scoreDmmAgainstMaster(pg, pgIso3, pgCanonName, master) {
  // HARD COUNTRY GATE: never link across countries (or when either side lacks a country).
  if (!pgIso3 || !master.primaryCountryCode || pgIso3 !== master.primaryCountryCode) {
    return { score: 0, tier: 5, matchType: 'COUNTRY', band: 'KEEP_SEPARATE' };
  }

  let score = 0;
  let tier = 5;

  // COUNTRY (Tier 3) — guaranteed present past the gate.
  const hasCountry = true;
  score += PTS_COUNTRY_MATCH; // 20
  tier = Math.min(tier, 3);

  // NAME (Tier 4) — compare stripped DMM canonical name to the master's canonical name.
  // (Aliases could be folded in for a max-over-aliases, but canonicalName is kept
  // deliberately simple and consistent here.)
  const sim = trigramSimilarity(pgCanonName, normName(master.canonicalName));
  let nameSignal = null;
  if (sim >= NAME_SIM_HIGH) {
    score += DMM_PTS_NAME_HIGH; // 45
    nameSignal = 'strong';
    tier = Math.min(tier, 4);
  } else if (sim >= NAME_SIM_MED) {
    score += DMM_PTS_NAME_MED; // 25
    nameSignal = 'medium';
    tier = Math.min(tier, 4);
  }

  // GEO (Tier 5) — proximity within PROX_RADIUS_KM (25km). GeoJSON is [lng, lat].
  let hasGeo = false;
  const pgPt = pointToLatLng(pg.location);
  const mPt = pointToLatLng(master.primaryLocation);
  if (pgPt && mPt) {
    const km = haversineKm(pgPt.lat, pgPt.lng, mPt.lat, mPt.lng);
    if (km <= DMM_PROX_RADIUS_KM) {
      score += PTS_GEO; // 10
      hasGeo = true;
      tier = Math.min(tier, 5);
    }
  }

  score = clamp(score, 0, 100);

  // Provisional band from raw score…
  let band = bandFor(score);

  // …then STRICT CAP: all three signals (name strong|medium, country, geo) required.
  const hasName = nameSignal === 'strong' || nameSignal === 'medium';
  if (!(hasName && hasCountry && hasGeo)) {
    band = 'KEEP_SEPARATE';
  }

  return { score, tier, matchType: tierName(tier), band };
}

// ─────────────────────────────────────────────────────────────────────────────
// RESET — remove ONLY DMM artifacts (never JP/CPPI).
// ─────────────────────────────────────────────────────────────────────────────
async function resetDmmArtifacts() {
  console.log('RESET: removing DMM artifacts (JP/CPPI untouched)…');

  // 1) capture DMM source _ids first (so we can scope match/location deletes).
  const dmmSources = await PeopleSource.find({ sourceType: 'DMM' }, { _id: 1, masterPeopleId: 1 }).lean();
  const dmmSourceIds = dmmSources.map((d) => d._id);
  const affectedMasterIds = [...new Set(dmmSources.map((d) => String(d.masterPeopleId)).filter(Boolean))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  // 2) delete matches/locations referencing those DMM sources.
  if (dmmSourceIds.length) {
    await Promise.all([
      PeopleMatch.deleteMany({ toSourceId: { $in: dmmSourceIds } }),
      PeopleLocation.deleteMany({ sourceId: { $in: dmmSourceIds } }),
    ]);
  }

  // 3) delete the DMM sources themselves.
  await PeopleSource.deleteMany({ sourceType: 'DMM' });

  // 4) unlink DMM PeopleGroups.
  await PeopleGroup.updateMany({ source: 'DMM' }, { $unset: { masterPeopleId: '' } });

  // 5) for each previously-affected master, if it has NO remaining DMM sources,
  //    pull 'DMM' from sourceTypes and clear dmmRollup (leaving JP/CPPI intact).
  let cleanedMasters = 0;
  for (const masterId of affectedMasterIds) {
    const remaining = await PeopleSource.countDocuments({ masterPeopleId: masterId, sourceType: 'DMM' });
    if (remaining === 0) {
      await MasterPeople.updateOne(
        { _id: masterId },
        { $pull: { sourceTypes: 'DMM' }, $unset: { dmmRollup: '' } }
      );
      cleanedMasters++;
    }
  }

  console.log(
    `  removed ${dmmSourceIds.length} DMM sources; unlinked DMM groups; cleaned ${cleanedMasters} master(s).`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const started = Date.now();

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('FATAL: MONGODB_URI is not set (check backend/.env).');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  const migrationRunId = `dmm-run-${started}`;

  try {
    console.log(
      `Mode: ${FLAG_DRY_RUN ? 'DRY-RUN (no writes)' : FLAG_RESET ? 'RESET + INGEST' : 'INGEST (upsert)'}` +
        (LIMIT ? ` | limit=${LIMIT}` : '')
    );

    // ── --reset (only when actually writing) ───────────────────────────────
    if (FLAG_RESET && !FLAG_DRY_RUN) {
      await resetDmmArtifacts();
    } else if (FLAG_RESET && FLAG_DRY_RUN) {
      console.log('RESET skipped (dry-run performs zero writes).');
    }

    // ── Load DMM PeopleGroups ──────────────────────────────────────────────
    let query = PeopleGroup.find({ source: 'DMM' });
    if (LIMIT) query = query.limit(LIMIT);
    const dmmGroups = await query.exec();
    console.log(`DMM PeopleGroups to process: ${dmmGroups.length}`);

    const resolveIso3 = makeResolveIso3();

    // Per-country candidate-master cache so we query each country only once.
    const candidatesByCountry = new Map(); // iso3 -> [master docs]
    const loadCandidates = async (iso3) => {
      if (!iso3) return [];
      if (candidatesByCountry.has(iso3)) return candidatesByCountry.get(iso3);
      const list = await MasterPeople.find({ primaryCountryCode: iso3 }).lean();
      candidatesByCountry.set(iso3, list);
      return list;
    };

    // Report counters + tallies.
    let cntAutoMerge = 0;
    let cntManualReview = 0;
    let cntNewMaster = 0;
    const touchedMasterIds = new Set(); // string ids of every master we linked/created

    // ── Decision pass ──────────────────────────────────────────────────────
    // Each decision: { pg, pgIso3, pgCanonName, action:'LINK'|'NEW', master?, best? }
    const decisions = [];
    for (const pg of dmmGroups) {
      const pgIso3 = await resolveIso3(pg);
      const pgCanonName = dmmCanonicalName(pg);

      const candidates = await loadCandidates(pgIso3);

      let best = null; // { master, score, tier, matchType, band }
      for (const master of candidates) {
        const scored = scoreDmmAgainstMaster(pg, pgIso3, pgCanonName, master);
        if (
          !best ||
          scored.score > best.score ||
          (scored.score === best.score && scored.tier < best.tier) // tie → prefer stronger tier
        ) {
          best = { master, ...scored };
        }
      }

      if (best && (best.band === 'AUTO_MERGE' || best.band === 'MANUAL_REVIEW')) {
        if (best.band === 'AUTO_MERGE') cntAutoMerge++;
        else cntManualReview++;
        decisions.push({ pg, pgIso3, pgCanonName, action: 'LINK', master: best.master, best });
      } else {
        cntNewMaster++;
        decisions.push({ pg, pgIso3, pgCanonName, action: 'NEW', best });
      }
    }

    // ── WRITE PHASE (skipped entirely in --dry-run) ────────────────────────
    if (!FLAG_DRY_RUN) {
      for (const d of decisions) {
        const { pg, pgIso3, pgCanonName, best } = d;

        // 1) Determine the target master _id (link to existing, or create new).
        let masterId;
        let matchTypeForRecord;
        let matchTierForRecord;
        let confidenceForRecord;
        let bandForRecord;

        if (d.action === 'LINK') {
          masterId = d.master._id;
          matchTypeForRecord = best.matchType;
          matchTierForRecord = best.tier;
          confidenceForRecord = best.score;
          bandForRecord = best.band;
          // Ensure 'DMM' is registered on the master's source-type list.
          await MasterPeople.updateOne({ _id: masterId }, { $addToSet: { sourceTypes: 'DMM' } });
        } else {
          // NEW master keyed by the DMM group's natural key.
          // Idempotent upsert (not create()) so re-runs — or a re-run after a
          // mid-loop crash that already inserted some NEW masters — converge on the
          // same master instead of throwing a duplicate-key error on the unique
          // groupNaturalKey index.
          const naturalKey = `DMM:${pg._id}`;
          const created = await MasterPeople.findOneAndUpdate(
            { groupNaturalKey: naturalKey },
            {
              $setOnInsert: {
                canonicalName: pg.name,
                groupNaturalKey: naturalKey,
                primaryCountryCode: pgIso3 || null,
                primaryLanguageName: pg.language || null,
                primaryLocation: pg.location || null,
                sourceTypes: ['DMM'],
                totalPopulation: pg.population || 0,
                status: { status: 'UNKNOWN' },
                migrationRunId,
                version: MIGRATION_VERSION,
              },
            },
            { upsert: true, new: true }
          );
          masterId = created._id;
          matchTypeForRecord = best ? best.matchType : 'MANUAL';
          matchTierForRecord = best ? best.tier : 5;
          confidenceForRecord = best ? best.score : 0;
          bandForRecord = 'KEEP_SEPARATE';
        }
        touchedMasterIds.add(String(masterId));

        // 2) Idempotent PeopleSource upsert (key: sourceType+sourceRecordId).
        const recordId = String(pg._id);
        await PeopleSource.updateOne(
          { sourceType: 'DMM', sourceRecordId: recordId },
          {
            $set: {
              masterPeopleId: masterId,
              sourceType: 'DMM',
              sourceRecordId: recordId,
              countryCode: pgIso3 || null,
              countryName: pg.country || null,
              sourceName: pg.name,
              population: typeof pg.population === 'number' ? pg.population : null,
              rawAttributes: {
                name: pg.name,
                villageName: pg.villageName,
                region: pg.region,
                admin2: pg.admin2,
                admin3: pg.admin3,
                country: pg.country,
                countryCode: pg.countryCode,
                numberOfChurches: pg.numberOfChurches,
                churchGeneration: pg.churchGeneration,
                engagementStatus: pg.engagementStatus,
                location: pg.location,
              },
            },
            $setOnInsert: { importedAt: new Date() },
          },
          { upsert: true }
        );

        // Resolve the DMM source _id (needed for match/location refs).
        const sourceDoc = await PeopleSource.findOne(
          { sourceType: 'DMM', sourceRecordId: recordId },
          { _id: 1 }
        ).lean();
        const sourceId = sourceDoc ? sourceDoc._id : null;

        // 3) Idempotency: clear this DMM source's prior match/location rows before
        //    recreating (scoped to the DMM source only — JP/CPPI rows untouched).
        if (sourceId) {
          await Promise.all([
            PeopleMatch.deleteMany({ toSourceId: sourceId }),
            PeopleLocation.deleteMany({ sourceId }),
          ]);
        }

        // 4) PeopleMatch (audit of the decision).
        if (sourceId) {
          await PeopleMatch.create({
            masterPeopleId: masterId,
            toSourceId: sourceId,
            matchType: matchTypeForRecord,
            matchTier: matchTierForRecord,
            confidence: confidenceForRecord,
            confidenceBand: bandForRecord,
            decidedBy: bandForRecord === 'MANUAL_REVIEW' ? 'pending' : 'system',
          });
        }

        // 5) PeopleLocation (if the group has a point).
        const pgPt = pointToLatLng(pg.location);
        if (sourceId && pg.location && pgPt) {
          await PeopleLocation.create({
            masterPeopleId: masterId,
            sourceId,
            geom: pg.location,
            latitude: pgPt.lat,
            longitude: pgPt.lng,
            countryCode: pgIso3 || null,
            isPrimary: d.action === 'NEW', // NEW master's own point is primary; links are not
            sourceType: 'DMM',
          });
        }

        // 6) Link the PeopleGroup to its master.
        // Use a targeted, unvalidated update instead of pg.save(): a full-document
        // save re-validates EVERY field, which fails on legacy DMM rows that carry
        // an out-of-enum `status` (e.g. 'midway') written by an older import path
        // that bypassed validation. We only need to set the link here, so scope the
        // write to masterPeopleId and skip re-validating unrelated legacy fields.
        pg.masterPeopleId = masterId;
        await PeopleGroup.updateOne({ _id: pg._id }, { $set: { masterPeopleId: masterId } });
      }

      // ── OPTION B ROLLUP — aggregate DMM engagement per touched master ─────
      console.log(`Computing DMM rollups for ${touchedMasterIds.size} master(s)…`);
      for (const idStr of touchedMasterIds) {
        const masterId = new mongoose.Types.ObjectId(idStr);
        const members = await PeopleGroup.find({ source: 'DMM', masterPeopleId: masterId }).lean();

        const engagementCount = members.length;
        const villagesTouched = new Set(members.map((m) => s(m.villageName)).filter((v) => v)).size;
        const totalChurches = members.reduce((sum, m) => sum + toInt(m.numberOfChurches), 0);
        const maxGeneration = members.reduce((mx, m) => Math.max(mx, toInt(m.churchGeneration)), 0);

        const status = dmmStatusCalculator.calculateStatus(totalChurches, maxGeneration);
        const level = dmmStatusCalculator.calculateLevel(maxGeneration);

        // $set dmmRollup only — never overwrite master.status (JP-derived reached-status).
        await MasterPeople.updateOne(
          { _id: masterId },
          {
            $set: {
              dmmRollup: {
                engagementCount,
                villagesTouched,
                totalChurches,
                maxGeneration,
                status,
                level,
                updatedAt: new Date(),
              },
            },
          }
        );
      }
    }

    // ── RECONCILIATION REPORT (always printed) ─────────────────────────────
    printReport(
      {
        dmmProcessed: dmmGroups.length,
        autoMerge: cntAutoMerge,
        manualReview: cntManualReview,
        newMasters: cntNewMaster,
        distinctMastersTouched: FLAG_DRY_RUN
          ? distinctMasterEstimate(decisions)
          : touchedMasterIds.size,
      },
      decisions,
      started,
      FLAG_DRY_RUN
    );
  } finally {
    await mongoose.disconnect();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTING
// ─────────────────────────────────────────────────────────────────────────────

/** In dry-run we have no touched-master set; estimate distinct masters from decisions. */
function distinctMasterEstimate(decisions) {
  const linked = new Set(
    decisions.filter((d) => d.action === 'LINK').map((d) => String(d.master._id))
  );
  const created = decisions.filter((d) => d.action === 'NEW').length;
  return linked.size + created; // each NEW is its own (yet-uncreated) master
}

/**
 * Print the reconciliation report plus up to ~5 example aggregations: a canonical
 * name that gathered more than one DMM engagement (the Fulani-style aggregation),
 * with its member engagement names + villages.
 */
function printReport(stats, decisions, started, dryRun) {
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const line = '─'.repeat(60);

  console.log(`\n${line}`);
  console.log(`DMM RECONCILIATION REPORT${dryRun ? ' (DRY RUN — no writes performed)' : ''}`);
  console.log(line);
  console.log(`  DMM groups processed:      ${stats.dmmProcessed}`);
  console.log(`    AUTO_MERGE links:        ${stats.autoMerge}`);
  console.log(`    MANUAL_REVIEW links:     ${stats.manualReview}  (needs review)`);
  console.log(`    NEW masters (KEEP_SEP):  ${stats.newMasters}`);
  console.log(`  Distinct masters touched:  ${stats.distinctMastersTouched}`);
  console.log(line);

  // Build aggregations keyed by (target master identity, canonical name). For LINK
  // decisions we key by the master _id; for NEW decisions by the new group key.
  const agg = new Map(); // key -> { canonicalName, members: [{name, village}] }
  for (const d of decisions) {
    const key =
      d.action === 'LINK' ? `M:${String(d.master._id)}` : `N:${String(d.pg._id)}`;
    const canonicalName =
      d.action === 'LINK' ? d.master.canonicalName : d.pg.name;
    if (!agg.has(key)) agg.set(key, { canonicalName, members: [] });
    agg.get(key).members.push({
      name: d.pg.name,
      village: s(d.pg.villageName) || s(d.pg.region) || '—',
    });
  }

  const multi = [...agg.values()].filter((a) => a.members.length > 1).slice(0, 5);
  if (multi.length) {
    console.log('  Example aggregations (canonicalName with >1 engagement):');
    for (const a of multi) {
      console.log(`    • ${a.canonicalName}  (${a.members.length} engagements)`);
      for (const m of a.members) {
        console.log(`        - ${m.name}  @ ${m.village}`);
      }
    }
  } else {
    console.log('  Example aggregations: (none — no canonicalName gathered >1 engagement)');
  }
  console.log(line);
  console.log(`  Elapsed: ${secs}s`);
  console.log(`${line}\n`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
