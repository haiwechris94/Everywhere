/**
 * Dashboard Controller
 * Provides endpoints for dashboard KPIs, charts, and hierarchical data
 * 
 * Status Colors:
 * - Red (#EF4444): Unreached
 * - Yellow (#F59E0B): Pioneer
 * - Blue (#3B82F6): Midway
 * - Orange (#F97316): Tipping Point
 * - Green (#10B981): DMM
 * - Gray (#6B7280): No Data / Pas d'information
 */

const PeopleGroup = require('../models/PeopleGroup');
const Village = require('../models/Village');

// Status colors mapping
const STATUS_COLORS = {
  'unreached': '#EF4444',
  'pioneer': '#F59E0B',
  'midway': '#3B82F6',
  'tipping-point': '#F97316',
  'dmm': '#10B981',
  'pas-d-information': '#6B7280'
};

// Status display names
const STATUS_DISPLAY_NAMES = {
  'unreached': 'Unreached',
  'pioneer': 'Pioneer',
  'midway': 'Midway',
  'tipping-point': 'Tipping Point',
  'dmm': 'DMM',
  'pas-d-information': "Pas d'information"
};

const VILLAGE_REACHED_STATUSES = ['church-planted', 'multiplying', 'dmm', 'tipping-point', 'midway'];
const VILLAGE_UNREACHED_STATUSES = ['unreached', 'pioneer', 'in-progress'];

const buildVillageStatusCounts = async (match = {}) => {
  const [statusAgg, totalCount] = await Promise.all([
    Village.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$status', 'unreached'] },
          count: { $sum: 1 }
        }
      }
    ]),
    Village.countDocuments(match)
  ]);

  const counts = {
    unreached: 0,
    pioneer: 0,
    midway: 0,
    'tipping-point': 0,
    dmm: 0,
    'in-progress': 0,
    'church-planted': 0,
    multiplying: 0,
  };

  statusAgg.forEach(item => {
    if (Object.prototype.hasOwnProperty.call(counts, item._id)) {
      counts[item._id] = item.count;
    }
  });

  return { counts, totalCount };
};

/**
 * GET /api/dashboard/kpi-summary
 * Returns KPI cards data with counts by status
 * Query params:
 *   - includeJoshuaProject: boolean (default: false) - Include Joshua Project data in calculations
 */
const getKPISummary = async (req, res) => {
  try {
    // Parse includeJoshuaProject parameter (default: false)
    const includeJoshuaProject = req.query.includeJoshuaProject === 'true';
    
    // Build query - exclude Joshua Project by default
    const query = { approved: true };
    if (!includeJoshuaProject) {
      query.source = { $ne: 'Joshua Project' };
    }
    
    // Get all approved people groups
    const peopleGroups = await PeopleGroup.find(query)
      .select('engagementStatus villageName source');

    // Count by status
    const statusCounts = {
      unreached: 0,
      pioneer: 0,
      midway: 0,
      'tipping-point': 0,
      dmm: 0
    };

    peopleGroups.forEach(pg => {
      const status = pg.engagementStatus || 'unreached';
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
      }
    });

    const total = peopleGroups.length;
    
    // Calculate percentages
    const percentages = {};
    Object.keys(statusCounts).forEach(status => {
      percentages[status] = total > 0 ? Math.round((statusCounts[status] / total) * 100) : 0;
    });

    // Get unique villages with data
    const villagesWithData = new Set(
      peopleGroups
        .filter(pg => pg.villageName)
        .map(pg => pg.villageName)
    );

    // Get total villages count
    const totalVillages = await Village.countDocuments();

    const { counts: villageStatusCounts } = await buildVillageStatusCounts();

    // Calculate coverage metrics
    const withDataCount = statusCounts.unreached + statusCounts.pioneer + 
                          statusCounts.midway + statusCounts['tipping-point'] + statusCounts.dmm;
    const withDataExcludingUnreached = statusCounts.pioneer + statusCounts.midway + 
                                        statusCounts['tipping-point'] + statusCounts.dmm;

    // With Data % = (Red + Yellow + Blue + Orange + Green) / Total × 100
    const withDataPercentage = total > 0 ? Math.round((withDataCount / total) * 100) : 0;
    
    // Saturation % = Green / (Red + Yellow + Blue + Orange + Green) × 100
    const saturationPercentage = withDataCount > 0 
      ? Math.round((statusCounts.dmm / withDataCount) * 100) 
      : 0;

    res.json({
      success: true,
      data: {
        total,
        statusCounts,
        percentages,
        villagesWithData: villagesWithData.size,
        totalVillages,
        withDataPercentage,
        saturationPercentage,
        villageStatusCounts,
        statusColors: STATUS_COLORS,
        statusDisplayNames: STATUS_DISPLAY_NAMES
      }
    });
  } catch (error) {
    console.error('Error fetching KPI summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch KPI summary',
      message: error.message
    });
  }
};

