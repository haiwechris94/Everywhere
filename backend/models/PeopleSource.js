/**
 * PeopleSource Model — lossless, write-heavy source record store.
 * Collection: people_sources. One document per original source record (JP, CPPI, …)
 * contributing to a master people. Every raw column is preserved in rawAttributes
 * (Mixed), mirroring PeopleGroup.sourceData. See docs/architecture/04-mongodb-schemas.md §2.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const peopleSourcesSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    masterPeopleId: { type: Schema.Types.ObjectId, ref: 'MasterPeople', required: true },

    sourceType: {
      type: String,
      enum: ['JP', 'CPPI', 'DMM', 'FTT', 'SURVEY', 'MANUAL'],
      required: true,
    },
    sourceRecordId: { type: String, required: true }, // natural key within the source

    // Source identifiers (sparse — not every source provides every field)
    peopleId3: { type: String, default: null }, // JP PeopleID3
    peopleId2: { type: String, default: null }, // JP PeopleID2
    peopleId1: { type: String, default: null }, // JP PeopleID1
    peid: { type: String, default: null },       // CPPI PEID
    pgid: { type: String, default: null },       // CPPI PGID
    rop3: { type: String, default: null },
    rop2: { type: String, default: null },
    rop1: { type: String, default: null },

    countryCode: { type: String, default: null }, // ISO3
    countryName: { type: String, default: null },
    sourceName: { type: String, default: null },  // the group's name as given by this source
    population: { type: Number, default: null },

    // Full original row — mirrors PeopleGroup.sourceData (Mixed)
    rawAttributes: { type: Schema.Types.Mixed, default: {} },

    importedAt: { type: Date, default: Date.now },
    sourceUpdatedAt: { type: Date, default: null }, // last-updated timestamp from the source, if any
  },
  { timestamps: true }
);

// Indexes
peopleSourcesSchema.index({ masterPeopleId: 1 });                          // fetch all sources for a group
peopleSourcesSchema.index({ sourceType: 1, sourceRecordId: 1 }, { unique: true }); // idempotent imports
peopleSourcesSchema.index({ rop3: 1 });                                    // cross-reference by ROP3
peopleSourcesSchema.index({ peopleId3: 1 });                               // JP lookups
peopleSourcesSchema.index({ peid: 1 });                                    // CPPI lookups
peopleSourcesSchema.index({ countryCode: 1 });                             // country filtering

module.exports = mongoose.model('PeopleSource', peopleSourcesSchema, 'people_sources');
