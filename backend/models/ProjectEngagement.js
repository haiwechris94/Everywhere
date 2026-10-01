/**
 * ProjectEngagement — links a people group (MasterPeople) to a special
 * initiative ("ESP300" or "YCS") and stores the per-people progress for that
 * initiative.
 *
 * Why a single generic collection (rather than one per project):
 *  - The people fiche only needs a fast "is this people engaged in X?" lookup,
 *    which is a single indexed query here.
 *  - New initiatives can be added later by introducing a new `projectKey`
 *    without a schema/collection change.
 *
 * ESP300 (Ending Scripture Poverty Initiative) is an audio Bible-story
 * translation project built around 4 Scripture Sets (series). We therefore
 * track a per-set recording status + the local language being recorded.
 *
 * YCS is a separate initiative whose detailed structure will be enriched
 * later; for now we keep a generic status + free-form fields so the page is
 * useful immediately and extensible without a migration.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Supported initiative keys. Keep in sync with routes/initiatives.js INITIATIVES.
const PROJECT_KEYS = ['ESP300', 'YCS'];

// Recording lifecycle for an ESP300 Scripture Set, in order of progression.
const SET_STATUSES = ['not_started', 'in_progress', 'recorded', 'published'];

// Per-Scripture-Set progress for ESP300. `setNumber` is 1..4 and maps to the
// 4 sets defined in routes/initiatives.js (ESP300_SETS).
const Esp300SetProgressSchema = new Schema(
  {
    setNumber: { type: Number, min: 1, max: 4, required: true },
    status: { type: String, enum: SET_STATUSES, default: 'not_started' },
    // How many of the set's passages have been recorded so far (optional).
    passagesRecorded: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const projectEngagementSchema = new Schema(
  {
    projectKey: {
      type: String,
      enum: PROJECT_KEYS,
      required: true,
      index: true,
    },

    // The canonical people group this engagement belongs to.
    masterPeopleId: {
      type: Schema.Types.ObjectId,
      ref: 'MasterPeople',
      required: true,
      index: true,
    },

    // Denormalized people descriptors so project pages can render a people row
    // without a join (kept in sync on write).
    peopleName: { type: String, trim: true, default: '' },
    countryCode: { type: String, trim: true, default: '' }, // alpha-2 or alpha-3 as available
    regionId: { type: String, trim: true, default: '' },    // NG region id (FCA/AWA/FWA) when known

    // Overall participation status for the initiative.
    status: {
      type: String,
      enum: ['planned', 'active', 'completed', 'on_hold'],
      default: 'active',
    },

    // The local language this people's recordings target (audio translation).
    language: { type: String, trim: true, default: '' },

    // ── ESP300-specific ───────────────────────────────────────────────────────
    esp300Sets: { type: [Esp300SetProgressSchema], default: undefined },

    // ── Generic / YCS ──────────────────────────────────────────────────────────
    // Free-form progress notes; YCS structure will be enriched later.
    notes: { type: String, trim: true, default: '' },

    startDate: { type: Date },
    endDate: { type: Date },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One engagement per (project, people).
projectEngagementSchema.index({ projectKey: 1, masterPeopleId: 1 }, { unique: true });

projectEngagementSchema.statics.PROJECT_KEYS = PROJECT_KEYS;
projectEngagementSchema.statics.SET_STATUSES = SET_STATUSES;

module.exports = mongoose.model('ProjectEngagement', projectEngagementSchema);
