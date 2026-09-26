/**
 * Project Routes - CRUD API for church planting projects/initiatives
 *
 * GET    /api/projects        - list projects (public read, optional auth)
 * GET    /api/projects/stats  - aggregate stats for the dashboard header
 * GET    /api/projects/:id    - single project
 * POST   /api/projects        - create (supervisor/admin)
 * PUT    /api/projects/:id    - update (supervisor/admin)
 * DELETE /api/projects/:id    - delete (admin)
 */
const express = require('express');
const router = express.Router();

const Project = require('../models/Project');
const { auth, optionalAuth } = require('../middleware/auth');
const { isAdmin, isSupervisorOrAdmin } = require('../middleware/roles');

/**
 * GET /api/projects
 * Returns all projects, newest first. Supports optional ?status= and ?search= filters.
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (search && search.trim()) {
      query.name = { $regex: search.trim(), $options: 'i' };
    }

    const projects = await Project.find(query).sort({ createdAt: -1 }).lean();

    res.json({ success: true, total: projects.length, data: projects });
  } catch (error) {
    console.error('[projects] list error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement des projets' });
  }
});

/**
 * GET /api/projects/stats
 * Aggregate counters for the Projects dashboard header.
 */
router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const [totals] = await Project.aggregate([
      {
        $group: {
          _id: null,
          projects: { $sum: 1 },
          churches: { $sum: '$churches' },
          countries: { $addToSet: '$country' },
          owners: { $addToSet: '$owner' },
        },
      },
    ]);

    const cleanCount = (arr) => (arr || []).filter((v) => v && String(v).trim()).length;

    res.json({
      success: true,
      data: {
        projects: totals?.projects || 0,
        churches: totals?.churches || 0,
        countries: cleanCount(totals?.countries),
        teams: cleanCount(totals?.owners),
      },
    });
  } catch (error) {
    console.error('[projects] stats error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du calcul des statistiques' });
  }
});

/**
 * GET /api/projects/:id
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) {
      return res.status(404).json({ success: false, message: 'Projet introuvable' });
    }
    res.json({ success: true, data: project });
  } catch (error) {
    console.error('[projects] get error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du chargement du projet' });
  }
});

/**
 * POST /api/projects
 */
router.post('/', auth, isSupervisorOrAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      status,
      owner,
      country,
      region,
      progress,
      churches,
      startDate,
      endDate,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Le nom du projet est requis' });
    }

    const project = await Project.create({
      name: name.trim(),
      description,
      status,
      owner,
      country,
      region,
      progress,
      churches,
      startDate,
      endDate,
      createdBy: req.user?._id,
    });

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    console.error('[projects] create error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la création du projet' });
  }
});

/**
 * PUT /api/projects/:id
 */
router.put('/:id', auth, isSupervisorOrAdmin, async (req, res) => {
  try {
    const updatable = [
      'name', 'description', 'status', 'owner', 'country',
      'region', 'progress', 'churches', 'startDate', 'endDate',
    ];
    const updates = {};
    updatable.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });

    const project = await Project.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Projet introuvable' });
    }
    res.json({ success: true, data: project });
  } catch (error) {
    console.error('[projects] update error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du projet' });
  }
});

/**
 * DELETE /api/projects/:id
 */
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Projet introuvable' });
    }
    res.json({ success: true, message: 'Projet supprimé' });
  } catch (error) {
    console.error('[projects] delete error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la suppression du projet' });
  }
});

module.exports = router;
