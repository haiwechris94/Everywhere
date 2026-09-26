/**
 * PeopleLocation Model — all known coordinates for a master people.
 * Collection: people_locations. One document per point, stored as GeoJSON Point with
 * a 2dsphere index (coordinates [lng, lat]), mirroring PeopleGroup.location. Exactly
 * one location per group is flagged isPrimary and copied into master_people.primaryLocation.
 * See docs/architecture/04-mongodb-schemas.md §5.
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const PointSubSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false }
);

const peopleLocationsSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    masterPeopleId: { type: Schema.Types.ObjectId, ref: 'MasterPeople', required: true },
    sourceId: { type: Schema.Types.ObjectId, ref: 'PeopleSource', default: null }, // nullable

    geom: { type: PointSubSchema, required: true }, // 2dsphere indexed; coordinates [lng, lat]

    // Convenience scalars (denormalized from geom for simple reads/exports)
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },

    countryCode: { type: String, default: null }, // ISO3
    isPrimary: { type: Boolean, default: false },
    sourceType: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes
peopleLocationsSchema.index({ masterPeopleId: 1 }); // all points for a group
peopleLocationsSchema.index({ geom: '2dsphere' });   // $near / $geoWithin (replaces PostGIS ST_DWithin)

module.exports = mongoose.model('PeopleLocation', peopleLocationsSchema, 'people_locations');
