/**
 * PeopleMatch Model — audit trail of every match/merge decision.
 * Collection: people_matches. Records the 5-tier algorithm and 0–100 confidence
 * scoring: why two source records were (or were not) merged, who decided, and with
 * what confidence. See docs/architecture/04-mongodb-schemas.md §3.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const peopleMatchesSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    masterPeopleId: { type: Schema.Types.ObjectId, ref: 'MasterPeople', required: true },

    fromSourceId: { type: Schema.Types.ObjectId, ref: 'PeopleSource', default: null }, // nullable
    toSourceId: { type: Schema.Types.ObjectId, ref: 'PeopleSource', required: true },

    matchType: {
      type: String,
      enum: ['CROSS_REFERENCE', 'EXACT_ID', 'COUNTRY', 'NAME_SIMILARITY', 'GEO_PROXIMITY', 'MANUAL'],
      required: true,
    },
    matchTier: { type: Number, min: 1, max: 5, required: true }, // 1 = strongest
    confidence: { type: Number, min: 0, max: 100, required: true },
    confidenceBand: {
      type: String,
      enum: ['AUTO_MERGE', 'MANUAL_REVIEW', 'KEEP_SEPARATE'],
      required: true,
    },

    crossReferenceType: { type: String, default: null }, // e.g. 'PEID<->PeopleID3'
    decidedBy: { type: String, default: 'system' },       // 'system' or a user id
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes
peopleMatchesSchema.index({ masterPeopleId: 1 });   // all decisions for a group
peopleMatchesSchema.index({ confidenceBand: 1 });   // review queue (MANUAL_REVIEW)
peopleMatchesSchema.index({ matchTier: 1 });         // tier analytics

module.exports = mongoose.model('PeopleMatch', peopleMatchesSchema, 'people_matches');
