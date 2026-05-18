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
            .populate('locationId', 'name')
            .lean();

        // Fetch all IDs to stitch
        const materialIds = inventory.map(i => i.materialId);

        // Fetch RawMaterials
        const rawMaterials = await RawMaterial.find({ _id: { $in: materialIds } }, 'name unit category').lean();
        const rawMap = {};
        rawMaterials.forEach(rm => rawMap[rm._id.toString()] = rm);

        // Fetch Menus
        const Menu = require('../../menus/models/menuModel');
        const menus = await Menu.find({ _id: { $in: materialIds } }, 'name unit category').lean();
        const menuMap = {};
        menus.forEach(m => menuMap[m._id.toString()] = m);

        // Stitch back
        inventory.forEach(item => {
            const matId = item.materialId?.toString();
            if (matId) {
                if (rawMap[matId]) {
                    item.materialId = rawMap[matId];
                } else if (menuMap[matId]) {
                    item.materialId = menuMap[matId];
                } else {
                    item.materialId = null;
                }
            }
        });

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
        ).populate('locationId', 'name').lean();

        const matId = item.materialId?.toString();
        if (matId) {
            const rawMat = await RawMaterial.findById(matId, 'name unit category').lean();
            if (rawMat) {
                item.materialId = rawMat;
            } else {
                const Menu = require('../../menus/models/menuModel');
                const menu = await Menu.findById(matId, 'name unit category').lean();
                item.materialId = menu || null;
            }
        }

        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
