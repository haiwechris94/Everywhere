/**
 * DMM Manual Review Queue — approve/reject uncertain DMM→MasterPeople links.
 *
 * The DMM ingestion loader (scripts/ingestDmmPeople.js) records uncertain links
 * as PeopleMatch rows with confidenceBand 'MANUAL_REVIEW' and decidedBy 'pending'.
 * An admin/supervisor can here APPROVE (confirm the link and roll up the DMM
 * engagement into the candidate MasterPeople) or REJECT (detach the engagement
 * into its own standalone MasterPeople).
 *
 * Mounted at /api/dmm-review (see server.js). All endpoints require `auth` and
 * `canApprove` (admin or supervisor only — see middleware/roles.js).
 */
const express = require('express');
const router = express.Router();

const MasterPeople = require('../models/MasterPeople');
const PeopleSource = require('../models/PeopleSource');
const PeopleMatch = require('../models/PeopleMatch');
const PeopleGroup = require('../models/PeopleGroup');
const { auth } = require('../middleware/auth');
const { canApprove } = require('../middleware/roles');
const { calculateStatus, calculateLevel } = require('../services/dmmStatusCalculator');

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Recompute a MasterPeople.dmmRollup from all its linked DMM PeopleGroups (Option B).
 * gathers PeopleGroup.find({ source: 'DMM', masterPeopleId }); totalChurches =
 * sum(numberOfChurches), maxGeneration = max(churchGeneration), engagementCount,
 * villagesTouched (distinct villageName); status = calculateStatus(...),
 * level = calculateLevel(maxGeneration). $set dmmRollup — never touches master.status.
 *
 * If the master has zero DMM engagements, $pull 'DMM' from sourceTypes and $unset dmmRollup.
 * @param {mongoose.Types.ObjectId|string} masterId
 * @returns {Promise<object|null>} the new dmmRollup, or null when cleared
 */
async function recomputeDmmRollup(masterId) {
  const groups = await PeopleGroup.find({ source: 'DMM', masterPeopleId: masterId })
    .select('numberOfChurches churchGeneration villageName')
    .lean();

  if (!groups.length) {
    // No DMM engagements remain — drop the rollup and the 'DMM' source tag.
    await MasterPeople.updateOne(
      { _id: masterId },
      { $unset: { dmmRollup: '' }, $pull: { sourceTypes: 'DMM' } }
    );
    return null;
  }

  const totalChurches = groups.reduce((s, g) => s + (g.numberOfChurches || 0), 0);
  const maxGeneration = groups.reduce((mx, g) => Math.max(mx, g.churchGeneration || 0), 0);
  const engagementCount = groups.length;
  const villagesTouched = new Set(
    groups.map((g) => (g.villageName || '').trim()).filter(Boolean)
  ).size;

  const rollup = {
    engagementCount,
    villagesTouched,
    totalChurches,
    maxGeneration,
    status: calculateStatus(totalChurches, maxGeneration),
    level: calculateLevel(maxGeneration),
    updatedAt: new Date(),
  };

  await MasterPeople.updateOne(
    { _id: masterId },
    { $set: { dmmRollup: rollup }, $addToSet: { sourceTypes: 'DMM' } }
  );
  return rollup;
}

/** String identity to store in PeopleMatch.decidedBy (a String field). */
const reviewerString = (req) =>
  String((req.user && (req.user._id || req.user.name)) || 'admin');

