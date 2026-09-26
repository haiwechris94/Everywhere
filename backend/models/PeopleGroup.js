/**
 * PeopleGroup Model - Enhanced with status colors, approval workflow, photos, and organization tags
 * Status colors: pioneer (blue), mid-journey (orange), tipping-point (green), movement (red)
 */
const mongoose = require('mongoose');

// Progress history entry schema
const progressHistorySchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  percentage: {
    type: Number,
    min: 0,
    max: 100,
  },
  status: String,
  notes: String,
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { _id: false });

// Photo schema
const photoSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  filename: String,
  caption: String,
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: true });

const peopleGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'People group name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [200, 'Name cannot exceed 200 characters'],
  },
  // Village name where the people group is located
  villageName: {
    type: String,
    trim: true,
    maxlength: [200, 'Village name cannot exceed 200 characters'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
  },
  // Number of churches in this people group
  numberOfChurches: {
    type: Number,
    min: [0, 'Number of churches cannot be negative'],
    default: 0,
  },
  // Church generation (1st, 2nd, 3rd generation, etc.)
  churchGeneration: {
    type: Number,
    min: [0, 'Church generation cannot be negative'],
    default: 0,
  },
  // NG field-report metrics (Discovery Bible Studies / Communities / Categorized churches)
  dbs: {
    type: Number,
    min: [0, 'DBS cannot be negative'],
    default: 0,
  },
  com: {
    type: Number,
    min: [0, 'COM cannot be negative'],
    default: 0,
  },
  cat: {
    type: Number,
    min: [0, 'CAT cannot be negative'],
    default: 0,
  },
  // Additional DMM quarterly metrics (from the 20-column report template)
  avgChurchSize: { type: Number, min: 0, default: 0 },
  newDisciples: { type: Number, min: 0, default: 0 },
  newBaptisms: { type: Number, min: 0, default: 0 },
  leadersInTraining: { type: Number, min: 0, default: 0 },
  activeCoaches: { type: Number, min: 0, default: 0 },
  trainingsHeld: { type: Number, min: 0, default: 0 },
  lostChurches: { type: Number, min: 0, default: 0 },
  mergedChurches: { type: Number, min: 0, default: 0 },
  // Master people group label (People_Group column) the engagement rolls up to
  peopleGroup: { type: String, trim: true, maxlength: [200, 'People group label too long'] },
  // Free-text notes column
  notes: { type: String, trim: true, maxlength: [2000, 'Notes cannot exceed 2000 characters'] },
  // Reporting period this data snapshot belongs to (e.g. "2Q26"). Updated on each quarterly import.
  reportPeriod: {
    type: String,
    trim: true,
    maxlength: [20, 'Report period cannot exceed 20 characters'],
  },
  // Engagement status: unreached, pioneer, midway, tipping-point, dmm
  engagementStatus: {
    type: String,
    enum: {
      values: ['unreached', 'pioneer', 'midway', 'tipping-point', 'dmm'],
      message: 'Engagement status must be unreached, pioneer, midway, tipping-point, or dmm',
    },
    default: 'unreached',
  },
  // Engagement level: I, II, III, IV
  engagementLevel: {
    type: String,
    enum: {
      values: ['I', 'II', 'III', 'IV', ''],
      message: 'Engagement level must be I, II, III, or IV',
    },
    default: '',
  },
  // Legacy status field (kept for backward compatibility)
  // Enhanced status with color coding
  // unreached = red, pioneer = yellow, mid-journey = blue, tipping-point = orange, movement = green
  status: {
    type: String,
    enum: {
      values: ['unreached', 'pioneer', 'mid-journey', 'tipping-point', 'movement'],
      message: 'Status must be unreached, pioneer, mid-journey, tipping-point, or movement',
    },
    default: 'unreached',
  },
  // Status color mapping (for frontend reference)
  statusColor: {
    type: String,
    enum: ['red', 'yellow', 'blue', 'orange', 'green'],
    default: 'red',
  },
  // GeoJSON Point location
  location: {
    type: {
      type: String,
      enum: ['Point'],
      // Do NOT default to 'Point'. Defaulting materializes an empty
      // { type: 'Point' } subdocument for coordinate-less rows (DMM metric
      // imports), which the 2dsphere index then rejects with
      // "Can't extract geo keys ... Point must be an array or object".
      // Only set when real coordinates are provided.
      required: false,
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: false, // Optional: DMM metric imports may have no coordinates
      validate: {
        validator: function (coords) {
          // Allow empty/undefined (people group without a map location)
          if (coords === undefined || coords === null) return true;
          if (Array.isArray(coords) && coords.length === 0) return true;
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [lng, lat] = coords;
          return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
        },
        message: 'Invalid coordinates. Must be [longitude, latitude] with valid ranges.',
      },
    },
  },
  // Progress tracking
  progressPercentage: {
    type: Number,
    min: [0, 'Progress cannot be negative'],
    max: [100, 'Progress cannot exceed 100'],
    default: 0,
  },
  progressDate: {
    type: Date,
    default: Date.now,
  },
  progressNotes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Progress notes cannot exceed 1000 characters'],
  },
  // Progress history for timeline
  progressHistory: [progressHistorySchema],
  // Photos array
  photos: [photoSchema],
  // Organization tags for filtering
  organizationTags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
  }],
  // Demographics
  population: {
    type: Number,
    min: [0, 'Population cannot be negative'],
    default: 0,
  },
  language: {
    type: String,
    trim: true,
    maxlength: [100, 'Language cannot exceed 100 characters'],
  },
  religion: {
    type: String,
    trim: true,
    maxlength: [100, 'Religion cannot exceed 100 characters'],
  },
  // ── Engagement/reference metadata (from Cameroon_PGs.xlsx) ──────────────────
  // Funding partner / sponsor of the engagement (e.g. Volunteer, DOULOS, GRACE)
  donor: {
    type: String,
    trim: true,
    maxlength: [150, 'Donor cannot exceed 150 characters'],
  },
  // National coordinator responsible for this people group
  nationalCoordinator: {
    type: String,
    trim: true,
    maxlength: [150, 'National coordinator cannot exceed 150 characters'],
  },
  // Field church planter assigned to this people group
  churchPlanter: {
    type: String,
    trim: true,
    maxlength: [150, 'Church planter cannot exceed 150 characters'],
  },
  // Affinity group classification (e.g. Sub-Saharan African Peoples)
  affinityGroup: {
    type: String,
    trim: true,
    maxlength: [150, 'Affinity group cannot exceed 150 characters'],
  },
  // Urban / rural context (free text, e.g. "Rural", "Urbain (petite ville)")
  urbanRural: {
    type: String,
    trim: true,
    maxlength: [100, 'Urban/Rural cannot exceed 100 characters'],
  },
  // Year the engagement started
  startYear: {
    type: Number,
    min: [1900, 'Start year is invalid'],
    max: [2100, 'Start year is invalid'],
  },
  believersCount: {
    type: Number,
    min: [0, 'Believers count cannot be negative'],
    default: 0,
  },
  churchesCount: {
    type: Number,
    min: [0, 'Churches count cannot be negative'],
    default: 0,
  },
  // Relationships
  village: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Village',
  },
  // Approval workflow
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  approved: {
    type: Boolean,
    default: false,
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: Date,
  // Visibility
  isPublic: {
    type: Boolean,
    default: true,
  },
  // Region for analytics
  region: {
    type: String,
    trim: true,
    maxlength: [100, 'Region cannot exceed 100 characters'],
  },
  country: {
    type: String,
    trim: true,
    maxlength: [100, 'Country cannot exceed 100 characters'],
  },
  // ISO 3166-1 alpha-2 country code (e.g., 'CM' for Cameroon)
  countryCode: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: [2, 'Country code must be 2 characters'],
  },
  // Administrative level 2 (department/province)
  admin2: {
    type: String,
    trim: true,
    maxlength: [100, 'Admin2 cannot exceed 100 characters'],
  },
  // Administrative level 3 (arrondissement/district)
  admin3: {
    type: String,
    trim: true,
    maxlength: [100, 'Admin3 cannot exceed 100 characters'],
  },
  // Data source: 'DMM' for user-entered data, 'Survey' for survey data, 'Joshua Project' for JP API data
  source: {
    type: String,
    enum: ['DMM', 'manual', 'Survey', 'Joshua Project', 'IMB', 'PeopleGroups.org', 'Finishing the Task'],
    default: 'DMM',
  },
  // Joshua Project specific data
  jpData: {
    peopleId: String,
    rog3: String,
    jpScale: String,
    percentEvangelical: Number,
    percentChristian: Number,
  },
  // Generic raw source-specific data (unmapped CSV columns from IMB / PeopleGroups.org / Finishing the Task)
  sourceData: {
    type: mongoose.Schema.Types.Mixed,
  },
  // Link to the canonical MasterPeople this group has been reconciled into (set by
  // the DMM ingestion loader). Sparse: only DMM-linked groups carry this reference.
  masterPeopleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MasterPeople',
    index: true,
    sparse: true,
  },
}, {
  timestamps: true,
});

