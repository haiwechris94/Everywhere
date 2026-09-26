const express = require('express');
const DBSSession = require('../models/DBSSession');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/dbs-sessions - List with filtering + pagination
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      discoveryGroup,
      startDate,
      endDate,
      limit = 50,
      skip = 0,
      sort = '-date',
    } = req.query;

    const query = {};
    if (discoveryGroup) query.discoveryGroup = discoveryGroup;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const sortOptions = {};
    if (sort.startsWith('-')) sortOptions[sort.substring(1)] = -1;
    else sortOptions[sort] = 1;

    const items = await DBSSession.find(query)
      .populate('discoveryGroup', 'name status')
      .populate('facilitator', 'name email')
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort(sortOptions);

    const total = await DBSSession.countDocuments(query);

    res.json({
      data: items,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      hasMore: parseInt(skip) + items.length < total,
    });
  } catch (error) {
    console.error('Error fetching DBS sessions:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// GET /api/dbs-sessions/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const item = await DBSSession.findById(req.params.id)
      .populate('discoveryGroup', 'name status village')
      .populate('facilitator', 'name email');
    if (!item) return res.status(404).json({ error: 'Not found', message: 'DBS session not found' });
    res.json(item);
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// POST /api/dbs-sessions
router.post('/', auth, async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user._id };
    if (!data.facilitator) data.facilitator = req.user._id;
    const item = new DBSSession(data);
    await item.save();
    await item.populate('discoveryGroup', 'name status');
    res.status(201).json({ message: 'DBS session created successfully', data: item });
  } catch (error) {
    console.error('Error creating DBS session:', error);
    res.status(400).json({ error: 'Creation failed', message: error.message });
  }
});

// PUT /api/dbs-sessions/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const item = await DBSSession.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found', message: 'DBS session not found' });
    if (item.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only update your own records' });
    }
    const updated = await DBSSession.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('discoveryGroup', 'name status');
    res.json({ message: 'DBS session updated successfully', data: updated });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(400).json({ error: 'Update failed', message: error.message });
  }
});

// DELETE /api/dbs-sessions/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await DBSSession.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found', message: 'DBS session not found' });
    if (item.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only delete your own records' });
    }
    await DBSSession.findByIdAndDelete(req.params.id);
    res.json({ message: 'DBS session deleted successfully', id: req.params.id });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
