/**
 * User Model - Enhanced with roles, organization references, and permissions
 * Supports: missionary, supervisor, admin, guest roles
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s-]{10,}$/, 'Please provide a valid phone number'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    // Enhanced role system
    role: {
      type: String,
      enum: {
        values: ['admin', 'supervisor', 'missionary', 'guest'],
        message: 'Role must be admin, supervisor, missionary, or guest',
      },
      default: 'missionary',
    },
    // Organization reference (for team management)
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },
    // Legacy organization name field (for backward compatibility)
    organizationName: {
      type: String,
      trim: true,
      maxlength: [200, 'Organization name cannot exceed 200 characters'],
    },
    // Profile settings
    avatar: {
      type: String,
      default: null,
    },
    // Location for auto-geolocation feature
    lastKnownLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
    },
    // Notification preferences
    notificationPreferences: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      proximity: { type: Boolean, default: true },
      proximityRadius: { type: Number, default: 10000 }, // meters
    },
    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    // Tracking
    lastLogin: Date,
    loginCount: {
      type: Number,
      default: 0,
    },
    loginHistory: [
      {
        at: { type: Date, default: Date.now },
        ip: { type: String },
        userAgent: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
// Note: email already has unique: true on line 20, so no need for separate index
userSchema.index({ role: 1 });
userSchema.index({ organization: 1 });
userSchema.index({ lastKnownLocation: '2dsphere' });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user has specific permission
userSchema.methods.hasPermission = function (permission) {
  const permissions = {
    admin: ['read', 'write', 'delete', 'approve', 'export', 'manage-users', 'manage-org', 'analytics'],
    supervisor: ['read', 'write', 'delete', 'approve', 'export', 'analytics', 'manage-team'],
    missionary: ['read', 'write', 'export'],
    guest: ['read'],
  };
  return permissions[this.role]?.includes(permission) || false;
};

// Check if user can edit a resource
userSchema.methods.canEdit = function (resource) {
  if (this.role === 'admin' || this.role === 'supervisor') return true;
  if (this.role === 'missionary') {
    return resource.createdBy?.toString() === this._id.toString();
  }
  return false;
};

// Remove sensitive data from JSON output
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.verificationToken;
  delete user.verificationExpires;
  delete user.resetPasswordToken;
  delete user.resetPasswordExpires;
  return user;
};

// Static method to find users near a location
userSchema.statics.findNearby = function (coordinates, maxDistance = 10000) {
  return this.find({
    lastKnownLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates,
        },
        $maxDistance: maxDistance,
      },
    },
    isActive: true,
  });
};

module.exports = mongoose.model('User', userSchema);