/**
 * Authentication Routes - Enhanced with role assignment, location tracking, and password recovery
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { auth, optionalAuth } = require('../middleware/auth');
const { checkRole, isAdmin, isSupervisorOrAdmin } = require('../middleware/roles');
const { logAuth } = require('../middleware/activityLogger');
const { uploadAvatar, processUploadedFiles } = require('../middleware/upload');
const { sendPasswordResetEmail } = require('../utils/emailService');

const router = express.Router();

/**
 * POST /auth/register - Register a new user
 * Supports role assignment (admin only can assign supervisor/admin roles)
 */
router.post('/register', logAuth('register'), async (req, res) => {
  try {
    const { 
      name, 
      email, 
      password, 
      phone,
      organizationName,
      organizationId,
      organization, // Can be ObjectId string or organization name
      role = 'missionary',
      location 
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        error: 'Registration failed',
        message: 'This email is already registered'
      });
    }

    // Validate role (only allow missionary or guest for self-registration)
    let assignedRole = role;
    if (!['missionary', 'guest'].includes(role)) {
      assignedRole = 'missionary'; // Default to missionary for security
    }

    // Create new user
    const userData = {
      name,
      email,
      password,
      phone,
      organizationName,
      role: assignedRole,
    };

    // Helper function to find or create organization by name
    const findOrCreateOrganization = async (orgName) => {
      let org = await Organization.findOne({ name: { $regex: new RegExp(`^${orgName}$`, 'i') } });
      if (!org) {
        // Create new organization with the given name
        org = new Organization({
          name: orgName,
          slug: orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          description: `Organization: ${orgName}`,
        });
        await org.save();
      }
      return org;
    };

    // Set organization if provided (handles multiple input formats)
    let resolvedOrgId = null;

    // Priority 1: organizationId (explicit ObjectId)
    if (organizationId) {
      if (mongoose.Types.ObjectId.isValid(organizationId)) {
        const org = await Organization.findById(organizationId);
        if (org) {
          resolvedOrgId = organizationId;
        }
      }
    }
    // Priority 2: organization field (can be ObjectId string or name)
    else if (organization) {
      if (mongoose.Types.ObjectId.isValid(organization)) {
        // It's a valid ObjectId format, try to find it
        const org = await Organization.findById(organization);
        if (org) {
          resolvedOrgId = organization;
        } else {
          // ObjectId format but not found, treat as name and create
          const newOrg = await findOrCreateOrganization(organization);
          resolvedOrgId = newOrg._id;
        }
      } else {
        // It's a string name, find or create the organization
        const org = await findOrCreateOrganization(organization);
        resolvedOrgId = org._id;
      }
    }

    if (resolvedOrgId) {
      userData.organization = resolvedOrgId;
    }

    // Set location if provided
    if (location && location.coordinates) {
      userData.lastKnownLocation = {
        type: 'Point',
        coordinates: location.coordinates,
      };
    }

    const user = new User(userData);
    await user.save();

    // Add user to organization if specified
    if (userData.organization) {
      const org = await Organization.findById(userData.organization);
      if (org) {
        org.addMember(user._id, 'member');
        await org.save();
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    res.status(400).json({
      error: 'Registration failed',
      message: error.message
    });
  }
});

/**
 * POST /auth/login - User login
 */
router.post('/login', logAuth('login'), async (req, res) => {
  try {
    const { email, password, location } = req.body;

    // Find user by email
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        error: 'Login failed',
        message: 'Invalid email or password'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        error: 'Login failed',
        message: 'Account is deactivated'
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Login failed',
        message: 'Invalid email or password'
      });
    }

    // Update last login and location
    user.lastLogin = new Date();
    user.loginCount += 1;

    // Record a capped login-history entry (most recent 50)
    const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;
    user.loginHistory = user.loginHistory || [];
    user.loginHistory.push({ at: new Date(), ip, userAgent });
    if (user.loginHistory.length > 50) user.loginHistory = user.loginHistory.slice(-50);
    
    if (location && location.coordinates) {
      user.lastKnownLocation = {
        type: 'Point',
        coordinates: location.coordinates,
      };
    }
    
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Populate organization
    await user.populate('organization', 'name slug');

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      token
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /auth/me - Get current user profile
 */
router.get('/me', auth, async (req, res) => {
  try {
    await req.user.populate('organization', 'name slug logo');
    res.json(req.user.toJSON());
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * PUT /auth/profile - Update user profile
 */
router.put('/profile', auth, async (req, res) => {
  try {
    const allowedUpdates = [
      'name', 
      'phone', 
      'organizationName',
      'notificationPreferences',
    ];
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        req.user[field] = req.body[field];
      }
    });

    await req.user.save();
    await req.user.populate('organization', 'name slug');

    res.json({
      message: 'Profile updated successfully',
      user: req.user.toJSON()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Update failed',
      message: error.message
    });
  }
});

/**
 * PUT /auth/avatar - Update user avatar
 */
