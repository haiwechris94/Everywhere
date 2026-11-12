/**
 * Region / Country Admin routes
 * ---------------------------------------------------------------------------
 * Admin-guarded CRUD over the editable OVERLAYS (RegionOverlay / CountryOverlay)
 * that augment the hardcoded NG regions (NG_AREAS in routes/reporting.js) and
 * COUNTRY_CONFIG (routes/countries.js). These never mutate the built-in config;
 * the reporting read endpoints merge overlays on top of it.
 *
 * Mounted at /api/region-admin, so final paths are /api/region-admin/...
 */
const express = require('express');
const { auth } = require('../middleware/auth');
const RegionOverlay = require('../models/RegionOverlay');
const CountryOverlay = require('../models/CountryOverlay');
const { COUNTRY_CONFIG } = require('./countries');
const { NG_AREAS } = require('./reporting');

const router = express.Router();

// Built-in region keys (defensive copy; reporting.js exports NG_AREAS).
const BUILTIN_REGION_IDS = new Set(Object.keys(NG_AREAS || {}));

/**
 * Inline admin guard. 401 when not authenticated, 403 unless the user is an
 * admin or supervisor (mirrors the inline convention used elsewhere).
 * `auth` always runs first so req.user is populated.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    return res.status(403).json({ error: 'Access denied', message: 'Admin or supervisor role required' });
  }
  next();
}

const isBuiltinRegion = (regionId) => BUILTIN_REGION_IDS.has(String(regionId).toUpperCase());
const isBuiltinCountry = (code) => Boolean(COUNTRY_CONFIG[String(code).toUpperCase()]);

// Fields an admin may set/update on a region overlay.
function pickRegionFields(body = {}) {
  const out = {};
  if (body.name !== undefined) out.name = body.name;
  if (body.fullName !== undefined) out.fullName = body.fullName;
  if (body.description !== undefined) out.description = body.description;
  if (body.leaders !== undefined) out.leaders = Array.isArray(body.leaders) ? body.leaders : [];
  if (body.responsibleName !== undefined) out.responsibleName = body.responsibleName;
  if (body.countryCodes !== undefined) {
    out.countryCodes = (Array.isArray(body.countryCodes) ? body.countryCodes : [])
      .map((c) => String(c).toUpperCase().trim())
      .filter(Boolean);
  }
  return out;
}

// Fields an admin may set/update on a country overlay.
function pickCountryFields(body = {}) {
  const out = {};
  if (body.code3 !== undefined) out.code3 = body.code3;
  if (body.name !== undefined) out.name = body.name;
  if (body.nameFr !== undefined) out.nameFr = body.nameFr;
  if (body.nameEn !== undefined) out.nameEn = body.nameEn;
  if (body.capital !== undefined) out.capital = body.capital;
  if (body.regionId !== undefined) out.regionId = body.regionId;
  if (body.description !== undefined) out.description = body.description;
  if (body.responsibleName !== undefined) out.responsibleName = body.responsibleName;
  if (body.leaders !== undefined) out.leaders = Array.isArray(body.leaders) ? body.leaders : [];
  if (body.defaultCenter !== undefined) out.defaultCenter = body.defaultCenter;
  return out;
}

// ── Regions ──────────────────────────────────────────────────────────────────

// GET /api/region-admin/regions — list every RegionOverlay (requires login).
router.get('/regions', auth, async (req, res) => {
  try {
    const docs = await RegionOverlay.find().sort({ regionId: 1 }).lean();
    res.json({ data: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/region-admin/regions — create a RegionOverlay.
router.post('/regions', auth, requireAdmin, async (req, res) => {
  try {
    const regionId = String(req.body.regionId || '').toUpperCase().trim();
    if (!regionId) {
      return res.status(400).json({ error: 'regionId is required' });
    }
    const existing = await RegionOverlay.findOne({ regionId });
    if (existing) {
      return res.status(409).json({ error: 'Region overlay already exists', regionId });
    }
    const doc = await RegionOverlay.create({
      ...pickRegionFields(req.body),
      regionId,
      // Custom when the region id is NOT a built-in NG_AREAS key.
      isCustom: !isBuiltinRegion(regionId),
      createdBy: req.user._id,
    });
    res.status(201).json({ data: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/region-admin/regions/:regionId — upsert/update overlay fields.
router.put('/regions/:regionId', auth, requireAdmin, async (req, res) => {
  try {
    const regionId = String(req.params.regionId || '').toUpperCase().trim();
    const update = pickRegionFields(req.body);
    let doc = await RegionOverlay.findOne({ regionId });
    if (!doc) {
      // Create the overlay on first edit (e.g. attach leaders to built-in FCA).
      doc = await RegionOverlay.create({
        ...update,
        regionId,
        isCustom: !isBuiltinRegion(regionId),
        createdBy: req.user._id,
      });
      return res.json({ data: doc });
    }
    Object.assign(doc, update);
    await doc.save();
    res.json({ data: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/region-admin/regions/:regionId — delete custom overlays only.
router.delete('/regions/:regionId', auth, requireAdmin, async (req, res) => {
  try {
    const regionId = String(req.params.regionId || '').toUpperCase().trim();
    const doc = await RegionOverlay.findOne({ regionId });
    if (!doc) {
      return res.status(404).json({ error: 'Region overlay not found', regionId });
    }
    if (!doc.isCustom) {
      return res.status(400).json({ error: 'Cannot delete a built-in region overlay', regionId });
    }
    await doc.deleteOne();
    res.json({ data: { regionId, deleted: true } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Countries ──────────────────────────────────────────────────────────────

// GET /api/region-admin/countries — list every CountryOverlay (requires login).
router.get('/countries', auth, async (req, res) => {
  try {
    const docs = await CountryOverlay.find().sort({ code: 1 }).lean();
    res.json({ data: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/region-admin/countries — create a CountryOverlay.
router.post('/countries', auth, requireAdmin, async (req, res) => {
  try {
    const code = String(req.body.code || '').toUpperCase().trim();
    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }
    const existing = await CountryOverlay.findOne({ code });
    if (existing) {
      return res.status(409).json({ error: 'Country overlay already exists', code });
    }
    const doc = await CountryOverlay.create({
      ...pickCountryFields(req.body),
      code,
      isCustom: !isBuiltinCountry(code),
      createdBy: req.user._id,
    });
    res.status(201).json({ data: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/region-admin/countries/:code — upsert/update overlay fields.
router.put('/countries/:code', auth, requireAdmin, async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().trim();
    const update = pickCountryFields(req.body);
    let doc = await CountryOverlay.findOne({ code });
    if (!doc) {
      doc = await CountryOverlay.create({
        ...update,
        code,
        isCustom: !isBuiltinCountry(code),
        createdBy: req.user._id,
      });
      return res.json({ data: doc });
    }
    Object.assign(doc, update);
    await doc.save();
    res.json({ data: doc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/region-admin/countries/:code — delete custom overlays only.
router.delete('/countries/:code', auth, requireAdmin, async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().trim();
    const doc = await CountryOverlay.findOne({ code });
    if (!doc) {
      return res.status(404).json({ error: 'Country overlay not found', code });
    }
    if (!doc.isCustom) {
      return res.status(400).json({ error: 'Cannot delete a built-in country overlay', code });
    }
    await doc.deleteOne();
    res.json({ data: { code, deleted: true } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
