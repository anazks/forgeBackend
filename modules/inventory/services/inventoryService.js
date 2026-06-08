const mongoose = require('mongoose');
const Inventory = require('../models/inventoryModel');
const RawMaterial = require('../../rawmaterials/models/rawMaterialModel');
const { AppError } = require('../../../middleware/errorHandler');

/**
 * L4 Fix: Shared helper — resolves a materialId to its display name and metadata
 * by looking up RawMaterial, then Menu, then BOM in sequence.
 * Previously copy-pasted in both GET / and PUT /:id inline handlers.
 */
async function enrichMaterialId(matId) {
    if (!matId) return null;
    const id = matId.toString();

    const rawMat = await RawMaterial.findById(id, 'name unit category').lean();
    if (rawMat) return rawMat;

    const Menu = require('../../menus/models/menuModel');
    const menu = await Menu.findById(id, 'name unit category').lean();
    if (menu) return menu;

    const Bom = require('../../boms/models/bomModel');
    const bom = await Bom.findById(id, 'dishName unit').lean();
    if (bom) return { _id: bom._id, name: bom.dishName, unit: bom.unit, category: 'BOM' };

    return null;
}

class InventoryService {
    /**
     * A1: Get inventory records for the given user scope.
     * Applies location filtering and stitches material names from
     * RawMaterial / Menu / BOM collections (the "Nameless Item" fix).
     * BOM-linked menu items are excluded (they are daily-consumption, not stock items).
     */
    async getInventory(user, queryLocationId) {
        const query = {};
        if (user.role !== 'SUPER_ADMIN') {
            query.entity = user.entity;
        }

        const locationRoles = ['CENTERS', 'KITCHEN', 'RESTAURANT', 'AGGREGATE'];
        if (locationRoles.includes(user.role)) {
            query.locationId = user._id;
        } else if (queryLocationId) {
            query.locationId = queryLocationId;
        }

        const inventory = await Inventory.find(query)
            .populate('locationId', 'name')
            .lean();

        const materialIds = inventory.map(i => i.materialId);

        // Batch-fetch all three collections in parallel
        const Menu = require('../../menus/models/menuModel');
        const Bom = require('../../boms/models/bomModel');

        const [rawMaterials, menus, bomsLinked] = await Promise.all([
            RawMaterial.find({ _id: { $in: materialIds } }, 'name unit category').lean(),
            Menu.find({ _id: { $in: materialIds } }, 'name unit category').lean(),
            Bom.find({ menuItem: { $in: materialIds } }, 'menuItem').lean()
        ]);

        const rawMap = {};
        rawMaterials.forEach(rm => { rawMap[rm._id.toString()] = rm; });

        const menuMap = {};
        menus.forEach(m => { menuMap[m._id.toString()] = m; });

        // BOM menu IDs: menu items that are covered by a BOM (not direct sale items)
        const bomMenuIds = new Set(bomsLinked.map(b => b.menuItem.toString()));

        const filteredInventory = [];
        inventory.forEach(item => {
            const matId = item.materialId?.toString();
            if (!matId) return;

            if (rawMap[matId]) {
                item.materialId = rawMap[matId];
                filteredInventory.push(item);
            } else if (menuMap[matId] && !bomMenuIds.has(matId)) {
                item.materialId = menuMap[matId];
                filteredInventory.push(item);
            }
        });

        return filteredInventory;
    }

    /**
     * A1: Update the currentStock of a single inventory record.
     * L4 Fix: uses shared enrichMaterialId instead of duplicated waterfall lookup.
     */
    async updateInventoryStock(id, currentStock) {
        const item = await Inventory.findByIdAndUpdate(
            id,
            { currentStock },
            { new: true }
        ).populate('locationId', 'name').lean();

        if (!item) throw new AppError('Inventory record not found', 404);

        item.materialId = await enrichMaterialId(item.materialId);

        return item;
    }

    /**
     * A1: Aggregate total stock per raw material across all locations.
     * Used by the Store Dashboard (OTP-002).
     */
    async getStockSummary(entityId) {
        const matchQuery = entityId
            ? { entity: new mongoose.Types.ObjectId(entityId) }
            : {};

        const aggregated = await Inventory.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$materialId',
                    totalStock: { $sum: '$currentStock' },
                    locationCount: { $sum: 1 }
                }
            }
        ]);

        const materialIds = aggregated.map(a => a._id);
        const rawMaterials = await RawMaterial.find(
            { _id: { $in: materialIds } },
            'name unit customUnit minimumStock simpleCode category'
        ).lean();

        const rmMap = {};
        rawMaterials.forEach(rm => { rmMap[rm._id.toString()] = rm; });

        return aggregated
            .filter(a => rmMap[a._id?.toString()])
            .map(a => {
                const rm = rmMap[a._id.toString()];
                return {
                    _id: rm._id,
                    simpleCode: rm.simpleCode,
                    name: rm.name,
                    unit: rm.unit,
                    customUnit: rm.customUnit,
                    category: rm.category,
                    minimumStock: rm.minimumStock,
                    currentStock: a.totalStock,
                    locationCount: a.locationCount
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async getInventoriesByEntity(entityId, isAdmin = false) {
        const query = isAdmin ? {} : { entity: entityId };
        return await Inventory.find(query)
            .lean()
            .select('locationId materialId currentStock');
    }

    /**
     * Safely deducts stock from Inventory, flooring at 0.
     * Operations (dispatch, revenue closure, etc.) are NEVER blocked.
     */
    async safeDeductStock(materialId, locationId, entityId, qty) {
        const inv = await Inventory.findOne({ materialId, locationId, entity: entityId }).lean();
        const available = inv ? (inv.currentStock || 0) : 0;
        const toDeduct = Math.min(qty, available);

        if (toDeduct <= 0) {
            if (qty > 0) {
                console.warn(`[STOCK FLOOR] materialId=${materialId} location=${locationId}: wanted -${qty}, stock already 0.`);
            }
            return;
        }

        await Inventory.findOneAndUpdate(
            { materialId, locationId, entity: entityId },
            { $inc: { currentStock: -toDeduct } },
            { upsert: true, new: true, runValidators: false }
        );
    }
}

module.exports = new InventoryService();
