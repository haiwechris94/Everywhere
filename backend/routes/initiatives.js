/**
 * Initiatives routes — the special projects "ESP300" and "YCS".
 *
 * These are distinct from the generic, user-managed Projects (routes/projects.js):
 * they have a fixed identity and a curated structure, and they track per-people
 * participation via the ProjectEngagement model.
 *
 * Mounted at /api/initiatives.
 *
 *  GET    /api/initiatives                         - list the initiatives (meta only)
 *  GET    /api/initiatives/membership?peopleId=    - { ESP300: bool, YCS: bool } for a people (fiche cases)
 *  GET    /api/initiatives/:key                    - initiative meta + curriculum + engaged peoples
 *  GET    /api/initiatives/:key/peoples/:peopleId  - one people's detail within the initiative
 *  POST   /api/initiatives/:key/peoples            - add/engage a people (supervisor/admin)
 *  PUT    /api/initiatives/:key/peoples/:peopleId  - update a people's engagement (supervisor/admin)
 *  DELETE /api/initiatives/:key/peoples/:peopleId  - remove a people's engagement (admin)
 */
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const ProjectEngagement = require('../models/ProjectEngagement');
const MasterPeople = require('../models/MasterPeople');
const { auth, optionalAuth } = require('../middleware/auth');
const { isAdmin, isSupervisorOrAdmin } = require('../middleware/roles');

