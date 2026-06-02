const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../../middleware/auth');
const {
    getInventory,
    updateInventory,
    getStockSummary
} = require('../controllers/inventoryController');

// A1 Fix: All business logic extracted to inventoryController.js + inventoryService.js.
// This file now only defines routes, consistent with all other modules.

// @route   GET /api/inventory/stock-summary
// @desc    Aggregate total stock per material across all locations (Store Dashboard)
// Note: must be declared BEFORE /:id to avoid route conflict
router.get('/stock-summary', protect, authorize('STORE', 'COO', 'ADMIN', 'SUPER_ADMIN'), getStockSummary);

// @route   GET /api/inventory
// @desc    Get inventory for current user's location (or filtered by locationId for admins)
router.get('/', protect, getInventory);

// @route   PUT /api/inventory/:id
// @desc    Manually update stock value (Store Manager / Admin only)
// M5 Fix: authorize() guard added — previously any logged-in user could set stock to any value
router.put('/:id', protect, authorize('STORE', 'ADMIN', 'SUPER_ADMIN'), updateInventory);

module.exports = router;
