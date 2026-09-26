const express = require('express');
const DiscoveryGroup = require('../models/DiscoveryGroup');
const DBSSession = require('../models/DBSSession');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/discovery-groups - List with filtering + pagination
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      village,
      peopleGroup,
      status,
      habitFocus,
      organization,
      search,
      limit = 50,
      skip = 0,
      sort = '-createdAt',
    } = req.query;

    const query = {};
    if (village) query.village = village;
    if (peopleGroup) query.peopleGroup = peopleGroup;
    if (status) query.status = status;
    if (habitFocus) query.habitFocus = habitFocus;
    if (organization) query.organization = organization;
    if (search) query.$text = { $search: search };

    const sortOptions = {};
    if (sort.startsWith('-')) sortOptions[sort.substring(1)] = -1;
    else sortOptions[sort] = 1;

    const items = await DiscoveryGroup.find(query)
      .populate('village', 'name region')
      .populate('facilitator', 'name email')
      .populate('facilitatorPop', 'name')
      .populate('createdBy', 'name email')
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort(sortOptions);

    const total = await DiscoveryGroup.countDocuments(query);

    res.json({
      data: items,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      hasMore: parseInt(skip) + items.length < total,
    });
  } catch (error) {
    console.error('Error fetching discovery groups:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// GET /api/discovery-groups/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const item = await DiscoveryGroup.findById(req.params.id)
      .populate('village', 'name region location')
      .populate('facilitator', 'name email')
      .populate('facilitatorPop', 'name')
      .populate('parentGroup', 'name generation')
      .populate('becameChurch', 'name generation')
      .populate('createdBy', 'name email');
    if (!item) return res.status(404).json({ error: 'Not found', message: 'Discovery group not found' });
    res.json(item);
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// GET /api/discovery-groups/:id/sessions - DBS sessions for a group
router.get('/:id/sessions', optionalAuth, async (req, res) => {
  try {
    const sessions = await DBSSession.find({ discoveryGroup: req.params.id })
      .populate('facilitator', 'name email')
      .sort({ date: -1 });
    res.json({ data: sessions, total: sessions.length });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// POST /api/discovery-groups
router.post('/', auth, async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user._id };
    const item = new DiscoveryGroup(data);
    await item.save();
    await item.populate('village', 'name region');
    await item.populate('createdBy', 'name email');
    res.status(201).json({ message: 'Discovery group created successfully', data: item });
  } catch (error) {
    console.error('Error creating discovery group:', error);
    res.status(400).json({ error: 'Creation failed', message: error.message });
  }
});

// PUT /api/discovery-groups/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const item = await DiscoveryGroup.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found', message: 'Discovery group not found' });
    if (item.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only update your own records' });
    }
    const updated = await DiscoveryGroup.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('village', 'name region')
      .populate('createdBy', 'name email');
    res.json({ message: 'Discovery group updated successfully', data: updated });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(400).json({ error: 'Update failed', message: error.message });
  }
});

// DELETE /api/discovery-groups/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await DiscoveryGroup.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found', message: 'Discovery group not found' });
    if (item.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only delete your own records' });
    }
    await DiscoveryGroup.findByIdAndDelete(req.params.id);
    res.json({ message: 'Discovery group deleted successfully', id: req.params.id });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
