/**
 * PeopleAlias Model — alternate/alternate-spelling names for a master people.
 * Collection: people_aliases. Drawn from across and within sources; used for search
 * and disambiguation only — name is never the primary matching key.
 * See docs/architecture/04-mongodb-schemas.md §4.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const peopleAliasesSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    masterPeopleId: { type: Schema.Types.ObjectId, ref: 'MasterPeople', required: true },
    sourceId: { type: Schema.Types.ObjectId, ref: 'PeopleSource', default: null }, // nullable

    alias: { type: String, required: true, trim: true },
    aliasType: {
      type: String,
      enum: ['NAME_ACROSS', 'NAME_IN_COUNTRY', 'DISPLAY', 'ALTERNATE', 'ROP3', 'PGID', 'PEID'],
      required: true,
    },
    sourceType: { type: String, default: null },   // which source contributed this alias
    languageCode: { type: String, default: null }, // ISO 639-3 if known
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes
peopleAliasesSchema.index({ masterPeopleId: 1 }); // all aliases for a group
peopleAliasesSchema.index({ alias: 'text' });      // free-text alias search

module.exports = mongoose.model('PeopleAlias', peopleAliasesSchema, 'people_aliases');
