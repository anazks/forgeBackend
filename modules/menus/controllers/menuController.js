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
            if (!req.user.entity) {
                console.warn(`User ${req.user._id} (${req.user.role}) has no entity assigned!`);
                // Fallback: If no entity, maybe they should see everything or nothing.
                // For debugging, let's see if there are any menus at all.
                const allCount = await Menu.countDocuments();
                console.log(`Total menus in DB: ${allCount}`);
            }
            query.entity = req.user.entity;
        }

        console.log(`[DEBUG] Fetching menus. Role: ${req.user.role}, EntityID: ${req.user.entity}`);
        
        const menus = await Menu.find(query);
        console.log(`[DEBUG] Found ${menus.length} menus for query:`, query);
        
        res.status(200).json({ success: true, count: menus.length, data: menus });
    } catch (error) {
        console.error('Error in getMenus:', error);
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

        // Sync reference on corresponding BOM document
        if (menu.type === 'BOM' && menu.bom) {
            const Bom = require('../../boms/models/bomModel');
            await Bom.findByIdAndUpdate(menu.bom, { menuItem: menu._id });
        }

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

        const oldBomId = menu.bom;

        menu = await Menu.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        // Sync references on BOM documents if the linked BOM changed
        if (oldBomId?.toString() !== menu.bom?.toString()) {
            const Bom = require('../../boms/models/bomModel');
            if (oldBomId) {
                await Bom.findByIdAndUpdate(oldBomId, { $unset: { menuItem: 1 } });
            }
            if (menu.type === 'BOM' && menu.bom) {
                await Bom.findByIdAndUpdate(menu.bom, { menuItem: menu._id });
            }
        }

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

        // Clear reference from linked BOM before deleting
        if (menu.bom) {
            const Bom = require('../../boms/models/bomModel');
            await Bom.findByIdAndUpdate(menu.bom, { $unset: { menuItem: 1 } });
        }

        await menu.deleteOne();

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
