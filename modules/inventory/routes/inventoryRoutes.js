const express = require('express');
const router = express.Router();
const { protect } = require('../../../middleware/auth');
const Inventory = require('../models/inventoryModel');
const RawMaterial = require('../../rawmaterials/models/rawMaterialModel');

// @route   GET /api/inventory
// @desc    Get inventory for the logged-in location, or all for Store Manager
router.get('/', protect, async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        }

        // If it's a Center or Kitchen, only show their own stock
        if (req.user.role === 'CENTERS' || req.user.role === 'KITCHEN') {
            query.locationId = req.user._id;
        } else if (req.query.locationId) {
            query.locationId = req.query.locationId;
        }

        const inventory = await Inventory.find(query)
            .populate('materialId', 'name unit category')
            .populate('locationId', 'name');

        res.status(200).json({ success: true, count: inventory.length, data: inventory });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// @route   PUT /api/inventory/:id
// @desc    Update stock value
router.put('/:id', protect, async (req, res) => {
    try {
        const item = await Inventory.findByIdAndUpdate(
            req.params.id,
            { currentStock: req.body.currentStock },
            { new: true }
        ).populate('materialId', 'name unit category').populate('locationId', 'name');

        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
