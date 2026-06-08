const Bom = require('../models/bomModel');
const bomService = require('../services/bomService');

// @desc    Get all BOMs
// @route   GET /api/boms
// @access  Private
exports.getBoms = async (req, res, next) => {
    try {
        let query = {};
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) {
                query.entity = req.query.entity;
            }
        } else {
            query.entity = req.user.entity;
        }

        console.log(`Fetching BOMs for role: ${req.user.role}, entity: ${req.user.entity}`);
        console.log('BOM Query:', query);

        const boms = await bomService.getBomsByEntity(query.entity, req.user.role === 'SUPER_ADMIN');
        console.log(`Found ${boms.length} BOMs`);

        res.status(200).json({ success: true, count: boms.length, data: boms });
    } catch (error) {
        console.error('Error in getBoms:', error);
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create BOM
// @route   POST /api/boms
// @access  Private
exports.createBom = async (req, res, next) => {
    try {
        if (req.user.role === 'SUPER_ADMIN') {
            // Allow specifying entity in body
        } else {
            req.body.entity = req.user.entity;
        }

        const bom = await Bom.create(req.body);
        res.status(201).json({ success: true, data: bom });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update BOM
// @route   PUT /api/boms/:id
// @access  Private
exports.updateBom = async (req, res, next) => {
    try {
        let bom = await Bom.findById(req.params.id);
        if (!bom) {
            return res.status(404).json({ success: false, error: 'BOM not found' });
        }
        
        if (req.user.role !== 'SUPER_ADMIN' && bom.entity.toString() !== req.user.entity.toString()) {
            return res.status(401).json({ success: false, error: 'Not authorized to update this BOM' });
        }

        bom = await Bom.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: bom });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete BOM
// @route   DELETE /api/boms/:id
// @access  Private
exports.deleteBom = async (req, res, next) => {
    try {
        await bomService.deleteBom(req.params.id, req.user.entity, req.user.role);
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(error.statusCode || 400).json({ success: false, error: error.message });
    }
};
