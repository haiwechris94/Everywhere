/**
 * Export Routes - Generate GeoJSON, KML, and Excel exports
 */
const express = require('express');
const Village = require('../models/Village');
const PeopleGroup = require('../models/PeopleGroup');
const { auth } = require('../middleware/auth');
const { canExport } = require('../middleware/roles');
const { logExport } = require('../middleware/activityLogger');
const { toGeoJSON, toKML, toExcel } = require('../utils/exportUtils');

const router = express.Router();

/**
 * Helper to fetch export data
 */
const fetchExportData = async (options = {}) => {
  const { 
    includeVillages = true, 
    includePeopleGroups = true,
    region,
    country,
    status,
    organization,
    approved = true,
  } = options;

  const data = {};

  if (includeVillages) {
    const villageQuery = {};
    if (region) villageQuery.region = region;
    if (country) villageQuery.country = country;
    if (status) villageQuery.status = status;
    if (organization) villageQuery.organization = organization;

    data.villages = await Village.find(villageQuery)
      .select('-__v')
      .lean();
  }

  if (includePeopleGroups) {
    const pgQuery = { approved };
    if (region) pgQuery.region = region;
    if (country) pgQuery.country = country;
    if (status) pgQuery.status = status;
    if (organization) pgQuery.organizationTags = organization;

    data.peopleGroups = await PeopleGroup.find(pgQuery)
      .select('-__v -progressHistory')
      .lean();
  }

  return data;
};

/**
 * GET /export/geojson - Export data as GeoJSON
 */
