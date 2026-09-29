const express = require('express');
const mongoose = require('mongoose');
const Church = require('../models/Church');
const DiscoveryGroup = require('../models/DiscoveryGroup');
const DBSSession = require('../models/DBSSession');
const PersonOfPeace = require('../models/PersonOfPeace');
const CoachingSession = require('../models/CoachingSession');
const Village = require('../models/Village');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const Country = require('../models/Country');
const { auth, optionalAuth } = require('../middleware/auth');
const { COUNTRY_CONFIG } = require('./countries');

const router = express.Router();

// ── NG Areas definition (mirrors frontend) ────────────────────────────────────
const NG_AREAS = {
  FCA: ['CM', 'TD', 'CG', 'CD', 'GA', 'CF', 'GQ', 'UG'],
  AWA: ['SL', 'GH', 'LR', 'GM', 'NG', 'GW', 'GN'],
  FWA: ['CI', 'BJ', 'TG', 'NE', 'ML', 'BF', 'SN', 'GN'],
};

/**
 * Resolve a list of area ids and/or country codes into a deduplicated
 * array of ISO-3166-1 alpha-2 country codes.
 * @param {string[]} areas   - e.g. ['FCA', 'AWA']
 * @param {string[]} countries - e.g. ['CM', 'TD']
 * @returns {string[]} deduplicated country codes, or [] if no filter
 */
function resolveCountryCodes(areas = [], countries = []) {
  const codes = new Set(countries.map((c) => c.toUpperCase()));
  areas.forEach((areaId) => {
    const areaCodes = NG_AREAS[areaId.toUpperCase()] || [];
    areaCodes.forEach((c) => codes.add(c));
  });
  return [...codes];
}

/**
 * Given a list of ISO country codes, return the MongoDB ObjectIds of all
 * Villages and PeopleGroups that belong to those countries.
 * Returns { villageIds, peopleGroupIds } — both may be empty arrays.
 */
async function resolveEntityIdsByCountry(countryCodes) {
  if (!countryCodes || countryCodes.length === 0) {
    return { villageIds: null, peopleGroupIds: null }; // null = no filter
  }

  // Village: match on osmData.countryCode (preferred) or country (legacy)
  const villages = await Village.find(
    {
      $or: [
        { 'osmData.countryCode': { $in: countryCodes } },
        { country: { $in: countryCodes } },
      ],
    },
    { _id: 1 }
  ).lean();
  const villageIds = villages.map((v) => v._id);

  // PeopleGroup: match on countryCode (preferred) or country name
  const peopleGroups = await PeopleGroup.find(
    { countryCode: { $in: countryCodes } },
    { _id: 1 }
  ).lean();
  const peopleGroupIds = peopleGroups.map((p) => p._id);

  return { villageIds, peopleGroupIds };
}

/**
 * Compute a UTC quarter window [from, to] for a given year and quarter.
 * @param {number|string} year
 * @param {number|string} quarter - 1..4
 * @returns {{ from: Date, to: Date }}
 */
function quarterWindow(year, quarter) {
  const y = parseInt(year, 10);
  const q = parseInt(quarter, 10);
  const startMonth = (q - 1) * 3;
  const from = new Date(Date.UTC(y, startMonth, 1, 0, 0, 0));
  const to = new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59));
  return { from, to };
}

/**
 * Build the Cityteam-style numerical DMM report for a date window.
 * All counts guard against empty results (return 0, never null).
 *
 * @param {object} opts
 * @param {string}   opts.from         - ISO date string (start of window)
 * @param {string}   opts.to           - ISO date string (end of window)
 * @param {string}   [opts.organization] - Organization ObjectId string
 * @param {string[]} [opts.areas]      - NG Area ids (e.g. ['FCA'])
 * @param {string[]} [opts.countries]  - ISO country codes (e.g. ['CM', 'TD'])
 */
