/**
 * CountryOverlay Model
 * ---------------------------------------------------------------------------
 * Editable, admin-managed overlay that AUGMENTS / OVERRIDES the hardcoded
 * COUNTRY_CONFIG (routes/countries.js) and ISO country data. Does NOT touch
 * the existing Mongoose Country model (models/Country.js).
 *
 * The read endpoints merge an overlay (when one exists) on top of the built-in
 * country descriptor, and surface overlays flagged isCustom===true as brand-new
 * countries. When this collection is empty, existing behaviour is unchanged.
 *
 * Collection: countryoverlays
 */
const mongoose = require('mongoose');

// Sub-document for a responsible person / leader ("noms des responsables").
const leaderSchema = new mongoose.Schema(
  {
    role: { type: String, trim: true },
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
  },
  { _id: false }
);

const countryOverlaySchema = new mongoose.Schema(
  {
    // ISO 3166-1 alpha-2 code (e.g. "CM").
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    code3: { type: String, uppercase: true, trim: true },
    name: { type: String, trim: true },
    nameFr: { type: String, trim: true },
    nameEn: { type: String, trim: true },
    capital: { type: String, trim: true },
    // Which region this country belongs to (e.g. "FCA").
    regionId: { type: String, uppercase: true, trim: true },
    // true when created by admin / not present in COUNTRY_CONFIG.
    isCustom: { type: Boolean, default: false },
    // Responsible people / leaders ("noms des responsables").
    leaders: { type: [leaderSchema], default: [] },
    responsibleName: { type: String, trim: true },
    defaultCenter: {
      lat: { type: Number },
      lng: { type: Number },
    },
    description: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.CountryOverlay ||
  mongoose.model('CountryOverlay', countryOverlaySchema);
