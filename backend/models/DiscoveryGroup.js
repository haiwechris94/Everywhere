const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const discoveryGroupSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
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
    facilitator: {
      type: ObjectId,
      ref: 'User',
    },
    facilitatorPop: {
      type: ObjectId,
      ref: 'PersonOfPeace',
    },
    memberCount: {
      type: Number,
      min: [0, 'Member count cannot be negative'],
      default: 0,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    meetingFrequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly', 'other'],
      default: 'weekly',
    },
    currentPassage: {
      type: String,
    },
    habitFocus: {
      type: String,
      enum: ['gods-heart', 'pray', 'engage', 'find', ''],
      default: '',
    },
    status: {
      type: String,
      enum: ['active', 'multiplied', 'became-church', 'stalled', 'closed'],
      default: 'active',
    },
    generation: {
      type: Number,
      min: 1,
      default: 1,
    },
    parentGroup: {
      type: ObjectId,
      ref: 'DiscoveryGroup',
      default: null,
    },
    becameChurch: {
      type: ObjectId,
      ref: 'Church',
      default: null,
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
discoveryGroupSchema.index({ location: '2dsphere' });

// Index for status filtering
discoveryGroupSchema.index({ status: 1 });

// Index for village
// (village already indexed via `index: true` on the field)

// Text index on name
discoveryGroupSchema.index({ name: 'text' });

// Virtual to get DBS sessions for this group
discoveryGroupSchema.virtual('dbsSessions', {
  ref: 'DBSSession',
  localField: '_id',
  foreignField: 'discoveryGroup',
});

// Enable virtuals in JSON output
discoveryGroupSchema.set('toJSON', { virtuals: true });
discoveryGroupSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('DiscoveryGroup', discoveryGroupSchema);