router.put('/avatar', auth, uploadAvatar, processUploadedFiles, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Upload failed',
        message: 'No file provided'
      });
    }

    req.user.avatar = req.file.url;
    await req.user.save();

    res.json({
      message: 'Avatar updated successfully',
      avatar: req.user.avatar
    });
  } catch (error) {
    res.status(400).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});

/**
 * PUT /auth/location - Update user location
 */
router.put('/location', auth, async (req, res) => {
  try {
    const { coordinates } = req.body;

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return res.status(400).json({
        error: 'Invalid location',
        message: 'Coordinates must be [longitude, latitude]'
      });
    }

    req.user.lastKnownLocation = {
      type: 'Point',
      coordinates: coordinates,
    };
    await req.user.save();

    res.json({
      message: 'Location updated successfully',
      location: req.user.lastKnownLocation
    });
  } catch (error) {
    res.status(400).json({
      error: 'Update failed',
      message: error.message
    });
  }
});

/**
 * PUT /auth/password - Change password
 */
router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Password change failed',
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(400).json({
      error: 'Password change failed',
      message: error.message
    });
  }
});

/**
 * PUT /auth/role/:userId - Update user role (admin/supervisor only)
 */
router.put('/role/:userId', auth, isSupervisorOrAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const { userId } = req.params;

    // Validate role
    const validRoles = ['admin', 'supervisor', 'missionary', 'guest'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Invalid role',
        message: `Role must be one of: ${validRoles.join(', ')}`
      });
    }

    // Only admins can assign admin role
    if (role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only admins can assign admin role'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    user.role = role;
    await user.save();

    res.json({
      message: 'User role updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    res.status(400).json({
      error: 'Update failed',
      message: error.message
    });
  }
});

/**
 * GET /auth/users - Get all users (admin/supervisor only)
 */
router.get('/users', auth, isSupervisorOrAdmin, async (req, res) => {
  try {
    const { role, organization, limit = 50, skip = 0, search } = req.query;

    const query = {};
    if (role) query.role = role;
    if (organization) query.organization = organization;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    // Supervisors can only see users in their organization
    if (req.user.role === 'supervisor' && req.user.organization) {
      query.organization = req.user.organization;
    }

    const users = await User.find(query)
      .populate('organization', 'name')
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({
      users,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * DELETE /auth/profile - Delete account
 */
router.delete('/profile', auth, logAuth('profile-update'), async (req, res) => {
  try {
    // Remove user from organizations
    await Organization.updateMany(
      { 'members.user': req.user._id },
      { $pull: { members: { user: req.user._id } } }
    );

    await User.findByIdAndDelete(req.user._id);
    
    res.json({
      message: 'Account deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * POST /auth/logout - Logout (for activity logging)
 */
router.post('/logout', auth, logAuth('logout'), async (req, res) => {
  res.json({
    message: 'Logged out successfully'
  });
});

/**
 * POST /auth/forgot-password - Request password reset
 * Sends an email with a reset link if the email exists
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, language = 'en' } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Email is required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success to prevent email enumeration attacks
    // But only send email if user exists
    if (user) {
      // Generate secure random token
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Hash the token before storing (for security)
      const hashedToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

      // Set token and expiration (1 hour from now)
      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
      await user.save();

      // Send email with the unhashed token (user will use this)
      try {
        await sendPasswordResetEmail(
          user.email,
          resetToken,
          user.name,
          language
        );
      } catch (emailError) {
        // Log error but don't expose to user
        console.error('Failed to send password reset email:', emailError);
        // Clear the token since email failed
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        
        return res.status(500).json({
          error: 'Email service error',
          message: 'Failed to send password reset email. Please try again later.'
        });
      }
    }

    // Always return success message (security best practice)
    res.json({
      message: 'If an account exists with this email, a password reset link has been sent.',
      success: true
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred while processing your request'
    });
  }
});

/**
 * POST /auth/reset-password - Reset password with token
 * Validates token and updates password
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    // Validate input
    if (!token) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Reset token is required'
      });
    }

    if (!password) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'New password is required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Password must be at least 6 characters long'
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Passwords do not match'
      });
    }

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token that hasn't expired
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Invalid token',
        message: 'Password reset token is invalid or has expired'
      });
    }

    // Update password (will be hashed by pre-save hook)
    user.password = password;
    
    // Clear reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    await user.save();

    // Generate new JWT token for automatic login
    const jwtToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Password has been reset successfully',
      success: true,
      token: jwtToken,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred while resetting your password'
    });
  }
});

/**
 * GET /auth/verify-reset-token/:token - Verify if reset token is valid
 * Used by frontend to check token before showing reset form
 */
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Token is required',
        valid: false
      });
    }

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token that hasn't expired
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Invalid token',
        message: 'Password reset token is invalid or has expired',
        valid: false
      });
    }

    res.json({
      message: 'Token is valid',
      valid: true,
      email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Partially mask email
    });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred while verifying the token',
      valid: false
    });
  }
});

module.exports = router;