router.get('/geojson', auth, canExport, logExport('geojson'), async (req, res) => {
  try {
    const { 
      includeVillages = 'true', 
      includePeopleGroups = 'true',
      region,
      country,
      status,
      organization,
    } = req.query;

    const data = await fetchExportData({
      includeVillages: includeVillages === 'true',
      includePeopleGroups: includePeopleGroups === 'true',
      region,
      country,
      status,
      organization,
    });

    const geojson = toGeoJSON(data, {
      includeVillages: includeVillages === 'true',
      includePeopleGroups: includePeopleGroups === 'true',
    });

    // Set headers for download
    const filename = `church-planting-map-${new Date().toISOString().split('T')[0]}.geojson`;
    res.setHeader('Content-Type', 'application/geo+json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.json(geojson);
  } catch (error) {
    console.error('Error exporting GeoJSON:', error);
    res.status(500).json({
      error: 'Export failed',
      message: error.message
    });
  }
});

/**
 * GET /export/kml - Export data as KML
 */
router.get('/kml', auth, canExport, logExport('kml'), async (req, res) => {
  try {
    const { 
      includeVillages = 'true', 
      includePeopleGroups = 'true',
      region,
      country,
      status,
      organization,
      documentName,
    } = req.query;

    const data = await fetchExportData({
      includeVillages: includeVillages === 'true',
      includePeopleGroups: includePeopleGroups === 'true',
      region,
      country,
      status,
      organization,
    });

    const kml = toKML(data, {
      includeVillages: includeVillages === 'true',
      includePeopleGroups: includePeopleGroups === 'true',
      documentName: documentName || 'Everywhere Export',
    });

    // Set headers for download
    const filename = `church-planting-map-${new Date().toISOString().split('T')[0]}.kml`;
    res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(kml);
  } catch (error) {
    console.error('Error exporting KML:', error);
    res.status(500).json({
      error: 'Export failed',
      message: error.message
    });
  }
});

/**
 * GET /export/excel - Export data as CSV (Excel-compatible)
 */
router.get('/excel', auth, canExport, logExport('excel'), async (req, res) => {
  try {
    const { 
      includeVillages = 'true', 
      includePeopleGroups = 'true',
      region,
      country,
      status,
      organization,
    } = req.query;

    const data = await fetchExportData({
      includeVillages: includeVillages === 'true',
      includePeopleGroups: includePeopleGroups === 'true',
      region,
      country,
      status,
      organization,
    });

    const csv = toExcel(data, {
      includeVillages: includeVillages === 'true',
      includePeopleGroups: includePeopleGroups === 'true',
    });

    // Set headers for download
    const filename = `church-planting-map-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Add BOM for Excel UTF-8 compatibility
    res.send('\ufeff' + csv);
  } catch (error) {
    console.error('Error exporting Excel:', error);
    res.status(500).json({
      error: 'Export failed',
      message: error.message
    });
  }
});

/**
 * GET /export/preview - Preview export data without downloading
 */
router.get('/preview', auth, canExport, async (req, res) => {
  try {
    const { 
      format = 'geojson',
      includeVillages = 'true', 
      includePeopleGroups = 'true',
      region,
      country,
      status,
      organization,
      limit = 10,
    } = req.query;

    // Fetch limited data for preview
    const data = {};

    if (includeVillages === 'true') {
      const villageQuery = {};
      if (region) villageQuery.region = region;
      if (country) villageQuery.country = country;
      if (status) villageQuery.status = status;

      data.villages = await Village.find(villageQuery)
        .select('name location status population region country')
        .limit(parseInt(limit))
        .lean();
    }

    if (includePeopleGroups === 'true') {
      const pgQuery = { approved: true };
      if (region) pgQuery.region = region;
      if (country) pgQuery.country = country;
      if (status) pgQuery.status = status;

      data.peopleGroups = await PeopleGroup.find(pgQuery)
        .select('name location status statusColor progressPercentage population')
        .limit(parseInt(limit))
        .lean();
    }

    // Get total counts
    const villageCount = includeVillages === 'true' 
      ? await Village.countDocuments(region || country || status ? { region, country, status } : {})
      : 0;
    const pgCount = includePeopleGroups === 'true'
      ? await PeopleGroup.countDocuments({ approved: true, ...(region && { region }), ...(country && { country }), ...(status && { status }) })
      : 0;

    let preview;
    if (format === 'kml') {
      preview = toKML(data, { includeVillages: includeVillages === 'true', includePeopleGroups: includePeopleGroups === 'true' });
    } else if (format === 'excel') {
      preview = toExcel(data, { includeVillages: includeVillages === 'true', includePeopleGroups: includePeopleGroups === 'true' });
    } else {
      preview = toGeoJSON(data, { includeVillages: includeVillages === 'true', includePeopleGroups: includePeopleGroups === 'true' });
    }

    res.json({
      format,
      preview: typeof preview === 'string' ? preview.substring(0, 2000) + '...' : preview,
      counts: {
        villages: villageCount,
        peopleGroups: pgCount,
        total: villageCount + pgCount,
      },
      previewLimit: parseInt(limit),
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({
      error: 'Preview failed',
      message: error.message
    });
  }
});

/**
 * GET /export/share-link - Generate a shareable view link
 */
router.get('/share-link', auth, async (req, res) => {
  try {
    const { 
      center,
      zoom,
      filters,
      layers,
    } = req.query;

    // Create a shareable state object
    const shareState = {
      center: center ? center.split(',').map(Number) : null,
      zoom: zoom ? parseInt(zoom) : null,
      filters: filters ? JSON.parse(filters) : {},
      layers: layers ? layers.split(',') : ['villages', 'people-groups'],
      createdBy: req.user._id,
      createdAt: new Date(),
    };

    // Encode state as base64
    const encodedState = Buffer.from(JSON.stringify(shareState)).toString('base64');
    
    // Generate share URL (frontend should handle this route)
    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/map/shared/${encodedState}`;

    res.json({
      shareUrl,
      state: shareState,
      expiresIn: 'Never (link contains all state)',
    });
  } catch (error) {
    res.status(400).json({
      error: 'Share link generation failed',
      message: error.message
    });
  }
});

/**
 * GET /export/all - Export all data (villages, people groups, activities)
 */
router.get('/all', auth, canExport, logExport('all'), async (req, res) => {
  try {
    const { format = 'json', source } = req.query;

    // Fetch all data
    const villages = await Village.find({})
      .select('-__v')
      .lean();

    // Filter people groups by data source(s) — supports a single value or a
    // comma-separated list (e.g. "IMB,PeopleGroups.org,Finishing the Task")
    const pgQueryAll = { approved: true };
    if (source) {
      const sources = String(source).split(',').map(s => s.trim()).filter(Boolean);
      if (sources.length === 1) pgQueryAll.source = sources[0];
      else if (sources.length > 1) pgQueryAll.source = { $in: sources };
    }

    const peopleGroups = await PeopleGroup.find(pgQueryAll)
      .select('-__v -progressHistory')
      .lean();

    const Activity = require('../models/Activity');
    const activities = await Activity.find({})
      .populate('user', 'name email')
      .populate('village', 'name')
      .populate('church', 'name')
      .populate('peopleGroup', 'name')
      .select('-__v')
      .lean();

    const data = {
      exportedAt: new Date().toISOString(),
      villages,
      peopleGroups,
      activities,
      summary: {
        totalVillages: villages.length,
        totalPeopleGroups: peopleGroups.length,
        totalActivities: activities.length
      }
    };

    const filename = `church-planting-map-all-${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      // Convert to CSV format
      let csvContent = '';
      
      // Villages CSV
      csvContent += '=== VILLAGES ===\n';
      if (villages.length > 0) {
        const villageHeaders = ['name', 'population', 'status', 'region', 'country', 'latitude', 'longitude'];
        csvContent += villageHeaders.join(',') + '\n';
        villages.forEach(v => {
          const lat = v.location?.coordinates?.[1] || '';
          const lng = v.location?.coordinates?.[0] || '';
          csvContent += `"${v.name || ''}",${v.population || 0},"${v.status || ''}","${v.region || ''}","${v.country || ''}",${lat},${lng}\n`;
        });
      }
      
      // People Groups CSV
      csvContent += '\n=== PEOPLE GROUPS ===\n';
      if (peopleGroups.length > 0) {
        const pgHeaders = ['name', 'source', 'status', 'engagementStatus', 'population', 'numberOfChurches', 'churchGeneration', 'villageName', 'latitude', 'longitude'];
        csvContent += pgHeaders.join(',') + '\n';
        peopleGroups.forEach(pg => {
          const lat = pg.location?.coordinates?.[1] || '';
          const lng = pg.location?.coordinates?.[0] || '';
          csvContent += `"${pg.name || ''}","${pg.source || ''}","${pg.status || ''}","${pg.engagementStatus || ''}",${pg.population || 0},${pg.numberOfChurches || 0},${pg.churchGeneration || 0},"${pg.villageName || ''}",${lat},${lng}\n`;
        });
      }
      
      // Activities CSV
      csvContent += '\n=== ACTIVITIES ===\n';
      if (activities.length > 0) {
        const actHeaders = ['type', 'description', 'date', 'participants', 'user', 'village', 'peopleGroup'];
        csvContent += actHeaders.join(',') + '\n';
        activities.forEach(a => {
          csvContent += `"${a.type || ''}","${(a.description || '').replace(/"/g, '""')}","${a.date || ''}",${a.participants || 0},"${a.user?.name || ''}","${a.village?.name || ''}","${a.peopleGroup?.name || ''}"\n`;
        });
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send('\ufeff' + csvContent);
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(data);
    }
  } catch (error) {
    console.error('Error exporting all data:', error);
    res.status(500).json({
      error: 'Export failed',
      message: error.message
    });
  }
});

