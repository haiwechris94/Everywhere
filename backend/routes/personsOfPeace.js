const express = require('express');
const PersonOfPeace = require('../models/PersonOfPeace');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/persons-of-peace - List with filtering + pagination
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      village,
      peopleGroup,
      status,
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
    if (organization) query.organization = organization;
    if (search) query.$text = { $search: search };

    const sortOptions = {};
    if (sort.startsWith('-')) sortOptions[sort.substring(1)] = -1;
    else sortOptions[sort] = 1;

    const items = await PersonOfPeace.find(query)
      .populate('village', 'name region')
      .populate('createdBy', 'name email')
      .populate('discoveryGroup', 'name status')
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .sort(sortOptions);

    const total = await PersonOfPeace.countDocuments(query);

    res.json({
      data: items,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      hasMore: parseInt(skip) + items.length < total,
    });
  } catch (error) {
    console.error('Error fetching persons of peace:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// GET /api/persons-of-peace/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const item = await PersonOfPeace.findById(req.params.id)
      .populate('village', 'name region location')
      .populate('createdBy', 'name email')
      .populate('steward', 'name email')
      .populate('discoveryGroup', 'name status');
    if (!item) return res.status(404).json({ error: 'Not found', message: 'Person of peace not found' });
    res.json(item);
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

// POST /api/persons-of-peace
router.post('/', auth, async (req, res) => {
  try {
    const data = { ...req.body, createdBy: req.user._id };
    const item = new PersonOfPeace(data);
    await item.save();
    await item.populate('village', 'name region');
    await item.populate('createdBy', 'name email');
    res.status(201).json({ message: 'Person of peace created successfully', data: item });
  } catch (error) {
    console.error('Error creating person of peace:', error);
    res.status(400).json({ error: 'Creation failed', message: error.message });
  }
});

// PUT /api/persons-of-peace/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const item = await PersonOfPeace.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found', message: 'Person of peace not found' });
    if (item.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only update your own records' });
    }
    const updated = await PersonOfPeace.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('village', 'name region')
      .populate('createdBy', 'name email');
    res.json({ message: 'Person of peace updated successfully', data: updated });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(400).json({ error: 'Update failed', message: error.message });
  }
});

// DELETE /api/persons-of-peace/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await PersonOfPeace.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found', message: 'Person of peace not found' });
    if (item.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'You can only delete your own records' });
    }
    await PersonOfPeace.findByIdAndDelete(req.params.id);
    res.json({ message: 'Person of peace deleted successfully', id: req.params.id });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid ID', message: 'The id is invalid' });
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

module.exports = router;
