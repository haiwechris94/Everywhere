/**
 * Master People API — read-only endpoints over the canonical people-graph
 * (master_people + people_sources / people_aliases / people_locations /
 * people_matches / people_statuses). See docs/architecture/08-api-architecture.md.
 *
 * Mounted at /api/master-people (see server.js).
 * Always returns exactly ONE marker per master people from /map/markers.
 */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const MasterPeople = require('../models/MasterPeople');
const PeopleSource = require('../models/PeopleSource');
const PeopleAlias = require('../models/PeopleAlias');
const PeopleLocation = require('../models/PeopleLocation');
const PeopleMatch = require('../models/PeopleMatch');
const PeopleStatus = require('../models/PeopleStatus');
const PeopleGroup = require('../models/PeopleGroup');
const Activity = require('../models/Activity');
const Village = require('../models/Village');
const { COUNTRY_CONFIG } = require('./countries');
const { auth } = require('../middleware/auth');
const { recomputeDmmRollup } = require('../services/dmmRollup');

const fs = require('fs');
const path = require('path');

// ── DMM peoples: country/region resolution helpers ───────────────────────────
// Reverse map alpha-3 (e.g. 'CMR') -> alpha-2 (e.g. 'CM') from COUNTRY_CONFIG so
// the separate DMM layer can build the /regions/:regionId/countries/:code/peoples
// navigation target. NG_AREAS mirrors backend/routes/reporting.js.
const ALPHA3_TO_ALPHA2 = {};
for (const key of Object.keys(COUNTRY_CONFIG || {})) {
  const c = COUNTRY_CONFIG[key];
  if (c && c.code3 && c.code) ALPHA3_TO_ALPHA2[c.code3] = c.code;
}
const NG_AREAS = {
  FCA: ['CM', 'TD', 'CG', 'CD', 'GA', 'CF', 'GQ', 'UG'],
  AWA: ['SL', 'GH', 'LR', 'GM', 'NG', 'GW', 'GN'],
  FWA: ['CI', 'BJ', 'TG', 'NE', 'ML', 'BF', 'SN', 'GN'],
};
function regionForAlpha2(a2) {
  if (!a2) return null;
  for (const key of Object.keys(NG_AREAS)) {
    if (NG_AREAS[key].includes(a2)) return key;
  }
  return null;
}

