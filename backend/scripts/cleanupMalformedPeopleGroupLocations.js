/**
 * One-off cleanup for malformed PeopleGroup.location documents.
 *
 * Scope:
 * - Only touches PeopleGroup records.
 * - Finds records where location.type === 'Point' but location.coordinates is missing.
 * - Repairs the location only when a safe fallback exists.
 * - Otherwise removes the malformed location field entirely.
 *
 * Safe fallback rules:
 * - If a valid `location.coordinates` already exists, leave the record unchanged.
 * - If `latitude` and `longitude` fields exist at the top level and are valid numbers,
 *   convert them into GeoJSON Point coordinates.
 * - If `lat` and `lng` fields exist at the top level and are valid numbers,
 *   convert them into GeoJSON Point coordinates.
 * - For anything else, remove `location` so the record is not left in a broken state.
 */

const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');

function isValidNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function buildPointFromFields(doc) {
  const latitude = doc.latitude;
  const longitude = doc.longitude;
  if (isValidNumber(latitude) && isValidNumber(longitude)) {
    return [longitude, latitude];
  }

  const lat = doc.lat;
  const lng = doc.lng;
  if (isValidNumber(lat) && isValidNumber(lng)) {
    return [lng, lat];
  }

  return null;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';

  await mongoose.connect(mongoUri);

  const malformedQuery = {
    'location.type': 'Point',
    $or: [
      { 'location.coordinates': { $exists: false } },
      { 'location.coordinates': null },
      { 'location.coordinates.0': { $exists: false } },
      { 'location.coordinates.1': { $exists: false } },
    ],
  };

  const records = await PeopleGroup.find(malformedQuery)
    .select('_id name location latitude longitude lat lng')
    .lean();

  let repairedCount = 0;
  let removedCount = 0;

  for (const record of records) {
    const coordinates = buildPointFromFields(record);

    if (coordinates) {
      await PeopleGroup.updateOne(
        { _id: record._id },
        { $set: { location: { type: 'Point', coordinates } } }
      );
      repairedCount += 1;
      continue;
    }

    await PeopleGroup.updateOne(
      { _id: record._id },
      { $unset: { location: '' } }
    );
    removedCount += 1;
  }

  console.log(JSON.stringify({
    scanned: records.length,
    repaired: repairedCount,
    removed: removedCount,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Cleanup failed:', error);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect errors
  }
  process.exitCode = 1;
});
