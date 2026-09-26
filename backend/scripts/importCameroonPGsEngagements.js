/**
 * Cameroon People-Group Engagements Import Script
 * ================================================
 * Reads the "PGs" sheet of backend/data/Cameroon_PGs.xlsx and upserts each row as a
 * DMM PeopleGroup engagement record. Idempotent by (name, villageName, country) —
 * a re-run updates existing DMM/manual/Survey groups in place instead of duplicating.
 *
 * UPDATE semantics preserve real progress: on an update it refreshes descriptive
 * fields but NEVER overwrites numberOfChurches / churchGeneration when the existing
 * value is > 0, and keeps a stronger existing engagementStatus
 * ('midway','tipping-point','dmm'). numberOfChurches/churchGeneration are set to 0
 * only when CREATING a brand-new record.
 *
 * After this import, run scripts/ingestDmmPeople.js to reconcile these DMM groups
 * into the canonical MasterPeople graph.
 *
 * Usage: node scripts/importCameroonPGsEngagements.js [--dry-run]
 *   --dry-run   Tally created/updated/skipped and print skip reasons. No DB writes.
 *   (default)   Perform the live upsert.
 *
 * Run from the backend directory so require('xlsx') resolves.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const XLSX = require('xlsx');
const PeopleGroup = require('../models/PeopleGroup');
const User = require('../models/User');

// ── Configuration ────────────────────────────────────────────────────────────
const XLSX_FILE_PATH = path.join(__dirname, '../data/Cameroon_PGs.xlsx');
const SHEET_NAME = 'PGs';
const IGNORE_SHEETS = ['Error', 'Méthodologie'];
const ADMIN_EMAIL = 'chrishaiwe@gmail.com';

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
 * digits (with interior spaces) and strips the spaces.
 *   "≈2 800 (Cameroun) / 3 800 (monde)" -> 2800
 *   "≈151 000" -> 151000
 *   "Non trouvé" -> 0
 * Defaults to 0 when no digits are present.
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

/** Case-insensitive exact-match regex anchored to the whole string. */
function ciExact(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Map a spreadsheet row to the PeopleGroup fields we manage. Returns null (with a
 * reason pushed onto skipReasons) when the row must be skipped.
 */
function mapRow(row, adminUserId, rowNum, skipReasons) {
  const name = s(row.People_Group);
  if (!name) {
    skipReasons.push(`Row ${rowNum}: missing People_Group`);
    return null;
  }

  const lat = Number(row.Latitude);
  const lng = Number(row.Longitude);
  const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
  if (!validLat || !validLng) {
    skipReasons.push(`Row ${rowNum} (${name}): invalid coordinates lat=${row.Latitude} lng=${row.Longitude}`);
    return null;
  }

  const region = s(row.Province) || s(row.Region);

  // Start year: accept a plain year number or the first 4-digit year in a string.
  let startYear;
  const rawStart = row.Start_Date;
  if (typeof rawStart === 'number' && Number.isFinite(rawStart)) {
    startYear = Math.round(rawStart);
  } else if (rawStart != null) {
    const ym = String(rawStart).match(/\d{4}/);
    if (ym) startYear = parseInt(ym[0], 10);
  }
  if (!(Number.isFinite(startYear) && startYear >= 1900 && startYear <= 2100)) {
    startYear = undefined;
  }

  return {
    name,
    villageName: s(row.Village),
    region,
    admin2: s(row.Department),
    admin3: s(row.District),
    country: 'Cameroon',
    countryCode: 'CM',
    language: s(row.Language),
    religion: s(row.Religious_Background),
    description: s(row.Notes),
    // New reference/engagement metadata columns
    donor: s(row.Donor),
    nationalCoordinator: s(row['National Coordinator']),
    churchPlanter: s(row['Church planter']),
    affinityGroup: s(row.Affinity_Group),
    urbanRural: s(row.Urban_Rural),
    startYear,
    location: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    source: 'DMM',
    approved: true,
    population: parsePopulation(row.Population_Size),
    createdBy: adminUserId,
    approvedBy: adminUserId,
  };
}

/**
 * Merge a mapped doc onto an existing record while PRESERVING progress metrics.
 * - Refreshes descriptive fields (region, admin2/3, language, religion, description,
 *   population, location, villageName) plus source/approved.
 * - numberOfChurches / churchGeneration are NEVER overwritten when the existing
 *   record already has a value > 0 (real progress). Otherwise they default to 0.
 * - engagementStatus/status: keep an existing stronger status
 *   ('midway','tipping-point','dmm'); otherwise set 'pioneer'.
 */
const STRONG_STATUSES = ['midway', 'tipping-point', 'dmm'];
function applyUpdate(existing, doc) {
  // Descriptive fields — safe to refresh.
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
  // New reference/engagement metadata
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

  // Progress metrics — preserve when the existing record already has real progress.
  if (!(Number(existing.numberOfChurches) > 0)) existing.numberOfChurches = 0;
  if (!(Number(existing.churchGeneration) > 0)) existing.churchGeneration = 0;

  // Status — keep an existing stronger engagement status, else pioneer.
  const cur = String(existing.engagementStatus || '').toLowerCase();
  if (!STRONG_STATUSES.includes(cur)) {
    existing.engagementStatus = 'pioneer';
    existing.status = 'pioneer';
  }
}

/** Fields set only when CREATING a brand-new record. */
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
  console.log('  Cameroon People-Group Engagements Import');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode: ${isDryRun ? 'DRY RUN (no writes)' : 'LIVE IMPORT'}`);
  console.log(`  File: ${XLSX_FILE_PATH}  | Sheet: ${SHEET_NAME}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const stats = { parsed: 0, created: 0, updated: 0, skipped: 0, errors: 0 };
  const skipReasons = [];

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

    // Read the workbook / PGs sheet.
    console.log(`📂 Reading workbook (ignoring sheets: ${IGNORE_SHEETS.join(', ')})...`);
    const wb = XLSX.readFile(XLSX_FILE_PATH);
    if (!wb.SheetNames.includes(SHEET_NAME)) {
      throw new Error(`Sheet "${SHEET_NAME}" not found. Available: ${wb.SheetNames.join(', ')}`);
    }
    const ws = wb.Sheets[SHEET_NAME];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
    console.log(`✅ Sheet "${SHEET_NAME}" has ${rows.length} data rows\n`);

    console.log('📊 Processing rows...\n');
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // header row is row 1
      const doc = mapRow(rows[i], adminUserId, rowNum, skipReasons);
      if (!doc) {
        stats.skipped++;
        continue;
      }
      stats.parsed++;

      if (isDryRun) {
        // Classify as created vs updated without writing.
        try {
          const existing = await PeopleGroup.findOne({
            name: ciExact(doc.name),
            villageName: ciExact(doc.villageName),
            country: 'Cameroon',
            source: { $in: ['DMM', 'manual', 'Survey'] },
          });
          if (existing) {
            stats.updated++;
            const keepC = Number(existing.numberOfChurches) > 0;
            const keepS = STRONG_STATUSES.includes(String(existing.engagementStatus || '').toLowerCase());
            if (keepC || keepS) {
              console.log(`   🔒 Row ${rowNum} (${doc.name}${doc.villageName ? ' / ' + doc.villageName : ''}): would preserve` +
                (keepC ? ` churches=${existing.numberOfChurches} gen=${existing.churchGeneration}` : '') +
                (keepS ? ` status=${existing.engagementStatus}` : ''));
            }
          } else stats.created++;
        } catch (err) {
          stats.errors++;
          console.log(`   ❌ Row ${rowNum} (${doc.name}) lookup error: ${err.message}`);
        }
        continue;
      }

      try {
        const existing = await PeopleGroup.findOne({
          name: ciExact(doc.name),
          villageName: ciExact(doc.villageName),
          country: 'Cameroon',
          source: { $in: ['DMM', 'manual', 'Survey'] },
        });

        if (existing) {
          applyUpdate(existing, doc);
          await existing.save();
          stats.updated++;
        } else {
          const pg = new PeopleGroup(applyCreateDefaults(doc));
          await pg.save();
          stats.created++;
        }
      } catch (err) {
        stats.errors++;
        if (stats.errors <= 15) {
          console.log(`   ❌ Row ${rowNum} (${doc.name}) save error: ${err.message}`);
        }
      }
    }

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  IMPORT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Rows parsed (valid):   ${stats.parsed}`);
    console.log(`  ✅ Created:            ${stats.created}`);
    console.log(`  🔄 Updated:            ${stats.updated}`);
    console.log(`  ⏭️  Skipped:            ${stats.skipped}`);
    console.log(`  ❌ Errors:             ${stats.errors}`);
    console.log('═══════════════════════════════════════════════════════════════');

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
