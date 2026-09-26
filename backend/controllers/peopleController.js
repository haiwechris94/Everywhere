/**
 * People Controller - Handles all CRUD operations for peoples/population data
 * Includes role-based access control for Admin and Supervisor roles
 */
const People = require('../models/People');
const Village = require('../models/Village');
const mongoose = require('mongoose');

/**
 * Get all peoples with pagination and filtering
 * @route GET /api/peoples
 * @access Public (with optional auth for more data)
 */
const getAllPeoples = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      region,
      villageName,
      polygonId,
      approved,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
    } = req.query;

    // Build query
    const query = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by region
    if (region) {
      query.region = region;
    }
    
    // Filter by village name
    if (villageName) {
      query.villageName = { $regex: villageName, $options: 'i' };
    }
    
    // Filter by polygon ID
    if (polygonId) {
      query.polygonId = polygonId;
    }
    
    // Filter by approval status (admin/supervisor only)
    if (approved !== undefined) {
      if (req.user && ['admin', 'supervisor'].includes(req.user.role)) {
        query.approved = approved === 'true';
      } else {
        query.approved = true; // Non-admin users only see approved
      }
    } else {
      // Default: show only approved for non-admin users
      if (!req.user || !['admin', 'supervisor'].includes(req.user.role)) {
        query.approved = true;
      }
    }
    
    // Text search
    if (search) {
      query.$text = { $search: search };
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [peoples, total] = await Promise.all([
      People.find(query)
        .populate('createdBy', 'name email')
        .populate('village', 'name location')
        .populate('organization', 'name')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      People.countDocuments(query),
    ]);

    res.json({
      success: true,
      peoples,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching peoples:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message,
    });
  }
};

/**
 * Get a single people by ID
 * @route GET /api/peoples/:id
 * @access Public
 */
const getPeopleById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID',
        message: 'The provided ID is not valid',
      });
    }

    const people = await People.findById(id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('village', 'name location population')
      .populate('organization', 'name');

    if (!people) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'People record not found',
      });
    }

    // Check if user can view unapproved records
    if (!people.approved) {
      if (!req.user || !['admin', 'supervisor'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'This record is pending approval',
        });
      }
    }

    res.json({
      success: true,
      people,
    });
  } catch (error) {
    console.error('Error fetching people:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message,
    });
  }
};

/**
 * Create a new people record
 * @route POST /api/peoples
 * @access Admin, Supervisor only
 */
const createPeople = async (req, res) => {
  try {
    const {
      name,
      villageName,
      village,
      polygonId,
      population,
      households,
      location,
      demographics,
      language,
      religion,
      ethnicity,
      description,
      region,
      departement,
      arrondissement,
      country,
      status,
      believersCount,
      churchesCount,
      organization,
      dataSource,
      dataYear,
      isPublic,
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Name is required',
      });
    }

    // Build people data
    const peopleData = {
      name,
      createdBy: req.user._id,
      // Nouveaux engagements : toujours en attente de validation par un admin
      // avant d'être comptés dans le reporting région et affichés sur la carte.
      approved: false,
    };

    // Add optional fields if provided
    if (villageName) peopleData.villageName = villageName;
    if (village) peopleData.village = village;
    if (polygonId) peopleData.polygonId = polygonId;
    if (population !== undefined) peopleData.population = population;
    if (households !== undefined) peopleData.households = households;
    if (location) peopleData.location = location;
    if (demographics) peopleData.demographics = demographics;
    if (language) peopleData.language = language;
    if (religion) peopleData.religion = religion;
    if (ethnicity) peopleData.ethnicity = ethnicity;
    if (description) peopleData.description = description;
    if (region) peopleData.region = region;
    if (departement) peopleData.departement = departement;
    if (arrondissement) peopleData.arrondissement = arrondissement;
    if (country) peopleData.country = country;
    if (status) peopleData.status = status;
    if (believersCount !== undefined) peopleData.believersCount = believersCount;
    if (churchesCount !== undefined) peopleData.churchesCount = churchesCount;
    if (organization) peopleData.organization = organization;
    if (dataSource) peopleData.dataSource = dataSource;
    if (dataYear) peopleData.dataYear = dataYear;
    if (isPublic !== undefined) peopleData.isPublic = isPublic;

    // If auto-approved, set approval info
    if (peopleData.approved) {
      peopleData.approvedBy = req.user._id;
      peopleData.approvedAt = new Date();
    }

    const people = new People(peopleData);
    await people.save();

    // Populate references for response
    await people.populate('createdBy', 'name email');

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to('map').emit('people-added', {
        people: people.toJSON(),
        addedBy: req.user.name,
      });
    }

    res.status(201).json({
      success: true,
      message: 'People record created successfully',
      people,
    });
  } catch (error) {
    console.error('Error creating people:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: error.message,
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message,
    });
  }
};

/**
 * Update a people record
 * @route PUT /api/peoples/:id
 * @access Admin, Supervisor only
 */