/**
 * POST /export/villages - Export selected villages with their data
 */
router.post('/villages', auth, canExport, logExport('villages'), async (req, res) => {
  try {
    const { villageIds, format = 'json', includeActivities = true, includePeopleGroups = true } = req.body;

    if (!villageIds || !Array.isArray(villageIds) || villageIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Please provide an array of village IDs'
      });
    }

    // Fetch selected villages
    const villages = await Village.find({ _id: { $in: villageIds } })
      .select('-__v')
      .lean();

    const data = {
      exportedAt: new Date().toISOString(),
      villages
    };

    // Fetch related people groups if requested
    if (includePeopleGroups) {
      const villageNames = villages.map(v => v.name);
      data.peopleGroups = await PeopleGroup.find({
        $or: [
          { village: { $in: villageIds } },
          { villageName: { $in: villageNames } }
        ],
        approved: true
      })
        .select('-__v -progressHistory')
        .lean();
    }

    // Fetch related activities if requested
    if (includeActivities) {
      const Activity = require('../models/Activity');
      data.activities = await Activity.find({ village: { $in: villageIds } })
        .populate('user', 'name email')
        .populate('church', 'name')
        .populate('peopleGroup', 'name')
        .select('-__v')
        .lean();
    }

    data.summary = {
      totalVillages: villages.length,
      totalPeopleGroups: data.peopleGroups?.length || 0,
      totalActivities: data.activities?.length || 0
    };

    const filename = `church-planting-map-villages-${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      let csvContent = '';
      
      // Villages CSV
      csvContent += '=== VILLAGES ===\n';
      const villageHeaders = ['name', 'population', 'status', 'region', 'country', 'latitude', 'longitude'];
      csvContent += villageHeaders.join(',') + '\n';
      villages.forEach(v => {
        const lat = v.location?.coordinates?.[1] || '';
        const lng = v.location?.coordinates?.[0] || '';
        csvContent += `"${v.name || ''}",${v.population || 0},"${v.status || ''}","${v.region || ''}","${v.country || ''}",${lat},${lng}\n`;
      });
      
      // People Groups CSV
      if (data.peopleGroups && data.peopleGroups.length > 0) {
        csvContent += '\n=== PEOPLE GROUPS ===\n';
        const pgHeaders = ['name', 'status', 'engagementStatus', 'population', 'numberOfChurches', 'villageName', 'latitude', 'longitude'];
        csvContent += pgHeaders.join(',') + '\n';
        data.peopleGroups.forEach(pg => {
          const lat = pg.location?.coordinates?.[1] || '';
          const lng = pg.location?.coordinates?.[0] || '';
          csvContent += `"${pg.name || ''}","${pg.status || ''}","${pg.engagementStatus || ''}",${pg.population || 0},${pg.numberOfChurches || 0},"${pg.villageName || ''}",${lat},${lng}\n`;
        });
      }
      
      // Activities CSV
      if (data.activities && data.activities.length > 0) {
        csvContent += '\n=== ACTIVITIES ===\n';
        const actHeaders = ['type', 'description', 'date', 'participants', 'user', 'village'];
        csvContent += actHeaders.join(',') + '\n';
        data.activities.forEach(a => {
          csvContent += `"${a.type || ''}","${(a.description || '').replace(/"/g, '""')}","${a.date || ''}",${a.participants || 0},"${a.user?.name || ''}","${a.village?.name || ''}"\n`;
        });
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send('\ufeff' + csvContent);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json(data);
    }
  } catch (error) {
    console.error('Error exporting villages:', error);
    res.status(500).json({
      error: 'Export failed',
      message: error.message
    });
  }
});

