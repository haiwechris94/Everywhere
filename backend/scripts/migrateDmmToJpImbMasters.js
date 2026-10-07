/**
 * migrateDmmToJpImbMasters.js — re-link DMM engagements onto canonical JP+IMB
 * MasterPeople, merge each DMM-only master's data into the matched JP+IMB master,
 * then delete the now-empty DMM-only masters.
 * ============================================================================
 *
 * GOAL
 * ----
 * The DMM import (scripts/importDmmMasterPeople.js) created ONE DMM-only
 * MasterPeople per distinct `Master_People_Group`, and linked every spreadsheet
 * row to it. We now have a reliable JP↔CPPI identity for each engagement
 * (`JP ROP3` and `JP PG ID` columns in With_PGs_infos_completed.xlsx). This
 * script moves each DMM engagement onto the correct canonical JP+IMB master
 * (matching by JP ROP3 first, then JP People ID), merges the descriptive data
 * from the vacated DMM-only master into that JP+IMB master, recomputes the DMM
 * rollups, and finally deletes the DMM-only masters that are left empty.
 *
 * SAFETY / REVERSIBILITY
 * ----------------------
 *   • Defaults to a DRY RUN. Pass `--live` to perform writes.
 *   • A dry run performs NO writes and prints a full report.
 *   • A live run, BEFORE deleting anything, writes a backup JSON file
 *     backend/data/backup-dmm-masters-<timestamp>.json containing the full
 *     documents of every DMM-only master about to be deleted plus the complete
 *     list of re-link changes { engagementId, oldMasterId, newMasterId }.
 *   • Idempotent: re-running --live finds engagements already pointing at
 *     JP+IMB masters and no DMM-only masters left to delete → 0 deletions.
 *   • UNRESOLVED rows (no JP ROP3 / JP PG ID match in the cross-reference) are
 *     reported and SKIPPED — their DMM master is never touched or deleted.
 *
 * Usage (run from the backend directory so require('xlsx')/models resolve):
 *   node scripts/migrateDmmToJpImbMasters.js            # DRY RUN (default)
 *   node scripts/migrateDmmToJpImbMasters.js --dry-run  # explicit dry run
 *   node scripts/migrateDmmToJpImbMasters.js --live     # perform the migration
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const MasterPeople = require('../models/MasterPeople');
const PeopleGroup = require('../models/PeopleGroup');
const { recomputeDmmRollup } = require('../services/dmmRollup');
const { COUNTRY_CONFIG } = require('../routes/countries');
const { normName } = require('./lib/peopleMatcher');

// ── Configuration ────────────────────────────────────────────────────────────
const DMM_XLSX = path.join(__dirname, '../data/With_PGs_infos_completed.xlsx');
const DMM_SHEET = 'Feuil1';
const XREF_XLSX = path.join(__dirname, '../data/jp-cppi-cross-reference.xlsx');
const XREF_SHEET = 'CrossRefJP_CPPI';
const COUNTRY_A2 = 'CM';
const COUNTRY_ISO3 = COUNTRY_CONFIG[COUNTRY_A2] ? COUNTRY_CONFIG[COUNTRY_A2].code3 : 'CMR';

const ARGS = process.argv.slice(2);
const IS_LIVE = ARGS.includes('--live');
const IS_DRY_RUN = !IS_LIVE; // default to dry-run unless --live is passed

// ── Small helpers ──────────────────────────────────────────────────────────────
const s = (v) => (v == null ? '' : String(v).trim());

/** A string key for a nullable identifier, or null when absent/blank. */
function idKey(v) {
  if (v === null || v === undefined) return null;
  const str = String(v).trim();
  return str.length ? str : null;
}

/** Parse a loosely-formatted number (thousand separators / spaces), else null. */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** True when a target field is "empty" and may be filled from a source. */
const isEmpty = (v) => v === null || v === undefined || v === '' || v === 0;

/** Case-insensitive exact-match regex anchored to the whole string. */
function ciExact(value) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Shape a cross-reference row into the reference record used throughout.
 * Note the literal spaces around the CPPIPopulation header: " CPPIPopulation ".
 */
