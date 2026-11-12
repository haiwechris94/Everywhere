/**
 * Person Model - Registry of people involved in church planting
 * Roles: director (directeur), church_planter (implanteur),
 *        coordinator (coordinateur), other
 */
const mongoose = require('mongoose');

const personSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  // director=directeur, church_planter=implanteur, coordinator=coordinateur
  role: {
    type: String,
    enum: {
      values: ['director', 'national_coordinator', 'church_planter', 'coordinator', 'sic', 'sst', 'other'],
      message: 'Role must be director, national_coordinator, church_planter, coordinator, sic, sst, or other',
    },
    required: [true, 'Role is required'],
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
  },
  phone: {
    type: String,
    trim: true,
  },
  country: {
    type: String,
    trim: true,
  },
  // ISO 3166-1 alpha-2 country code (e.g., 'CM' for Cameroon)
  countryCode: {
    type: String,
    trim: true,
    uppercase: true,
  },
  // Administrative level 1
  region: {
    type: String,
    trim: true,
  },
  // Administrative level 2 (department/province)
  admin2: {
    type: String,
    trim: true,
  },
  // Administrative level 3 (arrondissement/district)
  admin3: {
    type: String,
    trim: true,
  },
  organization: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Notes cannot exceed 2000 characters'],
  },
  // Optional link to an app account
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // Reversible archive flags
  isArchived: {
    type: Boolean,
    default: false,
    index: true,
  },
  archivedAt: {
    type: Date,
    default: null,
  },
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

// ============================================
// INDEXES
// ============================================
personSchema.index({ role: 1 });
personSchema.index({ countryCode: 1 });
personSchema.index({ isArchived: 1 });

module.exports = mongoose.model('Person', personSchema);