// ── ESP300 curriculum (source: backend/data/ESP300 Kingdom Scripture Sets - V. 2.docx) ──
// 4 Scripture Sets. Each set lists its passages so the project page can render
// the full curriculum, and so per-people recording progress is meaningful.
const ESP300_SETS = [
  {
    setNumber: 1,
    title: 'Creation to Christ',
    subtitle: 'Helping People Discover God',
    note: 'Francophone West Africa (25 Scriptures). Other regions have slight variations; AWA is the most distinct.',
    passages: [
      'Genesis 1:1-25 — Discover our Creator',
      'Genesis 1:26-31 — The Image of God',
      'Genesis 2:7-17 — God Provides & Instructs',
      'Genesis 3:1-6 — Man Disobeys God',
      'Genesis 3:7-13 — Results of Disobedience',
      'Genesis 3:14-24 — Creation Cursed & Promise',
      'Genesis 6:5-17 — Compounded Consequences',
      'Genesis 11:1-9 — United in Rebellion',
      'Genesis 12:1-3 — God\u2019s Promised Restoration',
      'Genesis 22:1-19 — God Provides a Ram',
      'Exodus 12:1-28 — A Passover Lamb',
      'Isaiah 53 — Messiah will Suffer',
      'Luke 1:26-38, 2:1-20 — God\u2019s Promised Savior',
      'Matthew 3:13-17 — Jesus Baptized',
      'John 1:29-34 — The Lamb of God',
      'Matthew 4:1-11 — Jesus Tested',
      'Luke 5:17-26 — Forgiving & Healing',
      'Mark 4:35-41 — Power Over Nature',
      'Mark 5:1-20 — Power Over Demons',
      'John 11:1-44 — Power Over Death',
      'John 18:1-11 — Jesus Betrayed & Arrested',
      'Luke 23:32-56 — Crucified yet Forgiving',
      'Luke 24:1-35 — Jesus\u2019 Resurrection',
      'Matthew 11:28-30 — Come to Jesus',
      'John 3:1-7, 14-19 — Born Again',
    ],
  },
  {
    setNumber: 2,
    title: 'The Church',
    subtitle: 'Becoming a Community of Christ Followers',
    note: 'Used during a pilot in Benin (FWA).',
    passages: [
      'Luke 19:1-10 — Repenting & Believing',
      'Acts 1:4-5, 8; 2:1-17 — Holy Spirit Empowered',
      'Acts 2:14, 22-24, 36-41 — Baptizing Followers',
      'Acts 2:41-47 — Functions of Churches',
      'Acts 3:1-19 — Praying for Healing',
      'Acts 4:1-22 — Making Disciples',
      'Acts 4:23-31 — Spirit\u2019s Empowerment',
      'Acts 4:32-35 — Lifestyle of Generosity',
      'Acts 5:12, 17-35, 40-41 — Courage in Suffering',
      'Acts 6:1-7 — Developing Leaders',
      'Acts 6:8-15, 7:56-60 & 8:1-4 — Enduring',
      'Acts 8:26-39 — Baptizing New Followers',
      'Acts 9:1-22 — Sharing Good News',
      'Acts 9:32-42 — Praying for Oppressed',
      'Acts 11:19-26 — Studying God\u2019s Word',
      'Acts 11:25-30 — Mission of Generosity',
    ],
  },
  {
    setNumber: 3,
    title: 'Developing Leaders',
    subtitle: 'A Sample Set For Developing Leaders',
    note: 'South Asia intro: Ezekiel 34:11-24; 36:22-27 (Shepherding Introduction).',
    passages: [
      'Titus 1:1-4 — Promises of God',
      'Titus 1:5-9 — Qualifications of Elders',
      'Titus 1:10-16 — Behavior of the lost',
      'Titus 2:1-5 — Leading those older',
      'Titus 2:6-10 — Leading those younger',
      'Titus 2:11-14 — Grace & Renouncing',
      'Titus 2:15-3:2 — Vision Reminders',
      'Titus 3:3-8 — Grace motivates compassion',
      'Titus 3:9-11 — Handling distractions',
      'Titus 3:12-15 — Focused on Mission',
    ],
  },
  {
    setNumber: 4,
    title: 'Mission & Contextualization',
    subtitle: 'Various issues of Mission & Contextualization',
    note: 'This set has the most variety between regions based on local cross-cultural ministry issues. Grouped by theme.',
    groups: [
      {
        theme: 'Disciple Making Movement Training',
        passages: [
          'Luke 15:11-32 — God\u2019s loving heart',
          'John 6:43-45 — God draws, so ask him to',
          'Deuteronomy 6:4-9 — Show your Christian life',
          'Luke 10:1-12 — A Jesus strategy to reach the lost',
        ],
      },
      {
        theme: 'Commitment to Jesus',
        passages: [
          'Mark 12:28-31 — Love God and neighbor',
          'Luke 14:25-27, 33 — Die daily and follow Christ',
          'John 12:24-26 — Die to bear much fruit',
          'John 13:34-35 — Love as Christ loves us',
          'John 14:15-16 — Love and obey Jesus, receive the Holy Spirit',
          'John 15:7-8 — Remain in Christ to bear fruit',
          'John 20:28-29 — Trust Jesus as Lord and God',
          'Matthew 28:18-20 — Make disciples of all nations',
        ],
      },
      {
        theme: 'Marriage',
        passages: [
          'Genesis 24:1-29, 50-67 — In good times and bad: Isaac & Rebekah',
          'Ruth 2:1-23 — Love, honor and cherish: Ruth and Boaz',
          'Genesis 29:1-30 — \u2019Till death do us part: Jacob and Rachel',
          'John 13:1-17 — Serving one another: Who\u2019s job is foot washing?',
          'Genesis 2:4-25 — One-flesh friends: Adam and Eve',
          'Song of Songs 6:13-8:4 — Lovers: celebrate the difference',
        ],
      },
      {
        theme: 'Grief and loss',
        passages: [
          '2 Kings 4:8-37 — Denial: Elisha and a woman in denial',
          'Ruth 1:1-22 — Anger: Naomi empty and bitter',
          '2 Samuel 12:15-25 — Bargaining: David bargains with God',
          'Genesis 37:12-36 — Depression: Jacob mourns for Joseph',
          'Job 2:1-10 — Acceptance: Job suffers',
          'John 11:1-44 — Hope: Jesus raises Lazarus',
        ],
      },
      {
        theme: 'The Kingdom of God',
        passages: [
          'Genesis 3:14-24 — Promise of the Seed',
          '2 Samuel 7:4-5, 12-16 — Eternal Kingdom',
          'Isaiah 9:6-7 — Messiah born of a virgin',
          'Isaiah 40:3-5, 42:1-4 — New Kingdom',
          'Isaiah 53 — Messiah will Suffer',
          'Daniel 2:44, 7:14 — Eternal kingdom for all',
          'Matthew 6:25-33 — Kingdom Focus',
          'Matthew 24:3-14 — The Culmination',
          'Hebrews 10:12-14 — Kingdom Sacrifice',
          '1 Timothy 6:11-16 — King of Kings',
        ],
      },
    ],
  },
];

// Static identity/metadata for each initiative.
const INITIATIVES = {
  ESP300: {
    key: 'ESP300',
    name: 'ESP 300',
    fullName: 'Ending Scripture Poverty Initiative (ESP300)',
    kind: 'audio_scripture_translation',
    summary:
      'Audio translation of Bible stories into local languages. The vision is to record 4 Scripture Sets (series); these foundation Scriptures are adjusted to each context, after which trained indigenous specialists add further sets.',
    sets: ESP300_SETS,
  },
  YCS: {
    key: 'YCS',
    name: 'YCS',
    fullName: 'YCS',
    kind: 'initiative',
    summary:
      'YCS initiative. The detailed curriculum will be enriched later; this page already tracks the peoples engaged and their per-people progress.',
    sets: [],
  },
};