async function buildNumericalReport({ from, to, organization, areas = [], countries = [], peoples = [], period = null }) {
  const orgMatch = organization ? { organization: new mongoose.Types.ObjectId(organization) } : {};
  const windowMatch = {};
  if (from || to) {
    windowMatch.$gte = from ? new Date(from) : new Date(0);
    windowMatch.$lte = to ? new Date(to) : new Date();
  }
  const hasWindow = from || to;

  // ── Resolve geographic filter ─────────────────────────────────────────────
  const countryCodes = resolveCountryCodes(areas, countries);
  let { villageIds, peopleGroupIds } = await resolveEntityIdsByCountry(countryCodes);

  // ── Resolve NG (DMM) peoples filter ───────────────────────────────────────
  // When one or more MasterPeople ids are supplied, constrain the whole report
  // to the DMM PeopleGroups (and their villages) attached to those masters.
  // This makes every section (disciples, DBS, churches, leaders, persons of
  // peace) obey the peoples selection, not just the peoples list at the bottom.
  const peoplesArr = (peoples || [])
    .map((p) => String(p).trim())
    .filter((p) => p && mongoose.Types.ObjectId.isValid(p));
  if (peoplesArr.length > 0) {
    const masterIds = peoplesArr.map((p) => new mongoose.Types.ObjectId(p));
    const dmmGroups = await PeopleGroup.find(
      { source: 'DMM', masterPeopleId: { $in: masterIds } },
      { _id: 1, village: 1 }
    ).lean();

    // Intersect the peoplesselection with any existing geographic peopleGroup filter
    let selectedGroupIds = dmmGroups.map((g) => g._id);
    if (peopleGroupIds !== null) {
      const geoSet = new Set(peopleGroupIds.map((id) => String(id)));
      selectedGroupIds = selectedGroupIds.filter((id) => geoSet.has(String(id)));
    }
    peopleGroupIds = selectedGroupIds;

    // Restrict villages to those referenced by the selected DMM groups, still
    // intersecting with any geographic village filter already resolved.
    const peopleVillageIds = dmmGroups
      .filter((g) => selectedGroupIds.some((id) => String(id) === String(g._id)))
      .map((g) => g.village)
      .filter(Boolean);
    if (villageIds !== null) {
      const geoVillageSet = new Set(villageIds.map((id) => String(id)));
      villageIds = peopleVillageIds.filter((id) => geoVillageSet.has(String(id)));
    } else {
      villageIds = peopleVillageIds;
    }
  }

  // Build geo sub-filter for models that reference village or peopleGroup
  const geoMatch = {};
  if (villageIds !== null || peopleGroupIds !== null) {
    const conditions = [];
    if (villageIds !== null && villageIds.length > 0) {
      conditions.push({ village: { $in: villageIds } });
    }
    if (peopleGroupIds !== null && peopleGroupIds.length > 0) {
      conditions.push({ peopleGroup: { $in: peopleGroupIds } });
    }
    if (conditions.length > 0) {
      geoMatch.$or = conditions;
    } else {
      // Country filter was applied but no matching villages/groups found → return zeros
      geoMatch._id = null;
    }
  }

  // ── Disciples (from DBS sessions in the window) ───────────────────────────
  const dbsMatch = { ...orgMatch, ...geoMatch };
  if (hasWindow) dbsMatch.date = windowMatch;
  const [discipleAgg] = await DBSSession.aggregate([
    { $match: dbsMatch },
    {
      $group: {
        _id: null,
        newDisciples: { $sum: { $ifNull: ['$decisionsForChrist', 0] } },
        baptized: { $sum: { $ifNull: ['$baptisms', 0] } },
      },
    },
  ]);

  // ── Discovery groups ──────────────────────────────────────────────────────
  const dgBase = { ...orgMatch, ...geoMatch };
  const dgTotal = await DiscoveryGroup.countDocuments({ ...dgBase });
  const dgActive = await DiscoveryGroup.countDocuments({ ...dgBase, status: 'active' });
  const dgBecameChurch = await DiscoveryGroup.countDocuments({ ...dgBase, status: 'became-church' });

  // ── Churches ──────────────────────────────────────────────────────────────
  // Churches reference village and peopleGroup — apply geo filter
  const churchGeoMatch = {};
  if (villageIds !== null || peopleGroupIds !== null) {
    const conditions = [];
    if (villageIds !== null && villageIds.length > 0) {
      conditions.push({ village: { $in: villageIds } });
    }
    if (peopleGroupIds !== null && peopleGroupIds.length > 0) {
      conditions.push({ peopleGroup: { $in: peopleGroupIds } });
    }
    if (conditions.length > 0) {
      churchGeoMatch.$or = conditions;
    } else {
      churchGeoMatch._id = null;
    }
  }

  const churchBase = { ...churchGeoMatch };
  const churchTotal = await Church.countDocuments({ ...churchBase, lifecycleStatus: 'active' });
  const churchCommissioned = await Church.countDocuments({ ...churchBase, lifecycleStatus: 'active', planterType: 'commissioned' });
  const churchCatalytic = await Church.countDocuments({ ...churchBase, lifecycleStatus: 'active', planterType: 'catalytic' });
  const churchMerged = await Church.countDocuments({ ...churchBase, lifecycleStatus: 'merged' });
  const churchDied = await Church.countDocuments({ ...churchBase, lifecycleStatus: 'died' });

  const genAgg = await Church.aggregate([
    { $match: { ...churchBase, lifecycleStatus: 'active' } },
    { $group: { _id: '$generation', count: { $sum: 1 } } },
  ]);
  const byGeneration = { 1: 0, 2: 0, 3: 0, '4plus': 0 };
  genAgg.forEach((g) => {
    const gen = g._id || 1;
    if (gen >= 4) byGeneration['4plus'] += g.count;
    else byGeneration[gen] = (byGeneration[gen] || 0) + g.count;
  });

  // ── Persons of peace ──────────────────────────────────────────────────────
  const popBase = { ...orgMatch, ...geoMatch };
  const popAgg = await PersonOfPeace.aggregate([
    { $match: popBase },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = { identified: 0, engaging: 0, confirmed: 0, leading: 0, inactive: 0 };
  let popTotal = 0;
  popAgg.forEach((s) => {
    if (s._id && byStatus[s._id] !== undefined) byStatus[s._id] = s.count;
    popTotal += s.count;
  });

  // ── Leaders ───────────────────────────────────────────────────────────────
  const inTraining = byStatus.engaging + byStatus.confirmed + byStatus.leading;
  const deployMatch = { ...orgMatch, ...geoMatch, status: 'leading' };
  if (hasWindow) deployMatch.createdAt = windowMatch;
  const newLeadersDeployed = await PersonOfPeace.countDocuments(deployMatch);

  // Scope active coaches to the resolved geography (village/peopleGroup). Without
  // geoMatch this counted EVERY coach globally, so any region/country showed the
  // same phantom coach count regardless of its actual data.
  const coachMatch = { ...orgMatch, ...geoMatch };
  if (hasWindow) coachMatch.date = windowMatch;
  const activeCoaches = (await CoachingSession.distinct('coach', coachMatch)).length;

  // ── DMM field-report metrics carried ON the PeopleGroup docs ──────────────
  // The quarterly NG import writes its numbers (churches, DBS/COM/CAT, disciples,
  // baptisms, leaders, coaches, generation) DIRECTLY on the PeopleGroup rather
  // than into the Church/DBSSession collections above. Aggregate those here so a
  // country/region rolls up the imported engagement data (funnel: engagement →
  // country → region). Scope: the resolved peopleGroupIds when a geo/peoples
  // filter is active; otherwise every approved DMM/Survey group.
  const pgMatch = { source: { $in: ['DMM', 'Survey', 'manual'] }, approved: true };
  if (peopleGroupIds !== null) {
    // A country/peoples filter was applied → restrict to those groups (may be []).
    pgMatch._id = { $in: (peopleGroupIds || []) };
  }
  // Quarter/year filter: engagements carry a reportPeriod like "2Q26". When a
  // period is requested, only sum the engagements reported for that quarter so
  // switching 2Q26 ↔ 3Q26 shows different numbers (case-insensitive match).
  if (period) {
    pgMatch.reportPeriod = { $regex: new RegExp('^' + String(period).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') };
  }
  const [pgAgg] = await PeopleGroup.aggregate([
    { $match: pgMatch },
    {
      $group: {
        _id: null,
        engagements: { $sum: 1 },
        numberOfChurches: { $sum: { $ifNull: ['$numberOfChurches', 0] } },
        maxGeneration: { $max: { $ifNull: ['$churchGeneration', 0] } },
        dbs: { $sum: { $ifNull: ['$dbs', 0] } },
        com: { $sum: { $ifNull: ['$com', 0] } },
        cat: { $sum: { $ifNull: ['$cat', 0] } },
        newDisciples: { $sum: { $ifNull: ['$newDisciples', 0] } },
        newBaptisms: { $sum: { $ifNull: ['$newBaptisms', 0] } },
        leadersInTraining: { $sum: { $ifNull: ['$leadersInTraining', 0] } },
        activeCoaches: { $sum: { $ifNull: ['$activeCoaches', 0] } },
        trainingsHeld: { $sum: { $ifNull: ['$trainingsHeld', 0] } },
        lostChurches: { $sum: { $ifNull: ['$lostChurches', 0] } },
        mergedChurches: { $sum: { $ifNull: ['$mergedChurches', 0] } },
      },
    },
  ]);
  const pg = pgAgg || {};
  const pgNum = (f) => pg[f] || 0;

  return {
    period: { from: from || null, to: to || null },
    disciples: {
      // Combine DBSSession-derived disciples with the imported PeopleGroup metrics.
      newDisciples: (discipleAgg ? discipleAgg.newDisciples : 0) + pgNum('newDisciples'),
      baptized: (discipleAgg ? discipleAgg.baptized : 0) + pgNum('newBaptisms'),
    },
    discoveryGroups: {
      // Discovery/DBS groups: DiscoveryGroup collection + DBS count reported on
      // the imported engagements (CSV column "DBS" -> PeopleGroup.dbs).
      total: dgTotal + pgNum('dbs'),
      active: dgActive + pgNum('dbs'),
      becameChurch: dgBecameChurch,
    },
    churches: {
      // Church collection total + churches reported on the imported engagements.
      total: churchTotal + pgNum('numberOfChurches'),
      // Commissioned / catalytic: Church collection + the COM/CAT counts carried
      // on the imported engagements (CSV columns COM/CAT). This is why these were
      // stuck at 0 — the Church collection is empty and pg.com/pg.cat were ignored.
      commissioned: churchCommissioned + pgNum('com'),
      catalytic: churchCatalytic + pgNum('cat'),
      byGeneration,
      maxGeneration: pgNum('maxGeneration'),
      engagements: pgNum('engagements'),
      mergedOrDied: { merged: churchMerged + pgNum('mergedChurches'), died: churchDied + pgNum('lostChurches') },
    },
    leaders: {
      inTraining: inTraining + pgNum('leadersInTraining'),
      activeCoaches: activeCoaches + pgNum('activeCoaches'),
      newLeadersDeployed,
    },
    personsOfPeace: { total: popTotal, byStatus },
    // DMM engagement field-report rollup (from imported PeopleGroup metrics).
    dmmFieldMetrics: {
      engagements: pgNum('engagements'),
      churches: pgNum('numberOfChurches'),
      maxGeneration: pgNum('maxGeneration'),
      dbs: pgNum('dbs'),
      com: pgNum('com'),
      cat: pgNum('cat'),
      newDisciples: pgNum('newDisciples'),
      newBaptisms: pgNum('newBaptisms'),
      leadersInTraining: pgNum('leadersInTraining'),
      activeCoaches: pgNum('activeCoaches'),
      trainingsHeld: pgNum('trainingsHeld'),
    },
  };
}

// GET /api/reporting/numerical?from=&to=&organization=&areas=FCA,AWA&countries=CM,TD
router.get('/numerical', optionalAuth, async (req, res) => {
  try {
    const { from, to, organization } = req.query;
    const areas = req.query.areas ? req.query.areas.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const countries = req.query.countries ? req.query.countries.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const peoples = req.query.peoples ? req.query.peoples.split(',').map((s) => s.trim()).filter(Boolean) : [];
    // Optional quarter filter. Accept either an explicit period ("2Q26") or
    // year+quarter which we normalise to the same "<q>Q<yy>" engagement format.
    let period = req.query.period ? String(req.query.period).trim() : null;
    if (!period && req.query.year && req.query.quarter) {
      period = `${parseInt(req.query.quarter, 10)}Q${String(req.query.year).slice(-2)}`;
    }
    const report = await buildNumericalReport({ from, to, organization, areas, countries, peoples, period });
    res.json({ data: report });
  } catch (error) {
    console.error('Error building numerical report:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// GET /api/reporting/quarterly?year=&quarter=&organization=&areas=FCA,AWA&countries=CM,TD
router.get('/quarterly', optionalAuth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const quarter = Math.min(4, Math.max(1, parseInt(req.query.quarter) || 1));
    const { from, to } = quarterWindow(year, quarter);
    const areas = req.query.areas ? req.query.areas.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const countries = req.query.countries ? req.query.countries.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const peoples = req.query.peoples ? req.query.peoples.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const report = await buildNumericalReport({
      from: from.toISOString(),
      to: to.toISOString(),
      organization: req.query.organization,
      areas,
      countries,
      peoples,
      // Engagement metrics are keyed by reportPeriod ("2Q26"), not by date, so
      // pass the normalised period to filter DMM field data by the quarter.
      period: `${quarter}Q${String(year).slice(-2)}`,
    });
    report.quarter = { year, quarter };
    res.json({ data: report });
  } catch (error) {
    console.error('Error building quarterly report:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// GET /api/reporting/peoples?areas=FCA&countries=CM,TD&year=&quarter=&from=&to=&sourceTypes=&status=&page=&limit=
router.get('/peoples', async (req, res) => {
  try {
    // 1. params
    const { areas, countries, from, to, year, quarter, sourceTypes, status, peoples } = req.query;
    let page = parseInt(req.query.page, 10) || 1; if (page < 1) page = 1;
    let limit = parseInt(req.query.limit, 10) || 50; if (limit < 1) limit = 50; if (limit > 200) limit = 200;

    // 2. resolve alpha-2 country codes via existing helper
    const areasArr = areas ? String(areas).split(',').map((s) => s.trim()).filter(Boolean) : [];
    const countriesArr = countries ? String(countries).split(',').map((s) => s.trim()).filter(Boolean) : [];
    const alpha2 = resolveCountryCodes(areasArr, countriesArr); // returns array of alpha-2
    if (!alpha2 || alpha2.length === 0) {
      return res.status(400).json({ error: 'No countries resolved. Provide areas (e.g. FCA) and/or countries (alpha-2 codes).' });
    }
    // map alpha-2 -> alpha-3 via Country
    const countryDocs = await Country.find({ code: { $in: alpha2 } }).select('code code3').lean();
    const alpha3 = countryDocs.map((c) => c.code3).filter(Boolean);
    // Track which requested codes could not be resolved so a partial data gap
    // (e.g. a country missing from the `countries` collection) degrades gracefully
    // instead of failing the whole report.
    const mappedAlpha2 = new Set(countryDocs.map((c) => c.code));
    const unmappedAlpha2 = alpha2.filter((c) => !mappedAlpha2.has(c));
    if (unmappedAlpha2.length) {
      console.warn('GET /api/reporting/peoples: unmapped alpha-2 codes (missing from countries collection):', unmappedAlpha2.join(', '));
    }
    if (alpha3.length === 0) {
      return res.status(400).json({
        error: 'Could not map requested countries to ISO3 codes.',
        unmappedCountries: unmappedAlpha2,
        hint: 'Seed the countries collection (node backend/scripts/seedCountries.js) so these alpha-2 codes exist with a code3 value.',
      });
    }

    // 3. time window (optional)
    let window = null;
    if (year && quarter) { window = quarterWindow(year, quarter); }
    else if (from && to) { window = { from: new Date(from), to: new Date(to) }; }

    // 4. build MasterPeople filter
    const mpFilter = { primaryCountryCode: { $in: alpha3 } };
    // Optional explicit peoples selection (list of MasterPeople ids). When set,
    // the report is restricted to exactly these NG (DMM) peoples.
    const peoplesArr = peoples
      ? String(peoples).split(',').map((s) => s.trim()).filter((p) => p && mongoose.Types.ObjectId.isValid(p))
      : [];
    if (peoplesArr.length) {
      mpFilter._id = { $in: peoplesArr.map((p) => new mongoose.Types.ObjectId(p)) };
    }
    if (sourceTypes) {
      const st = String(sourceTypes).split(',').map((s) => s.trim()).filter(Boolean);
      if (st.length) mpFilter.sourceTypes = { $in: st };
    }
    if (status) {
      const stt = String(status).trim();
      mpFilter.$or = [{ 'dmmRollup.status': stt }, { 'status.status': stt }];
    }

    const total = await MasterPeople.countDocuments(mpFilter);
    // sort: NG-engaged first, then dmmRollup.totalChurches desc, then canonicalName
    const masters = await MasterPeople.find(mpFilter)
      .sort({ 'dmmRollup.totalChurches': -1, canonicalName: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // NOTE: sort NG-engaged first can't be a single simple Mongo sort on an array-includes; do a STABLE
    // JS re-sort of the page to bring sourceTypes-includes-'DMM' to the top while preserving the existing order.
    masters.sort((a, b) => {
      const an = (a.sourceTypes || []).includes('DMM') ? 0 : 1;
      const bn = (b.sourceTypes || []).includes('DMM') ? 0 : 1;
      return an - bn;
    });

    const masterIds = masters.map((m) => m._id);

    // 5. batch load DMM engagements for the page
      const engagements = masterIds.length
      ? await PeopleGroup.find({
          source: { $in: ['DMM', 'Survey'] },
          approved: true,
          masterPeopleId: { $in: masterIds },
        })
          .select('masterPeopleId name villageName region admin2 admin3 engagementStatus engagementLevel numberOfChurches churchGeneration newDisciples')
          .lean()
      : [];
    const engByMaster = new Map();
    for (const pg of engagements) {
      const k = String(pg.masterPeopleId);
      if (!engByMaster.has(k)) engByMaster.set(k, []);
      engByMaster.get(k).push(pg);
    }

    // 6. batch quarterly disciples/baptisms (only if window set)
    // map: pg _id -> master id ; discoveryGroup -> master id
    let dbsByMaster = new Map(); // masterId -> {newDisciples,baptisms}
    if (window) {
      const pgIds = engagements.map((e) => e._id);
      const pgToMaster = new Map(engagements.map((e) => [String(e._id), String(e.masterPeopleId)]));
      if (pgIds.length) {
        const dgs = await DiscoveryGroup.find({ peopleGroup: { $in: pgIds } }).select('_id peopleGroup').lean();
        const dgToMaster = new Map();
        for (const dg of dgs) {
          const mid = pgToMaster.get(String(dg.peopleGroup));
          if (mid) dgToMaster.set(String(dg._id), mid);
        }
        const dgIds = dgs.map((d) => d._id);
        if (dgIds.length) {
          const sessions = await DBSSession.find({ discoveryGroup: { $in: dgIds }, date: { $gte: window.from, $lte: window.to } })
            .select('discoveryGroup decisionsForChrist baptisms').lean();
          for (const s of sessions) {
            const mid = dgToMaster.get(String(s.discoveryGroup));
            if (!mid) continue;
            if (!dbsByMaster.has(mid)) dbsByMaster.set(mid, { newDisciples: 0, baptisms: 0 });
            const agg = dbsByMaster.get(mid);
            agg.newDisciples += (s.decisionsForChrist || 0);
            agg.baptisms += (s.baptisms || 0);
          }
        }
      }
    }

    // 7. build rows
    const data = masters.map((m) => {
      const isNG = (m.sourceTypes || []).includes('DMM');
      const rollup = m.dmmRollup || null;
      const mine = engByMaster.get(String(m._id)) || [];
      let dmm = null;
      if (isNG) {
        const engagementCount = rollup?.engagementCount != null ? rollup.engagementCount : mine.length;
        const villagesTouched = rollup?.villagesTouched != null ? rollup.villagesTouched : new Set(mine.map((e) => (e.villageName || '').trim()).filter(Boolean)).size;
        const totalChurches = rollup?.totalChurches != null ? rollup.totalChurches : mine.reduce((s, e) => s + (e.numberOfChurches || 0), 0);
        const maxGeneration = rollup?.maxGeneration != null ? rollup.maxGeneration : mine.reduce((mx, e) => Math.max(mx, e.churchGeneration || 0), 0);
        // Total des nouveaux disciples/croyants cumulé sur tous les engagements du peuple.
        const totalNewDisciples = mine.reduce((s, e) => s + (e.newDisciples || 0), 0);
        const w = window ? { from: window.from, to: window.to, ...(dbsByMaster.get(String(m._id)) || { newDisciples: 0, baptisms: 0 }) } : null;
        dmm = {
          engagementCount, villagesTouched, totalChurches, maxGeneration, totalNewDisciples,
          window: w,
          engagements: mine.map((e) => ({
            peopleGroupId: e._id, name: e.name, villageName: e.villageName,
            region: e.region, admin2: e.admin2, admin3: e.admin3,
            engagementStatus: e.engagementStatus, engagementLevel: e.engagementLevel,
            numberOfChurches: e.numberOfChurches, churchGeneration: e.churchGeneration,
            newDisciples: e.newDisciples || 0,
          })),
        };
      }
      return {
        masterPeopleId: m._id,
        canonicalName: m.canonicalName,
        rop3: m.rop3 || null,
        primaryCountryCode: m.primaryCountryCode || null,
        sourceTypes: m.sourceTypes || [],
        isNGEngaged: isNG,
        status: {
          global: (rollup && rollup.status) || (m.status && m.status.status) || 'UNKNOWN',
          jpScale: m.status ? m.status.jpScale : undefined,
          leastReached: m.status ? m.status.leastReached : undefined,
          level: rollup ? rollup.level : undefined,
        },
        dmm,
        reference: { jpScale: m.status ? m.status.jpScale : undefined, leastReached: m.status ? m.status.leastReached : undefined },
      };
    });

    const meta = {
      areas: areasArr,
      countries: alpha2,
      window: window ? { from: window.from, to: window.to } : null,
      sourceTypes: sourceTypes ? String(sourceTypes).split(',').map((s) => s.trim()).filter(Boolean) : [],
      unmappedCountries: unmappedAlpha2,
      totals: { peoples: total },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };

    return res.json({ meta, data });
  } catch (err) {
    console.error('GET /api/reporting/peoples error:', err);
    return res.status(500).json({ error: 'Failed to build peoples report', details: err.message });
  }
});

// ── NG Geography (funnel: Regions → Countries → Peoples) ──────────────────────

// Human-readable full names for the NG regions (sigles → libellé complet).
const NG_AREA_FULL_NAMES = {
  FCA: 'Francophone Central Africa',
  AWA: 'Anglophone West Africa',
  FWA: 'Francophone West Africa',
};

// Return the full label for a region id, falling back to "<ID> Region".
function ngAreaFullName(id) {
  const key = String(id || '').toUpperCase();
  return NG_AREA_FULL_NAMES[key] || `${key} Region`;
}

/**
 * Build a lightweight country descriptor from COUNTRY_CONFIG for a given
 * alpha-2 code. Returns null when the code is unknown so callers can skip it.
 */
function ngCountryDescriptor(alpha2) {
  const c = COUNTRY_CONFIG[String(alpha2).toUpperCase()];
  if (!c) return null;
  return {
    code: c.code,
    code3: c.code3,
    name: c.name,
    nameEn: c.nameEn,
    capital: c.capital,
    region: c.region,
    center: c.center,
    zoom: c.zoom,
    bounds: c.bounds,
  };
}

// GET /api/reporting/regions
// List the NG regions with their countries (source of truth: NG_AREAS + COUNTRY_CONFIG).
router.get('/regions', optionalAuth, async (req, res) => {
  try {
    const data = Object.keys(NG_AREAS).map((id) => {
      const countries = NG_AREAS[id]
        .map(ngCountryDescriptor)
        .filter(Boolean);
      return {
        id,
        name: id,
        fullName: ngAreaFullName(id),
        countryCount: countries.length,
        countries,
      };
    });
    res.json({ data });
  } catch (error) {
    console.error('Error building regions list:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// GET /api/reporting/regions/:regionId?year=&quarter=&from=&to=
// One region: its countries + aggregated DMM metrics for the whole region.
router.get('/regions/:regionId', optionalAuth, async (req, res) => {
  try {
    const regionId = String(req.params.regionId || '').toUpperCase();
    if (!NG_AREAS[regionId]) {
      return res.status(404).json({ error: 'Region not found', message: `No NG region: ${regionId}` });
    }
    const countries = NG_AREAS[regionId].map(ngCountryDescriptor).filter(Boolean);

    // Optional time window: year+quarter takes precedence over from/to.
    let from = req.query.from;
    let to = req.query.to;
    let period = req.query.period ? String(req.query.period).trim() : null;
    if (req.query.year && req.query.quarter) {
      const w = quarterWindow(req.query.year, req.query.quarter);
      from = w.from.toISOString();
      to = w.to.toISOString();
      period = `${parseInt(req.query.quarter, 10)}Q${String(req.query.year).slice(-2)}`;
    }
    const peoples = req.query.peoples ? String(req.query.peoples).split(',').map((s) => s.trim()).filter(Boolean) : [];

    const metrics = await buildNumericalReport({
      from,
      to,
      organization: req.query.organization,
      areas: [regionId],
      peoples,
      period,
    });

    // Per-country metrics for the Countries table on the region fiche.
    // Reuse buildNumericalReport scoped to a single country so the numbers stay
    // dynamically derived from the same source as the region-wide totals.
    const countriesWithMetrics = await Promise.all(
      countries.map(async (country) => {
        const cm = await buildNumericalReport({
          from,
          to,
          organization: req.query.organization,
          countries: [country.code],
          peoples,
          period,
        });
        const engagements = cm.churches?.engagements ?? cm.dmmFieldMetrics?.engagements ?? 0;
        const churchesTotal = cm.churches?.total ?? 0;
        const maxGen = cm.churches?.maxGeneration || 0;
        // Total Believers = new believers only. The baptized are already counted
        // among the new believers, so they must NOT be added again.
        const totalBelievers = cm.disciples?.newDisciples || 0;
        return {
          ...country,
          metrics: cm,
          summary: {
            engagements,
            churches: churchesTotal,
            maxGeneration: maxGen,
            totalBelievers,
          },
        };
      })
    );

    res.json({
      data: {
        id: regionId,
        name: regionId,
        fullName: ngAreaFullName(regionId),
        countries: countriesWithMetrics,
        metrics,
      },
    });
  } catch (error) {
    console.error('Error building region detail:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// GET /api/reporting/regions/:regionId/countries/:countryCode?year=&quarter=&from=&to=
// One country within a region: its config + aggregated DMM metrics.
router.get('/regions/:regionId/countries/:countryCode', optionalAuth, async (req, res) => {
  try {
    const regionId = String(req.params.regionId || '').toUpperCase();
    const countryCode = String(req.params.countryCode || '').toUpperCase();
    if (!NG_AREAS[regionId]) {
      return res.status(404).json({ error: 'Region not found', message: `No NG region: ${regionId}` });
    }
    if (!NG_AREAS[regionId].includes(countryCode)) {
      return res.status(404).json({
        error: 'Country not in region',
        message: `${countryCode} does not belong to ${regionId}`,
      });
    }
    const country = ngCountryDescriptor(countryCode);
    if (!country) {
      return res.status(404).json({ error: 'Country not found', message: `Unknown country config: ${countryCode}` });
    }

    let from = req.query.from;
    let to = req.query.to;
    let period = req.query.period ? String(req.query.period).trim() : null;
    if (req.query.year && req.query.quarter) {
      const w = quarterWindow(req.query.year, req.query.quarter);
      from = w.from.toISOString();
      to = w.to.toISOString();
      period = `${parseInt(req.query.quarter, 10)}Q${String(req.query.year).slice(-2)}`;
    }
    const peoples = req.query.peoples ? String(req.query.peoples).split(',').map((s) => s.trim()).filter(Boolean) : [];

    const metrics = await buildNumericalReport({
      from,
      to,
      organization: req.query.organization,
      countries: [countryCode],
      peoples,
      period,
    });

    res.json({
      data: {
        region: { id: regionId, name: regionId },
        country,
        metrics,
      },
    });
  } catch (error) {
    console.error('Error building country detail:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
