/**
 * dmmRollup.js — recompute a MasterPeople's Option-B DMM engagement rollup.
 *
 * Mirrors the aggregation used by scripts/ingestDmmPeople.js so that an on-demand
 * change (e.g. a village added via the API) keeps master_people.dmmRollup in sync
 * WITHOUT re-running the full ingestion script. Aggregates all linked
 * `PeopleGroup { source:'DMM', masterPeopleId }` rows.
 */
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const dmmStatusCalculator = require('./dmmStatusCalculator');

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const s = (v) => (v == null ? '' : String(v).trim());

/**
 * Recompute and persist `MasterPeople.dmmRollup` for one master people.
 * @param {string|ObjectId} masterId
 * @returns {Promise<object|null>} the new rollup, or null when master not found.
 */
async function recomputeDmmRollup(masterId) {
  if (!masterId || !mongoose.Types.ObjectId.isValid(masterId)) return null;
  const _id = new mongoose.Types.ObjectId(masterId);

  const members = await PeopleGroup.find({ source: 'DMM', masterPeopleId: _id }).lean();

  const engagementCount = members.length;
  const villagesTouched = new Set(members.map((m) => s(m.villageName)).filter((v) => v)).size;
  const totalChurches = members.reduce((sum, m) => sum + toInt(m.numberOfChurches), 0);
  const maxGeneration = members.reduce((mx, m) => Math.max(mx, toInt(m.churchGeneration)), 0);
  const status = dmmStatusCalculator.calculateStatus(totalChurches, maxGeneration);
  const level = dmmStatusCalculator.calculateLevel(maxGeneration);

  const dmmRollup = {
    engagementCount,
    villagesTouched,
    totalChurches,
    maxGeneration,
    status,
    level,
    updatedAt: new Date(),
  };

  // Ensure 'DMM' is registered as a contributing source and set the rollup.
  // $set dmmRollup only — never overwrite master.status (JP-derived reached-status).
  await MasterPeople.updateOne(
    { _id },
    { $set: { dmmRollup }, $addToSet: { sourceTypes: 'DMM' } }
  );

  return dmmRollup;
}

module.exports = { recomputeDmmRollup };