// ============================================
// INDEXES - Optimized for common query patterns
// ============================================

// Geospatial index for location-based queries (required for $near, $geoWithin)
peopleGroupSchema.index({ location: '2dsphere' }, { sparse: true });

// Single-field indexes for common filters
peopleGroupSchema.index({ status: 1 });                    // Filter by DMM status
peopleGroupSchema.index({ countryCode: 1 });               // Filter by country code (ISO 3166-1 alpha-2)
peopleGroupSchema.index({ country: 1 });                   // Filter by country name
peopleGroupSchema.index({ approved: 1 });                  // Filter approved/pending
peopleGroupSchema.index({ createdBy: 1 });                 // Filter by creator
peopleGroupSchema.index({ organizationTags: 1 });          // Filter by organization
peopleGroupSchema.index({ source: 1 });                    // Filter by data source (DMM, Joshua Project)
peopleGroupSchema.index({ engagementStatus: 1 });          // Filter by engagement status

// Compound indexes for common query patterns (order matters!)
// Most selective field first for optimal index usage
peopleGroupSchema.index({ countryCode: 1, status: 1 });    // Country + status filtering
peopleGroupSchema.index({ country: 1, status: 1 });        // Country name + status filtering
peopleGroupSchema.index({ approved: 1, status: 1 });       // Approved + status (common dashboard query)
peopleGroupSchema.index({ approved: 1, countryCode: 1 });  // Approved + country (map filtering)
peopleGroupSchema.index({ region: 1, country: 1 });        // Regional filtering
peopleGroupSchema.index({ admin2: 1 });                    // Department-level filtering
peopleGroupSchema.index({ admin3: 1 });                    // Arrondissement-level filtering

