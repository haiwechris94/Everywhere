const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const personOfPeaceSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    gender: {
      type: String,
      enum: ['M', 'F', ''],
      default: '',
    },
    contactInfo: {
      phone: { type: String },
      notes: { type: String },
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
      },
    },
    village: {
      type: ObjectId,
      ref: 'Village',
      index: true,
    },
    peopleGroup: {
      type: ObjectId,
      ref: 'PeopleGroup',
    },
    status: {
      type: String,
      enum: ['identified', 'engaging', 'confirmed', 'leading', 'inactive'],
      default: 'identified',
    },
    opennessSigns: [String],
    discoveryGroup: {
      type: ObjectId,
      ref: 'DiscoveryGroup',
    },
    steward: {
      type: ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    organization: {
      type: ObjectId,
      ref: 'Organization',
    },
    createdBy: {
      type: ObjectId,
      ref: 'User',
      required: [true, 'createdBy is required'],
    },
    approved: {
      type: Boolean,
      default: false,
    },
    approvedBy: {
      type: ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Geospatial index
personOfPeaceSchema.index({ location: '2dsphere' });

// Index for status filtering
personOfPeaceSchema.index({ status: 1 });

// Index for village
// (village already indexed via `index: true` on the field)

// Text index on name
personOfPeaceSchema.index({ name: 'text' });

// French status display virtual
personOfPeaceSchema.virtual('statusLabel').get(function () {
  const labels = {
    identified: 'Identifiée',
    engaging: 'En relation',
    confirmed: 'Confirmée',
    leading: 'Mène un groupe',
    inactive: 'Inactive',
  };
  return labels[this.status] || this.status;
});

// Enable virtuals in JSON output
personOfPeaceSchema.set('toJSON', { virtuals: true });
personOfPeaceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('PersonOfPeace', personOfPeaceSchema);