/**
 * GET /api/dashboard/status-distribution
 * Returns data for donut chart showing status distribution
 * Query params:
 *   - includeJoshuaProject: boolean (default: false) - Include Joshua Project data in calculations
 */
const getStatusDistribution = async (req, res) => {
  try {
    // Parse includeJoshuaProject parameter (default: false)
    const includeJoshuaProject = req.query.includeJoshuaProject === 'true';
    
    // Build match stage - exclude Joshua Project by default
    const matchStage = { approved: true };
    if (!includeJoshuaProject) {
      matchStage.source = { $ne: 'Joshua Project' };
    }
    
    const distribution = await PeopleGroup.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $ifNull: ['$engagementStatus', 'unreached'] },
          count: { $sum: 1 },
          totalPopulation: { $sum: { $ifNull: ['$population', 0] } }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          totalPopulation: 1,
          color: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 'unreached'] }, then: '#EF4444' },
                { case: { $eq: ['$_id', 'pioneer'] }, then: '#F59E0B' },
                { case: { $eq: ['$_id', 'midway'] }, then: '#3B82F6' },
                { case: { $eq: ['$_id', 'tipping-point'] }, then: '#F97316' },
                { case: { $eq: ['$_id', 'dmm'] }, then: '#10B981' }
              ],
              default: '#6B7280'
            }
          },
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]);

    const total = distribution.reduce((sum, item) => sum + item.count, 0);

    // Add percentage to each item
    const distributionWithPercentage = distribution.map(item => ({
      ...item,
      percentage: total > 0 ? Math.round((item.count / total) * 100) : 0,
      displayName: STATUS_DISPLAY_NAMES[item.status] || item.status
    }));

    // Aggregate village status distribution
    const villagesAggregation = await Village.aggregate([
      {
        $group: {
          _id: { $ifNull: ['$status', 'unreached'] },
          count: { $sum: 1 },
          totalPopulation: { $sum: { $ifNull: ['$population', 0] } }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          totalPopulation: 1,
          color: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 'unreached'] }, then: '#EF4444' },
                { case: { $eq: ['$_id', 'pioneer'] }, then: '#F59E0B' },
                { case: { $eq: ['$_id', 'midway'] }, then: '#3B82F6' },
                { case: { $eq: ['$_id', 'tipping-point'] }, then: '#F97316' },
                { case: { $eq: ['$_id', 'dmm'] }, then: '#10B981' }
              ],
              default: '#6B7280'
            }
          },
          _id: 0
        }
      },
      { $sort: { count: -1 } }
    ]);

    const villagesTotal = villagesAggregation.reduce((sum, item) => sum + item.count, 0);

    const villages = villagesAggregation.map(item => ({
      ...item,
      percentage: villagesTotal > 0 ? Math.round((item.count / villagesTotal) * 100) : 0,
      displayName: STATUS_DISPLAY_NAMES[item.status] || item.status
    }));

    res.json({
      success: true,
      data: {
        distribution: distributionWithPercentage,
        total,
        villages,
        villagesTotal,
        statusColors: STATUS_COLORS
      }
    });
  } catch (error) {
    console.error('Error fetching status distribution:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch status distribution',
      message: error.message
    });
  }
};

/**
 * GET /api/dashboard/coverage-gauge
 * Returns data for gauge chart showing coverage percentage
 * Query params:
 *   - includeJoshuaProject: boolean (default: false) - Include Joshua Project data in calculations
 */
