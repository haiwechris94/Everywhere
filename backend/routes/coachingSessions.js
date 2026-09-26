const express = require('express');
const CoachingSession = require('../models/CoachingSession');
const Activity = require('../models/Activity');
const { auth, optionalAuth } = require('../middleware/auth');
const { DMM_EVALUATION_DIMENSIONS } = require('../config/dmmConstants');

const router = express.Router();

// GET /api/coaching-sessions/dimensions - the 10 DMM evaluation dimensions
// (declared before /:id so it is not captured by the id param route)
router.get('/dimensions', (req, res) => {
  res.json({ data: DMM_EVALUATION_DIMENSIONS });
});

// GET /api/coaching-sessions - List with filtering + pagination
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      coach,
      village,
      peopleGroup,
      discoveryGroup,
      startDate,
      endDate,
      limit = 50,
      skip = 0,
      sort = '-date',
    } = req.query;

    const query = {};
    if (coach) query.coach = coach;
    if (village) query.village = village;
    if (peopleGroup) query.peopleGroup = peopleGroup;
    if (discoveryGroup) query.discoveryGroup = discoveryGroup;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const sortOptions = {};
    if (sort.startsWith('-')) sortOptions[sort.substring(1)] = -1;
    else sortOptions[sort] = 1;

    const items = await CoachingSession.find(query)
      .populate('coach', 'name email')
      .populate('coacheeUser', 'name email')
      .populate('village', 'name region')
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort(sortOptions);

    const total = await CoachingSession.countDocuments(query);

    res.json({
      data: items,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      hasMore: parseInt(skip) + items.length < total,
    });
  } catch (error) {
    console.error('Error fetching coaching sessions:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// GET /api/coaching-sessions/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const item = await CoachingSession.findById(req.params.id)
      .populate('coach', 'name email')
      .populate('coacheeUser', 'name email')
      .populate('village', 'name region location')
      .populate('peopleGroup', 'name')
      .populate('discoveryGroup', 'name status');
    if (!item) return res.status(404).json({ error: 'Not found', message: 'Coaching session not found' });
    res.json(item);
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// POST /api/coaching-sessions - create session + linked Activity (coaching-igrow)
router.post('/', auth, async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user._id };
    if (!data.coach) data.coach = req.user._id;

    const session = new CoachingSession(data);
    await session.save();

    // Journalise dans le fil d'activités existant (type coaching-igrow)
    try {
      const goalText = session.goal && session.goal.statement ? session.goal.statement : 'Session de coaching iGROW';
      const activity = new Activity({
        type: 'coaching-igrow',
        description: `Coaching iGROW: ${goalText}`.slice(0, 2000),
        date: session.date || new Date(),
        user: req.user._id,
        village: session.village || undefined,
        peopleGroup: session.peopleGroup || undefined,
        coachingDetails: {
          conversationWith: session.conversationWith,
          conversationTheme: goalText.slice(0, 500),
          duration: session.durationMinutes,
        },
      });
      await activity.save();
      session.activity = activity._id;
      await session.save();

      const io = req.app.get('io');
      if (io) io.to('map').emit('activity-added', activity);
    } catch (activityErr) {
      // Ne pas bloquer la création de la session si l'activité échoue
      console.error('Error creating linked activity for coaching session:', activityErr.message);
    }

    await session.populate('coach', 'name email');
    res.status(201).json({ message: 'Coaching session created successfully', data: session });
  } catch (error) {
    console.error('Error creating coaching session:', error);
    res.status(400).json({ error: 'Creation failed', message: error.message });
  }
});

// PUT /api/coaching-sessions/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const item = await CoachingSession.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found', message: 'Coaching session not found' });
    if (item.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only update your own records' });
    }
    // Merge + save so the pre-save hook recomputes overallHealthScore
    Object.assign(item, req.body);
    await item.save();
    await item.populate('coach', 'name email');
    res.json({ message: 'Coaching session updated successfully', data: item });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(400).json({ error: 'Update failed', message: error.message });
  }
});

// DELETE /api/coaching-sessions/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await CoachingSession.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found', message: 'Coaching session not found' });
    if (item.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only delete your own records' });
    }
    await CoachingSession.findByIdAndDelete(req.params.id);
    if (item.activity) {
      await Activity.findByIdAndDelete(item.activity).catch(() => {});
    }
    res.json({ message: 'Coaching session deleted successfully', id: req.params.id });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