// ── Admin polygon helpers (territorial coverage) ─────────────────────────────
const DATA_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'data');
const ADMIN_FILES = {
  CMR: 'Admin123CMR fusionnées.geojson',
  CAF: 'CAF_admin123.geojson',
  TCD: 'TCD_admin123.geojson',
  GAB: 'GAB_admin123.geojson',
  COG: 'Admin123COG fusionnées.geojson',
  COD: 'Admin123COD fusionnées.geojson',
  GNQ: 'Admin123GNQ fusionnées.geojson',
};
const _adminCache = new Map();
function loadAdmin(code3) {
  if (!code3 || !ADMIN_FILES[code3]) return null;
  if (_adminCache.has(code3)) return _adminCache.get(code3);
  let gj = null;
  try {
    gj = JSON.parse(fs.readFileSync(path.join(DATA_DIR, ADMIN_FILES[code3]), 'utf8'));
  } catch (e) {
    gj = null;
  }
  _adminCache.set(code3, gj);
  return gj;
}
function admLevel(props = {}) {
  if (props.admin_level != null) return Number(props.admin_level);
  if (!props.GID_2) return 1;
  if (!props.GID_3) return 2;
  return 3;
}
function admName(props = {}, lvl) {
  if (lvl === 1) return props.NAME_1 || props.name || '';
  if (lvl === 2) return props.NAME_2 || props.name || '';
  return props.NAME_3 || props.name || '';
}
function ringContains(pt, ring) {
  const [px, py] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function featureContains(lngLat, feature) {
  const g = feature && feature.geometry;
  if (!g) return false;
  if (g.type === 'Polygon') return ringContains(lngLat, g.coordinates[0]);
  if (g.type === 'MultiPolygon') return g.coordinates.some((poly) => ringContains(lngLat, poly[0]));
  return false;
}
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Admin-unit centroid fallback ─────────────────────────────────────────────
// Some DMM engagements/peoples have NO coordinates (primaryLocation / location
// nul). Rather than dropping them from the map, we place them at the centroid of
// the administrative unit they reference (arrondissement/admin3 > département/
// admin2 > région/admin1), matched by name in the country's GADM GeoJSON.

// Ring centroid via the shoelace formula ([lng,lat] rings).
function ringCentroid(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = xj * yi - xi * yj;
    area += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }
  if (area === 0) {
    // Degenerate polygon: fall back to the average of the vertices.
    const avg = ring.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
    return [avg[0] / ring.length, avg[1] / ring.length];
  }
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}
// Centroid of a GeoJSON feature (largest ring of the largest polygon).
function featureCentroid(feature) {
  const g = feature && feature.geometry;
  if (!g) return null;
  if (g.type === 'Polygon') return ringCentroid(g.coordinates[0]);
  if (g.type === 'MultiPolygon') {
    // Pick the polygon with the most points (a good proxy for the largest part).
    let best = null;
    let bestLen = -1;
    for (const poly of g.coordinates) {
      const len = (poly[0] || []).length;
      if (len > bestLen) { bestLen = len; best = poly[0]; }
    }
    return best ? ringCentroid(best) : null;
  }
  return null;
}
const _norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
// Per-country centroid index, keyed by "level:normalizedName" -> [lng,lat].
const _centroidCache = new Map();
function centroidIndex(code3) {
  if (!code3) return null;
  if (_centroidCache.has(code3)) return _centroidCache.get(code3);
  const gj = loadAdmin(code3);
  const idx = new Map();
  if (gj && Array.isArray(gj.features)) {
    for (const f of gj.features) {
      const props = f.properties || {};
      const lvl = admLevel(props);
      const name = admName(props, lvl);
      if (!name) continue;
      const c = featureCentroid(f);
      if (!c) continue;
      const key = `${lvl}:${_norm(name)}`;
      if (!idx.has(key)) idx.set(key, c);
    }
  }
  _centroidCache.set(code3, idx);
  return idx;
}
// Resolve [lng,lat] for a record's admin names, most specific level first.
// admins: { region (lvl1), admin2 (lvl2), admin3 (lvl3) }.
function adminCentroid(code3, admins = {}) {
  const idx = centroidIndex(code3);
  if (!idx || idx.size === 0) return null;
  const tries = [
    [3, admins.admin3],
    [2, admins.admin2],
    [1, admins.region],
  ];
  for (const [lvl, name] of tries) {
    if (!name) continue;
    const hit = idx.get(`${lvl}:${_norm(name)}`);
    if (hit) return { coordinates: hit, level: lvl };
  }
  return null;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const toList = (v) =>
  (v === undefined || v === null || v === '')
    ? null
    : String(v).split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/** Build the shared master_people filter from query params. */
function buildFilter(q) {
  const filter = {};
  const sources = toList(q.source);
  if (sources) filter.sourceTypes = { $in: sources };
  if (q.country) filter.primaryCountryCode = String(q.country).trim().toUpperCase();
  if (q.status) filter['status.status'] = String(q.status).trim().toUpperCase();
  if (q.q && String(q.q).trim()) {
    filter.canonicalName = { $regex: String(q.q).trim(), $options: 'i' };
  }
  return filter;
}

// ── GET /  — paginated list of master people ─────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = buildFilter(req.query);

    const [items, total] = await Promise.all([
      MasterPeople.find(filter)
        .sort({ canonicalName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MasterPeople.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /map/markers — ONE marker per master people (map-optimized) ──────────
router.get('/map/markers', async (req, res, next) => {
  try {
    const filter = buildFilter(req.query);
    // Only masters that have a display point.
    filter.primaryLocation = { $ne: null };
    // Exclude DMM-only masters from the unified JP/IMB layer: unless the caller
    // asked for an explicit `source`, require at least one NON-DMM source. DMM
    // peoples are rendered separately via /map/dmm-peoples.
    if (!filter.sourceTypes) {
      filter.sourceTypes = { $in: ['JP', 'CPPI', 'SURVEY'] };
    }

    // Optional bbox: "minLng,minLat,maxLng,maxLat"
    if (req.query.bbox) {
      const parts = String(req.query.bbox).split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const [minLng, minLat, maxLng, maxLat] = parts;
        filter.primaryLocation = {
          $geoWithin: { $box: [[minLng, minLat], [maxLng, maxLat]] },
        };
      }
    }

    const cap = Math.min(20000, Math.max(1, parseInt(req.query.limit, 10) || 20000));

    const docs = await MasterPeople.find(filter, {
      canonicalName: 1,
      rop3: 1,
      primaryCountryCode: 1,
      sourceTypes: 1,
      primaryLocation: 1,
      status: 1,
      totalPopulation: 1,
    })
      .limit(cap)
      .lean();

    const markers = docs.map((d) => ({
      id: d._id,
      name: d.canonicalName,
      rop3: d.rop3 || null,
      coordinates: d.primaryLocation ? d.primaryLocation.coordinates : null, // [lng,lat]
      // Strip DMM so this unified layer never treats a marker as a DMM point.
      sourceTypes: (d.sourceTypes || []).filter((t) => t !== 'DMM'),
      status: d.status ? d.status.status : null,
      country: d.primaryCountryCode || null,
      population: d.totalPopulation || 0,
    }));

    res.json({ count: markers.length, markers });
  } catch (err) {
    next(err);
  }
});

// ── GET /map/dmm-villages — DMM engagement "village" sub-points ──────────────
// Read-only. Returns the DMM PeopleGroup engagements (source:'DMM' + linked to a
// master people) as small "village" points to overlay in addition to the ONE
// main /map/markers marker per people (the people's "fief"). Optional filters:
//   bbox         = "minLng,minLat,maxLng,maxLat" (mirrors the $geoWithin $box
//                  pattern used by /map/markers, but on PeopleGroup.location)
//   masterPeopleId = restrict to a single master people
router.get('/map/dmm-villages', async (req, res, next) => {
  try {
    // Base filter: DMM engagements linked to a master people. NOTE: we no longer
    // require `location.coordinates` — engagements without coordinates are kept
    // and snapped to their administrative unit's centroid below.
    const filter = {
      source: 'DMM',
      masterPeopleId: { $ne: null },
    };

    // Optional restrict to a single master people.
    if (req.query.masterPeopleId && isValidId(req.query.masterPeopleId)) {
      filter.masterPeopleId = req.query.masterPeopleId;
    }

    const cap = Math.min(20000, Math.max(1, parseInt(req.query.limit, 10) || 20000));

    const docs = await PeopleGroup.find(filter)
      .select('name villageName location engagementStatus numberOfChurches churchGeneration masterPeopleId region admin2 admin3')
      .limit(cap)
      .lean();

    // Resolve country (alpha-3) per master people so we can pick the right GADM
    // file when snapping coordinate-less engagements to an admin centroid.
    const masterIds = [...new Set(docs.map((d) => String(d.masterPeopleId)).filter(Boolean))];
    const masters = masterIds.length
      ? await MasterPeople.find({ _id: { $in: masterIds } })
          .select('primaryCountryCode')
          .lean()
      : [];
    const code3ByMaster = new Map(masters.map((m) => [String(m._id), m.primaryCountryCode || null]));

    const villages = docs
      .map((d) => {
        // Treat a null island coordinate [0,0] as "no coordinates" so the
        // engagement gets snapped to its admin/village centroid instead of being
        // dropped by the country bbox filter (this is why 14 CM engagements were
        // missing: their location was literally [0,0]).
        const hasCoords =
          d.location && Array.isArray(d.location.coordinates) && d.location.coordinates.length === 2
          && !(Number(d.location.coordinates[0]) === 0 && Number(d.location.coordinates[1]) === 0);
        let coordinates = hasCoords ? d.location.coordinates : null; // [lng,lat]
        let locationSource = hasCoords ? 'exact' : null;

        // Fallback: snap to the centroid of the referenced admin unit.
        if (!coordinates) {
          const code3 = code3ByMaster.get(String(d.masterPeopleId));
          const hit = adminCentroid(code3, {
            region: d.region,
            admin2: d.admin2,
            admin3: d.admin3,
          });
          if (hit) {
            coordinates = hit.coordinates;
            locationSource = hit.level === 3 ? 'admin3-centroid'
              : hit.level === 2 ? 'admin2-centroid'
              : 'admin1-centroid';
          }
        }

        return {
          id: d._id,
          masterPeopleId: d.masterPeopleId || null,
          name: d.name || null,
          villageName: d.villageName || null,
          coordinates, // [lng,lat] — exact or admin centroid, null if unresolved
          approximate: locationSource !== 'exact' && !!coordinates,
          locationSource, // 'exact' | 'admin3-centroid' | 'admin2-centroid' | 'admin1-centroid' | null
          engagementStatus: d.engagementStatus || null,
          numberOfChurches: d.numberOfChurches || 0,
          churchGeneration: d.churchGeneration || 0,
          region: d.region || null,
          admin2: d.admin2 || null,
          admin3: d.admin3 || null,
        };
      })
      // Only keep points we can actually place. Also honour an optional bbox
      // filter here (post-centroid) so approximated points respect the viewport.
      .filter((v) => {
        if (!v.coordinates) return false;
        if (req.query.bbox) {
          const parts = String(req.query.bbox).split(',').map(Number);
          if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
            const [minLng, minLat, maxLng, maxLat] = parts;
            const [lng, lat] = v.coordinates;
            if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
          }
        }
        return true;
      });

    res.json({ count: villages.length, villages });
  } catch (err) {
    next(err);
  }
});

// ── GET /map/dmm-peoples — DMM peoples as a SEPARATE map layer ────────────────
// Read-only. Returns ONE point per DMM-engaged master people (sourceTypes
// includes 'DMM' and it has a primaryLocation). These are intentionally kept
// OUT of /map/markers (unified JP/IMB layer) and rendered as their own layer.
// Each point carries what the popup needs plus the navigation target
// /regions/:regionId/countries/:countryCode2/peoples/:id.
// Optional filters: country (alpha-3), bbox "minLng,minLat,maxLng,maxLat".
router.get('/map/dmm-peoples', async (req, res, next) => {
  try {
    // Include ALL DMM master-peoples (even those without a primaryLocation):
    // coordinate-less peoples are snapped to the admin centroid of their
    // representative engagement below, instead of being dropped from the map.
    const filter = { sourceTypes: 'DMM' };

    // Diagnostic counts (run in parallel) so the UI can explain why fewer
    // points appear than there are DMM engagements: some master-peoples have
    // no primaryLocation, and multiple raw DMM engagements collapse into one
    // master-people point.
    const [totalDmmMasterPeople, withLocation, totalDmmEngagements] = await Promise.all([
      MasterPeople.countDocuments({ sourceTypes: 'DMM' }),
      MasterPeople.countDocuments({ sourceTypes: 'DMM', primaryLocation: { $ne: null } }),
      PeopleGroup.countDocuments({ source: 'DMM' }),
    ]);

    if (req.query.country) {
      filter.primaryCountryCode = String(req.query.country).trim().toUpperCase();
    }

    // NOTE: bbox is applied AFTER coordinates are resolved (see filter below),
    // so peoples placed at an admin centroid still honour the viewport.
    const bboxParts = req.query.bbox
      ? String(req.query.bbox).split(',').map(Number)
      : null;
    const bbox = bboxParts && bboxParts.length === 4 && bboxParts.every((n) => Number.isFinite(n))
      ? bboxParts
      : null;

    const cap = Math.min(20000, Math.max(1, parseInt(req.query.limit, 10) || 20000));

    const docs = await MasterPeople.find(filter, {
      canonicalName: 1,
      rop3: 1,
      primaryCountryCode: 1,
      sourceTypes: 1,
      primaryLocation: 1,
      status: 1,
      totalPopulation: 1,
      dmmRollup: 1,
    })
      .limit(cap)
      .lean();

    const masterIds = docs.map((d) => d._id);

    // Batch-load linked DMM PeopleGroups for popup detail + aggregates.
    const engagements = masterIds.length
      ? await PeopleGroup.find({ source: 'DMM', masterPeopleId: { $in: masterIds } })
          .select('masterPeopleId name villageName region admin2 admin3 engagementStatus engagementLevel numberOfChurches churchGeneration language religion population')
          .lean()
      : [];
    const engByMaster = new Map();
    for (const e of engagements) {
      const k = String(e.masterPeopleId);
      if (!engByMaster.has(k)) engByMaster.set(k, []);
      engByMaster.get(k).push(e);
    }

    let placedByCentroid = 0;
    const peoples = docs
      .map((d) => {
        const mine = engByMaster.get(String(d._id)) || [];
        const rep = mine[0] || {};
        const rollup = d.dmmRollup || null;
        const computedChurches = mine.reduce((s, e) => s + (e.numberOfChurches || 0), 0);
        const computedGen = mine.reduce((mx, e) => Math.max(mx, e.churchGeneration || 0), 0);
        const computedVillages = new Set(mine.map((e) => (e.villageName || '').trim()).filter(Boolean)).size;
        const a2 = ALPHA3_TO_ALPHA2[d.primaryCountryCode] || null;

        // Resolve a display point: prefer the people's primaryLocation, otherwise
        // snap to the admin centroid of a representative engagement (admin3 >
        // admin2 > région). This keeps coordinate-less DMM peoples on the map.
        let coordinates = d.primaryLocation ? d.primaryLocation.coordinates : null; // [lng,lat]
        let locationSource = coordinates ? 'exact' : null;
        if (!coordinates) {
          // Try each engagement until one resolves to a centroid.
          for (const e of mine) {
            const hit = adminCentroid(d.primaryCountryCode, {
              region: e.region,
              admin2: e.admin2,
              admin3: e.admin3,
            });
            if (hit) {
              coordinates = hit.coordinates;
              locationSource = hit.level === 3 ? 'admin3-centroid'
                : hit.level === 2 ? 'admin2-centroid'
                : 'admin1-centroid';
              placedByCentroid += 1;
              break;
            }
          }
        }

        return {
          id: d._id,
          name: d.canonicalName,
          rop3: d.rop3 || null,
          coordinates, // [lng,lat] — exact or admin centroid
          approximate: locationSource !== 'exact' && !!coordinates,
          locationSource, // 'exact' | 'admin3-centroid' | 'admin2-centroid' | 'admin1-centroid' | null
          countryCode3: d.primaryCountryCode || null,
          countryCode2: a2,
          regionId: regionForAlpha2(a2),
          status: d.status ? d.status.status : null,
          dmmStatus: (rollup && rollup.status) || rep.engagementStatus || null,
          population: d.totalPopulation || 0,
          engagementCount: rollup && rollup.engagementCount != null ? rollup.engagementCount : mine.length,
          totalChurches: rollup && rollup.totalChurches != null ? rollup.totalChurches : computedChurches,
          maxGeneration: rollup && rollup.maxGeneration != null ? rollup.maxGeneration : computedGen,
          villagesTouched: rollup && rollup.villagesTouched != null ? rollup.villagesTouched : computedVillages,
          region: rep.region || null,
          department: rep.admin2 || null,
          subdivision: rep.admin3 || null,
          language: rep.language || null,
          religion: rep.religion || null,
        };
      })
      // Keep only peoples we can actually place, honouring an optional bbox.
      .filter((p) => {
        if (!p.coordinates) return false;
        if (bbox) {
          const [minLng, minLat, maxLng, maxLat] = bbox;
          const [lng, lat] = p.coordinates;
          if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
        }
        return true;
      });

    res.json({
      count: peoples.length,
      peoples,
      meta: {
        returned: peoples.length,
        totalDmmMasterPeople,
        withLocation,
        withoutLocation: totalDmmMasterPeople - withLocation,
        placedByCentroid,
        totalDmmEngagements,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /map/dmm-engagements — ONE marker per DMM engagement (village-level) ──
// Unlike /map/dmm-peoples (which collapses every engagement of a people into a
// single master-people marker), this returns ONE point per DMM PeopleGroup
// engagement — the same population the "Villages / statut DMM" layer counts
// (e.g. 80 engagements for Cameroon). Each point is labelled "name, villageName"
// and carries the funnel navigation target when the people is linked to a
// master people. Coordinate-less engagements are snapped to their admin centroid
// (admin3 > admin2 > région) so they still appear on the map.
// Optional filters: country (alpha-2 or alpha-3), status (engagementStatus),
// bbox "minLng,minLat,maxLng,maxLat".
router.get('/map/dmm-engagements', async (req, res, next) => {
  try {
    // Match the villages/statuses layer: approved DMM/Survey/manual engagements
    // (everything that is NOT Joshua Project). This is the "80" population.
    const query = {
      approved: true,
      source: { $in: ['DMM', 'Survey', 'manual'] },
    };

    // Country filter accepts alpha-2 (CM) or alpha-3 (CMR). We store alpha-2 in
    // countryCode, so translate alpha-3 down to alpha-2 first.
    let alpha2Filter = null;
    let alpha3Filter = null;
    if (req.query.country) {
      const c = String(req.query.country).trim().toUpperCase();
      if (c.length === 3) {
        alpha3Filter = c;
        alpha2Filter = ALPHA3_TO_ALPHA2[c] || null;
      } else if (c.length === 2) {
        alpha2Filter = c;
      }
      if (alpha2Filter) query.countryCode = alpha2Filter;
    }
    if (req.query.status) {
      query.engagementStatus = String(req.query.status).trim().toLowerCase();
    }

    const bboxParts = req.query.bbox
      ? String(req.query.bbox).split(',').map(Number)
      : null;
    const bbox = bboxParts && bboxParts.length === 4 && bboxParts.every((n) => Number.isFinite(n))
      ? bboxParts
      : null;

    const cap = Math.min(20000, Math.max(1, parseInt(req.query.limit, 10) || 20000));

    const engagements = await PeopleGroup.find(query)
      .select('name villageName masterPeopleId countryCode region admin2 admin3 engagementStatus engagementLevel numberOfChurches churchGeneration language religion population location')
      .limit(cap)
      .lean();

    let placedByCentroid = 0;
    const points = engagements
      .map((e) => {
        const a2 = e.countryCode || alpha2Filter || null;
        // alpha-3 needed for the admin centroid lookup (GeoJSON files keyed by code3)
        const code3 = alpha3Filter
          || (COUNTRY_CONFIG[a2] && COUNTRY_CONFIG[a2].code3)
          || null;

        // Resolve a display point: prefer the engagement's exact location,
        // otherwise snap to its admin centroid (admin3 > admin2 > région).
        let coordinates = e.location && Array.isArray(e.location.coordinates)
          ? e.location.coordinates // [lng,lat]
          : null;
        let locationSource = coordinates ? 'exact' : null;
        if (!coordinates && code3) {
          const hit = adminCentroid(code3, {
            region: e.region,
            admin2: e.admin2,
            admin3: e.admin3,
          });
          if (hit) {
            coordinates = hit.coordinates;
            locationSource = hit.level === 3 ? 'admin3-centroid'
              : hit.level === 2 ? 'admin2-centroid'
              : 'admin1-centroid';
            placedByCentroid += 1;
          }
        }

        const village = (e.villageName || '').trim();
        // "nom de l'engagement, Village" — matches the Villages/DMM-status layer.
        const label = village ? `${e.name}, ${village}` : e.name;

        return {
          id: e._id,
          name: e.name,
          villageName: village || null,
          label,
          masterPeopleId: e.masterPeopleId || null,
          coordinates, // [lng,lat] — exact or admin centroid
          approximate: locationSource !== 'exact' && !!coordinates,
          locationSource,
          countryCode2: a2,
          countryCode3: code3,
          regionId: regionForAlpha2(a2),
          dmmStatus: e.engagementStatus || null,
          engagementLevel: e.engagementLevel || null,
          totalChurches: e.numberOfChurches || 0,
          maxGeneration: e.churchGeneration || 0,
          population: e.population || 0,
          region: e.region || null,
          department: e.admin2 || null,
          subdivision: e.admin3 || null,
          language: e.language || null,
          religion: e.religion || null,
        };
      })
      .filter((p) => {
        if (!p.coordinates) return false;
        if (bbox) {
          const [minLng, minLat, maxLng, maxLat] = bbox;
          const [lng, lat] = p.coordinates;
          if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
        }
        return true;
      });

    res.json({
      count: points.length,
      // Keep the `peoples` key so the existing UnifiedMap consumer works
      // unchanged; each entry is now a single engagement, not a master people.
      peoples: points,
      meta: {
        returned: points.length,
        totalEngagements: engagements.length,
        placedByCentroid,
        withoutPlaceableLocation: engagements.length - points.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /planters/:name/engagements — all engagements for a church planter ───
// Read-only. Returns every DMM/Survey/manual PeopleGroup whose churchPlanter
// matches the given name (case-insensitive, exact). No auth (open like the
// other map endpoints in this file).
router.get('/planters/:name/engagements', async (req, res) => {
  try {
    const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const name = decodeURIComponent(req.params.name || '').trim();

    const rows = await PeopleGroup.find({
      source: { $in: ['DMM', 'Survey', 'manual'] },
      churchPlanter: { $regex: new RegExp('^' + escapeRegExp(name) + '$', 'i') },
    })
      .select(
        'name villageName region admin2 admin3 countryCode engagementStatus engagementLevel numberOfChurches churchGeneration dbs com cat newDisciples newBaptisms leadersInTraining activeCoaches trainingsHeld reportPeriod masterPeopleId location churchPlanter'
      )
      .sort({ name: 1 })
      .lean();

    const totalChurches = rows.reduce((sum, r) => sum + (r.numberOfChurches || 0), 0);

    const engagements = rows.map((r) => {
      let coordinates = null;
      const coords = r.location && r.location.coordinates;
      if (
        Array.isArray(coords) &&
        coords.length === 2 &&
        !(coords[0] === 0 && coords[1] === 0)
      ) {
        coordinates = coords;
      }
      return {
        id: String(r._id),
        name: r.name,
        villageName: r.villageName,
        region: r.region,
        countryCode: r.countryCode,
        engagementStatus: r.engagementStatus,
        numberOfChurches: r.numberOfChurches,
        churchGeneration: r.churchGeneration,
        reportPeriod: r.reportPeriod,
        masterPeopleId: r.masterPeopleId ? String(r.masterPeopleId) : null,
        coordinates,
      };
    });

    res.json({
      planter: name,
      count: rows.length,
      totalChurches,
      engagements,
    });
  } catch (err) {
    console.error('GET /planters/:name/engagements failed:', err);
    res.status(500).json({ error: 'Failed to load planter engagements' });
  }
});

// ── POST /recompute-rollups — recompute dmmRollup for all DMM peoples ────────
// Finds all distinct master peoples that have DMM engagements and recomputes
// each one's dmmRollup. Requires auth.
router.post('/recompute-rollups', auth, async (req, res, next) => {
  try {
    const ids = await PeopleGroup.distinct('masterPeopleId', {
      source: 'DMM',
      masterPeopleId: { $ne: null },
    });
    for (const id of ids) {
      await recomputeDmmRollup(id);
    }
    res.json({ ok: true, recomputed: ids.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/villages — add a NEW DMM village engagement to a people ────────
// Creates a DMM PeopleGroup row linked to this master people, then recomputes
// the master's dmmRollup so the "one people = one row, N villages" view stays
// accurate as missionaries gain ground. Requires auth.
// Body: { villageName (required), latitude, longitude, engagementStatus,
//         numberOfChurches, churchGeneration, region, admin2, admin3,
//         engagementLevel, description }
router.post('/:id/villages', auth, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const master = await MasterPeople.findById(req.params.id).lean();
    if (!master) return res.status(404).json({ error: 'Master people not found' });

    const b = req.body || {};
    const villageName = (b.villageName || '').trim();
    if (!villageName) return res.status(400).json({ error: 'villageName is required' });

    // Coordinates: fall back to the master's representative point when omitted.
    let lng = Number(b.longitude);
    let lat = Number(b.latitude);
    const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
    const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
    if (!validLng || !validLat) {
      const rep = master.primaryLocation && master.primaryLocation.coordinates;
      if (Array.isArray(rep) && rep.length === 2) {
        lng = Number(rep[0]);
        lat = Number(rep[1]);
      } else {
        return res.status(400).json({ error: 'Valid latitude/longitude required (people has no reference point).' });
      }
    }

    const allowedStatuses = ['unreached', 'pioneer', 'midway', 'tipping-point', 'dmm'];
    const engagementStatus = allowedStatuses.includes(b.engagementStatus) ? b.engagementStatus : 'pioneer';
    const allowedLevels = ['I', 'II', 'III', 'IV', ''];
    const engagementLevel = allowedLevels.includes(b.engagementLevel) ? b.engagementLevel : '';

    // Derive descriptive defaults from an existing sibling engagement when present.
    const sibling = await PeopleGroup.findOne({ source: 'DMM', masterPeopleId: master._id })
      .select('region admin2 admin3 country countryCode language religion')
      .lean();
    const a2 = ALPHA3_TO_ALPHA2[master.primaryCountryCode] || null;

    const doc = new PeopleGroup({
      name: master.canonicalName,
      villageName,
      description: (b.description || '').trim(),
      numberOfChurches: Math.max(0, parseInt(b.numberOfChurches, 10) || 0),
      churchGeneration: Math.max(0, parseInt(b.churchGeneration, 10) || 0),
      engagementStatus,
      engagementLevel,
      region: (b.region || sibling?.region || '').trim(),
      admin2: (b.admin2 || sibling?.admin2 || '').trim(),
      admin3: (b.admin3 || sibling?.admin3 || '').trim(),
      country: sibling?.country || undefined,
      countryCode: sibling?.countryCode || a2 || undefined,
      language: sibling?.language || undefined,
      religion: sibling?.religion || undefined,
      location: { type: 'Point', coordinates: [lng, lat] },
      source: 'DMM',
      approved: true,
      masterPeopleId: master._id,
      createdBy: req.user && (req.user._id || req.user.id),
      approvedBy: req.user && (req.user._id || req.user.id),
    });
    await doc.save();

    // Keep the Option-B rollup in sync (engagementCount / villagesTouched / …).
    const dmmRollup = await recomputeDmmRollup(master._id);

    res.status(201).json({
      ok: true,
      village: {
        id: doc._id,
        name: doc.name,
        villageName: doc.villageName,
        coordinates: doc.location.coordinates,
        engagementStatus: doc.engagementStatus,
        numberOfChurches: doc.numberOfChurches,
        churchGeneration: doc.churchGeneration,
        region: doc.region || null,
        admin2: doc.admin2 || null,
        admin3: doc.admin3 || null,
      },
      dmmRollup,
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /:id/villages/:villageId — modify a DMM engagement ───────────────────
// Updates an existing DMM PeopleGroup engagement that belongs to this master
// people, then recomputes the master's dmmRollup. Requires auth.
router.put('/:id/villages/:villageId', auth, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.villageId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const master = await MasterPeople.findById(req.params.id).lean();
    if (!master) return res.status(404).json({ error: 'Master people not found' });

    const doc = await PeopleGroup.findOne({
      _id: req.params.villageId,
      source: 'DMM',
      masterPeopleId: master._id,
    });
    if (!doc) return res.status(404).json({ error: 'Engagement not found' });

    const b = req.body || {};
    const allowedStatuses = ['unreached', 'pioneer', 'midway', 'tipping-point', 'dmm'];
    const allowedLevels = ['I', 'II', 'III', 'IV', ''];

    if (Object.prototype.hasOwnProperty.call(b, 'villageName')) {
      const villageName = (b.villageName || '').trim();
      if (!villageName) return res.status(400).json({ error: 'villageName must be non-empty' });
      doc.villageName = villageName;
    }
    if (Object.prototype.hasOwnProperty.call(b, 'engagementStatus') && allowedStatuses.includes(b.engagementStatus)) {
      doc.engagementStatus = b.engagementStatus;
    }
    if (Object.prototype.hasOwnProperty.call(b, 'engagementLevel') && allowedLevels.includes(b.engagementLevel)) {
      doc.engagementLevel = b.engagementLevel;
    }
    if (Object.prototype.hasOwnProperty.call(b, 'numberOfChurches')) {
      doc.numberOfChurches = Math.max(0, parseInt(b.numberOfChurches, 10) || 0);
    }
    if (Object.prototype.hasOwnProperty.call(b, 'churchGeneration')) {
      doc.churchGeneration = Math.max(0, parseInt(b.churchGeneration, 10) || 0);
    }
    if (Object.prototype.hasOwnProperty.call(b, 'region')) {
      doc.region = (b.region || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(b, 'admin2')) {
      doc.admin2 = (b.admin2 || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(b, 'admin3')) {
      doc.admin3 = (b.admin3 || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(b, 'description')) {
      doc.description = (b.description || '').trim();
    }
    // Coordinates: only update when BOTH latitude & longitude are valid numbers in range.
    if (Object.prototype.hasOwnProperty.call(b, 'latitude') && Object.prototype.hasOwnProperty.call(b, 'longitude')) {
      const lng = Number(b.longitude);
      const lat = Number(b.latitude);
      const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
      const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
      if (validLng && validLat) {
        doc.location = { type: 'Point', coordinates: [lng, lat] };
      }
    }

    await doc.save();

    const dmmRollup = await recomputeDmmRollup(master._id);

    res.json({
      ok: true,
      village: {
        id: doc._id,
        name: doc.name,
        villageName: doc.villageName,
        engagementStatus: doc.engagementStatus,
        engagementLevel: doc.engagementLevel,
        numberOfChurches: doc.numberOfChurches,
        churchGeneration: doc.churchGeneration,
        region: doc.region,
        admin2: doc.admin2,
        admin3: doc.admin3,
        coordinates: doc.location?.coordinates,
      },
      dmmRollup,
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /:id/villages/:villageId — remove a DMM engagement ─────────────────
// Deletes an existing DMM PeopleGroup engagement that belongs to this master
// people, then recomputes the master's dmmRollup. Requires auth.
router.delete('/:id/villages/:villageId', auth, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.villageId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const master = await MasterPeople.findById(req.params.id).lean();
    if (!master) return res.status(404).json({ error: 'Master people not found' });

    const result = await PeopleGroup.deleteOne({
      _id: req.params.villageId,
      source: 'DMM',
      masterPeopleId: master._id,
    });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Engagement not found' });

    const dmmRollup = await recomputeDmmRollup(master._id);

    res.json({ ok: true, deletedId: req.params.villageId, dmmRollup });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id — one master people (full) ──────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const doc = await MasterPeople.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Master people not found' });

    // Attach the aggregated status doc if present.
    const status = await PeopleStatus.findOne({ masterPeopleId: doc._id }).lean();
    res.json({ ...doc, statusDetail: status || null });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id/sources — all contributing source records (with raw attributes) ─
router.get('/:id/sources', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const sources = await PeopleSource.find({ masterPeopleId: req.params.id }).lean();
    res.json({ count: sources.length, sources });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id/aliases ─────────────────────────────────────────────────────────
router.get('/:id/aliases', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const aliases = await PeopleAlias.find({ masterPeopleId: req.params.id }).lean();
    res.json({ count: aliases.length, aliases });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id/coordinates ─────────────────────────────────────────────────────
router.get('/:id/coordinates', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const coords = await PeopleLocation.find({ masterPeopleId: req.params.id }).lean();
    res.json({ count: coords.length, coordinates: coords });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id/matches — merge-decision audit trail ────────────────────────────
router.get('/:id/matches', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const matches = await PeopleMatch.find({ masterPeopleId: req.params.id }).lean();
    res.json({ count: matches.length, matches });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id/profile — consolidated profile for the detail panel ─────────────
// Aggregates overview (language, religion, photo, description, region), sources
// with a normalized "lastSyncedAt" + per-source coordinates, a population
// breakdown, and localisation (representative point). Fields that are absent
// from the imported source data are returned as null.
router.get('/:id/profile', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const master = await MasterPeople.findById(req.params.id).lean();
    if (!master) return res.status(404).json({ error: 'Master people not found' });

    const [sources, aliases, statusDetail, dmmGroups] = await Promise.all([
      PeopleSource.find({ masterPeopleId: master._id }).lean(),
      PeopleAlias.find({ masterPeopleId: master._id }).lean(),
      PeopleStatus.findOne({ masterPeopleId: master._id }).lean(),
      PeopleGroup.find({
        source: { $in: ['DMM', 'Survey'] },
        approved: true,
        masterPeopleId: master._id,
      })
        .select('name villageName region admin2 admin3 language religion description donor nationalCoordinator churchPlanter affinityGroup urbanRural startYear population engagementStatus engagementLevel numberOfChurches churchGeneration')
        .lean(),
    ]);

    // DMM engagement detail (from linked DMM PeopleGroups, e.g. Cameroon_PGs import).
    // null when this master has no DMM engagement.
    let dmmDetail = null;
    if (Array.isArray(dmmGroups) && dmmGroups.length) {
      const rep = dmmGroups[0] || {};
      dmmDetail = {
        engagementStatus: rep.engagementStatus || null,
        engagementLevel: rep.engagementLevel || null,
        numberOfChurches: dmmGroups.reduce((s, g) => s + (g.numberOfChurches || 0), 0),
        churchGeneration: dmmGroups.reduce((mx, g) => Math.max(mx, g.churchGeneration || 0), 0),
        villagesTouched: new Set(dmmGroups.map((g) => (g.villageName || '').trim()).filter(Boolean)).size,
        region: rep.region || null,
        department: rep.admin2 || null,
        subdivision: rep.admin3 || null,
        language: rep.language || null,
        religion: rep.religion || null,
        description: rep.description || null,
        donor: rep.donor || null,
        nationalCoordinator: rep.nationalCoordinator || null,
        churchPlanter: rep.churchPlanter || null,
        affinityGroup: rep.affinityGroup || null,
        urbanRural: rep.urbanRural || null,
        startYear: rep.startYear || null,
        population: rep.population || null,
        peopleName: master.canonicalName,
        villages: dmmGroups.map((g) => ({
          id: g._id,
          peopleName: master.canonicalName,
          villageName: g.villageName || null,
          engagementStatus: g.engagementStatus || null,
          numberOfChurches: g.numberOfChurches || 0,
          churchGeneration: g.churchGeneration || 0,
          region: g.region || null,
          admin2: g.admin2 || null,
          admin3: g.admin3 || null,
        })),
      };
    }

    // Derive overview fields from raw source rows, preferring a stable order.
    const ORDER = ['JP', 'CPPI', 'DMM', 'FTT', 'SURVEY', 'MANUAL'];
    const ordered = [...sources].sort(
      (a, b) => ORDER.indexOf(a.sourceType) - ORDER.indexOf(b.sourceType)
    );

    const pick = (keys) => {
      for (const src of ordered) {
        const raw = src.rawAttributes || {};
        for (const k of keys) {
          if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') {
            return String(raw[k]).trim();
          }
        }
      }
      return null;
    };

    const religion = pick(['Rlgn', 'PrimaryReligion', 'ReligionPrimary', 'Religion', 'RlgnDesc']);
    const description = pick(['PeopleDesc', 'Summary', 'Introduction', 'Description', 'LocationDesc']);
    let photoUrl = pick(['PicURL', 'PhotoAddress', 'PeopleGroupPhotoURL', 'PhotoURL', 'Photo']);
    if (photoUrl && !/^https?:\/\//i.test(photoUrl)) {
      // Bare filename (common for JP/CPPI exports) — best-effort JP profile URL.
      photoUrl = `https://joshuaproject.net/assets/media/profiles/photos/${photoUrl}`;
    }
    const language = master.primaryLanguageName || pick(['Lang', 'PrimaryLanguageName', 'Language']);
    const region = pick(['Regn', 'RegionName', 'Region', 'RegnSub']);

    const normSyncDate = (s) =>
      s.sourceUpdatedAt ||
      (s.rawAttributes && (s.rawAttributes.UpdatedDate || s.rawAttributes.UpdateDate)) ||
      s.updatedAt ||
      s.importedAt ||
      null;

    const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    const sourceRows = ordered.map((s) => {
      const raw = s.rawAttributes || {};
      const lng = num(raw.Longitude);
      const lat = num(raw.Latitude);
      return {
        id: s._id,
        sourceType: s.sourceType,
        sourceRecordId: s.sourceRecordId,
        sourceName: s.sourceName || null,
        countryName: s.countryName || s.countryCode || null,
        population: s.population != null ? s.population : null,
        lastSyncedAt: normSyncDate(s),
        coordinates: lng != null && lat != null ? [lng, lat] : null,
      };
    });

    const representative = master.primaryLocation ? master.primaryLocation.coordinates : null;

    res.json({
      id: master._id,
      overview: {
        name: master.canonicalName,
        status: master.status ? master.status.status : null,
        jpScale: master.status ? master.status.jpScale : null,
        leastReached: master.status ? master.status.leastReached : null,
        country: master.primaryCountryCode || null,
        region,
        language,
        religion,
        description,
        photoUrl,
        totalPopulation: master.totalPopulation || 0,
        rop3: master.rop3 || null,
        // Registre Joshua Project enrichi pour la fiche des peuples DMM.
        primaryLanguageName: master.primaryLanguageName || language || null,
        bibleStatus:
          (statusDetail && statusDetail.bibleStatus != null ? statusDetail.bibleStatus : null),
        percentEvangelical:
          (statusDetail && statusDetail.percentEvangelical != null
            ? statusDetail.percentEvangelical
            : (master.status ? master.status.percentEvangelical : null)),
      },
      sources: sourceRows,
      population: {
        total: master.totalPopulation || 0,
        bySource: sourceRows.map((s) => ({ sourceType: s.sourceType, population: s.population })),
      },
      localisation: {
        representative, // [lng, lat] or null
        method: 'Calculée',
        sourcePoints: sourceRows
          .filter((s) => s.coordinates)
          .map((s) => ({ sourceType: s.sourceType, coordinates: s.coordinates })),
        coverage: null, // territorial coverage (region/districts/…) : agrégation polygones à venir
      },
      aliases: aliases.map((a) => a.alias).filter(Boolean),
      statusDetail: statusDetail || null,
      dmmDetail,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id/coverage — territorial coverage (admin polygons + villages) ─────
// Attaches the people's point(s) (representative + per-source raw coordinates)
// to administrative polygons (GADM region/dept/arrondissement) and to village
// polygons (Village.boundary), returning per-level counts and a territory list
// suitable for the "Territoires" table.
router.get('/:id/coverage', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const master = await MasterPeople.findById(req.params.id).lean();
    if (!master) return res.status(404).json({ error: 'Master people not found' });

    const sources = await PeopleSource.find({ masterPeopleId: master._id }).lean();

    // Collect all known points for this people (dedup, [lng, lat]).
    const points = [];
    const seenPt = new Set();
    const pushPt = (c) => {
      if (!Array.isArray(c) || c.length !== 2) return;
      const lng = Number(c[0]); const lat = Number(c[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      const k = `${lng.toFixed(5)},${lat.toFixed(5)}`;
      if (seenPt.has(k)) return;
      seenPt.add(k);
      points.push([lng, lat]);
    };
    if (master.primaryLocation) pushPt(master.primaryLocation.coordinates);
    for (const s of sources) {
      const raw = s.rawAttributes || {};
      pushPt([raw.Longitude, raw.Latitude]);
    }

    // Administrative polygons (region/dept/arrondissement) via point-in-polygon.
    const code3 = (master.primaryCountryCode || '').toUpperCase();
    const admin = loadAdmin(code3);
    const territories = [];
    const byLevel = { 1: new Set(), 2: new Set(), 3: new Set() };
    const LEVEL_LABEL = { 1: 'Région', 2: 'Département', 3: 'Arrondissement' };
    if (admin && Array.isArray(admin.features) && points.length) {
      for (const f of admin.features) {
        const lvl = admLevel(f.properties || {});
        if (![1, 2, 3].includes(lvl)) continue;
        if (!points.some((p) => featureContains(p, f))) continue;
        const gid = (f.properties && f.properties[`GID_${lvl}`]) || admName(f.properties, lvl);
        if (byLevel[lvl].has(gid)) continue;
        byLevel[lvl].add(gid);
        territories.push({
          name: admName(f.properties, lvl) || 'Inconnu',
          level: LEVEL_LABEL[lvl],
          type: (f.properties && f.properties[`TYPE_${lvl}`]) || null,
          coverageStatus: null,
          population: null,
          area: null,
        });
      }
    }

    // Village polygons from the DB (boundary contains the point).
    const villageTerritories = [];
    const seenV = new Set();
    for (const p of points) {
      let vs = [];
      try {
        vs = await Village.find({
          boundary: { $geoIntersects: { $geometry: { type: 'Point', coordinates: p } } },
        })
          .select('name status population area region departement arrondissement')
          .limit(10)
          .lean();
      } catch (e) {
        vs = [];
      }
      for (const v of vs) {
        const key = String(v._id);
        if (seenV.has(key)) continue;
        seenV.add(key);
        villageTerritories.push({
          name: v.name,
          level: 'Village',
          type: 'Village',
          coverageStatus: v.status || null,
          population: v.population || null,
          area: v.area || null,
        });
      }
    }

    const allTerritories = [...territories, ...villageTerritories];
    const totalPop = allTerritories.reduce((s, t) => s + (t.population || 0), 0);

    res.json({
      id: master._id,
      pointsUsed: points.length,
      counts: {
        region: byLevel[1].size,
        departement: byLevel[2].size,
        arrondissement: byLevel[3].size,
        village: villageTerritories.length,
      },
      territories: allTerritories,
      totalPopulation: totalPop || null,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id/activities — activities linked to this people ───────────────────
// Activities reference the legacy PeopleGroup collection, so we resolve
// candidate people groups by exact name (case-insensitive) and by geographic
// proximity to the representative point, then return their recent activities.
router.get('/:id/activities', async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const master = await MasterPeople.findById(req.params.id).lean();
    if (!master) return res.status(404).json({ error: 'Master people not found' });

    const pgIds = new Set();
    if (master.canonicalName) {
      const byName = await PeopleGroup.find({
        name: new RegExp(`^${escapeRegExp(master.canonicalName)}$`, 'i'),
      }).select('_id').limit(50).lean();
      byName.forEach((p) => pgIds.add(String(p._id)));
    }
    const rep = master.primaryLocation && master.primaryLocation.coordinates;
    if (Array.isArray(rep) && rep.length === 2) {
      try {
        const near = await PeopleGroup.find({
          location: { $near: { $geometry: { type: 'Point', coordinates: rep }, $maxDistance: 8000 } },
        }).select('_id').limit(50).lean();
        near.forEach((p) => pgIds.add(String(p._id)));
      } catch (e) { /* no geo index / no match */ }
    }

    let activities = [];
    if (pgIds.size) {
      activities = await Activity.find({
        peopleGroup: { $in: [...pgIds] },
        archived: { $ne: true },
      })
        .sort({ date: -1 })
        .limit(50)
        .populate('village', 'name')
        .populate('user', 'name email')
        .lean();
    }

    res.json({
      count: activities.length,
      linkedPeopleGroups: pgIds.size,
      activities: activities.map((a) => ({
        id: a._id,
        type: a.type,
        date: a.date,
        description: a.description,
        participants: a.participants || 0,
        village: a.village ? a.village.name : null,
        user: a.user ? (a.user.name || a.user.email) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
