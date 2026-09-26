/**
 * PeopleStatus Model — reached/engagement status for a master people.
 * Collection: people_statuses. Exactly one document per group (masterPeopleId unique).
 * Its summary fields (status, jpScale, leastReached) are denormalized onto
 * master_people.status. See docs/architecture/04-mongodb-schemas.md §6.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const peopleStatusesSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    masterPeopleId: { type: Schema.Types.ObjectId, ref: 'MasterPeople', required: true }, // unique

    status: {
      type: String,
      enum: ['UNREACHED', 'FRONTIER', 'MINIMALLY_REACHED', 'REACHED', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    jpScale: { type: Number, default: null },          // 1–5
    leastReached: { type: Boolean, default: null },
    frontier: { type: Boolean, default: null },
    percentEvangelical: { type: Number, default: null },
    percentChristian: { type: Number, default: null },
    engagementStatus: { type: String, default: null },
    bibleStatus: { type: String, default: null },
    derivedFromSource: { type: String, default: null }, // which source set this status
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

// Indexes
peopleStatusesSchema.index({ masterPeopleId: 1 }, { unique: true }); // one status per group

module.exports = mongoose.model('PeopleStatus', peopleStatusesSchema, 'people_statuses');