const getCoverageGauge = async (req, res) => {
  try {
    // Parse includeJoshuaProject parameter (default: false)
    const includeJoshuaProject = req.query.includeJoshuaProject === 'true';
    
    // Build query - exclude Joshua Project by default
    const baseQuery = { 
      villageName: { $exists: true, $ne: null, $ne: '' },
      approved: true 
    };
    if (!includeJoshuaProject) {
      baseQuery.source = { $ne: 'Joshua Project' };
    }
    
    // Get villages with people groups data
    const villagesWithPeopleGroups = await PeopleGroup.distinct('villageName', baseQuery);

    // Get total villages
    const totalVillages = await Village.countDocuments();

    // Build match stage for aggregation
    const matchStage = { approved: true };
    if (!includeJoshuaProject) {
      matchStage.source = { $ne: 'Joshua Project' };
    }

    // Get people groups stats
    const peopleGroupStats = await PeopleGroup.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withData: {
            $sum: {
              $cond: [
                { $in: ['$engagementStatus', ['unreached', 'pioneer', 'midway', 'tipping-point', 'dmm']] },
                1,
                0
              ]
            }
          },
          dmm: {
            $sum: { $cond: [{ $eq: ['$engagementStatus', 'dmm'] }, 1, 0] }
          }
        }
      }
    ]);

    const stats = peopleGroupStats[0] || { total: 0, withData: 0, dmm: 0 };

    // With Data % = villages with data / total villages × 100
    const villagesCoveragePercentage = totalVillages > 0 
      ? Math.round((villagesWithPeopleGroups.length / totalVillages) * 100) 
      : 0;

    // Saturation % = DMM / total with data × 100
    const saturationPercentage = stats.withData > 0 
      ? Math.round((stats.dmm / stats.withData) * 100) 
      : 0;

    // Aggregate village status counts
    const { counts: villageStatusCounts, totalCount: villagesTotal } = await buildVillageStatusCounts();

    const villageCoverage = {
      withData: villagesWithPeopleGroups.length,
      withoutData: Math.max(totalVillages - villagesWithPeopleGroups.length, 0),
      total: totalVillages
    };

    res.json({
      success: true,
      data: {
        villagesWithData: villagesWithPeopleGroups.length,
        totalVillages,
        villagesCoveragePercentage,
        totalPeopleGroups: stats.total,
        peopleGroupsWithData: stats.withData,
        dmmCount: stats.dmm,
        saturationPercentage,
        villageStatusCounts,
        villageCoverage,
        reachedVillages: VILLAGE_REACHED_STATUSES.reduce((sum, status) => sum + (villageStatusCounts[status] || 0), 0),
        unreachedVillages: VILLAGE_UNREACHED_STATUSES.reduce((sum, status) => sum + (villageStatusCounts[status] || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error fetching coverage gauge:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch coverage gauge',
      message: error.message
    });
  }
};

/**
 * GET /api/dashboard/hierarchical-data
 * Returns hierarchical data for drill-down table
 * Levels: Country → Region → Department → District (Arrondissement) → Village
 * Query params:
 *   - includeJoshuaProject: boolean (default: false) - Include Joshua Project data in calculations
 */
const getHierarchicalData = async (req, res) => {
  try {
    const { 
      level = 'country', 
      parent = null,
      page = 1, 
      limit = 20,
      sortBy = 'name',
      sortOrder = 'asc',
      includeJoshuaProject = 'false'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    // Build match stage - exclude Joshua Project by default
    let matchStage = { approved: true };
    if (includeJoshuaProject !== 'true') {
      matchStage.source = { $ne: 'Joshua Project' };
    }
    let groupField;
    let nextLevel;

    // Determine grouping based on level
    switch (level) {
      case 'country':
        groupField = '$country';
        nextLevel = 'region';
        break;
      case 'region':
        groupField = '$region';
        nextLevel = 'department';
        if (parent) matchStage.country = parent;
        break;
      case 'department':
        groupField = '$departement';
        nextLevel = 'district';
        if (parent) matchStage.region = parent;
        break;
      case 'district':
        groupField = '$arrondissement';
        nextLevel = 'village';
        if (parent) matchStage.departement = parent;
        break;
      case 'village':
        groupField = '$villageName';
        nextLevel = null;
        if (parent) matchStage.arrondissement = parent;
        break;
      default:
        groupField = '$country';
        nextLevel = 'region';
    }

    // Aggregation pipeline
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: groupField,
          total: { $sum: 1 },
          unreached: { $sum: { $cond: [{ $eq: ['$engagementStatus', 'unreached'] }, 1, 0] } },
          pioneer: { $sum: { $cond: [{ $eq: ['$engagementStatus', 'pioneer'] }, 1, 0] } },
          midway: { $sum: { $cond: [{ $eq: ['$engagementStatus', 'midway'] }, 1, 0] } },
          tippingPoint: { $sum: { $cond: [{ $eq: ['$engagementStatus', 'tipping-point'] }, 1, 0] } },
          dmm: { $sum: { $cond: [{ $eq: ['$engagementStatus', 'dmm'] }, 1, 0] } },
          totalPopulation: { $sum: { $ifNull: ['$population', 0] } },
          totalChurches: { $sum: { $ifNull: ['$numberOfChurches', 0] } }
        }
      },
      {
        $match: {
          _id: { $ne: null, $ne: '' }
        }
      },
      {
        $project: {
          name: '$_id',
          total: 1,
          unreached: 1,
          pioneer: 1,
          midway: 1,
          tippingPoint: 1,
          dmm: 1,
          totalPopulation: 1,
          totalChurches: 1,
          withData: { $add: ['$unreached', '$pioneer', '$midway', '$tippingPoint', '$dmm'] },
          withDataPercentage: {
            $cond: [
              { $gt: ['$total', 0] },
              {
                $round: [
                  { $multiply: [
                    { $divide: [
                      { $add: ['$unreached', '$pioneer', '$midway', '$tippingPoint', '$dmm'] },
                      '$total'
                    ] },
                    100
                  ] },
                  1
                ]
              },
              0
            ]
          },
          saturationPercentage: {
            $cond: [
              { $gt: [{ $add: ['$unreached', '$pioneer', '$midway', '$tippingPoint', '$dmm'] }, 0] },
              {
                $round: [
                  { $multiply: [
                    { $divide: [
                      '$dmm',
                      { $add: ['$unreached', '$pioneer', '$midway', '$tippingPoint', '$dmm'] }
                    ] },
                    100
                  ] },
                  1
                ]
              },
              0
            ]
          },
          _id: 0
        }
      }
    ];

    // Add sorting
    const sortField = sortBy === 'name' ? 'name' : sortBy;
    pipeline.push({ $sort: { [sortField]: sortDirection } });

    // Get total count before pagination
    const countPipeline = [...pipeline.slice(0, -1)];
    countPipeline.push({ $count: 'total' });
    const countResult = await PeopleGroup.aggregate(countPipeline);
    const totalCount = countResult[0]?.total || 0;

    // Add pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });

    const data = await PeopleGroup.aggregate(pipeline);

    // Add hasChildren flag
    const dataWithChildren = data.map(item => ({
      ...item,
      hasChildren: nextLevel !== null,
      nextLevel
    }));

    res.json({
      success: true,
      data: {
        items: dataWithChildren,
        level,
        parent,
        nextLevel,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / parseInt(limit))
        },
        statusColors: STATUS_COLORS
      }
    });
  } catch (error) {
    console.error('Error fetching hierarchical data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch hierarchical data',
      message: error.message
    });
  }
};

