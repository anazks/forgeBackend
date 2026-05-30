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

        // If it's a Center, Kitchen, or Restaurant, only show their own stock
        if (req.user.role === 'CENTERS' || req.user.role === 'KITCHEN' || req.user.role === 'RESTAURANT') {
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

        // Fetch Boms that are directly referenced
        const Bom = require('../../boms/models/bomModel');
        const bomsDirect = await Bom.find({ _id: { $in: materialIds } }, 'dishName unit').lean();
        const bomMap = {};
        bomsDirect.forEach(b => bomMap[b._id.toString()] = { _id: b._id, name: b.dishName, unit: b.unit, category: 'BOM' });

        // Fetch Boms that are linked to these menu items (to filter out BOM menu items)
        const bomsLinked = await Bom.find({ menuItem: { $in: materialIds } }, 'menuItem').lean();
        const bomMenuIds = new Set(bomsLinked.map(b => b.menuItem.toString()));

        // Stitch back and filter out BOM items
        const filteredInventory = [];
        inventory.forEach(item => {
            const matId = item.materialId?.toString();
            if (matId) {
                if (rawMap[matId]) {
                    item.materialId = rawMap[matId];
                    filteredInventory.push(item);
                } else if (menuMap[matId]) {
                    if (!bomMenuIds.has(matId)) {
                        item.materialId = menuMap[matId];
                        filteredInventory.push(item);
                    }
                }
                // BOM items directly referenced in bomMap are skipped
            }
        });

        res.status(200).json({ success: true, count: filteredInventory.length, data: filteredInventory });
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
                if (menu) {
                    item.materialId = menu;
                } else {
                    const Bom = require('../../boms/models/bomModel');
                    const bom = await Bom.findById(matId, 'dishName unit').lean();
                    item.materialId = bom ? { _id: bom._id, name: bom.dishName, unit: bom.unit, category: 'BOM' } : null;
                }
            }
        }

        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

module.exports = router;