// Compound index for pagination queries (sort + filter)
peopleGroupSchema.index({ approved: 1, createdAt: -1 });   // Approved sorted by date (default list view)
peopleGroupSchema.index({ countryCode: 1, createdAt: -1 }); // Country sorted by date

// Text index for full-text search on name field
// Note: MongoDB allows only ONE text index per collection
// Using simple text index without language_override to avoid compatibility issues
peopleGroupSchema.index({ name: 'text' }, { 
  name: 'name_text_search',
  default_language: 'english',
  language_override: '_textLang',  // Decouple from `language` field to avoid 'Arabic, Sudanese' etc. errors
  weights: { name: 10 }  // Higher weight for name matches
});

// Sparse index for optional fields (only indexes documents where field exists)
peopleGroupSchema.index({ villageName: 1 }, { sparse: true });
peopleGroupSchema.index({ village: 1 }, { sparse: true });

// Auto-update statusColor based on status
// Strip an incomplete GeoJSON location before validation/save. Rows imported
// without coordinates (DMM metric templates) must NOT carry an empty
// { type: 'Point' } subdocument, otherwise the 2dsphere index throws
// "Can't extract geo keys ... Point must be an array or object".
function stripEmptyLocation(doc) {
  const loc = doc.location;
  if (!loc) return;
  const coords = loc.coordinates;
  const hasValidCoords = Array.isArray(coords) && coords.length === 2 &&
    Number.isFinite(coords[0]) && Number.isFinite(coords[1]);
  if (!hasValidCoords) {
    doc.location = undefined;
    if (typeof doc.markModified === 'function') doc.markModified('location');
  }
}

peopleGroupSchema.pre('validate', function (next) {
  stripEmptyLocation(this);
  next();
});

peopleGroupSchema.pre('save', function (next) {
  stripEmptyLocation(this);
  const statusColorMap = {
    'unreached': 'red',
    'pioneer': 'yellow',
    'mid-journey': 'blue',
    'tipping-point': 'orange',
    'movement': 'green',
  };
  this.statusColor = statusColorMap[this.status] || 'red';
  next();
});

// Add progress history entry when progress changes
peopleGroupSchema.pre('save', function (next) {
  if (this.isModified('progressPercentage') || this.isModified('status')) {
    this.progressHistory.push({
      date: new Date(),
      percentage: this.progressPercentage,
      status: this.status,
      notes: this.progressNotes,
      updatedBy: this.updatedBy || this.createdBy,
    });
  }
  next();
});

// Virtual for status display name
peopleGroupSchema.virtual('statusDisplay').get(function () {
  const displayNames = {
    'unreached': 'Unreached',
    'pioneer': 'Pioneer Stage',
    'mid-journey': 'Mid-Journey',
    'tipping-point': 'Tipping Point',
    'movement': 'Movement',
  };
  return displayNames[this.status] || this.status;
});

// Enable virtuals in JSON output
peopleGroupSchema.set('toJSON', { virtuals: true });
peopleGroupSchema.set('toObject', { virtuals: true });

// Static method to find by status
peopleGroupSchema.statics.findByStatus = function (status) {
  return this.find({ status, approved: true });
};

// Static method to find nearby people groups
peopleGroupSchema.statics.findNearby = function (coordinates, maxDistance = 10000) {
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates,
        },
        $maxDistance: maxDistance,
      },
    },
    approved: true,
  });
};

// Static method for status statistics
peopleGroupSchema.statics.getStatusStats = async function (filters = {}) {
  const matchStage = { approved: true, ...filters };
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalPopulation: { $sum: '$population' },
        totalBelievers: { $sum: '$believersCount' },
        totalChurches: { $sum: '$churchesCount' },
        avgProgress: { $avg: '$progressPercentage' },
      },
    },
    {
      $project: {
        status: '$_id',
        count: 1,
        totalPopulation: 1,
        totalBelievers: 1,
        totalChurches: 1,
        avgProgress: { $round: ['$avgProgress', 1] },
        _id: 0,
      },
    },
  ]);
};

module.exports = mongoose.model('PeopleGroup', peopleGroupSchema);