/**
 * GET /api/villages/:id/details
 * Returns detailed village information including population
 */
const getVillageDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Get village by ID
    const village = await Village.findById(id);

    if (!village) {
      return res.status(404).json({
        success: false,
        error: 'Village not found'
      });
    }

    // Get people groups in this village
    const peopleGroups = await PeopleGroup.find({
      $or: [
        { villageName: village.name },
        { village: village._id }
      ],
      approved: true
    }).select('name engagementStatus population numberOfChurches churchGeneration');

    // Calculate status breakdown
    const statusBreakdown = {
      unreached: 0,
      pioneer: 0,
      midway: 0,
      'tipping-point': 0,
      dmm: 0
    };

    let totalPeopleGroupPopulation = 0;
    let totalChurches = 0;

    peopleGroups.forEach(pg => {
      const status = pg.engagementStatus || 'unreached';
      if (statusBreakdown.hasOwnProperty(status)) {
        statusBreakdown[status]++;
      }
      totalPeopleGroupPopulation += pg.population || 0;
      totalChurches += pg.numberOfChurches || 0;
    });

    const totalPeopleGroups = peopleGroups.length;

    // Calculate percentages
    const percentages = {};
    Object.keys(statusBreakdown).forEach(status => {
      percentages[status] = totalPeopleGroups > 0 
        ? Math.round((statusBreakdown[status] / totalPeopleGroups) * 100) 
        : 0;
    });

    // Determine village status based on thresholds
    let villageStatus = 'pas-d-information';
    if (totalPeopleGroups > 0) {
      if (percentages.dmm >= 30) villageStatus = 'dmm';
      else if (percentages['tipping-point'] >= 40) villageStatus = 'tipping-point';
      else if (percentages.midway >= 50) villageStatus = 'midway';
      else if (percentages.pioneer >= 70) villageStatus = 'pioneer';
      else if (percentages.unreached >= 90) villageStatus = 'unreached';
      else villageStatus = 'pioneer';
    }

    res.json({
      success: true,
      data: {
        _id: village._id,
        name: village.name,
        population: village.population || 0,
        region: village.region,
        departement: village.departement,
        arrondissement: village.arrondissement,
        country: village.country,
        location: village.location,
        boundary: village.boundary,
        status: villageStatus,
        statusColor: STATUS_COLORS[villageStatus],
        statusDisplay: STATUS_DISPLAY_NAMES[villageStatus],
        totalPeopleGroups,
        totalChurches,
        totalPeopleGroupPopulation,
        statusBreakdown,
        percentages,
        peopleGroups: peopleGroups.map(pg => ({
          _id: pg._id,
          name: pg.name,
          status: pg.engagementStatus,
          population: pg.population,
          churches: pg.numberOfChurches,
          generation: pg.churchGeneration
        })),
        statusColors: STATUS_COLORS,
        statusDisplayNames: STATUS_DISPLAY_NAMES
      }
    });
  } catch (error) {
    console.error('Error fetching village details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch village details',
      message: error.message
    });
  }
};

