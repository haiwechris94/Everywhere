/**
 * Project Model
 * Church planting projects/initiatives tracked in the platform.
 * Fully user-managed (created via the Projects page) - no seed data.
 */
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    status: {
      type: String,
      enum: ['Planning', 'Active', 'Monitoring', 'Completed', 'On Hold'],
      default: 'Planning',
      index: true,
    },
    owner: {
      type: String,
      trim: true,
      default: '',
    },
    country: {
      type: String,
      trim: true,
      default: '',
    },
    region: {
      type: String,
      trim: true,
      default: '',
    },
    // Execution progress in percent (0-100)
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    churches: {
      type: Number,
      min: 0,
      default: 0,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    // Audit
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

projectSchema.index({ name: 1 });
projectSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Project', projectSchema);