// ── GET /queue — list pending manual-review matches ──────────────────────────
router.get('/queue', auth, canApprove, async (req, res) => {
  try {
    let page = parseInt(req.query.page, 10) || 1;
    if (page < 1) page = 1;
    let limit = parseInt(req.query.limit, 10) || 50;
    if (limit < 1) limit = 50;
    if (limit > 200) limit = 200;
    const country = req.query.country ? String(req.query.country).trim().toUpperCase() : null;

    const matchFilter = { confidenceBand: 'MANUAL_REVIEW', decidedBy: 'pending' };

    // Top-level count of ALL pending across countries (for a badge).
    const totalPending = await PeopleMatch.countDocuments(matchFilter);

    // When filtering by country we must scope to matches whose candidate master
    // is in that country. Resolve the eligible master ids first, then constrain.
    if (country) {
      const mastersInCountry = await MasterPeople.find(
        { primaryCountryCode: country },
        { _id: 1 }
      ).lean();
      matchFilter.masterPeopleId = { $in: mastersInCountry.map((m) => m._id) };
    }

    const total = await PeopleMatch.countDocuments(matchFilter);

    // Fetch the page of matches.
    const matches = await PeopleMatch.find(matchFilter)
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Batch the lookups (avoid N+1): collect masterIds + sourceIds.
    const masterIds = [...new Set(matches.map((m) => String(m.masterPeopleId)))];
    const sourceIds = [...new Set(matches.map((m) => String(m.toSourceId)))];

    const [masters, sources] = await Promise.all([
      MasterPeople.find({ _id: { $in: masterIds } })
        .select('canonicalName primaryCountryCode rop3 sourceTypes status')
        .lean(),
      PeopleSource.find({ _id: { $in: sourceIds } })
        .select('sourceRecordId sourceType')
        .lean(),
    ]);

    const masterById = new Map(masters.map((m) => [String(m._id), m]));
    const sourceById = new Map(sources.map((s) => [String(s._id), s]));

    // For DMM sources, sourceRecordId is the DMM PeopleGroup _id (string).
    const pgIds = sources
      .map((s) => s.sourceRecordId)
      .filter(Boolean);
    const peopleGroups = pgIds.length
      ? await PeopleGroup.find({ _id: { $in: pgIds } })
          .select('name villageName region admin2 admin3 country countryCode numberOfChurches churchGeneration engagementStatus location')
          .lean()
      : [];
    const pgById = new Map(peopleGroups.map((pg) => [String(pg._id), pg]));

    const data = matches.map((m) => {
      const master = masterById.get(String(m.masterPeopleId)) || null;
      const source = sourceById.get(String(m.toSourceId)) || null;
      const pg = source ? pgById.get(String(source.sourceRecordId)) || null : null;
      return {
        matchId: m._id,
        matchType: m.matchType,
        matchTier: m.matchTier,
        confidence: m.confidence,
        confidenceBand: m.confidenceBand,
        candidateMaster: master
          ? {
              masterPeopleId: master._id,
              canonicalName: master.canonicalName,
              primaryCountryCode: master.primaryCountryCode || null,
              rop3: master.rop3 || null,
              sourceTypes: master.sourceTypes || [],
              status: master.status ? master.status.status : null,
            }
          : null,
        engagement: pg
          ? {
              peopleGroupId: pg._id,
              name: pg.name,
              villageName: pg.villageName || null,
              region: pg.region || null,
              admin2: pg.admin2 || null,
              admin3: pg.admin3 || null,
              country: pg.country || null,
              countryCode: pg.countryCode || null,
              numberOfChurches: pg.numberOfChurches || 0,
              churchGeneration: pg.churchGeneration || 0,
              engagementStatus: pg.engagementStatus || null,
            }
          : null,
      };
    });

    res.json({
      meta: {
        totalPending,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      data,
    });
  } catch (err) {
    console.error('GET /api/dmm-review/queue error:', err);
    res.status(500).json({ error: 'Failed to load review queue', details: err.message });
  }
});

// ── GET /queue/count — quick pending counts (total + by country) ─────────────
router.get('/queue/count', auth, canApprove, async (req, res) => {
  try {
    const matchFilter = { confidenceBand: 'MANUAL_REVIEW', decidedBy: 'pending' };

    const totalPending = await PeopleMatch.countDocuments(matchFilter);

    // Two queries + JS grouping (simple and correct): pending matches → master ids,
    // then map master ids to primaryCountryCode.
    const pending = await PeopleMatch.find(matchFilter).select('masterPeopleId').lean();
    const masterIds = [...new Set(pending.map((m) => String(m.masterPeopleId)))];

    const masters = masterIds.length
      ? await MasterPeople.find({ _id: { $in: masterIds } })
          .select('primaryCountryCode')
          .lean()
      : [];
    const countryByMaster = new Map(
      masters.map((m) => [String(m._id), m.primaryCountryCode || 'UNKNOWN'])
    );

    const counts = new Map();
    for (const m of pending) {
      const cc = countryByMaster.get(String(m.masterPeopleId)) || 'UNKNOWN';
      counts.set(cc, (counts.get(cc) || 0) + 1);
    }
    const byCountry = [...counts.entries()]
      .map(([countryCode, count]) => ({ countryCode, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ totalPending, byCountry });
  } catch (err) {
    console.error('GET /api/dmm-review/queue/count error:', err);
    res.status(500).json({ error: 'Failed to count review queue', details: err.message });
  }
});

// ── POST /:matchId/approve — confirm the link ────────────────────────────────
router.post('/:matchId/approve', auth, canApprove, async (req, res) => {
  try {
    const match = await PeopleMatch.findById(req.params.matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    if (match.confidenceBand !== 'MANUAL_REVIEW' || match.decidedBy !== 'pending') {
      return res.status(409).json({
        error: 'Match already decided',
        message: 'This match is not pending manual review.',
      });
    }

    const master = await MasterPeople.findById(match.masterPeopleId);
    if (!master) {
      return res.status(404).json({ error: 'Candidate master people not found' });
    }

    const source = await PeopleSource.findById(match.toSourceId).lean();
    const pg = source && source.sourceRecordId
      ? await PeopleGroup.findById(source.sourceRecordId)
      : null;

    // Mark decided (keep matchType/tier/confidence unchanged).
    match.decidedBy = reviewerString(req);
    await match.save();

    // Enforce the PeopleGroup → master link (it should already be set).
    if (pg && String(pg.masterPeopleId) !== String(master._id)) {
      pg.masterPeopleId = master._id;
      await pg.save();
    }

    // Ensure the master carries the DMM source tag.
    await MasterPeople.updateOne(
      { _id: master._id },
      { $addToSet: { sourceTypes: 'DMM' } }
    );

    // Recompute the DMM rollup (does not overwrite master.status).
    await recomputeDmmRollup(master._id);

    res.json({ ok: true, matchId: match._id, masterPeopleId: master._id });
  } catch (err) {
    console.error('POST /api/dmm-review/:matchId/approve error:', err);
    res.status(500).json({ error: 'Failed to approve match', details: err.message });
  }
});

// ── POST /:matchId/reject — detach engagement into a new standalone master ───
router.post('/:matchId/reject', auth, canApprove, async (req, res) => {
  try {
    const match = await PeopleMatch.findById(req.params.matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    if (match.confidenceBand !== 'MANUAL_REVIEW' || match.decidedBy !== 'pending') {
      return res.status(409).json({
        error: 'Match already decided',
        message: 'This match is not pending manual review.',
      });
    }

    const oldMaster = await MasterPeople.findById(match.masterPeopleId).lean();

    const source = await PeopleSource.findById(match.toSourceId);
    if (!source) {
      return res.status(404).json({ error: 'People source not found' });
    }
    const pg = source.sourceRecordId
      ? await PeopleGroup.findById(source.sourceRecordId)
      : null;
    if (!pg) {
      return res.status(404).json({ error: 'DMM people group not found for this match' });
    }

    // Reuse an existing standalone master if one already exists for this pg.
    const naturalKey = `DMM:${pg._id}`;
    let newMaster = await MasterPeople.findOne({ groupNaturalKey: naturalKey });
    if (!newMaster) {
      newMaster = await MasterPeople.create({
        canonicalName: pg.name,
        groupNaturalKey: naturalKey,
        primaryCountryCode: (oldMaster && oldMaster.primaryCountryCode) || null,
        primaryLanguageName: pg.language || null,
        primaryLocation: pg.location || null,
        sourceTypes: ['DMM'],
        totalPopulation: pg.population || 0,
        status: { status: 'UNKNOWN' },
        migrationRunId: `review-${Date.now()}`,
        version: 1,
      });
    }

    // Re-point the source and the people group to the new master.
    source.masterPeopleId = newMaster._id;
    await source.save();
    pg.masterPeopleId = newMaster._id;
    await pg.save();

    // Update the match: now a MANUAL, kept-separate decision on the new master.
    match.masterPeopleId = newMaster._id;
    match.matchType = 'MANUAL';
    match.confidenceBand = 'KEEP_SEPARATE';
    match.decidedBy = reviewerString(req);
    // (PeopleMatch has no `reason` field — do not add one; reason is not stored.)
    await match.save();

    // Recompute rollups for BOTH the old master (now minus this engagement)
    // and the new standalone master.
    if (oldMaster) await recomputeDmmRollup(oldMaster._id);
    await recomputeDmmRollup(newMaster._id);

    res.json({ ok: true, matchId: match._id, newMasterPeopleId: newMaster._id });
  } catch (err) {
    console.error('POST /api/dmm-review/:matchId/reject error:', err);
    res.status(500).json({ error: 'Failed to reject match', details: err.message });
  }
});

module.exports = router;
