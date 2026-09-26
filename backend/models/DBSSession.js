const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// Sub-schema for "I will" statements
const iWillSchema = new Schema(
  {
    text: {
      type: String,
      required: [true, 'Statement text is required'],
    },
    owner: { type: String },
    sharedWith: { type: String },
    dueDate: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'done'],
      default: 'pending',
    },
  },
  { _id: false }
);

const dbsSessionSchema = new Schema(
  {
    discoveryGroup: {
      type: ObjectId,
      ref: 'DiscoveryGroup',
      required: [true, 'Discovery group reference is required'],
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    passage: {
      type: String,
      required: [true, 'Passage is required'],
    },
    thankfulFor: { type: String },
    strugglingWith: { type: String },
    whatItSays: { type: String },
    whatItMeans: { type: String },
    iWillStatements: [iWillSchema],
    prayerRequests: [String],
    attendanceCount: {
      type: Number,
      min: [0, 'Attendance count cannot be negative'],
      default: 0,
    },
    newPeopleCount: {
      type: Number,
      min: [0, 'New people count cannot be negative'],
      default: 0,
    },
    decisionsForChrist: {
      type: Number,
      min: [0, 'Decisions count cannot be negative'],
      default: 0,
    },
    baptisms: {
      type: Number,
      min: [0, 'Baptisms count cannot be negative'],
      default: 0,
    },
    facilitator: {
      type: ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: ObjectId,
      ref: 'User',
      required: [true, 'createdBy is required'],
    },
  },
  {
    timestamps: true,
  }
);

// Index for date queries
dbsSessionSchema.index({ date: -1 });

// Compound index for discovery group and date
dbsSessionSchema.index({ discoveryGroup: 1, date: -1 });

// Enable virtuals in JSON output
dbsSessionSchema.set('toJSON', { virtuals: true });
dbsSessionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('DBSSession', dbsSessionSchema);
