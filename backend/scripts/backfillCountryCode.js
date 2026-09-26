/**
 * Backfill / repair the `countryCode` (ISO 3166-1 alpha-2) field on existing
 * PeopleGroup documents so the Reporting / Country / Region funnel (which filters
 * by countryCode) picks up data that was imported BEFORE the import fix.
 *
 * Why this is needed:
 *   The old import wrote countryCode by simply upper-casing the CSV `country`
 *   value (e.g. "Cameroon" -> "CAMEROON"), which is NOT a valid 2-letter code,
 *   so the reporting queries (`countryCode: { $in: ['CM'] }`) never matched and
 *   nothing showed up in Data Reporting / Pays / Région / fiches peuples.
 *
 * What it does (idempotent — safe to run repeatedly):
 *   1. For EVERY PeopleGroup, resolve the correct alpha-2 code from its
 *      `country` value using the SAME source of truth as the app
 *      (backend/routes/countries.js -> COUNTRY_CONFIG: alpha-2, alpha-3,
 *      French name, English name).
 *   2. Update the document only when the resolved code differs from the stored
 *      one (fixes missing, empty, AND wrong/invalid values like "CAMEROON").
 *   3. Prints a per-country summary + a list of unresolved country strings so
 *      you can add any missing aliases.
 *
 * Usage:
 *   node backend/scripts/backfillCountryCode.js            # apply changes
 *   node backend/scripts/backfillCountryCode.js --dry-run  # preview only
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const { COUNTRY_CONFIG } = require('../routes/countries');

const DRY_RUN = process.argv.includes('--dry-run');

// Build a lookup: every known identifier (alpha-2, alpha-3, FR name, EN name)
// -> canonical alpha-2 code. Same logic as the fixed import route.
const norm = (s) =>
  String(s == null ? '' : s)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

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

function resolveCode(country) {
  const key = norm(country);
  if (!key) return '';
  if (COUNTRY_LOOKUP[key]) return COUNTRY_LOOKUP[key];
  // Already a valid known 2-letter code?
  const upper = String(country || '').trim().toUpperCase();
  if (upper.length === 2 && COUNTRY_CONFIG[upper]) return upper;
  return '';
}

async function run() {
  const mongoUri =
    process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  console.log(`Connecting to MongoDB${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  await mongoose.connect(mongoUri);
  console.log('Connected.');

  const all = await PeopleGroup.find(
    {},
    { _id: 1, name: 1, country: 1, countryCode: 1 },
  ).lean();

  console.log(`Scanning ${all.length} people groups...`);

  let updated = 0;
  let alreadyOk = 0;
  let noCountry = 0;
  const byCode = {};
  const unresolved = {};

  for (const pg of all) {
    const resolved = resolveCode(pg.country);

    if (!resolved) {
      if (!pg.country || !String(pg.country).trim()) {
        noCountry++;
      } else {
        unresolved[pg.country] = (unresolved[pg.country] || 0) + 1;
      }
      continue;
    }

    if (pg.countryCode === resolved) {
      alreadyOk++;
      continue;
    }

    byCode[resolved] = (byCode[resolved] || 0) + 1;
    if (!DRY_RUN) {
      await PeopleGroup.updateOne(
        { _id: pg._id },
        { $set: { countryCode: resolved } },
      );
    }
    updated++;
  }

  console.log('\n──────── Backfill summary ────────');
  console.log(`${DRY_RUN ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`Already correct:          ${alreadyOk}`);
  console.log(`No country value:         ${noCountry}`);
  console.log('Fixed by resolved code:');
  Object.entries(byCode)
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, n]) => console.log(`   ${code}: ${n}`));

  const unresolvedKeys = Object.keys(unresolved);
  if (unresolvedKeys.length) {
    console.log('\n⚠ Unresolved country strings (add aliases in COUNTRY_CONFIG):');
    unresolvedKeys
      .sort((a, b) => unresolved[b] - unresolved[a])
      .forEach((k) => console.log(`   "${k}": ${unresolved[k]}`));
  } else {
    console.log('\nAll non-empty country values resolved. ✅');
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
