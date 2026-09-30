/**
 * Merge duplicated DMM engagements (PeopleGroup documents) that were created
 * because the old importer matched on the free-text `country` string.
 *
 * Root cause recap:
 *   The 1Q26 import stored country = "Cameroun" and the 2Q26 import stored
 *   country = "Cameroon". The dedupe query required an exact country match, so
 *   the 2Q26 rows did NOT match their 1Q26 counterparts and 80 duplicate
 *   PeopleGroups were created (160 total = 80 x 1Q26 + 80 x 2Q26, names
 *   matching 80/80 across quarters).
 *
 * What this script does:
 *   1. Loads every reporting-visible engagement (source in DMM/Survey/manual).
 *   2. Groups them by  normalized name  +  normalized country code
 *      (Cameroun / Cameroon / CMR / CM all collapse to "CM").
 *   3. For each group with >1 doc, picks the SURVIVOR = the doc with the most
 *      recent reportPeriod (year then quarter; a doc WITH a period beats one
 *      without). The survivor's latest-quarter metrics are applied to the kept
 *      doc; a non-empty villageName and a real location are preserved (if the
 *      survivor lacks one but a duplicate has it, the existing value is kept).
 *      The surviving doc's country is normalized to the canonical spelling and
 *      countryCode is set. The losing duplicates are deleted.
 *
 * SAFETY: dry-run by default. Nothing is written unless you pass --apply.
 *
 * Usage:
 *   node backend/scripts/mergeDuplicateEngagements.js            # dry run (report only)
 *   node backend/scripts/mergeDuplicateEngagements.js --apply    # actually merge + delete
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const { COUNTRY_CONFIG } = require('../routes/countries');

const APPLY = process.argv.includes('--apply');
const DMM_SOURCES = ['DMM', 'Survey', 'manual'];

// Metric fields carried over from the most-recent-quarter survivor.
const METRIC_FIELDS = [
  'numberOfChurches', 'churchGeneration', 'dbs', 'com', 'cat',
  'avgChurchSize', 'newDisciples', 'newBaptisms', 'leadersInTraining',
  'activeCoaches', 'trainingsHeld', 'lostChurches', 'mergedChurches',
  'engagementStatus', 'engagementLevel', 'reportPeriod', 'population',
];

const norm = (s) =>
  String(s == null ? '' : s).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

// alpha-2 / alpha-3 / FR name / EN name -> canonical alpha-2 code.
const COUNTRY_LOOKUP = (() => {
  const map = {};
  Object.values(COUNTRY_CONFIG || {}).forEach((cfg) => {
    if (!cfg || !cfg.code) return;
    const code2 = cfg.code.toUpperCase();
    [cfg.code, cfg.code3, cfg.name, cfg.nameEn].forEach((alias) => {
      const key = norm(alias);
      if (key) map[key] = code2;
    });
  });
  return map;
})();

function resolveCode(country, countryCode) {
  const direct = norm(countryCode);
  if (direct && COUNTRY_CONFIG[direct]) return direct;
  if (COUNTRY_LOOKUP[direct]) return COUNTRY_LOOKUP[direct];
  const key = norm(country);
  if (COUNTRY_LOOKUP[key]) return COUNTRY_LOOKUP[key];
  const upper = String(country || '').trim().toUpperCase();
  if (upper.length === 2 && COUNTRY_CONFIG[upper]) return upper;
  return '';
}

function canonicalName(code2, fallback) {
  const target = String(code2 || '').toUpperCase();
  if (!target) return fallback || '';
  // COUNTRY_CONFIG is keyed by alpha-3; match on the alpha-2 `.code`.
  const cfg = COUNTRY_CONFIG[target] ||
    Object.values(COUNTRY_CONFIG || {}).find((c) => c && String(c.code).toUpperCase() === target);
  return (cfg && cfg.name) || fallback || '';
}

// Parse a reportPeriod like "1Q26" / "2Q26" / "Q1 2026" into a sortable number.
// Higher = more recent. Missing / unparseable => -1 (loses to any real period).
function periodRank(reportPeriod) {
  const s = String(reportPeriod || '').trim().toUpperCase();
  if (!s) return -1;
  let quarter = null;
  let year = null;
  let m = s.match(/([1-4])\s*Q\s*(\d{2,4})/); // 1Q26 / 1Q2026
  if (m) { quarter = Number(m[1]); year = Number(m[2]); }
  if (year == null) {
    m = s.match(/Q\s*([1-4]).*?(\d{2,4})/); // Q1 2026
    if (m) { quarter = Number(m[1]); year = Number(m[2]); }
  }
  if (year == null) return -1;
  if (year < 100) year += 2000; // 26 -> 2026
  return year * 10 + (quarter || 0);
}

const hasRealLocation = (loc) =>
  loc && loc.type === 'Point' && Array.isArray(loc.coordinates) &&
  loc.coordinates.length === 2 &&
  Number.isFinite(loc.coordinates[0]) && Number.isFinite(loc.coordinates[1]);

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting-map';
  console.log(`\nConnecting to MongoDB${APPLY ? ' (APPLY MODE — WILL WRITE)' : ' (DRY RUN — no writes)'}...`);
  await mongoose.connect(mongoUri);
  console.log('Connected.\n');

  const docs = await PeopleGroup.find({ source: { $in: DMM_SOURCES } });
  console.log(`Loaded ${docs.length} reporting-visible engagements.\n`);

  // Group by  normalized name + resolved country code.
  const groups = new Map();
  for (const d of docs) {
    const code = resolveCode(d.country, d.countryCode) || norm(d.country) || 'NONE';
    const key = `${norm(d.name)}::${code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  const dupGroups = [...groups.entries()].filter(([, arr]) => arr.length > 1);
  console.log(`Groups total: ${groups.size} | with duplicates: ${dupGroups.length}\n`);

  let deletedTotal = 0;
  let mergedTotal = 0;

  for (const [key, arr] of dupGroups) {
    // Most recent quarter wins as the "survivor snapshot".
    const sorted = [...arr].sort((a, b) => periodRank(b.reportPeriod) - periodRank(a.reportPeriod));
    const survivorSnapshot = sorted[0];

    // KEEP the OLDEST doc (stable _id / oldest history) as the surviving record,
    // then apply the newest snapshot's metrics onto it.
    const keep = [...arr].sort((a, b) => periodRank(a.reportPeriod) - periodRank(b.reportPeriod))[0];
    const losers = arr.filter((d) => String(d._id) !== String(keep._id));

    const code2 = resolveCode(keep.country, keep.countryCode) ||
      resolveCode(survivorSnapshot.country, survivorSnapshot.countryCode);
    const canonical = canonicalName(code2, keep.country || survivorSnapshot.country);

    // Compute the merged field set (report + write).
    const changes = {};
    for (const f of METRIC_FIELDS) {
      if (survivorSnapshot[f] !== undefined && survivorSnapshot[f] !== null && survivorSnapshot[f] !== '') {
        changes[f] = survivorSnapshot[f];
      }
    }
    // Preserve a populated villageName (prefer any non-empty across the group).
    const villageName = [keep, survivorSnapshot, ...arr]
      .map((d) => (d.villageName || '').trim())
      .find(Boolean);
    if (villageName) changes.villageName = villageName;

    // Preserve a real location (prefer keep, else any duplicate that has one).
    if (!hasRealLocation(keep.location)) {
      const withLoc = arr.find((d) => hasRealLocation(d.location));
      if (withLoc) changes.location = withLoc.location;
    }
    if (canonical) changes.country = canonical;
    if (code2) changes.countryCode = code2;

    console.log('─'.repeat(72));
    console.log(`GROUP ${key}`);
    console.log(`  KEEP   _id=${keep._id}  name="${keep.name}"  period=${keep.reportPeriod || '—'}`);
    console.log(`  SNAPSHOT from _id=${survivorSnapshot._id} period=${survivorSnapshot.reportPeriod || '—'}`);
    const rCountry = changes.country ?? keep.country ?? '—';
    const rCode = changes.countryCode ?? keep.countryCode ?? '—';
    const rVillage = changes.villageName ?? keep.villageName ?? '—';
    const rPeriod = changes.reportPeriod ?? keep.reportPeriod ?? '—';
    const rChurches = changes.numberOfChurches ?? keep.numberOfChurches ?? 0;
    console.log(`  RESULT country="${rCountry}" code=${rCode} village="${rVillage}" reportPeriod=${rPeriod} churches=${rChurches}`);
    console.log(`  DELETE ${losers.length} duplicate(s): ${losers.map((d) => d._id).join(', ')}`);

    if (APPLY) {
      Object.assign(keep, changes);
      await keep.save();
      const ids = losers.map((d) => d._id);
      await PeopleGroup.deleteMany({ _id: { $in: ids } });
    }
    mergedTotal += 1;
    deletedTotal += losers.length;
  }

  console.log('\n' + '═'.repeat(72));
  console.log(`SUMMARY${APPLY ? ' (APPLIED)' : ' (DRY RUN)'}`);
  console.log(`  Duplicate groups merged : ${mergedTotal}`);
  console.log(`  Documents ${APPLY ? 'deleted' : 'that WOULD be deleted'} : ${deletedTotal}`);
  console.log(`  Documents kept          : ${mergedTotal}`);
  if (!APPLY) console.log('\n  Re-run with --apply to perform the merge + deletion.');
  console.log('═'.repeat(72) + '\n');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('mergeDuplicateEngagements failed:', err);
  process.exitCode = 1;
  mongoose.disconnect();
});
