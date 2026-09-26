const express = require('express');
const { auth, optionalAuth } = require('../middleware/auth');
const {
  getAllChurches,
  getChurchStats,
  getNearbyChurches,
  getChurchById,
  createChurch,
  updateChurch,
  deleteChurch,
} = require('../controllers/churchController');

const router = express.Router();

// GET /api/churches - List churches (filtering + pagination)
router.get('/', optionalAuth, getAllChurches);

// GET /api/churches/stats - Aggregated statistics
// NOTE: must be declared before '/:id' so it is not captured as an id.
router.get('/stats', optionalAuth, getChurchStats);

// GET /api/churches/nearby - Churches near a geographic point
router.get('/nearby', optionalAuth, getNearbyChurches);

// GET /api/churches/:id - Single church
router.get('/:id', optionalAuth, getChurchById);

// POST /api/churches - Create church
router.post('/', auth, createChurch);

// PUT /api/churches/:id - Update church
router.put('/:id', auth, updateChurch);

// DELETE /api/churches/:id - Delete church
router.delete('/:id', auth, deleteChurch);

module.exports = router;
