/**
 * DMM MasterPeople Import Script
 * ==============================
 * Reads the "Feuil1" sheet of backend/data/With_PGs_infos_completed.xlsx and, using
 * the `Master_People_Group` column as the source of truth for canonical DMM peoples:
 *
 *   1. Upserts ONE MasterPeople per distinct `Master_People_Group` value + country.
 *      A repeated master name (e.g. "Pygmy Baka" appearing 10 times) becomes ONE
 *      master, not ten. Only DMM masters are ever matched/created — JP/CPPI/SURVEY
 *      masters are never mutated or attached to.
 *   2. Creates/links each spreadsheet row as its own DMM PeopleGroup engagement,
 *      setting `masterPeopleId` to the corresponding master.
 *   3. Recomputes each touched master's dmmRollup at the end.
 *
 * Idempotent by (source:'DMM', name, villageName, country) for engagements, and by
 * (primaryCountryCode:'CMR', normName(canonicalName)) restricted to DMM masters.
 * NEVER deletes anything.
 *
 * Usage (run from the backend directory so require('xlsx') resolves):
 *   node scripts/importDmmMasterPeople.js [--dry-run]
 *     --dry-run   Tally masters/engagements + skip reasons. No DB writes.
 *     (default)   Perform the live upsert and recompute rollups.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const XLSX = require('xlsx');
const MasterPeople = require('../models/MasterPeople');
const PeopleGroup = require('../models/PeopleGroup');
const User = require('../models/User');
const { recomputeDmmRollup } = require('../services/dmmRollup');
const { normName } = require('./lib/peopleMatcher');

// ── Configuration ────────────────────────────────────────────────────────────
const XLSX_FILE_PATH = path.join(__dirname, '../data/With_PGs_infos_completed.xlsx');
const SHEET_NAME = 'Feuil1';
const ADMIN_EMAIL = 'chrishaiwe@gmail.com';
const COUNTRY_ISO3 = 'CMR';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────
function s(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Parse the first integer out of a Population_Size string.
 * Treats spaces as thousands separators (French locale). Grabs the first run of
 * digits (with interior spaces) and strips the spaces. Defaults to 0.
 */