/**
 * GET /api/villages/details/by-name/:name
 * Returns detailed village information by name (for polygon clicks)
 */
const getVillageDetailsByName = async (req, res) => {
  try {
    const { name } = req.params;
    const decodedName = decodeURIComponent(name);

    // Get village by name
    const village = await Village.findOne({ name: decodedName });

    // Get people groups in this village (by name match)
    const peopleGroups = await PeopleGroup.find({
      villageName: decodedName,
      approved: true
    }).select('name engagementStatus population numberOfChurches churchGeneration');

    // Calculate status breakdown
    const statusBreakdown = {
      unreached: 0,
      pioneer: 0,
      midway: 0,
      'tipping-point': 0,
      dmm: 0
    };

    let totalPeopleGroupPopulation = 0;
    let totalChurches = 0;

    peopleGroups.forEach(pg => {
      const status = pg.engagementStatus || 'unreached';
      if (statusBreakdown.hasOwnProperty(status)) {
        statusBreakdown[status]++;
      }
      totalPeopleGroupPopulation += pg.population || 0;
      totalChurches += pg.numberOfChurches || 0;
    });

    const totalPeopleGroups = peopleGroups.length;

    // Calculate percentages
    const percentages = {};
    Object.keys(statusBreakdown).forEach(status => {
      percentages[status] = totalPeopleGroups > 0 
        ? Math.round((statusBreakdown[status] / totalPeopleGroups) * 100) 
        : 0;
    });

    // Determine village status based on thresholds
    let villageStatus = 'pas-d-information';
    if (totalPeopleGroups > 0) {
      if (percentages.dmm >= 30) villageStatus = 'dmm';
      else if (percentages['tipping-point'] >= 40) villageStatus = 'tipping-point';
      else if (percentages.midway >= 50) villageStatus = 'midway';
      else if (percentages.pioneer >= 70) villageStatus = 'pioneer';
      else if (percentages.unreached >= 90) villageStatus = 'unreached';
      else villageStatus = 'pioneer';
    }

    res.json({
      success: true,
      data: {
        _id: village?._id || null,
        name: decodedName,
        population: village?.population || 0,
        region: village?.region || null,
        departement: village?.departement || null,
        arrondissement: village?.arrondissement || null,
        country: village?.country || null,
        location: village?.location || null,
        status: villageStatus,
        statusColor: STATUS_COLORS[villageStatus],
        statusDisplay: STATUS_DISPLAY_NAMES[villageStatus],
        totalPeopleGroups,
        totalChurches,
        totalPeopleGroupPopulation,
        statusBreakdown,
        percentages,
        peopleGroups: peopleGroups.map(pg => ({
          _id: pg._id,
          name: pg.name,
          status: pg.engagementStatus,
          population: pg.population,
          churches: pg.numberOfChurches,
          generation: pg.churchGeneration
        })),
        statusColors: STATUS_COLORS,
        statusDisplayNames: STATUS_DISPLAY_NAMES
      }
    });
  } catch (error) {
    console.error('Error fetching village details by name:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch village details',
      message: error.message
    });
  }
};

module.exports = {
  getKPISummary,
  getStatusDistribution,
  getCoverageGauge,
  getHierarchicalData,
  getVillageDetails,
  getVillageDetailsByName
};