const updatePeople = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID',
        message: 'The provided ID is not valid',
      });
    }

    const people = await People.findById(id);

    if (!people) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'People record not found',
      });
    }

    // Define allowed update fields
    const allowedUpdates = [
      'name', 'villageName', 'village', 'polygonId', 'population',
      'households', 'location', 'demographics', 'language', 'religion',
      'ethnicity', 'description', 'region', 'departement', 'arrondissement',
      'country', 'status', 'believersCount', 'churchesCount', 'organization',
      'dataSource', 'dataYear', 'isPublic',
    ];

    // Apply updates
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        people[field] = req.body[field];
      }
    });

    // Track who updated
    people.updatedBy = req.user._id;

    await people.save();

    // Populate references for response
    await people.populate('createdBy', 'name email');
    await people.populate('updatedBy', 'name email');

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to('map').emit('people-updated', {
        people: people.toJSON(),
        updatedBy: req.user.name,
      });
    }

    res.json({
      success: true,
      message: 'People record updated successfully',
      people,
    });
  } catch (error) {
    console.error('Error updating people:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: error.message,
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message,
    });
  }
};

/**
 * Delete a people record
 * @route DELETE /api/peoples/:id
 * @access Admin only
 */
const deletePeople = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID',
        message: 'The provided ID is not valid',
      });
    }

    const people = await People.findById(id);

    if (!people) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'People record not found',
      });
    }

    await People.findByIdAndDelete(id);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to('map').emit('people-deleted', {
        peopleId: id,
        deletedBy: req.user.name,
      });
    }

    res.json({
      success: true,
      message: 'People record deleted successfully',
      id,
    });
  } catch (error) {
    console.error('Error deleting people:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message,
    });
  }
};

/**
 * Get peoples by polygon ID
 * @route GET /api/peoples/polygon/:polygonId
 * @access Public
 */
const getPeoplesByPolygon = async (req, res) => {
  try {
    const { polygonId } = req.params;

    if (!polygonId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Polygon ID is required',
      });
    }

    // Build query - also search by village name if polygonId looks like a name
    const query = {
      $or: [
        { polygonId: polygonId },
        { villageName: { $regex: new RegExp(`^${polygonId}$`, 'i') } },
      ],
    };

    // Only show approved records for non-admin users
    if (!req.user || !['admin', 'supervisor'].includes(req.user.role)) {
      query.approved = true;
    }

    const peoples = await People.find(query)
      .populate('createdBy', 'name email')
      .populate('village', 'name location')
      .sort({ population: -1 });

    // Calculate totals
    const totals = peoples.reduce(
      (acc, p) => ({
        totalPopulation: acc.totalPopulation + (p.population || 0),
        totalHouseholds: acc.totalHouseholds + (p.households || 0),
        totalBelievers: acc.totalBelievers + (p.believersCount || 0),
        totalChurches: acc.totalChurches + (p.churchesCount || 0),
      }),
      { totalPopulation: 0, totalHouseholds: 0, totalBelievers: 0, totalChurches: 0 }
    );

    res.json({
      success: true,
      polygonId,
      peoples,
      count: peoples.length,
      totals,
    });
  } catch (error) {
    console.error('Error fetching peoples by polygon:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message,
    });
  }
};

/**
 * Approve a people record
 * @route POST /api/peoples/:id/approve
 * @access Admin, Supervisor only
 */
const approvePeople = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID',
        message: 'The provided ID is not valid',
      });
    }

    const people = await People.findById(id);

    if (!people) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'People record not found',
      });
    }

    if (people.approved) {
      return res.status(400).json({
        success: false,
        error: 'Already approved',
        message: 'This record is already approved',
      });
    }

    people.approved = true;
    people.approvedBy = req.user._id;
    people.approvedAt = new Date();
    await people.save();

    await people.populate('approvedBy', 'name email');

    res.json({
      success: true,
      message: 'People record approved successfully',
      people,
    });
  } catch (error) {
    console.error('Error approving people:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message,
    });
  }
};

/**
 * Get population statistics
 * @route GET /api/peoples/stats
 * @access Public
 */
const getPopulationStats = async (req, res) => {
  try {
    const { region, status } = req.query;
    
    const filters = {};
    if (region) filters.region = region;
    if (status) filters.status = status;

    const [populationStats, statusDistribution] = await Promise.all([
      People.getPopulationStats(filters),
      People.getStatusDistribution(filters),
    ]);

    // Calculate grand totals
    const grandTotals = populationStats.reduce(
      (acc, stat) => ({
        totalPopulation: acc.totalPopulation + stat.totalPopulation,
        totalHouseholds: acc.totalHouseholds + stat.totalHouseholds,
        totalBelievers: acc.totalBelievers + stat.totalBelievers,
        totalChurches: acc.totalChurches + stat.totalChurches,
        totalRecords: acc.totalRecords + stat.count,
      }),
      { totalPopulation: 0, totalHouseholds: 0, totalBelievers: 0, totalChurches: 0, totalRecords: 0 }
    );

    res.json({
      success: true,
      byRegion: populationStats,
      byStatus: statusDistribution,
      totals: grandTotals,
    });
  } catch (error) {
    console.error('Error fetching population stats:', error);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: error.message,
    });
  }
};

module.exports = {
  getAllPeoples,
  getPeopleById,
  createPeople,
  updatePeople,
  deletePeople,
  getPeoplesByPolygon,
  approvePeople,
  getPopulationStats,
};
