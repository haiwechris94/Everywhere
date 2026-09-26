/**
 * Analytics Routes - Statistics, heatmaps, and timeline data
 */
const express = require('express');
const mongoose = require('mongoose');
const turf = require('@turf/turf');
const Village = require('../models/Village');
const PeopleGroup = require('../models/PeopleGroup');
const Church = require('../models/Church');
const ActivityLog = require('../models/ActivityLog');
const { auth, optionalAuth } = require('../middleware/auth');
const { isSupervisorOrAdmin } = require('../middleware/roles');
const { generateAnalysisInsights } = require('../services/deepseekService');

const router = express.Router();

/**
 * GET /analytics/stats - Get regional statistics and coverage percentages
 */
router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const { region, country, organization } = req.query;

    const filters = {};
    if (region) filters.region = region;
    if (country) filters.country = country;
    if (organization) filters.organization = mongoose.Types.ObjectId(organization);

    // Village statistics
    const villageStats = await Village.aggregate([
      { $match: filters },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          totalPopulation: { $sum: '$population' },
          avgCoverage: { $avg: '$coveragePercentage' },
          byStatus: {
            $push: '$status'
          },
          byCoverage: {
            $push: '$coverageStatus'
          }
        }
      }
    ]);

    // People group statistics
    const pgFilters = { approved: true, ...filters };
    const peopleGroupStats = await PeopleGroup.getStatusStats(pgFilters);

    // Church statistics
    const churchStats = await Church.aggregate([
      { $match: filters.village ? { village: filters.village } : {} },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalMembers: { $sum: '$memberCount' }
        }
      }
    ]);

    // Coverage calculation
    const coverageStats = await Village.getCoverageStats(filters);

    // Calculate percentages
    const villageData = villageStats[0] || { total: 0, totalPopulation: 0, avgCoverage: 0 };
    const statusCounts = {};
    const coverageCounts = {};

    if (villageData.byStatus) {
      villageData.byStatus.forEach(s => {
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });
    }

    if (villageData.byCoverage) {
      villageData.byCoverage.forEach(c => {
        coverageCounts[c] = (coverageCounts[c] || 0) + 1;
      });
    }

    res.json({
      villages: {
        total: villageData.total,
        totalPopulation: villageData.totalPopulation,
        averageCoverage: Math.round(villageData.avgCoverage || 0),
        byStatus: statusCounts,
        byCoverage: coverageCounts,
        coverageBreakdown: coverageStats,
      },
      peopleGroups: {
        byStatus: peopleGroupStats,
        total: peopleGroupStats.reduce((sum, s) => sum + s.count, 0),
      },
      churches: {
        byStatus: churchStats,
        total: churchStats.reduce((sum, s) => sum + s.count, 0),
        totalMembers: churchStats.reduce((sum, s) => sum + (s.totalMembers || 0), 0),
      },
      filters: { region, country, organization },
    });
  } catch (error) {
    console.error('Error fetching analytics stats:', error);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /analytics/heatmap - Get heatmap data for status distribution
 */
router.get('/heatmap', optionalAuth, async (req, res) => {
  try {
    const { type = 'people-groups', status, bounds } = req.query;

    let Model, statusField;
    if (type === 'villages') {
      Model = Village;
      statusField = 'status';
    } else {
      Model = PeopleGroup;
      statusField = 'status';
    }

    const query = {};
    if (type === 'people-groups') {
      query.approved = true;
    }
    if (status) {
      query[statusField] = status;
    }

    // Parse bounds if provided (sw_lng,sw_lat,ne_lng,ne_lat)
    if (bounds) {
      const [swLng, swLat, neLng, neLat] = bounds.split(',').map(Number);
      query.location = {
        $geoWithin: {
          $box: [[swLng, swLat], [neLng, neLat]]
        }
      };
    }

    // Get points for heatmap
    const points = await Model.find(query)
      .select('location status statusColor population progressPercentage')
      .lean();

    // Transform to heatmap format
    const heatmapData = points
      .filter(p => p.location?.coordinates)
      .map(p => ({
        lat: p.location.coordinates[1],
        lng: p.location.coordinates[0],
        intensity: p.progressPercentage || p.population || 1,
        status: p.status,
        color: p.statusColor,
      }));

    // Group by status for legend
    const statusGroups = {};
    heatmapData.forEach(p => {
      if (!statusGroups[p.status]) {
        statusGroups[p.status] = { count: 0, color: p.color };
      }
      statusGroups[p.status].count++;
    });

    res.json({
      type,
      points: heatmapData,
      total: heatmapData.length,
      statusGroups,
      bounds: bounds || null,
    });
  } catch (error) {
    console.error('Error fetching heatmap data:', error);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /analytics/timeline - Get progress timeline data
 */
router.get('/timeline', optionalAuth, async (req, res) => {
  try {
    const { 
      type = 'people-groups', 
      period = '30', // days
      groupBy = 'day',
      region,
      country 
    } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    const matchStage = {
      createdAt: { $gte: startDate },
    };
    if (region) matchStage.region = region;
    if (country) matchStage.country = country;

    let Model;
    if (type === 'villages') {
      Model = Village;
    } else if (type === 'churches') {
      Model = Church;
    } else {
      Model = PeopleGroup;
      matchStage.approved = true;
    }

    // Group by time period
    let dateGroup;
    if (groupBy === 'week') {
      dateGroup = {
        year: { $year: '$createdAt' },
        week: { $week: '$createdAt' },
      };
    } else if (groupBy === 'month') {
      dateGroup = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
      };
    } else {
      dateGroup = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
      };
    }

    const timeline = await Model.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: dateGroup,
          count: { $sum: 1 },
          statuses: { $push: '$status' },
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } },
    ]);

    // Format timeline data
    const formattedTimeline = timeline.map(t => {
      let date;
      if (groupBy === 'week') {
        // Approximate date from week number
        const d = new Date(t._id.year, 0, 1);
        d.setDate(d.getDate() + (t._id.week - 1) * 7);
        date = d.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        date = `${t._id.year}-${String(t._id.month).padStart(2, '0')}`;
      } else {
        date = `${t._id.year}-${String(t._id.month).padStart(2, '0')}-${String(t._id.day).padStart(2, '0')}`;
      }

      // Count statuses
      const statusBreakdown = {};
      t.statuses.forEach(s => {
        statusBreakdown[s] = (statusBreakdown[s] || 0) + 1;
      });

      return {
        date,
        count: t.count,
        statusBreakdown,
      };
    });

    // Calculate cumulative totals
    let cumulative = 0;
    const cumulativeTimeline = formattedTimeline.map(t => {
      cumulative += t.count;
      return { ...t, cumulative };
    });

    res.json({
      type,
      period: parseInt(period),
      groupBy,
      timeline: cumulativeTimeline,
      total: cumulative,
    });
  } catch (error) {
    console.error('Error fetching timeline data:', error);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /analytics/activity - Get activity analytics (supervisor only)
 */
router.get('/activity', auth, isSupervisorOrAdmin, async (req, res) => {
  try {
    const { days = 30, organization } = req.query;

    const options = { days: parseInt(days) };
    if (organization) {
      options.organization = organization;
    } else if (req.user.role === 'supervisor' && req.user.organization) {
      options.organization = req.user.organization;
    }

    const [dailyActivity, actionStats, geoDistribution] = await Promise.all([
      ActivityLog.getDailyActivity(options),
      ActivityLog.getStats(options),
      ActivityLog.getGeographicDistribution(options),
    ]);

    res.json({
      period: parseInt(days),
      dailyActivity,
      actionStats,
      geoDistribution,
    });
  } catch (error) {
    console.error('Error fetching activity analytics:', error);
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /analytics/regions - Get list of regions with counts
 */
router.get('/regions', optionalAuth, async (req, res) => {
  try {
    const { country } = req.query;

    const matchStage = {};
    if (country) matchStage.country = country;

    const regions = await Village.aggregate([
      { $match: { ...matchStage, region: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { region: '$region', country: '$country' },
          villageCount: { $sum: 1 },
          totalPopulation: { $sum: '$population' },
        }
      },
      {
        $project: {
          region: '$_id.region',
          country: '$_id.country',
          villageCount: 1,
          totalPopulation: 1,
          _id: 0,
        }
      },
      { $sort: { villageCount: -1 } },
    ]);

    res.json({
      regions,
      total: regions.length,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /analytics/countries - Get list of countries with counts
 */
router.get('/countries', optionalAuth, async (req, res) => {
  try {
    const countries = await Village.aggregate([
      { $match: { country: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$country',
          villageCount: { $sum: 1 },
          totalPopulation: { $sum: '$population' },
          regions: { $addToSet: '$region' },
        }
      },
      {
        $project: {
          country: '$_id',
          villageCount: 1,
          totalPopulation: 1,
          regionCount: { $size: '$regions' },
          _id: 0,
        }
      },
      { $sort: { villageCount: -1 } },
    ]);

    res.json({
      countries,
      total: countries.length,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /analytics/user-summary - Get current user's activity summary
 */
router.get('/user-summary', auth, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const [activitySummary, createdContent] = await Promise.all([
      ActivityLog.getUserActivitySummary(req.user._id, parseInt(days)),
      Promise.all([
        Village.countDocuments({ createdBy: req.user._id }),
        PeopleGroup.countDocuments({ createdBy: req.user._id }),
        Church.countDocuments({ createdBy: req.user._id }),
      ]),
    ]);

    res.json({
      period: parseInt(days),
      activitySummary,
      createdContent: {
        villages: createdContent[0],
        peopleGroups: createdContent[1],
        churches: createdContent[2],
        total: createdContent.reduce((a, b) => a + b, 0),
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

/**
 * GET /analytics/ai-summary - AI-powered mission insights using DeepSeek
 */
router.get('/ai-summary', optionalAuth, async (req, res) => {
  try {
    // Gather real data for AI summary
    const [villageStats, pgStats, recentActivity] = await Promise.all([
      Village.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      PeopleGroup.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$engagementStatus', count: { $sum: 1 } } }
      ]),
      ActivityLog.find().sort({ createdAt: -1 }).limit(5).lean()
    ]);

    const totalVillages = villageStats.reduce((s, v) => s + v.count, 0);
    const reachedVillages = villageStats.filter(v => ['church-planted', 'multiplying', 'dmm', 'tipping-point', 'midway'].includes(v._id)).reduce((s, v) => s + v.count, 0);
    const dmmGroups = pgStats.find(p => p._id === 'dmm')?.count || 0;
    const unreachedGroups = pgStats.find(p => p._id === 'unreached')?.count || 0;
    const pioneerGroups = pgStats.find(p => p._id === 'pioneer')?.count || 0;
    const totalGroups = pgStats.reduce((s, p) => s + p.count, 0);
    const coveragePct = totalVillages > 0 ? Math.round(reachedVillages / totalVillages * 100) : 0;

    // Build criteriaScores from real data for DeepSeek
    const criteriaScores = [
      { criterionId: 'church_multiplication', criterionName: 'Church Multiplication', score: dmmGroups > 10 ? 5 : dmmGroups > 5 ? 4 : dmmGroups > 2 ? 3 : dmmGroups > 0 ? 2 : 1, weight: 3 },
      { criterionId: 'disciple_replication', criterionName: 'Disciple Replication', score: coveragePct > 60 ? 5 : coveragePct > 40 ? 4 : coveragePct > 20 ? 3 : coveragePct > 5 ? 2 : 1, weight: 3 },
      { criterionId: 'leader_development', criterionName: 'Leader Development', score: pioneerGroups > 5 ? 4 : pioneerGroups > 0 ? 3 : 2, weight: 3 },
      { criterionId: 'church_gathering', criterionName: 'Church Gathering', score: reachedVillages > 20 ? 5 : reachedVillages > 10 ? 4 : reachedVillages > 5 ? 3 : reachedVillages > 0 ? 2 : 1, weight: 2 },
      { criterionId: 'prayer', criterionName: 'Prayer', score: 3, weight: 2 },
    ];

    const overallScore = Math.round(
      criteriaScores.reduce((s, c) => s + c.score * c.weight, 0) /
      criteriaScores.reduce((s, c) => s + c.weight, 0) * 20
    );

    const analysisData = {
      peopleGroupName: 'Tableau de bord global',
      villageName: null,
      country: 'Afrique Centrale',
      criteriaScores,
      overallScore,
      priorityLevel: coveragePct < 20 ? 'critical' : coveragePct < 40 ? 'high' : coveragePct < 60 ? 'moderate' : 'low',
      remarks: `Données globales: ${totalVillages} villages, ${totalGroups} groupes de peuples, ${reachedVillages} villages atteints (${coveragePct}%), ${dmmGroups} mouvements DMM actifs.`,
      recommendations: null,
    };

    // Try DeepSeek AI
    const aiResult = await generateAnalysisInsights(analysisData);

    if (aiResult.success) {
      // Parse AI response into bullet points for the dashboard
      const rawText = aiResult.rawResponse || aiResult.interpretation || '';
      const lines = rawText.split('\n').filter(l => l.trim().length > 20);
      const insights = lines.slice(0, 3).map(l => l.replace(/^\*+\s*/, '').replace(/^-\s*/, '').trim());
      const recommendations = lines.slice(3, 6).map(l => l.replace(/^\*+\s*/, '').replace(/^-\s*/, '').trim());

      return res.json({
        insights: insights.length > 0 ? insights : [
          `${reachedVillages} villages atteints sur ${totalVillages} (${coveragePct}% de couverture)`,
          `${dmmGroups} groupes de peuples avec des mouvements DMM actifs sur ${totalGroups} au total`,
        ],
        alerts: totalVillages === 0 ? ['Aucune donnée de village disponible — commencez par ajouter des villages'] : [],
        recommendations: recommendations.length > 0 ? recommendations : [],
        aiPowered: true,
      });
    }

    // Fallback to static insights
    res.json({
      insights: [
        `${reachedVillages} out of ${totalVillages} villages have been reached (${coveragePct}% coverage)`,
        `${dmmGroups} people groups have active DMM movements out of ${totalGroups} total`,
        `Mission momentum is ${dmmGroups > 5 ? 'strong' : 'growing'} across tracked regions`
      ],
      alerts: totalVillages === 0 ? ['No village data available yet — start by adding villages'] : [],
      recommendations: [
        'Focus outreach on unreached villages in high-density regions',
        'Strengthen discipleship in pioneer-stage people groups',
        'Document new DMM movements to track multiplication'
      ],
      aiPowered: false,
    });
  } catch (error) {
    console.error('[Analytics] /ai-summary error:', error.message);
    // Return static fallback instead of 500 so the dashboard still loads
    res.json({
      insights: [
        'Mission data is being gathered — check back shortly',
        'Add villages and people groups to see AI-powered insights',
        'DMM movements are tracked across all registered regions',
      ],
      alerts: ['AI summary temporarily unavailable — using static insights'],
      recommendations: [
        'Focus outreach on unreached villages in high-density regions',
        'Strengthen discipleship in pioneer-stage people groups',
        'Document new DMM movements to track multiplication',
      ],
      aiPowered: false,
    });
  }
});

/**
 * GET /analytics/weekly-activity - Weekly activity chart data
 */
router.get('/weekly-activity', optionalAuth, async (req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const result = { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0 };

    try {
      const activities = await ActivityLog.aggregate([
        { $match: { createdAt: { $gte: startOfWeek } } },
        { $group: { _id: { $dayOfWeek: '$createdAt' }, count: { $sum: 1 } } }
      ]);
      // MongoDB $dayOfWeek: 1=Sun, 2=Mon, ..., 7=Sat
      activities.forEach(a => {
        const dayIndex = a._id - 1; // 0=Sun
        if (days[dayIndex]) result[days[dayIndex]] = a.count;
      });
    } catch (e) {
      // fallback: return zeros
    }

    // If all zeros (no ActivityLog data), try Village createdAt
    const hasData = Object.values(result).some(v => v > 0);
    if (!hasData) {
      try {
        const villageActivity = await Village.aggregate([
          { $match: { createdAt: { $gte: startOfWeek } } },
          { $group: { _id: { $dayOfWeek: '$createdAt' }, count: { $sum: 1 } } }
        ]);
        villageActivity.forEach(a => {
          const dayIndex = a._id - 1;
          if (days[dayIndex]) result[days[dayIndex]] = a.count;
        });
      } catch (e) {}
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * GET /analytics/monthly-activity - Monthly activity chart data (current year)
 */
router.get('/monthly-activity', optionalAuth, async (req, res) => {
  try {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1); // Jan 1st current year

    const monthKeys = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const result = {};
    monthKeys.forEach(k => { result[k] = 0; });

    // Try ActivityLog first
    let hasData = false;
    try {
      const activities = await ActivityLog.aggregate([
        { $match: { createdAt: { $gte: startOfYear } } },
        { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 } } }
      ]);
      // MongoDB $month: 1=Jan ... 12=Dec
      activities.forEach(a => {
        const key = monthKeys[a._id - 1];
        if (key) { result[key] = a.count; hasData = true; }
      });
    } catch (e) {}

    // Fallback: try PeopleGroup createdAt
    if (!hasData) {
      try {
        const pgActivity = await PeopleGroup.aggregate([
          { $match: { approved: true, createdAt: { $gte: startOfYear } } },
          { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 } } }
        ]);
        pgActivity.forEach(a => {
          const key = monthKeys[a._id - 1];
          if (key) { result[key] = a.count; hasData = true; }
        });
      } catch (e) {}
    }

    // Fallback 2: Village createdAt
    if (!hasData) {
      try {
        const villageActivity = await Village.aggregate([
          { $match: { createdAt: { $gte: startOfYear } } },
          { $group: { _id: { $month: '$createdAt' }, count: { $sum: 1 } } }
        ]);
        villageActivity.forEach(a => {
          const key = monthKeys[a._id - 1];
          if (key) result[key] = a.count;
        });
      } catch (e) {}
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * GET /analytics/reached-villages - Count of reached villages with trend
 */
router.get('/reached-villages', optionalAuth, async (req, res) => {
  try {
    const includeJP = req.query.includeJoshuaProject === 'true' || req.query.includeJoshuaProject === '1';
    const reachedStatuses = ['church-planted', 'multiplying', 'dmm', 'tipping-point', 'midway'];
    const jpReachedStatuses = ['dmm', 'tipping-point', 'midway'];
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const tasks = [
      Village.countDocuments({ status: { $in: reachedStatuses } }),
      Village.countDocuments({ status: { $in: reachedStatuses }, createdAt: { $lt: cutoff } })
    ];
    if (includeJP) {
      tasks.push(
        PeopleGroup.countDocuments({ source: 'Joshua Project', engagementStatus: { $in: jpReachedStatuses } }),
        PeopleGroup.countDocuments({ source: 'Joshua Project', engagementStatus: { $in: jpReachedStatuses }, createdAt: { $lt: cutoff } })
      );
    }
    const [current, lastMonth, jpCurrent = 0, jpLastMonth = 0] = await Promise.all(tasks);
    const total = current + jpCurrent;
    const totalLast = lastMonth + jpLastMonth;
    const trend = totalLast > 0 ? Math.round(((total - totalLast) / totalLast) * 100) : 0;
    res.json({ count: total, trend, label: 'Reached Villages', includeJoshuaProject: includeJP });
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * GET /analytics/unreached-villages - Count of unreached villages with trend
 */
router.get('/unreached-villages', optionalAuth, async (req, res) => {
  try {
    const includeJP = req.query.includeJoshuaProject === 'true' || req.query.includeJoshuaProject === '1';
    const unreachedStatuses = ['unreached', 'pioneer', 'in-progress'];
    const jpUnreachedStatuses = ['unreached', 'pioneer'];
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const tasks = [
      Village.countDocuments({ status: { $in: unreachedStatuses } }),
      Village.countDocuments({ status: { $in: unreachedStatuses }, createdAt: { $lt: cutoff } })
    ];
    if (includeJP) {
      tasks.push(
        PeopleGroup.countDocuments({ source: 'Joshua Project', engagementStatus: { $in: jpUnreachedStatuses } }),
        PeopleGroup.countDocuments({ source: 'Joshua Project', engagementStatus: { $in: jpUnreachedStatuses }, createdAt: { $lt: cutoff } })
      );
    }
    const [current, lastMonth, jpCurrent = 0, jpLastMonth = 0] = await Promise.all(tasks);
    const total = current + jpCurrent;
    const totalLast = lastMonth + jpLastMonth;
    const trend = totalLast > 0 ? Math.round(((total - totalLast) / totalLast) * 100) : 0;
    res.json({ count: total, trend, label: 'Unreached Villages', includeJoshuaProject: includeJP });
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * GET /analytics/dmm-growth - DMM movement growth percentage
 */
router.get('/dmm-growth', optionalAuth, async (req, res) => {
  try {
    const [dmmNow, dmmLastMonth, totalNow] = await Promise.all([
      PeopleGroup.countDocuments({ approved: true, engagementStatus: 'dmm' }),
      PeopleGroup.countDocuments({
        approved: true,
        engagementStatus: 'dmm',
        createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      }),
      PeopleGroup.countDocuments({ approved: true })
    ]);
    const growth = dmmLastMonth > 0 ? parseFloat(((dmmNow - dmmLastMonth) / dmmLastMonth * 100).toFixed(1)) : (dmmNow > 0 ? 100 : 0);
    const percentage = totalNow > 0 ? parseFloat((dmmNow / totalNow * 100).toFixed(1)) : 0;
    res.json({ growth, dmmCount: dmmNow, totalCount: totalNow, percentage });
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * GET /analytics/top-regions - Top active regions by village count
 */
router.get('/top-regions', optionalAuth, async (req, res) => {
  try {
    const regions = await Village.aggregate([
      { $match: { region: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$region',
          count: { $sum: 1 },
          country: { $first: '$country' },
        }
      },
      { $project: { region: '$_id', count: 1, country: 1, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]);
    res.json(regions);
  } catch (error) {
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * GET /analytics/people-groups-stats - Rich people groups analytics
 */
router.get('/people-groups-stats', optionalAuth, async (req, res) => {
  try {
    const { region, country } = req.query;
    const baseMatch = { approved: true };
    if (country) baseMatch.country = country;
    if (region) baseMatch.region = region;

    // Run all aggregations in parallel (including distinct regions list)
    const [totalsResult, statusDist, top5, religionDist, languageDist, rawRegions, donorDist, startYearDist] = await Promise.all([
      // Totals: count, population, believers, churches
      PeopleGroup.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            totalPopulation: { $sum: '$population' },
            totalBelievers: { $sum: '$believersCount' },
            totalChurches: { $sum: '$churchesCount' },
          },
        },
      ]),

      // Status distribution by engagementStatus
      PeopleGroup.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: '$engagementStatus',
            count: { $sum: 1 },
            totalPopulation: { $sum: '$population' },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Top 5 by population (with location for map navigation)
      PeopleGroup.find(baseMatch)
        .sort({ population: -1 })
        .limit(5)
        .select('name population engagementStatus region believersCount churchesCount location')
        .lean(),

      // Religion distribution (top 5)
      PeopleGroup.aggregate([
        { $match: { ...baseMatch, religion: { $exists: true, $ne: null, $ne: '' } } },
        { $group: { _id: '$religion', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),

      // Language distribution (top 5)
      PeopleGroup.aggregate([
        { $match: { ...baseMatch, language: { $exists: true, $ne: null, $ne: '' } } },
        { $group: { _id: '$language', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),

      // Distinct regions (always unfiltered — full list for the selector)
      PeopleGroup.distinct('region', { approved: true }),

      // Donor distribution (répartition des peuples par donateur, top 10)
      PeopleGroup.aggregate([
        { $match: { ...baseMatch, donor: { $exists: true, $ne: null, $ne: '' } } },
        { $group: { _id: '$donor', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // Start-year distribution (répartition par année de début, ascendant)
      PeopleGroup.aggregate([
        { $match: { ...baseMatch, startYear: { $exists: true, $ne: null, $gte: 1900, $lte: 2100 } } },
        { $group: { _id: '$startYear', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const totals = totalsResult[0] || {
      totalCount: 0,
      totalPopulation: 0,
      totalBelievers: 0,
      totalChurches: 0,
    };

    const evangelismRate =
      totals.totalPopulation > 0
        ? Math.round((totals.totalBelievers / totals.totalPopulation) * 100 * 10) / 10
        : 0;

    // Normalise status distribution into a keyed map
    const statusMap = {};
    statusDist.forEach(s => {
      statusMap[s._id || 'unknown'] = {
        status: s._id || 'unknown',
        count: s.count,
        totalPopulation: s.totalPopulation,
      };
    });

    const orderedStatuses = ['unreached', 'pioneer', 'midway', 'tipping-point', 'dmm'];
    const statusDistribution = orderedStatuses.map(key => ({
      status: key,
      count: statusMap[key]?.count || 0,
      totalPopulation: statusMap[key]?.totalPopulation || 0,
    }));

    // Clean and sort the regions list
    const regions = rawRegions
      .filter(r => r != null && r !== '')
      .sort((a, b) => a.localeCompare(b));

    res.json({
      totalPeopleGroups: totals.totalCount,
      totalPopulation: totals.totalPopulation,
      totalBelievers: totals.totalBelievers,
      totalChurches: totals.totalChurches,
      evangelismRate,
      statusDistribution,
      regions,
      top5ByPopulation: top5.map(pg => ({
        name: pg.name,
        population: pg.population || 0,
        status: pg.engagementStatus || 'unknown',
        region: pg.region || '',
        believersCount: pg.believersCount || 0,
        churchesCount: pg.churchesCount || 0,
        coordinates: pg.location?.coordinates || null, // [lng, lat]
      })),
      religionDistribution: religionDist.map(r => ({ religion: r._id, count: r.count })),
      languageDistribution: languageDist.map(l => ({ language: l._id, count: l.count })),
      donorDistribution: donorDist.map(d => ({ donor: d._id, count: d.count })),
      startYearDistribution: startYearDist.map(y => ({ year: y._id, count: y.count })),
    });
  } catch (error) {
    console.error('[Analytics] /people-groups-stats error:', error.message);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

/**
 * GET /analytics/jp-coverage
 * Combien de peuples JP sont déjà engagés par une équipe DMM ?
 */
router.get('/jp-coverage', optionalAuth, async (req, res) => {
  try {
    const { countryCode, country } = req.query
    const geoFilter = {}
    if (countryCode) geoFilter.countryCode = countryCode
    if (country)     geoFilter.country     = country

    const [jpStats, dmmByCountry, jpByStatus] = await Promise.all([
      PeopleGroup.aggregate([
        { $match: { source: 'Joshua Project', ...geoFilter } },
        { $group: {
          _id: null,
          total:        { $sum: 1 },
          frontier:     { $sum: { $cond: [{ $eq: ['$jpData.frontier',     true] }, 1, 0] } },
          leastReached: { $sum: { $cond: [{ $eq: ['$jpData.leastReached', true] }, 1, 0] } },
          totalPop:     { $sum: '$population' },
        }},
      ]),
      PeopleGroup.aggregate([
        { $match: { source: { $ne: 'Joshua Project' }, approved: true, ...geoFilter } },
        { $group: {
          _id:   '$country',
          count: { $sum: 1 },
          dmm:   { $sum: { $cond: [{ $eq: ['$engagementStatus', 'dmm'] }, 1, 0] } },
        }},
      ]),
      PeopleGroup.aggregate([
        { $match: { source: 'Joshua Project', ...geoFilter } },
        { $group: { _id: '$engagementStatus', count: { $sum: 1 } } },
      ]),
    ])

    const jp = jpStats[0] || { total: 0, frontier: 0, leastReached: 0, totalPop: 0 }
    const totalDMM = dmmByCountry.reduce((s, c) => s + c.count, 0)
    const jpStatusMap = {}
    jpByStatus.forEach(s => { jpStatusMap[s._id || 'unreached'] = s.count })
    const jpUnreachedPioneer = (jpStatusMap['unreached'] || 0) + (jpStatusMap['pioneer'] || 0)

    res.json({
      jp: {
        total: jp.total,
        frontier: jp.frontier,
        leastReached: jp.leastReached,
        totalPop: jp.totalPop,
        byStatus: jpStatusMap,
        unreachedPioneer: jpUnreachedPioneer,
      },
      dmm: {
        total: totalDMM,
        byCountry: dmmByCountry,
        countriesActive: dmmByCountry.length,
      },
      coveragePct: jp.total > 0
        ? parseFloat(((totalDMM / jp.total) * 100).toFixed(1))
        : 0,
    })
  } catch (error) {
    console.error('[Analytics] /jp-coverage error:', error.message)
    res.status(500).json({ error: 'Server error', message: error.message })
  }
})

/**
 * GET /analytics/coverage-voronoi
 * Retourne le statut DMM de chaque village pour colorier les polygones Voronoï.
 *
 * Pour chaque village (identifié par son nom), cherche s'il existe un PeopleGroup
 * DMM associé et retourne son statut d'engagement.
 *
 * Logique de statut :
 *   - Un village a un peuple DMM lié → statut du peuple le plus avancé
 *   - Aucun peuple → 'unreached' (zone blanche)
 *
 * Retourne : { [villageName]: { status, engagementLevel, peopleCount, population } }
 */
router.get('/coverage-voronoi', optionalAuth, async (req, res) => {
  try {
    const { country, countryCode } = req.query

    const matchFilter = {
      source:   'DMM',
      approved: true,
      villageName: { $ne: '', $exists: true },
    }
    if (country)     matchFilter.country     = country
    if (countryCode) matchFilter.countryCode = countryCode

    // Agréger : pour chaque village, prendre le statut le plus avancé
    const STATUS_ORDER = ['dmm', 'tipping-point', 'midway', 'pioneer', 'unreached']

    const villageStats = await PeopleGroup.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { $toLower: { $trim: { input: '$villageName' } } },
          villageNameOriginal: { $first: '$villageName' },
          statuses:   { $push: '$engagementStatus' },
          levels:     { $push: '$engagementLevel' },
          peopleCount:{ $sum: 1 },
          population: { $sum: '$population' },
          churches:   { $sum: '$numberOfChurches' },
          // Génération maximale atteinte parmi les engagements du village.
          maxGeneration: { $max: '$churchGeneration' },
        },
      },
    ])

    // Calculer le statut dominant (le plus avancé) pour chaque village
    const coverageMap = {}
    for (const v of villageStats) {
      if (!v._id) continue

      // Trouver le statut le plus avancé dans la liste
      let bestStatus = 'unreached'
      for (const s of STATUS_ORDER) {
        if (v.statuses.includes(s)) { bestStatus = s; break }
      }

      coverageMap[v.villageNameOriginal] = {
        status:       bestStatus,
        peopleCount:  v.peopleCount,
        population:   v.population,
        churches:     v.churches,
        // Génération max du village (utilisée par le popup du mode couverture).
        maxGeneration: v.maxGeneration || 0,
        // Population par source : ce jeu de données est DMM-only, donc la
        // population appartient à la source DMM (jamais cumulée entre sources).
        populationBySource: { DMM: v.population || 0 },
      }

      // Aussi indexer par nom en minuscules pour le matching côté frontend
      if (v._id !== v.villageNameOriginal) {
        coverageMap[v._id] = coverageMap[v.villageNameOriginal]
      }
    }

    res.json({
      total:       Object.keys(coverageMap).length / 2, // divisé par 2 car double-indexé
      coverageMap,
    })
  } catch (error) {
    console.error('[coverage-voronoi]', error.message)
    res.status(500).json({ error: 'Server error', message: error.message })
  }
})

/**
 * GET /analytics/mission-corridor
 * Calcule le corridor missionnaire optimal — tournée qui relie les peuples JP
 * non-atteints dans un rayon donné en minimisant la distance totale.
 *
 * Algorithme : Plus proche voisin (greedy TSP) avec Turf.js
 * Complexité : O(n²) — rapide jusqu'à ~200 peuples
 *
 * Query params :
 *   lat        - Latitude du point de départ (requis)
 *   lng        - Longitude du point de départ (requis)
 *   radius     - Rayon de recherche en km (défaut: 200)
 *   maxStops   - Nombre maximum d'étapes (défaut: 15)
 *   country    - Filtrer par pays
 *   statuses   - Statuts à inclure (défaut: unreached,pioneer)
 *   prioritize - 'frontier' | 'population' | 'distance' (défaut: frontier)
 */
router.get('/mission-corridor', optionalAuth, async (req, res) => {
  try {
    const lat        = parseFloat(req.query.lat)
    const lng        = parseFloat(req.query.lng)
    const radius     = Math.min(parseFloat(req.query.radius) || 200, 1000) // km max 1000
    const maxStops   = Math.min(parseInt(req.query.maxStops) || 15, 30)
    const country    = req.query.country || null
    const statuses   = (req.query.statuses || 'unreached,pioneer').split(',')
    const prioritize = req.query.prioritize || 'frontier'

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        error: 'Paramètres requis',
        message: 'lat et lng sont obligatoires (point de départ)',
      })
    }

    // ── 1. Récupérer les peuples JP non-atteints dans le rayon ─────────────
    const startPoint = turf.point([lng, lat])

    const matchFilter = {
      source:           'Joshua Project',
      approved:         true,
      engagementStatus: { $in: statuses },
      location:         {
        $geoWithin: {
          $centerSphere: [[lng, lat], (radius / 6371)] // rayon en radians
        }
      }
    }
    if (country) matchFilter.country = country

    const candidates = await PeopleGroup.find(matchFilter)
      .select('name country population location engagementStatus jpData language religion')
      .lean()

    if (candidates.length === 0) {
      return res.json({
        startPoint: { lat, lng },
        radius,
        corridor:   [],
        totalDistance: 0,
        message: `Aucun peuple JP non-atteint dans un rayon de ${radius} km`,
      })
    }

    // ── 2. Score de priorité pour chaque peuple ─────────────────────────────
    const scored = candidates.map(pg => {
      const [pLng, pLat] = pg.location.coordinates
      const dist = turf.distance(startPoint, turf.point([pLng, pLat]), { units: 'kilometers' })

      let score = 0
      if (prioritize === 'frontier') {
        score  = (pg.jpData?.frontier     ? 100 : 0)
                + (pg.jpData?.leastReached ? 50  : 0)
                + ((pg.population || 0) / 10000)
                - dist / 10
      } else if (prioritize === 'population') {
        score  = ((pg.population || 0) / 1000) - dist / 50
      } else { // distance
        score  = -dist
      }

      return { ...pg, _dist: dist, _score: score, _pLat: pLat, _pLng: pLng }
    })

    // Trier par score et prendre les maxStops meilleurs candidats
    scored.sort((a, b) => b._score - a._score)
    const pool = scored.slice(0, Math.min(maxStops * 3, 60)) // pool élargi pour TSP

    // ── 3. Algorithme Plus Proche Voisin (Nearest Neighbor TSP) ─────────────
    const visited  = new Set()
    const corridor = []
    let currentLat = lat
    let currentLng = lng
    let totalDistance = 0

    for (let step = 0; step < maxStops && visited.size < pool.length; step++) {
      let nearest = null
      let nearestDist = Infinity

      for (const pg of pool) {
        if (visited.has(pg._id.toString())) continue

        const d = turf.distance(
          turf.point([currentLng, currentLat]),
          turf.point([pg._pLng, pg._pLat]),
          { units: 'kilometers' }
        )

        // Favoriser les peuples Frontier en réduisant leur distance effective
        const effectiveDist = pg.jpData?.frontier
          ? d * 0.6  // 40% de bonus — les peuples Frontier valent le détour
          : pg.jpData?.leastReached
            ? d * 0.8
            : d

        if (effectiveDist < nearestDist) {
          nearestDist = effectiveDist
          nearest     = { pg, realDist: d }
        }
      }

      if (!nearest) break

      const { pg, realDist } = nearest
      visited.add(pg._id.toString())
      totalDistance += realDist

      corridor.push({
        step:        corridor.length + 1,
        id:          pg._id,
        name:        pg.name,
        country:     pg.country,
        lat:         pg._pLat,
        lng:         pg._pLng,
        population:  pg.population || 0,
        language:    pg.language   || '',
        religion:    pg.religion   || '',
        status:      pg.engagementStatus,
        frontier:    pg.jpData?.frontier     || false,
        leastReached:pg.jpData?.leastReached || false,
        jpScale:     pg.jpData?.jpScale      || '',
        pctEvangel:  pg.jpData?.percentEvangelical || 0,
        distFromPrev:parseFloat(realDist.toFixed(1)),
        cumulDist:   parseFloat(totalDistance.toFixed(1)),
      })

      currentLat = pg._pLat
      currentLng = pg._pLng
    }

    // ── 4. Retour au point de départ (boucle complète optionnelle) ───────────
    const returnDist = corridor.length > 0
      ? turf.distance(
          turf.point([currentLng, currentLat]),
          turf.point([lng, lat]),
          { units: 'kilometers' }
        )
      : 0

    // ── 5. GeoJSON LineString pour affichage Leaflet ─────────────────────────
    const lineCoords = [
      [lng, lat],
      ...corridor.map(s => [s.lng, s.lat]),
    ]
    const routeLine = turf.lineString(lineCoords)

    // Stats
    const frontierCount    = corridor.filter(s => s.frontier).length
    const leastReachedCount= corridor.filter(s => s.leastReached).length
    const totalPopulation  = corridor.reduce((s, p) => s + (p.population || 0), 0)

    res.json({
      startPoint:     { lat, lng },
      radius,
      maxStops,
      prioritize,
      country:        country || 'tous',
      corridor,
      totalStops:     corridor.length,
      totalDistance:  parseFloat(totalDistance.toFixed(1)),
      returnDistance: parseFloat(returnDist.toFixed(1)),
      roundTrip:      parseFloat((totalDistance + returnDist).toFixed(1)),
      stats: {
        frontierCount,
        leastReachedCount,
        totalPopulation,
        avgDistPerStop: corridor.length > 0
          ? parseFloat((totalDistance / corridor.length).toFixed(1))
          : 0,
      },
      routeLine, // GeoJSON LineString
    })
  } catch (error) {
    console.error('[mission-corridor]', error.message)
    res.status(500).json({ error: 'Server error', message: error.message })
  }
})

module.exports = router;