function parsePopulation(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const str = String(raw);
  const m = str.match(/\d[\d ]*/);
  if (!m) return 0;
  const digits = m[0].replace(/\s+/g, '');
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Parse Start_Date into a 4-digit startYear number when present, else undefined. */
function parseStartYear(rawStart) {
  let startYear;
  if (typeof rawStart === 'number' && Number.isFinite(rawStart)) {
    startYear = Math.round(rawStart);
  } else if (rawStart != null) {
    const ym = String(rawStart).match(/\d{4}/);
    if (ym) startYear = parseInt(ym[0], 10);
  }
  if (!(Number.isFinite(startYear) && startYear >= 1900 && startYear <= 2100)) {
    startYear = undefined;
  }
  return startYear;
}

/** Case-insensitive exact-match regex anchored to the whole string. */
function ciExact(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Return a valid {lat, lng} from a row, or null when out of range / non-numeric. */
function parseCoords(row) {
  const lat = Number(row.Latitude);
  const lng = Number(row.Longitude);
  const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
  if (!validLat || !validLng) return null;
  return { lat, lng };
}

const STRONG_STATUSES = ['midway', 'tipping-point', 'dmm'];

/**
 * Map a spreadsheet row to the PeopleGroup fields we manage. Returns null (with a
 * reason pushed onto skipReasons) when the row must be skipped.
 */
function mapRow(row, adminUserId, masterId, rowNum, skipReasons) {
  const name = s(row.NG_Engagment_Name) || s(row.Master_People_Group);
  if (name.length < 2) {
    skipReasons.push(`Row ${rowNum}: missing/short engagement name`);
    return null;
  }

  const coords = parseCoords(row);
  if (!coords) {
    skipReasons.push(
      `Row ${rowNum} (${name}): invalid coordinates lat=${row.Latitude} lng=${row.Longitude}`
    );
    return null;
  }

  const region = s(row.Province) || s(row.Region);

  return {
    name,
    villageName: s(row.Village),
    region,
    admin2: s(row.Department),
    admin3: s(row.District),
    country: s(row.Country) || 'Cameroon',
    countryCode: 'CM',
    language: s(row.Language),
    religion: s(row.Religious_Background),
    description: s(row.Notes),
    // Reference/engagement metadata columns.
    donor: s(row.Donor),
    nationalCoordinator: s(row['National Coordinator']),
    churchPlanter: s(row['Church planter']),
    affinityGroup: s(row.Affinity_Group),
    urbanRural: s(row.Urban_Rural),
    startYear: parseStartYear(row.Start_Date),
    population: parsePopulation(row.Population_Size),
    location: {
      type: 'Point',
      coordinates: [coords.lng, coords.lat],
    },
    source: 'DMM',
    approved: true,
    createdBy: adminUserId,
    approvedBy: adminUserId,
    masterPeopleId: masterId,
  };
}

/**
 * Merge a mapped doc onto an existing record while PRESERVING progress metrics.
 * numberOfChurches / churchGeneration are NEVER overwritten when the existing
 * value is > 0. engagementStatus keeps an existing stronger status.
 */
function applyUpdate(existing, doc) {
  existing.name = doc.name;
  existing.villageName = doc.villageName;
  existing.region = doc.region;
  existing.admin2 = doc.admin2;
  existing.admin3 = doc.admin3;
  existing.country = doc.country;
  existing.countryCode = doc.countryCode;
  existing.language = doc.language;
  existing.religion = doc.religion;
  existing.description = doc.description;
  existing.donor = doc.donor;
  existing.nationalCoordinator = doc.nationalCoordinator;
  existing.churchPlanter = doc.churchPlanter;
  existing.affinityGroup = doc.affinityGroup;
  existing.urbanRural = doc.urbanRural;
  if (doc.startYear !== undefined) existing.startYear = doc.startYear;
  existing.location = doc.location;
  existing.population = doc.population;
  existing.source = doc.source;
  existing.approved = doc.approved;
  existing.approvedBy = doc.approvedBy;
  existing.masterPeopleId = doc.masterPeopleId;

  // Progress metrics — preserve real progress.
  if (!(Number(existing.numberOfChurches) > 0)) existing.numberOfChurches = 0;
  if (!(Number(existing.churchGeneration) > 0)) existing.churchGeneration = 0;

  // Status — keep an existing stronger engagement status, else pioneer.
  const cur = String(existing.engagementStatus || '').toLowerCase();
  if (!STRONG_STATUSES.includes(cur)) {
    existing.engagementStatus = 'pioneer';
    existing.status = 'pioneer';
  }
}

/** Fields set only when CREATING a brand-new engagement record. */
function applyCreateDefaults(doc) {
  return {
    ...doc,
    engagementStatus: 'pioneer',
    status: 'pioneer',
    numberOfChurches: 0,
    churchGeneration: 0,
  };
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DMM MasterPeople Import');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode: ${isDryRun ? 'DRY RUN (no writes)' : 'LIVE IMPORT'}`);
  console.log(`  File: ${XLSX_FILE_PATH}  | Sheet: ${SHEET_NAME}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const stats = {
    mastersCreated: 0,
    mastersMatched: 0,
    engCreated: 0,
    engUpdated: 0,
    engSkipped: 0,
    rollups: 0,
    errors: 0,
  };
  const skipReasons = [];
  // groupKey -> { count } for reporting.
  const groupCounts = new Map();

  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting-map';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log(`✅ Connected: ${mongoose.connection.host}/${mongoose.connection.name}\n`);

    // Resolve the createdBy / approvedBy user.
    console.log(`🔍 Looking for user: ${ADMIN_EMAIL}`);
    let adminUser = await User.findOne({ email: ADMIN_EMAIL });
    if (!adminUser) adminUser = await User.findOne({ role: 'admin' });
    let adminUserId;
    if (adminUser) {
      adminUserId = adminUser._id;
      console.log(`✅ Using user: ${adminUser.name || adminUser.email}\n`);
    } else {
      adminUserId = new mongoose.Types.ObjectId();
      console.log('⚠️  No matching or admin user found — using a synthetic ObjectId.\n');
    }

    // Read the workbook / Feuil1 sheet.
    console.log('📂 Reading workbook...');
    const wb = XLSX.readFile(XLSX_FILE_PATH);
    if (!wb.SheetNames.includes(SHEET_NAME)) {
      throw new Error(`Sheet "${SHEET_NAME}" not found. Available: ${wb.SheetNames.join(', ')}`);
    }
    const ws = wb.Sheets[SHEET_NAME];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    console.log(`✅ Sheet "${SHEET_NAME}" has ${rows.length} data rows\n`);

    // ── Build in-memory Map of existing DMM masters keyed by normName(canonicalName).
    console.log('🔍 Loading existing DMM masters...');
    const existingDmmMasters = await MasterPeople.find({
      primaryCountryCode: COUNTRY_ISO3,
      sourceTypes: 'DMM',
    });
    const masterByKey = new Map(); // normName(canonicalName) -> MasterPeople doc (or in-memory placeholder)
    for (const m of existingDmmMasters) {
      const key = normName(m.canonicalName);
      if (key && !masterByKey.has(key)) masterByKey.set(key, { doc: m, existing: true });
    }
    console.log(`✅ Loaded ${existingDmmMasters.length} existing DMM master(s)\n`);

    // ── Group rows by normName(Master_People_Group) so we upsert ONE master each.
    const groups = new Map(); // groupKey -> { rawName, rows: [{row, rowNum}] }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // header row is row 1
      const rawMaster = s(row.Master_People_Group);
      if (!rawMaster) {
        skipReasons.push(`Row ${rowNum}: missing Master_People_Group`);
        stats.engSkipped++;
        continue;
      }
      const nk = normName(rawMaster);
      const groupKey = `${nk}|${COUNTRY_ISO3}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { rawName: rawMaster, nk, rows: [] });
      groups.get(groupKey).rows.push({ row, rowNum });
    }

    console.log(`📊 ${groups.size} distinct master group(s) across ${rows.length} row(s)\n`);

    const touchedMasterIds = new Set();

    // ── Process each master group.
    for (const [groupKey, group] of groups) {
      groupCounts.set(group.rawName, group.rows.length);

      // Find or create the DMM master for this group.
      let masterId = null;
      let matched = false;
      const found = masterByKey.get(group.nk);
      if (found) {
        matched = true;
        masterId = found.doc._id || found.doc.id || null;
        stats.mastersMatched++;
      } else {
        // Determine primary location (first valid coords in the group) and language.
        let primaryLocation = null;
        let primaryLanguageName = null;
        for (const { row } of group.rows) {
          if (!primaryLocation) {
            const c = parseCoords(row);
            if (c) primaryLocation = { type: 'Point', coordinates: [c.lng, c.lat] };
          }
          if (!primaryLanguageName) {
            const lang = s(row.Language);
            if (lang) primaryLanguageName = lang;
          }
          if (primaryLocation && primaryLanguageName) break;
        }

        stats.mastersCreated++;

        if (isDryRun) {
          // Reserve a placeholder so subsequent rows in this run treat it as "created".
          masterByKey.set(group.nk, { doc: { _id: null }, existing: false });
        } else {
          const masterDoc = new MasterPeople({
            canonicalName: group.rawName,
            // Unique, NON-null natural key so we don't collide on the sparse-unique
            // groupNaturalKey index (an explicit `null` IS indexed and would clash).
            groupNaturalKey: `DMM:${group.nk}`,
            primaryCountryCode: COUNTRY_ISO3,
            sourceTypes: ['DMM'],
            primaryLocation: primaryLocation || null,
            primaryLanguageName: primaryLanguageName || null,
          });
          try {
            await masterDoc.save();
            masterId = masterDoc._id;
            masterByKey.set(group.nk, { doc: masterDoc, existing: false });
          } catch (err) {
            stats.errors++;
            console.log(`   ❌ Master "${group.rawName}" create error: ${err.message}`);
            // Skip all engagements in this group since there's no master to link.
            stats.engSkipped += group.rows.length;
            continue;
          }
        }
      }

      if (!isDryRun && masterId) touchedMasterIds.add(String(masterId));

      // ── Process each engagement row in the group.
      for (const { row, rowNum } of group.rows) {
        const doc = mapRow(row, adminUserId, masterId, rowNum, skipReasons);
        if (!doc) {
          stats.engSkipped++;
          continue;
        }

        if (isDryRun) {
          try {
            const existing = await PeopleGroup.findOne({
              source: 'DMM',
              name: ciExact(doc.name),
              villageName: ciExact(doc.villageName),
              country: 'Cameroon',
            });
            if (existing) stats.engUpdated++;
            else stats.engCreated++;
          } catch (err) {
            stats.errors++;
            console.log(`   ❌ Row ${rowNum} (${doc.name}) lookup error: ${err.message}`);
          }
          continue;
        }

        try {
          const existing = await PeopleGroup.findOne({
            source: 'DMM',
            name: ciExact(doc.name),
            villageName: ciExact(doc.villageName),
            country: 'Cameroon',
          });

          if (existing) {
            applyUpdate(existing, doc);
            await existing.save();
            stats.engUpdated++;
          } else {
            const pg = new PeopleGroup(applyCreateDefaults(doc));
            await pg.save();
            stats.engCreated++;
          }
        } catch (err) {
          stats.errors++;
          if (stats.errors <= 15) {
            console.log(`   ❌ Row ${rowNum} (${doc.name}) save error: ${err.message}`);
          }
        }
      }
    }

    // ── Recompute dmmRollup for each touched master (skip in dry-run).
    if (!isDryRun) {
      console.log(`\n🔁 Recomputing dmmRollup for ${touchedMasterIds.size} master(s)...`);
      for (const id of touchedMasterIds) {
        try {
          await recomputeDmmRollup(id);
          stats.rollups++;
        } catch (err) {
          stats.errors++;
          console.log(`   ❌ Rollup error for master ${id}: ${err.message}`);
        }
      }
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  IMPORT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  🧩 Masters created:    ${stats.mastersCreated}`);
    console.log(`  🔗 Masters matched:    ${stats.mastersMatched}`);
    console.log(`  ✅ Engagements created: ${stats.engCreated}`);
    console.log(`  🔄 Engagements updated: ${stats.engUpdated}`);
    console.log(`  ⏭️  Engagements skipped: ${stats.engSkipped}`);
    console.log(`  📈 Rollups recomputed: ${stats.rollups}`);
    console.log(`  ❌ Errors:             ${stats.errors}`);
    console.log('═══════════════════════════════════════════════════════════════');

    // Top master groups by engagement count.
    const topGroups = [...groupCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (topGroups.length) {
      console.log('\n🏷️  Top master groups (by engagement count):');
      for (const [name, count] of topGroups) {
        console.log(`   • ${name}: ${count}`);
      }
    }

    if (skipReasons.length) {
      console.log('\n⏭️  Skip reasons:');
      for (const r of skipReasons) console.log(`   - ${r}`);
    } else {
      console.log('\n(no rows skipped)');
    }

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN — no changes were saved. Re-run without --dry-run to import.');
    }
  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

run();