/**
 * GET /export/people-groups - Export people groups as CSV
 */
router.get('/people-groups', auth, canExport, logExport('people-groups'), async (req, res) => {
  try {
    const { format = 'csv', status, region, country, source } = req.query;

    const query = { approved: true };
    if (status) query.status = status;
    if (region) query.region = region;
    if (country) query.country = country;
    // Filter by data source(s) — supports a single value or a comma-separated
    // list (e.g. "IMB,PeopleGroups.org,Finishing the Task")
    if (source) {
      const sources = String(source).split(',').map(s => s.trim()).filter(Boolean);
      if (sources.length === 1) query.source = sources[0];
      else if (sources.length > 1) query.source = { $in: sources };
    }

    const peopleGroups = await PeopleGroup.find(query)
      .populate('village', 'name')
      .select('-__v -progressHistory')
      .lean();

    const filename = `people-groups-${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      const headers = ['name', 'description', 'source', 'status', 'engagementStatus', 'engagementLevel', 'population', 'numberOfChurches', 'churchGeneration', 'villageName', 'region', 'country', 'language', 'religion', 'latitude', 'longitude'];
      let csvContent = headers.join(',') + '\n';
      
      peopleGroups.forEach(pg => {
        const lat = pg.location?.coordinates?.[1] || '';
        const lng = pg.location?.coordinates?.[0] || '';
        csvContent += `"${pg.name || ''}","${(pg.description || '').replace(/"/g, '""')}","${pg.source || ''}","${pg.status || ''}","${pg.engagementStatus || ''}","${pg.engagementLevel || ''}",${pg.population || 0},${pg.numberOfChurches || 0},${pg.churchGeneration || 0},"${pg.villageName || ''}","${pg.region || ''}","${pg.country || ''}","${pg.language || ''}","${pg.religion || ''}",${lat},${lng}\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send('\ufeff' + csvContent);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.json({
        exportedAt: new Date().toISOString(),
        total: peopleGroups.length,
        peopleGroups
      });
    }
  } catch (error) {
    console.error('Error exporting people groups:', error);
    res.status(500).json({
      error: 'Export failed',
      message: error.message
    });
  }
});

module.exports = router;