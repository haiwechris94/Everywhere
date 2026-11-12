/**
 * RegionOverlay Model
 * ---------------------------------------------------------------------------
 * Editable, admin-managed overlay that AUGMENTS / OVERRIDES the hardcoded NG
 * regions defined in routes/reporting.js (NG_AREAS = { FCA, AWA, FWA }).
 *
 * This model NEVER replaces the built-in config. The read endpoints merge an
 * overlay (when one exists) on top of the built-in region, and append overlays
 * flagged isCustom===true as brand-new regions. When this collection is empty
 * the existing behaviour is completely unchanged.
 *
 * Collection: regionoverlays
 */
const mongoose = require('mongoose');

// Sub-document for a responsible person / leader ("noms des responsables").
const leaderSchema = new mongoose.Schema(
  {
    role: { type: String, trim: true }, // e.g. "Coordinateur régional"
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
  },
  { _id: false }
);

const regionOverlaySchema = new mongoose.Schema(
  {
    // Region identifier. Either overrides a built-in NG_AREAS key (e.g. "FCA")
    // or introduces a brand-new region code (e.g. "SADC").
    regionId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    // Short sigle / label (e.g. "FCA").
    name: { type: String, trim: true },
    // Human-readable full label (e.g. "Francophone Central Africa").
    fullName: { type: String, trim: true },
    description: { type: String, trim: true },
    // true when this region does NOT exist in NG_AREAS (admin-created region).
    isCustom: { type: Boolean, default: false },
    // Extra countries attached to a CUSTOM region (uppercase alpha-2). For
    // built-in regions this only ADDS to the NG_AREAS list, never replaces it.
    countryCodes: [{ type: String, uppercase: true, trim: true }],
    // Responsible people / leaders ("noms des responsables").
    leaders: { type: [leaderSchema], default: [] },
    // Convenience single responsible field (back-compat / quick display).
    responsibleName: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.RegionOverlay ||
  mongoose.model('RegionOverlay', regionOverlaySchema);
