'use strict';

const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const { isMissionary } = require('../middleware/roles');
const fttService = require('../services/finishingTheTaskService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ── validation middleware ─────────────────────────────────────────────────────

function validatePagination(req, res, next) {
  const limit = parseInt(req.query.limit, 10);
  if (!isNaN(limit) && limit > 500) {
    return res.status(400).json({ success: false, error: 'Limit cannot exceed 500' });
  }
  next();
}

function validateCountryCode(req, res, next) {
  const { country } = req.query;
  if (country && (typeof country !== 'string' || country.length > 2)) {
    return res.status(400).json({ success: false, error: 'Country code must be 2 characters' });
  }
  next();
}

// ── POST /import ──────────────────────────────────────────────────────────────

router.post('/import', auth, isMissionary, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const result = await fttService.importFromCSV(req.file.buffer);
    res.json(result);
  } catch (err) {
    console.error('[FTT] import error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /people-groups ────────────────────────────────────────────────────────

router.get('/people-groups', auth, validatePagination, validateCountryCode, async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page, 10) || 1,
      limit: Math.min(parseInt(req.query.limit, 10) || 50, 500),
      sortBy: req.query.sortBy || 'name',
      sortOrder: req.query.sortOrder || 'asc',
      country: req.query.country,
      status: req.query.status,
      source: req.query.source,
    };
    const result = await fttService.getAllPeopleGroups(options);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[FTT] people-groups error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /people-groups/unreached ──────────────────────────────────────────────

router.get('/people-groups/unreached', auth, validatePagination, async (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page, 10) || 1,
      limit: Math.min(parseInt(req.query.limit, 10) || 50, 500),
      sortBy: req.query.sortBy || 'name',
      sortOrder: req.query.sortOrder || 'asc',
      status: 'unreached',
    };
    const result = await fttService.getAllPeopleGroups(options);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[FTT] unreached error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /status ───────────────────────────────────────────────────────────────

router.get('/status', auth, async (req, res) => {
  try {
    const statistics = await fttService.getSyncStatus();
    res.json({ success: true, statistics });
  } catch (err) {
    console.error('[FTT] status error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /clear ─────────────────────────────────────────────────────────────

router.delete('/clear', auth, isMissionary, async (req, res) => {
  try {
    const result = await fttService.clearAllData();
    res.json({ success: true, message: 'Finishing the Task data cleared', ...result });
  } catch (err) {
    console.error('[FTT] clear error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
