const Menu = require('../models/menuModel');

// @desc    Get all menu items
// @route   GET /api/menus
// @access  Private
exports.getMenus = async (req, res, next) => {
    try {
        let query = {};
        
        // If not SUPER_ADMIN, only show menus for their entity
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) {
                query.entity = req.query.entity;
            }
        } else {
            query.entity = req.user.entity;
        }

        const menus = await Menu.find(query);
        res.status(200).json({ success: true, count: menus.length, data: menus });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create menu item
// @route   POST /api/menus
// @access  Private
exports.createMenu = async (req, res, next) => {
    try {
        // If not SUPER_ADMIN, automatically link menu to their entity
        if (req.user.role === 'SUPER_ADMIN') {
            // Allow specifying entity in body for super admin
        } else {
            req.body.entity = req.user.entity;
        }

        const menu = await Menu.create(req.body);
        res.status(201).json({ success: true, data: menu });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update menu item
// @route   PUT /api/menus/:id
// @access  Private
exports.updateMenu = async (req, res, next) => {
    try {
        let menu = await Menu.findById(req.params.id);
        if (!menu) {
            return res.status(404).json({ success: false, error: 'Menu not found' });
        }
        
        // Make sure user owns the menu if not super admin
        if (req.user.role !== 'SUPER_ADMIN' && menu.entity.toString() !== req.user.entity.toString()) {
            return res.status(401).json({ success: false, error: 'Not authorized to update this menu' });
        }

        menu = await Menu.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: menu });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete menu item
// @route   DELETE /api/menus/:id
// @access  Private
exports.deleteMenu = async (req, res, next) => {
    try {
        let menu = await Menu.findById(req.params.id);
        if (!menu) {
            return res.status(404).json({ success: false, error: 'Menu not found' });
        }

        // Make sure user owns the menu if not super admin
        if (req.user.role !== 'SUPER_ADMIN' && menu.entity.toString() !== req.user.entity.toString()) {
            return res.status(401).json({ success: false, error: 'Not authorized to delete this menu' });
        }

        await menu.deleteOne();

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