function shapeRef(r) {
  const rop3 = r.ROP3 != null ? String(r.ROP3) : null;
  const peopleId3 = r.PeopleID3 != null ? String(r.PeopleID3) : null;
  const jpPeopleGroup = r.JPPeopleGroup || null;
  const cppiPeopleGroup = r.CPPIPeopleGroup || null;
  const jpPop = num(r.JPPopulation);
  const cppiPop = num(r[' CPPIPopulation ']);
  return {
    rop3,
    peopleId3,
    jpPeopleGroup,
    cppiPeopleGroup,
    rog3: r.ROG3 || null,
    ctry: r.Ctry || null,
    population: jpPop != null ? jpPop : cppiPop,
    primaryLanguage: r.JPPrimaryLanguage || r.CPPIPrimaryLanguage || null,
    primaryReligion: r.JPPrimaryReligion || r.CPPIPrimaryReligion || null,
    jpScale: num(r.JPScale),
    leastReached: r.JPLeastReached === 'Y',
    percentChristian: num(r['JP%ChristianAdherent']),
    percentEvangelical: num(r['JP%Evangelical']),
    cppiEvangelicalEngagement: r.CPPIEvangelicalEngagement || null,
    matchedName: jpPeopleGroup || cppiPeopleGroup || null,
  };
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DMM → JP+IMB MasterPeople Migration');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode:    ${IS_DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (writes + delete)'}`);
  console.log(`  Country: ${COUNTRY_A2} (ISO3 ${COUNTRY_ISO3})`);
  console.log(`  DMM:     ${DMM_XLSX}  | sheet ${DMM_SHEET}`);
  console.log(`  XRef:    ${XREF_XLSX} | sheet ${XREF_SHEET}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const stats = {
    engagementsProcessed: 0,
    rowsWithIdentity: 0,
    resolvedByRop3: 0,
    resolvedByPeopleId: 0,
    jpImbMatched: 0,
    jpImbCreated: 0,
    engagementsRelinked: 0,
    relinkWarnings: 0,
    dmmOnlyToDelete: 0,
    mastersMerged: 0,
    rollups: 0,
  };
  const unresolved = [];     // { name, rop3, jpId }
  const relinkWarnings = [];  // { name, village, matched }
  const relinkChanges = [];   // { engagementId, oldMasterId, newMasterId }
  const deleteList = [];      // full DMM-only master docs to delete

  // 1) Read workbooks.
  console.log('📂 Reading workbooks...');
  const dmmWb = XLSX.readFile(DMM_XLSX);
  if (!dmmWb.SheetNames.includes(DMM_SHEET)) {
    throw new Error(`Sheet "${DMM_SHEET}" not found in DMM workbook. Available: ${dmmWb.SheetNames.join(', ')}`);
  }
  const dmmRows = XLSX.utils.sheet_to_json(dmmWb.Sheets[DMM_SHEET], { defval: null });
  console.log(`   DMM engagements: ${dmmRows.length} rows`);

  const xrefWb = XLSX.readFile(XREF_XLSX);
  if (!xrefWb.SheetNames.includes(XREF_SHEET)) {
    throw new Error(`Sheet "${XREF_SHEET}" not found in cross-reference workbook. Available: ${xrefWb.SheetNames.join(', ')}`);
  }
  const xrefRows = XLSX.utils.sheet_to_json(xrefWb.Sheets[XREF_SHEET], { defval: null });
  console.log(`   Cross-reference: ${xrefRows.length} rows`);

  // 2) Build lookup maps keyed by String(ROP3) and String(PeopleID3).
  const byRop3 = new Map();
  const byPeopleId = new Map();
  for (const r of xrefRows) {
    const rec = shapeRef(r);
    if (rec.rop3 && !byRop3.has(rec.rop3)) byRop3.set(rec.rop3, rec);
    if (rec.peopleId3 && !byPeopleId.has(rec.peopleId3)) byPeopleId.set(rec.peopleId3, rec);
  }
  console.log(`   byRop3 keys: ${byRop3.size} | byPeopleId keys: ${byPeopleId.size}\n`);

  // ── Connect to MongoDB.
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log(`✅ Connected: ${mongoose.connection.host}/${mongoose.connection.name}\n`);

  // Reference JP/CPPI masters for this country, indexed by normalized canonicalName.
  const jpImbMasters = await MasterPeople.find({
    primaryCountryCode: COUNTRY_ISO3,
    sourceTypes: { $in: ['JP', 'CPPI'] },
  });
  const jpImbByName = new Map();
  for (const m of jpImbMasters) {
    const key = normName(m.canonicalName);
    if (key && !jpImbByName.has(key)) jpImbByName.set(key, m);
  }
  console.log(`🔎 JP/CPPI masters (${COUNTRY_ISO3}): ${jpImbMasters.length}\n`);

  // Caches so repeated engagements for the same identity reuse the resolved target.
  const targetCacheByRop3 = new Map();      // rop3 -> MasterPeople (or placeholder)
  const createdPlaceholders = new Map();     // key -> fake id string, for dry-run uniqueness
  const newTargetIds = new Set();            // string ids of JP+IMB targets touched (relink)
  const oldDmmMasterIds = new Set();         // string ids of DMM-only masters that lost engagements

  // Find or (OPTION A) create the JP+IMB master for a reference record.
  async function resolveTargetMaster(ref) {
    const rop3 = ref.rop3 ? String(ref.rop3) : null;

    // Use cache keyed by rop3 when present.
    if (rop3 && targetCacheByRop3.has(rop3)) return targetCacheByRop3.get(rop3);

    // (b) by rop3 within CMR
    let target = null;
    if (rop3) {
      target = await MasterPeople.findOne({ rop3, primaryCountryCode: COUNTRY_ISO3 });
    }
    // (b) else by canonicalName normalized match to jp/cppi people-group name
    if (!target) {
      const nk1 = normName(ref.jpPeopleGroup);
      const nk2 = normName(ref.cppiPeopleGroup);
      if (nk1 && jpImbByName.has(nk1)) target = jpImbByName.get(nk1);
      else if (nk2 && jpImbByName.has(nk2)) target = jpImbByName.get(nk2);
    }

    if (target) {
      stats.jpImbMatched++;
      if (rop3) targetCacheByRop3.set(rop3, target);
      return target;
    }

    // (c) OPTION A — create a JP+IMB master from the reference record.
    const canonicalName = ref.jpPeopleGroup || ref.cppiPeopleGroup || `JP+IMB ${rop3 || ''}`.trim();
    const sourceTypes = [...new Set(['JP', 'CPPI'])];
    const naturalKeySuffix = rop3 || normName(canonicalName) || Math.random().toString(36).slice(2);
    const groupNaturalKey = `jpimb:${COUNTRY_ISO3}:${naturalKeySuffix}`;

    stats.jpImbCreated++;

    if (IS_DRY_RUN) {
      // Return a lightweight placeholder so the dry-run report is coherent.
      const key = rop3 || normName(canonicalName);
      if (!createdPlaceholders.has(key)) {
        createdPlaceholders.set(key, `created:${createdPlaceholders.size + 1}`);
      }
      const placeholder = {
        _id: createdPlaceholders.get(key),
        canonicalName,
        rop3,
        sourceTypes,
        __created: true,
        __placeholder: true,
      };
      if (rop3) targetCacheByRop3.set(rop3, placeholder);
      return placeholder;
    }

    const doc = new MasterPeople({
      canonicalName,
      groupNaturalKey,
      rop3: rop3 || null,
      primaryCountryCode: COUNTRY_ISO3,
      primaryLanguageName: ref.primaryLanguage || null,
      totalPopulation: ref.population || 0,
      sourceTypes,
      status: {
        jpScale: ref.jpScale != null ? ref.jpScale : null,
        leastReached: ref.leastReached === true ? true : (ref.leastReached === false ? false : null),
        percentEvangelical: ref.percentEvangelical != null ? ref.percentEvangelical : null,
      },
      referenceData: {
        source: 'JP+CPPI(xref)',
        matchedBy: rop3 ? 'xref-rop3' : 'xref-name',
        matchedName: ref.matchedName || canonicalName,
        rop3: rop3 || null,
        population: ref.population != null ? ref.population : null,
        primaryLanguage: ref.primaryLanguage || null,
        primaryReligion: ref.primaryReligion || null,
        jpScale: ref.jpScale != null ? ref.jpScale : null,
        leastReached: ref.leastReached === true ? true : (ref.leastReached === false ? false : null),
        percentChristian: ref.percentChristian != null ? ref.percentChristian : null,
        percentEvangelical: ref.percentEvangelical != null ? ref.percentEvangelical : null,
        cppiEvangelicalEngagement: ref.cppiEvangelicalEngagement || null,
        updatedAt: new Date(),
      },
    });
    await doc.save();
    // index it so a later name match can reuse it
    const key = normName(doc.canonicalName);
    if (key && !jpImbByName.has(key)) jpImbByName.set(key, doc);
    if (rop3) targetCacheByRop3.set(rop3, doc);
    return doc;
  }

  // 3) Process each DMM engagement row.
  for (let i = 0; i < dmmRows.length; i++) {
    const row = dmmRows[i];
    stats.engagementsProcessed++;

    const engName = s(row.NG_Engagment_Name);
    const villageName = s(row.Village);
    const jpRop3 = idKey(row['JP ROP3']);
    const jpId = idKey(row['JP PG ID']);

    if (!jpRop3 && !jpId) {
      // Row carries no JP identity — nothing to re-link; skip quietly.
      continue;
    }
    stats.rowsWithIdentity++;

    // 3a) Resolve the reference record (ROP3 first, then People ID).
    let ref = null;
    let matchedBy = null;
    if (jpRop3 && byRop3.has(jpRop3)) {
      ref = byRop3.get(jpRop3);
      matchedBy = 'rop3';
      stats.resolvedByRop3++;
    } else if (jpId && byPeopleId.has(jpId)) {
      ref = byPeopleId.get(jpId);
      matchedBy = 'peopleId';
      stats.resolvedByPeopleId++;
    }

    if (!ref) {
      unresolved.push({ name: engName || '(unnamed)', rop3: jpRop3, jpId });
      continue; // UNRESOLVED — do NOT touch its DMM master
    }

    // 3b/c) Find or create the target JP+IMB master.
    const target = await resolveTargetMaster(ref);
    const targetId = target && target._id ? String(target._id) : null;

    // 4) Re-link the DB engagement to the target JP+IMB master.
    const engQuery = {
      source: 'DMM',
      countryCode: COUNTRY_A2,
      name: ciExact(engName),
    };
    if (villageName) engQuery.villageName = ciExact(villageName);

    const matches = await PeopleGroup.find(engQuery);
    if (matches.length !== 1) {
      relinkWarnings.push({
        name: engName,
        village: villageName || '(none)',
        matched: matches.length,
      });
      stats.relinkWarnings++;
      continue;
    }

    const eng = matches[0];
    const oldMasterId = eng.masterPeopleId ? String(eng.masterPeopleId) : null;

    // Record the old master (resolve DMM-only status later in bulk). In an
    // idempotent re-run the engagement may already point at the target; still
    // record it so we can confirm the old master (if any) is gone/empty.
    if (oldMasterId && oldMasterId !== targetId) {
      oldDmmMasterIds.add(oldMasterId);
    }
    if (targetId && !String(targetId).startsWith('created:')) newTargetIds.add(targetId);

    relinkChanges.push({
      engagementId: String(eng._id),
      oldMasterId,
      newMasterId: targetId,
      matchedBy,
    });
    stats.engagementsRelinked++;

    if (!IS_DRY_RUN && targetId && oldMasterId !== targetId) {
      eng.masterPeopleId = target._id;
      await eng.save();
    }
  }

  // 5) Merge each DMM-only master's data into the JP+IMB target, and
  // 7) determine which DMM-only masters are now deletable.
  //
  // Re-derive the per-engagement old→new mapping restricted to real DMM-only
  // old masters, so merges target the correct JP+IMB master.
  const oldToNew = new Map(); // oldMasterId -> Set(newMasterId)
  for (const c of relinkChanges) {
    if (!c.oldMasterId || !c.newMasterId) continue;
    if (c.oldMasterId === c.newMasterId) continue;
    if (!oldToNew.has(c.oldMasterId)) oldToNew.set(c.oldMasterId, new Set());
    oldToNew.get(c.oldMasterId).add(c.newMasterId);
  }

  // Load the candidate old masters (skip placeholders / invalid ids).
  const oldMasterObjectIds = [...oldDmmMasterIds]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const oldMasters = oldMasterObjectIds.length
    ? await MasterPeople.find({ _id: { $in: oldMasterObjectIds } })
    : [];
  const oldMasterById = new Map(oldMasters.map((m) => [String(m._id), m]));

  // Merge DMM-only master data into each JP+IMB target BEFORE deleting.
  // Build a quick ref lookup by target id (from the first engagement that hit it)
  // so we can always set cppiEvangelicalEngagement from the xref.
  for (const [oldId, newSet] of oldToNew) {
    const oldMaster = oldMasterById.get(oldId);
    if (!oldMaster) continue; // not loaded (e.g. placeholder target in dry-run)

    const oldIsDmmOnly =
      Array.isArray(oldMaster.sourceTypes) &&
      !oldMaster.sourceTypes.includes('JP') &&
      !oldMaster.sourceTypes.includes('CPPI');
    if (!oldIsDmmOnly) continue; // never merge/delete a JP/CPPI master

    for (const newId of newSet) {
      if (!mongoose.Types.ObjectId.isValid(newId)) continue; // placeholder (dry-run create)
      const target = await MasterPeople.findById(newId);
      if (!target) continue;

      stats.mastersMerged++;
      if (IS_DRY_RUN) continue;

      const set = {};
      // referenceData: fill null/empty fields from the DMM master; never overwrite non-empty.
      const tRef = target.referenceData ? target.referenceData.toObject() : {};
      const oRef = oldMaster.referenceData ? oldMaster.referenceData.toObject() : {};
      const mergedRef = { ...tRef };
      let refChanged = false;
      for (const k of Object.keys(oRef)) {
        if (k === 'updatedAt') continue;
        if (isEmpty(mergedRef[k]) && !isEmpty(oRef[k])) {
          mergedRef[k] = oRef[k];
          refChanged = true;
        }
      }
      if (refChanged) {
        mergedRef.updatedAt = new Date();
        set.referenceData = mergedRef;
      }

      // "Details du peuple": copy only when target value is empty/0/null.
      if (isEmpty(target.primaryLanguageName) && !isEmpty(oldMaster.primaryLanguageName)) {
        set.primaryLanguageName = oldMaster.primaryLanguageName;
      }
      if (isEmpty(target.totalPopulation) && !isEmpty(oldMaster.totalPopulation)) {
        set.totalPopulation = oldMaster.totalPopulation;
      }
      if (isEmpty(target.rop3) && !isEmpty(oldMaster.rop3)) {
        set.rop3 = oldMaster.rop3;
      }

      if (Object.keys(set).length) {
        await MasterPeople.updateOne({ _id: target._id }, { $set: set });
      }
    }
  }

  // 6) Recompute dmmRollup for every NEW target master id.
  if (!IS_DRY_RUN) {
    for (const id of newTargetIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) continue;
      await recomputeDmmRollup(id);
      stats.rollups++;
    }
  } else {
    stats.rollups = newTargetIds.size;
  }

  // 7) Identify DMM-only masters to DELETE: DMM-only sourceTypes AND zero linked
  // DMM engagements remaining after the (would-be) re-link.
  //
  // In dry-run, no re-link happened, so simulate the remaining count by
  // subtracting the engagements we would move away. In live, query the DB.
  const movedAwayCount = new Map(); // oldMasterId -> number of engagements relinked away
  for (const c of relinkChanges) {
    if (!c.oldMasterId || c.oldMasterId === c.newMasterId) continue;
    movedAwayCount.set(c.oldMasterId, (movedAwayCount.get(c.oldMasterId) || 0) + 1);
  }

  for (const oldMaster of oldMasters) {
    const oldId = String(oldMaster._id);
    const dmmOnly =
      Array.isArray(oldMaster.sourceTypes) &&
      !oldMaster.sourceTypes.includes('JP') &&
      !oldMaster.sourceTypes.includes('CPPI');
    if (!dmmOnly) continue;

    let remaining;
    if (IS_DRY_RUN) {
      const total = await PeopleGroup.countDocuments({ source: 'DMM', masterPeopleId: oldMaster._id });
      remaining = total - (movedAwayCount.get(oldId) || 0);
    } else {
      remaining = await PeopleGroup.countDocuments({ source: 'DMM', masterPeopleId: oldMaster._id });
    }

    if (remaining <= 0) {
      stats.dmmOnlyToDelete++;
      deleteList.push(oldMaster);
    }
  }

  // 8) Backup + delete (live only).
  let backupPath = null;
  if (!IS_DRY_RUN && deleteList.length) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(__dirname, `../data/backup-dmm-masters-${ts}.json`);
    const backup = {
      createdAt: new Date().toISOString(),
      country: COUNTRY_ISO3,
      deletedMasters: deleteList.map((m) => m.toObject()),
      relinkChanges,
    };
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`\n💾 Backup written: ${backupPath}`);

    const ids = deleteList.map((m) => m._id);
    const res = await MasterPeople.deleteMany({ _id: { $in: ids } });
    console.log(`🗑️  Deleted ${res.deletedCount} DMM-only master(s).`);
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  ${IS_DRY_RUN ? 'DRY-RUN' : 'LIVE'} MIGRATION REPORT`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Engagements processed:        ${stats.engagementsProcessed}`);
  console.log(`  Rows with JP identity:        ${stats.rowsWithIdentity}`);
  console.log(`  Resolved by ROP3:             ${stats.resolvedByRop3}`);
  console.log(`  Resolved by JP People ID:     ${stats.resolvedByPeopleId}`);
  console.log(`  Unresolved (skipped):         ${unresolved.length}`);
  console.log(`  JP+IMB masters matched:       ${stats.jpImbMatched}`);
  console.log(`  JP+IMB masters created:       ${stats.jpImbCreated}`);
  console.log(`  Engagements re-linked:        ${stats.engagementsRelinked}`);
  console.log(`  Re-link warnings:             ${stats.relinkWarnings}`);
  console.log(`  DMM-only masters merged:      ${stats.mastersMerged}`);
  console.log(`  Rollups recomputed:           ${stats.rollups}`);
  console.log(`  DMM-only masters ${IS_DRY_RUN ? 'to delete:    ' : 'deleted:      '}${stats.dmmOnlyToDelete}`);
  console.log('═══════════════════════════════════════════════════════════════');

  if (unresolved.length) {
    console.log('\n⚠️  UNRESOLVED engagements (no ROP3/JP-ID match — skipped):');
    for (const u of unresolved) {
      console.log(`   - ${u.name}  [ROP3=${u.rop3 || '∅'} JP-ID=${u.jpId || '∅'}]`);
    }
  }
  if (relinkWarnings.length) {
    console.log('\n⚠️  RE-LINK warnings (zero or multiple DB matches — left untouched):');
    for (const w of relinkWarnings) {
      console.log(`   - ${w.name} (village: ${w.village}) → ${w.matched} matches`);
    }
  }
  if (deleteList.length) {
    console.log(`\n🗑️  DMM-only masters ${IS_DRY_RUN ? 'that WOULD be deleted' : 'deleted'}:`);
    for (const m of deleteList) {
      console.log(`   - ${m.canonicalName} (${m._id})`);
    }
  }

  if (IS_DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no changes were saved. Re-run with --live to apply.');
  } else {
    console.log('\n✅ LIVE migration complete.');
    if (backupPath) console.log(`   Backup: ${backupPath}`);
  }

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected from MongoDB');
}

run().catch(async (err) => {
  console.error('\n❌ Migration failed:', err.message);
  console.error(err.stack);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exitCode = 1;
});
