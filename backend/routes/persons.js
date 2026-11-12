/**
 * Persons Routes - CRUD for the people registry.
 * A "Person" is a real individual involved in church planting:
 * director (directeur), church_planter (implanteur), coordinator (coordinateur).
 *
 * Mounted at /api/persons (see server.js). Reads require auth; writes require
 * supervisor/admin; delete requires admin. Archiving is reversible (soft).
 */
const express = require('express');
const router = express.Router();
const Person = require('../models/Person');
const PeopleGroup = require('../models/PeopleGroup');
const RegionOverlay = require('../models/RegionOverlay');
const CountryOverlay = require('../models/CountryOverlay');
const { auth } = require('../middleware/auth');
const { isAdmin, isSupervisorOrAdmin } = require('../middleware/roles');

/**
 * Map a free-text leader role label (FR/EN) onto the Person role enum.
 * Returns one of: director, national_coordinator, coordinator, church_planter,
 * sic, sst, other.
 */
const mapRole = (raw) => {
  const t = String(raw || '').toLowerCase();
  if (t.includes('directeur') || t.includes('director')) return 'director';
  if (t.includes('coordinateur national') || t.includes('national coordinator')) return 'national_coordinator';
  if (t.includes('coordinateur') || t.includes('coordinator')) return 'coordinator';
  if (t.includes('implanteur') || t.includes('planter')) return 'church_planter';
  if (t.includes('sic')) return 'sic';
  if (t.includes('sst')) return 'sst';
  return 'other';
};

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Build the list of VIRTUAL persons derived from PeopleGroup role fields.
 * One virtual person per non-empty role string on each (non-archived) group.
 */
async function derivePeopleGroupPersons() {
  const pgs = await PeopleGroup.find({
    isArchived: { $ne: true },
    $or: [
      { nationalCoordinator: { $type: 'string', $ne: '' } },
      { churchPlanter: { $type: 'string', $ne: '' } },
      { donor: { $type: 'string', $ne: '' } },
    ],
  })
    .select('nationalCoordinator churchPlanter donor country countryCode region admin2 admin3')
    .lean();

  const out = [];
  const fieldMap = [
    ['nationalCoordinator', 'national_coordinator'],
    ['churchPlanter', 'church_planter'],
    ['donor', 'other'],
  ];
  for (const pg of pgs) {
    for (const [field, role] of fieldMap) {
      if (!nonEmpty(pg[field])) continue;
      out.push({
        id: `eng:${pg._id}:${field}`,
        name: pg[field].trim(),
        role,
        email: '',
        phone: '',
        organization: '',
        country: pg.country || '',
        countryCode: pg.countryCode || '',
        region: pg.region || '',
        admin2: pg.admin2 || '',
        admin3: pg.admin3 || '',
        origin: 'engagement',
        editable: false,
      });
    }
  }
  return out;
}

/**
 * Build the list of VIRTUAL persons derived from RegionOverlay + CountryOverlay
 * leaders[] (and the single responsibleName convenience field).
 */
async function deriveOverlayPersons() {
  const [regionDocs, countryDocs] = await Promise.all([
    RegionOverlay.find().lean().catch(() => []),
    CountryOverlay.find().lean().catch(() => []),
  ]);

  const out = [];

  const pushLeader = ({ keyBase, idx, leader, country, countryCode, region }) => {
    if (!nonEmpty(leader && leader.name)) return;
    out.push({
      id: `ovl:${keyBase}:${idx}`,
      name: leader.name.trim(),
      role: mapRole(leader.role),
      email: (leader.email || '').trim(),
      phone: (leader.phone || '').trim(),
      organization: '',
      country: country || '',
      countryCode: countryCode || '',
      region: region || '',
      admin2: '',
      admin3: '',
      origin: 'overlay',
      editable: false,
    });
  };

  (regionDocs || []).forEach((ov) => {
    const keyBase = ov.regionId || String(ov._id);
    const region = ov.name || ov.regionId || '';
    const leaders = Array.isArray(ov.leaders) ? ov.leaders : [];
    leaders.forEach((leader, idx) =>
      pushLeader({ keyBase, idx, leader, country: '', countryCode: '', region })
    );
    if (nonEmpty(ov.responsibleName)) {
      pushLeader({
        keyBase,
        idx: `resp`,
        leader: { name: ov.responsibleName, role: 'other' },
        country: '',
        countryCode: '',
        region,
      });
    }
  });

  (countryDocs || []).forEach((ov) => {
    const keyBase = ov.code || String(ov._id);
    const country = ov.nameFr || ov.nameEn || ov.name || '';
    const countryCode = ov.code || '';
    const region = ov.regionId || '';
    const leaders = Array.isArray(ov.leaders) ? ov.leaders : [];
    leaders.forEach((leader, idx) =>
      pushLeader({ keyBase, idx, leader, country, countryCode, region })
    );
    if (nonEmpty(ov.responsibleName)) {
      pushLeader({
        keyBase,
        idx: `resp`,
        leader: { name: ov.responsibleName, role: 'other' },
        country,
        countryCode,
        region,
      });
    }
  });

  return out;
}

/**
 * Dedupe key: lowercase(trim(name)) | role | (countryCode || region || '').
 */
const dedupeKey = (p) =>
  `${String(p.name || '').trim().toLowerCase()}|${p.role || ''}|${(p.countryCode || p.region || '').toLowerCase()}`;

/**
 * GET /api/persons
 * List persons with filtering + pagination.
 * Query: role, country, countryCode, region, admin2, admin3, search, page, limit,
 *        includeArchived, onlyArchived.
 * Archived are excluded by default.
 */
