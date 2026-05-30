const menuRateService = require('../services/menuRateService');

// @desc    Get all menu rates for an entity or location
// @route   GET /api/menus/rates
// @access  Private
exports.getMenuRates = async (req, res, next) => {
    try {
        let entityId = null;
        let locationId = req.user._id;
        const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'COO'].includes(req.user.role);

        if (req.user.role !== 'SUPER_ADMIN') {
            entityId = req.user.entity;
        } else if (req.query.entity) {
            entityId = req.query.entity;
        }

        // If admin specifies a center query, look up rates for that center
        if (isAdmin && req.query.centerId) {
            locationId = req.query.centerId;
        }

        const rates = await menuRateService.getRatesByEntity(
            entityId, 
            locationId, 
            isAdmin && !req.query.centerId // If admin calls without centerId, fetch all
        );
            
        res.status(200).json({ success: true, count: rates.length, data: rates });
    } catch (error) {
        next(error);
    }
};

// @desc    Update or create a menu rate
// @route   POST /api/menus/rates
// @access  Private (Admin/SuperAdmin/COO)
exports.updateMenuRate = async (req, res, next) => {
    try {
        const menuRate = await menuRateService.updateRate(req.body, req.user);
        res.status(200).json({ success: true, data: menuRate });
    } catch (error) {
        next(error);
    }
};

// @desc    Bulk update or create menu rates
// @route   POST /api/menus/rates/bulk
// @access  Private (Admin/SuperAdmin/COO)
exports.updateMenuRatesBulk = async (req, res, next) => {
    try {
        const rates = await menuRateService.updateRatesBulk(req.body, req.user);
        res.status(200).json({ success: true, count: rates.length, data: rates });
    } catch (error) {
        next(error);
    }
};
