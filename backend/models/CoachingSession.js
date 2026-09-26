const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// The `dimensionId` / `dimensionName` values in reality.evaluationScores
// correspond to the DMM_EVALUATION_DIMENSIONS defined here.
// eslint-disable-next-line no-unused-vars
const { DMM_EVALUATION_DIMENSIONS } = require('../config/dmmConstants');

const evaluationScoreSchema = new Schema(
  {
    dimensionId: { type: String },
    dimensionName: { type: String },
    score: {
      type: Number,
      min: [1, 'Score must be at least 1'],
      max: [5, 'Score cannot exceed 5'],
    },
    notes: { type: String },
  },
  { _id: false }
);

const willDoSchema = new Schema(
  {
    rank: { type: Number },
    text: { type: String },
    dueDate: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'done'],
      default: 'pending',
    },
  },
  { _id: false }
);

const coachingSessionSchema = new Schema(
  {
    coach: {
      type: ObjectId,
      ref: 'User',
      required: [true, 'Coach reference is required'],
      index: true,
    },
    coacheeUser: {
      type: ObjectId,
      ref: 'User',
    },
    coacheeName: { type: String },
    conversationWith: {
      type: String,
      enum: ['leader', 'church-planter', 'other'],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    durationMinutes: { type: Number },
    invite: {
      rapportNotes: { type: String },
      coachPrep: { type: String },
    },
    goal: {
      statement: { type: String },
      importance: {
        type: Number,
        min: [1, 'Importance must be at least 1'],
        max: [10, 'Importance cannot exceed 10'],
      },
    },
    reality: {
      notes: { type: String },
      evaluationScores: [evaluationScoreSchema],
    },
    options: [String],
    willDo: [willDoSchema],
    overallHealthScore: {
      type: Number,
      min: [0, 'Health score cannot be negative'],
      max: [100, 'Health score cannot exceed 100'],
    },
    nextSessionDate: { type: Date },
    village: {
      type: ObjectId,
      ref: 'Village',
    },
    peopleGroup: {
      type: ObjectId,
      ref: 'PeopleGroup',
    },
    discoveryGroup: {
      type: ObjectId,
      ref: 'DiscoveryGroup',
    },
    activity: {
      type: ObjectId,
      ref: 'Activity',
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
  },
  {
    timestamps: true,
  }
);

// Index for date queries
coachingSessionSchema.index({ date: -1 });

// Compound index for coach and date
coachingSessionSchema.index({ coach: 1, date: -1 });

// Pre-save hook to compute overall health score from evaluation scores
coachingSessionSchema.pre('save', function (next) {
  const scores = this.reality && this.reality.evaluationScores;
  if (scores && scores.length) {
    const valid = scores
      .map((s) => s.score)
      .filter((s) => typeof s === 'number' && !Number.isNaN(s));
    if (valid.length) {
      const avg = valid.reduce((sum, s) => sum + s, 0) / valid.length;
      this.overallHealthScore = Math.round((avg / 5) * 100);
    }
  }
  next();
});

// Enable virtuals in JSON output
coachingSessionSchema.set('toJSON', { virtuals: true });
coachingSessionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CoachingSession', coachingSessionSchema);