// Resolve + validate the :key route param.
function resolveKey(req, res, next) {
  const key = String(req.params.key || '').toUpperCase();
  if (!INITIATIVES[key]) {
    return res.status(404).json({ success: false, message: `Unknown initiative: ${req.params.key}` });
  }
  req.initiativeKey = key;
  next();
}

// Build the default ESP300 set-progress array (all not started).
function defaultEsp300Sets() {
  return ESP300_SETS.map((s) => ({ setNumber: s.setNumber, status: 'not_started', passagesRecorded: 0, notes: '' }));
}

// ── GET /api/initiatives ──────────────────────────────────────────────────────
// Each initiative is returned with the number of DISTINCT countries and DISTINCT
// people groups engaged, derived from the ProjectEngagement records. These feed
// the Initiatives list table (Countries / People groups columns).
router.get('/', optionalAuth, async (req, res) => {
  try {
    // Aggregate per-initiative distinct counts in one pass. countryCode may be
    // alpha-2 or alpha-3 depending on when the engagement was created; we just
    // dedupe whatever (non-empty) code is stored. People groups are deduped by
    // masterPeopleId when present, otherwise by the engagement id.
    let countsByKey = {};
    try {
      const rows = await ProjectEngagement.aggregate([
        {
          $group: {
            _id: '$projectKey',
            countries: {
              $addToSet: {
                $toUpper: { $ifNull: ['$countryCode', ''] },
              },
            },
            peoples: {
              $addToSet: { $ifNull: ['$masterPeopleId', '$_id'] },
            },
          },
        },
      ]);
      countsByKey = rows.reduce((acc, r) => {
        const countries = (r.countries || []).filter((c) => c && c !== '');
        acc[r._id] = {
          countryCount: countries.length,
          peopleCount: (r.peoples || []).length,
        };
        return acc;
      }, {});
    } catch (aggErr) {
      // If the aggregation fails for any reason, fall back to zero counts so the
      // list still renders instead of 500-ing.
      console.error('[initiatives] counts aggregation error:', aggErr);
      countsByKey = {};
    }

    const data = Object.values(INITIATIVES).map((i) => ({
      key: i.key,
      name: i.name,
      fullName: i.fullName,
      kind: i.kind,
      summary: i.summary,
      setCount: (i.sets || []).length,
      countryCount: countsByKey[i.key]?.countryCount || 0,
      peopleCount: countsByKey[i.key]?.peopleCount || 0,
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[initiatives] list error:', err);
    res.status(500).json({ success: false, message: 'Error loading initiatives' });
  }
});

// ── GET /api/initiatives/membership?peopleId= ────────────────────────────────
// Fast lookup used by the people fiche to decide OUI/NON for each initiative.
router.get('/membership', optionalAuth, async (req, res) => {
  try {
    const { peopleId } = req.query;
    const result = { ESP300: false, YCS: false };
    if (peopleId && mongoose.Types.ObjectId.isValid(peopleId)) {
      const rows = await ProjectEngagement.find(
        { masterPeopleId: peopleId },
        { projectKey: 1 }
      ).lean();
      rows.forEach((r) => {
        if (r.projectKey in result) result[r.projectKey] = true;
      });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[initiatives] membership error:', err);
    res.status(500).json({ success: false, message: 'Error loading membership' });
  }
});

// ── GET /api/initiatives/:key ─────────────────────────────────────────────────
router.get('/:key', resolveKey, optionalAuth, async (req, res) => {
  try {
    const meta = INITIATIVES[req.initiativeKey];
    const engagements = await ProjectEngagement.find({ projectKey: req.initiativeKey })
      .sort({ peopleName: 1, createdAt: -1 })
      .lean();

    const peoples = engagements.map((e) => ({
      id: e._id,
      masterPeopleId: e.masterPeopleId,
      peopleName: e.peopleName,
      countryCode: e.countryCode,
      regionId: e.regionId,
      status: e.status,
      language: e.language,
      // Progress summary for ESP300 (recorded sets out of 4).
      setsRecorded:
        req.initiativeKey === 'ESP300'
          ? (e.esp300Sets || []).filter((s) => ['recorded', 'published'].includes(s.status)).length
          : undefined,
    }));

    res.json({
      success: true,
      data: {
        ...meta,
        peopleCount: peoples.length,
        peoples,
      },
    });
  } catch (err) {
    console.error('[initiatives] get error:', err);
    res.status(500).json({ success: false, message: 'Error loading initiative' });
  }
});

// ── GET /api/initiatives/:key/peoples/:peopleId ──────────────────────────────
router.get('/:key/peoples/:peopleId', resolveKey, optionalAuth, async (req, res) => {
  try {
    const { peopleId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(peopleId)) {
      return res.status(400).json({ success: false, message: 'Invalid people id' });
    }
    const engagement = await ProjectEngagement.findOne({
      projectKey: req.initiativeKey,
      masterPeopleId: peopleId,
    }).lean();

    if (!engagement) {
      return res.status(404).json({ success: false, message: 'This people is not engaged in this initiative' });
    }

    res.json({
      success: true,
      data: {
        initiative: INITIATIVES[req.initiativeKey],
        engagement,
      },
    });
  } catch (err) {
    console.error('[initiatives] people detail error:', err);
    res.status(500).json({ success: false, message: 'Error loading people detail' });
  }
});

// ── POST /api/initiatives/:key/peoples ───────────────────────────────────────
router.post('/:key/peoples', auth, isSupervisorOrAdmin, resolveKey, async (req, res) => {
  try {
    const { masterPeopleId, language, status, notes } = req.body;
    if (!masterPeopleId || !mongoose.Types.ObjectId.isValid(masterPeopleId)) {
      return res.status(400).json({ success: false, message: 'A valid masterPeopleId is required' });
    }

    const master = await MasterPeople.findById(masterPeopleId)
      .select('canonicalName primaryCountryCode')
      .lean();
    if (!master) {
      return res.status(404).json({ success: false, message: 'People group not found' });
    }

    const doc = {
      projectKey: req.initiativeKey,
      masterPeopleId,
      peopleName: master.canonicalName || '',
      countryCode: master.primaryCountryCode || '',
      regionId: req.body.regionId || '',
      language: language || '',
      status: status || 'active',
      notes: notes || '',
      createdBy: req.user?._id,
    };
    if (req.initiativeKey === 'ESP300') {
      doc.esp300Sets = defaultEsp300Sets();
    }

    // Upsert so re-adding an existing people is idempotent.
    const engagement = await ProjectEngagement.findOneAndUpdate(
      { projectKey: req.initiativeKey, masterPeopleId },
      { $setOnInsert: doc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, data: engagement });
  } catch (err) {
    console.error('[initiatives] add people error:', err);
    res.status(500).json({ success: false, message: 'Error adding people to initiative' });
  }
});

// ── PUT /api/initiatives/:key/peoples/:peopleId ──────────────────────────────
router.put('/:key/peoples/:peopleId', auth, isSupervisorOrAdmin, resolveKey, async (req, res) => {
  try {
    const { peopleId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(peopleId)) {
      return res.status(400).json({ success: false, message: 'Invalid people id' });
    }
    const update = {};
    ['language', 'status', 'notes', 'regionId'].forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (req.body.startDate !== undefined) update.startDate = req.body.startDate;
    if (req.body.endDate !== undefined) update.endDate = req.body.endDate;
    // ESP300 per-set progress (array of { setNumber, status, passagesRecorded, notes }).
    if (req.initiativeKey === 'ESP300' && Array.isArray(req.body.esp300Sets)) {
      update.esp300Sets = req.body.esp300Sets;
    }

    const engagement = await ProjectEngagement.findOneAndUpdate(
      { projectKey: req.initiativeKey, masterPeopleId: peopleId },
      { $set: update },
      { new: true }
    );
    if (!engagement) {
      return res.status(404).json({ success: false, message: 'Engagement not found' });
    }
    res.json({ success: true, data: engagement });
  } catch (err) {
    console.error('[initiatives] update people error:', err);
    res.status(500).json({ success: false, message: 'Error updating engagement' });
  }
});

// ── DELETE /api/initiatives/:key/peoples/:peopleId ───────────────────────────
router.delete('/:key/peoples/:peopleId', auth, isAdmin, resolveKey, async (req, res) => {
  try {
    const { peopleId } = req.params;
    const result = await ProjectEngagement.findOneAndDelete({
      projectKey: req.initiativeKey,
      masterPeopleId: peopleId,
    });
    if (!result) {
      return res.status(404).json({ success: false, message: 'Engagement not found' });
    }
    res.json({ success: true, message: 'Engagement removed' });
  } catch (err) {
    console.error('[initiatives] delete people error:', err);
    res.status(500).json({ success: false, message: 'Error removing engagement' });
  }
});

module.exports = router;
