/**
 * geocodeCMEngagements.js
 * Geocode the CM engagements sitting at (0,0) using their villageName via the
 * public OpenStreetMap Nominatim API. Writes location.coordinates = [lng, lat]
 * (GeoJSON order) for confident hits. Villages like "Non identifié"/"Non précisé"
 * are skipped (left for centroid approximation on the map).
 *
 * Respects Nominatim usage policy: <=1 req/sec, descriptive User-Agent.
 * Dry-run by default; pass --apply to persist.
 *
 * Node >=18 has global fetch.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const APPLY = process.argv.includes('--apply');

const UA = 'church-planting-map/1.0 (DMM engagement geocoding; contact: chrishaiwe@gmail.com)';
const SKIP = /non\s*(identifi|précis|precis)|multi-?sites|à préciser|a preciser/i;

// Normalize a raw villageName into a best-effort searchable place name:
//  - take the first entry of a comma-separated multi-village list
//  - drop parenthetical qualifiers
const cleanVillage = (raw) => {
  if (!raw) return '';
  let v = String(raw).split(',')[0];           // first of a list
  v = v.replace(/\([^)]*\)/g, '');             // remove (...) notes
  v = v.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  return v;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(place) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place + ', Cameroun')}&format=json&limit=1&countrycodes=cm`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' } });
  if (!res.ok) return null;
  const arr = await res.json();
  if (!Array.isArray(arr) || !arr.length) return null;
  const { lat, lon, display_name } = arr[0];
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  return { coordinates: [lo, la], display_name };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting');
  const all = await PeopleGroup.find({ countryCode: 'CM', source: { $in: ['DMM', 'Survey', 'manual'] } })
    .select('name villageName location');
  const targets = all.filter((r) => {
    const c = r.location && r.location.coordinates;
    return !Array.isArray(c) || c.length < 2 || (Number(c[0]) === 0 && Number(c[1]) === 0);
  });
  console.log(`Engagements to geocode (0,0): ${targets.length}\n`);

  let hit = 0, skip = 0, miss = 0;
  for (const r of targets) {
    const raw = r.villageName || '';
    if (!raw || SKIP.test(raw)) { skip++; console.log(`SKIP  ${r.name}  (village="${raw}")`); continue; }
    const place = cleanVillage(raw);
    if (!place) { skip++; console.log(`SKIP  ${r.name}  (empty after clean)`); continue; }
    let g = null;
    try { g = await geocode(place); } catch (e) { /* network */ }
    await sleep(1100); // rate limit
    if (!g) { miss++; console.log(`MISS  ${r.name}  ("${place}") — no result`); continue; }
    hit++;
    console.log(`HIT   ${r.name}  ("${place}") -> [${g.coordinates[0].toFixed(4)}, ${g.coordinates[1].toFixed(4)}]  (${g.display_name})`);
    if (APPLY) {
      r.location = { type: 'Point', coordinates: g.coordinates };
      await r.save();
    }
  }
  console.log(`\nHITS: ${hit}  SKIPPED (no usable village): ${skip}  MISS (not found): ${miss}`);
  console.log(APPLY ? 'APPLIED: coordinates written.' : 'DRY RUN — pass --apply to write coordinates.');
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
