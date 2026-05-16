const MenuRate = require('../models/menuRateModel');
const Menu = require('../models/menuModel');
const User = require('../../users/models/model');
const Bom = require('../../boms/models/bomModel');

// @desc    Get all menu rates for an entity
// @route   GET /api/menus/rates
// @access  Private (Admin/SuperAdmin)
exports.getMenuRates = async (req, res, next) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            if (!req.user.entity) {
                return res.status(200).json({ success: true, count: 0, data: [] });
            }
            query.entity = req.user.entity;
        } else if (req.query.entity) {
            query.entity = req.query.entity;
        }

        const rates = await MenuRate.find(query)
            .populate('menu')
            .populate('center')
            .populate('bom');
            
        res.status(200).json({ success: true, count: rates.length, data: rates });
    } catch (error) {
        console.error('Error in getMenuRates:', error);
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update or create a menu rate
// @route   POST /api/menus/rates
// @access  Private (Admin/SuperAdmin/Centers)
exports.updateMenuRate = async (req, res, next) => {
    try {
        const { menuId, bomId, centerId, rate, centerRate } = req.body;

        if ((!menuId && !bomId) || !centerId) {
            return res.status(400).json({ success: false, error: 'Please provide menuId or bomId, and centerId' });
        }

        // Role-based logic
        if (req.user.role === 'CENTERS') {
            // Centers can only update their own rates
            if (req.user._id.toString() !== centerId.toString()) {
                return res.status(403).json({ success: false, error: 'Not authorized to update rates for another center' });
            }
            // Centers can only update centerRate
            if (rate !== undefined) {
                return res.status(403).json({ success: false, error: 'Centers cannot update admin rate' });
            }
        }

        // Find existing or create new
        let query = { center: centerId };
        if (menuId) query.menu = menuId;
        if (bomId) query.bom = bomId;

        let menuRate = await MenuRate.findOne(query);

        if (menuRate) {
            if (rate !== undefined) menuRate.rate = rate;
            if (centerRate !== undefined) menuRate.centerRate = centerRate;
            await menuRate.save();
        } else {
            // Creation logic
            let finalRate = rate;
            let finalEntity = req.user.entity;

            // If no rate provided (e.g. by Center), fetch base price
            if (finalRate === undefined) {
                if (menuId) {
                    const menu = await Menu.findById(menuId);
                    if (menu) finalRate = menu.unitPrice;
                } else if (bomId) {
                    const bom = await Bom.findById(bomId);
                    if (bom) finalRate = bom.kitchenPrice;
                }
            }

            // Fallback for entity
            if (!finalEntity) {
                const centerUser = await User.findById(centerId);
                if (centerUser) finalEntity = centerUser.entity;
            }

            if (!finalEntity) {
                return res.status(400).json({ success: false, error: 'Entity context not found. Please contact admin.' });
            }

            menuRate = await MenuRate.create({
                menu: menuId || undefined,
                bom: bomId || undefined,
                center: centerId,
                rate: finalRate || 0,
                centerRate: centerRate || 0,
                entity: finalEntity
            });
        }

        res.status(200).json({ success: true, data: menuRate });
    } catch (error) {
        console.error('Error in updateMenuRate:', error);
        res.status(400).json({ success: false, error: error.message });
    }
};
