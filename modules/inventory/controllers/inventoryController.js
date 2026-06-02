const inventoryService = require('../services/inventoryService');
const { AppError } = require('../../../middleware/errorHandler');

// @desc    Get inventory for the logged-in location, or all for admins
// @route   GET /api/inventory
// @access  Private
exports.getInventory = async (req, res, next) => {
    try {
        const data = await inventoryService.getInventory(req.user, req.query.locationId);
        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Update stock value for a single inventory record
// @route   PUT /api/inventory/:id
// @access  Private (STORE, ADMIN, SUPER_ADMIN)
exports.updateInventory = async (req, res, next) => {
    try {
        if (req.body.currentStock === undefined) {
            throw new AppError('currentStock is required', 400);
        }
        const data = await inventoryService.updateInventoryStock(req.params.id, Number(req.body.currentStock));
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Aggregate total stock per material across ALL locations (for Store Dashboard)
// @route   GET /api/inventory/stock-summary
// @access  Private (STORE, COO, ADMIN, SUPER_ADMIN)
exports.getStockSummary = async (req, res, next) => {
    try {
        const isAdmin = req.user.role === 'SUPER_ADMIN';
        const entityId = isAdmin ? null : req.user.entity;
        const data = await inventoryService.getStockSummary(entityId);
        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        next(error);
    }
};