router.get('/', auth, async (req, res) => {
  try {
    const {
      role,
      country,
      countryCode,
      region,
      admin2,
      admin3,
      search,
      page = 1,
      limit = 500,
      includeArchived,
      onlyArchived,
    } = req.query;

    const query = {};

    if (role && typeof role === 'string' && role.trim()) query.role = role.trim();
    if (country && typeof country === 'string' && country.trim()) query.country = country.trim();
    if (countryCode && typeof countryCode === 'string' && countryCode.trim()) {
      query.countryCode = countryCode.trim().toUpperCase();
    }
    if (region && typeof region === 'string' && region.trim()) query.region = region.trim();
    if (admin2 && typeof admin2 === 'string' && admin2.trim()) query.admin2 = admin2.trim();
    if (admin3 && typeof admin3 === 'string' && admin3.trim()) query.admin3 = admin3.trim();

    if (search && typeof search === 'string' && search.trim()) {
      const esc = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: esc, $options: 'i' } },
        { email: { $regex: esc, $options: 'i' } },
        { organization: { $regex: esc, $options: 'i' } },
      ];
    }

    // Reversible archive filter for the registry (Person) query.
    // onlyArchived => only archived registry persons (and NO virtual persons).
    if (onlyArchived === 'true') {
      query.isArchived = true;
    } else if (includeArchived !== 'true') {
      query.isArchived = { $ne: true };
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 1000);
    const skip = (pageNum - 1) * limitNum;

    // (A) Real registry persons (respecting archive rules above).
    const registryDocs = await Person.find(query).lean();
    const registryPersons = registryDocs.map((p) => ({ ...p, origin: 'registry', editable: true }));

    // Virtual persons are included only when NOT viewing archived-only.
    let virtualPersons = [];
    if (onlyArchived !== 'true') {
      const [pgPersons, overlayPersons] = await Promise.all([
        derivePeopleGroupPersons(),
        deriveOverlayPersons(),
      ]);
      virtualPersons = [...pgPersons, ...overlayPersons];
    }

    // (4) Merge + dedupe. On collision prefer origin 'registry' (keeps its _id).
    const merged = [];
    const byKey = new Map();
    for (const p of [...registryPersons, ...virtualPersons]) {
      const key = dedupeKey(p);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, p);
        merged.push(p);
      } else if (existing.origin !== 'registry' && p.origin === 'registry') {
        // Replace the previously-kept virtual entry with the registry record.
        const idx = merged.indexOf(existing);
        if (idx !== -1) merged[idx] = p;
        byKey.set(key, p);
      }
      // else: keep the existing (registry wins, or first-seen virtual wins).
    }

    // (5) Apply request filters to the whole merged list (case-insensitive).
    const ci = (v) => String(v || '').trim().toLowerCase();
    const roleF = ci(role);
    const countryF = ci(country);
    const countryCodeF = ci(countryCode);
    const regionF = ci(region);
    const admin2F = ci(admin2);
    const admin3F = ci(admin3);
    const searchF = ci(search);

    const filtered = merged.filter((p) => {
      if (roleF && ci(p.role) !== roleF) return false;
      if (countryF && ci(p.country) !== countryF && ci(p.countryCode) !== countryF) return false;
      if (countryCodeF && ci(p.countryCode) !== countryCodeF) return false;
      if (regionF && ci(p.region) !== regionF) return false;
      if (admin2F && ci(p.admin2) !== admin2F) return false;
      if (admin3F && ci(p.admin3) !== admin3F) return false;
      if (searchF) {
        const hay = `${ci(p.name)} ${ci(p.email)} ${ci(p.organization)}`;
        if (!hay.includes(searchF)) return false;
      }
      return true;
    });

    // Sort by name asc.
    filtered.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' })
    );

    // Paginate over the filtered merged list.
    const totalCount = filtered.length;
    const data = filtered.slice(skip, skip + limitNum);

    res.json({
      success: true,
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error', message: error.message });
  }
});

/**
 * GET /api/persons/:id
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const person = await Person.findById(req.params.id).lean();
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
    res.json({ success: true, data: person });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/persons
 */
router.post('/', auth, isSupervisorOrAdmin, async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.isArchived;
    delete body.archivedAt;
    delete body.archivedBy;
    body.createdBy = req.user ? req.user._id : null;

    const person = await Person.create(body);
    res.status(201).json({ success: true, data: person, message: 'Person created' });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/persons/:id
 */
router.put('/:id', auth, isSupervisorOrAdmin, async (req, res) => {
  try {
    const body = { ...req.body };
    delete body.isArchived;
    delete body.archivedAt;
    delete body.archivedBy;
    delete body.createdBy;

    const person = await Person.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
    res.json({ success: true, data: person, message: 'Person updated' });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/persons/:id/archive - reversible archive
 */
router.patch('/:id/archive', auth, isSupervisorOrAdmin, async (req, res) => {
  try {
    const person = await Person.findByIdAndUpdate(
      req.params.id,
      { isArchived: true, archivedAt: new Date(), archivedBy: req.user ? req.user._id : null },
      { new: true }
    );
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
    res.json({ success: true, data: person, message: 'Person archived' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PATCH /api/persons/:id/unarchive
 */
router.patch('/:id/unarchive', auth, isSupervisorOrAdmin, async (req, res) => {
  try {
    const person = await Person.findByIdAndUpdate(
      req.params.id,
      { isArchived: false, archivedAt: null, archivedBy: null },
      { new: true }
    );
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
    res.json({ success: true, data: person, message: 'Person unarchived' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/persons/:id - admin only
 */
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const person = await Person.findByIdAndDelete(req.params.id);
    if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
    res.json({ success: true, message: 'Person deleted', id: req.params.id });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ID' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
