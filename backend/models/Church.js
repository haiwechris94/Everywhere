const mongoose = require('mongoose');

const churchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Church name is required'],
      trim: true,
      minlength: [2, 'Church name must be at least 2 characters'],
      maxlength: [200, 'Church name cannot exceed 200 characters'],
    },
    village: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Village',
      required: [true, 'Village reference is required'],
      index: true,
    },
    plantedDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: {
        values: ['planning', 'planted', 'growing', 'multiplying', 'inactive'],
        message: 'Status must be planning, planted, growing, multiplying, or inactive',
      },
      default: 'planning',
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    memberCount: {
      type: Number,
      min: [0, 'Member count cannot be negative'],
      default: 0,
    },
    leader: {
      type: String,
      trim: true,
      maxlength: [100, 'Leader name cannot exceed 100 characters'],
    },
    contactInfo: {
      phone: {
        type: String,
        trim: true,
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
    },
    parentChurch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Church',
      default: null,
    },
    generation: {
      type: Number,
      min: [1, 'Generation must be at least 1'],
      default: 1,
    },
    planterType: {
      type: String,
      enum: ['commissioned', 'catalytic'],
      default: 'commissioned',
    },
    lifecycleStatus: {
      type: String,
      enum: ['active', 'merged', 'died'],
      default: 'active',
    },
    mergedInto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Church',
      default: null,
    },
    baptizedCount: {
      type: Number,
      min: [0, 'Baptized count cannot be negative'],
      default: 0,
    },
    peopleGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PeopleGroup',
    },
    originGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DiscoveryGroup',
    },
  },
  {
    timestamps: true,
  }
);

// Index for status filtering
churchSchema.index({ status: 1 });

// Index for planted date queries
churchSchema.index({ plantedDate: -1 });

// Compound index for village and status
churchSchema.index({ village: 1, status: 1 });

// Virtual to get daughter churches
churchSchema.virtual('daughterChurches', {
  ref: 'Church',
  localField: '_id',
  foreignField: 'parentChurch',
});

// Enable virtuals in JSON output
churchSchema.set('toJSON', { virtuals: true });
churchSchema.set('toObject', { virtuals: true });

// Pre-save middleware to update village status when church is planted
churchSchema.pre('save', async function (next) {
  if (this.isNew && this.status !== 'planning') {
    try {
      const Village = mongoose.model('Village');
      await Village.findByIdAndUpdate(this.village, {
        status: 'church-planted',
      });
    } catch (error) {
      console.error('Error updating village status:', error);
    }
  }
  next();
});

// Pre-save middleware to compute church generation based on its parent church.
// Backward compatible: no parent -> generation defaults to 1.
churchSchema.pre('save', async function (next) {
  try {
    if (this.parentChurch) {
      const Church = mongoose.model('Church');
      const parent = await Church.findById(this.parentChurch).select('generation');
      this.generation = ((parent && parent.generation) || 1) + 1;
    } else if (this.generation == null) {
      this.generation = 1;
    }
  } catch (error) {
    console.error('Error computing church generation:', error);
  }
  next();
});

module.exports = mongoose.model('Church', churchSchema);
