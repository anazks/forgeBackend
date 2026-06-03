const RawMaterial = require('../models/rawMaterialModel');

// @desc    Get all raw materials
// @route   GET /api/rawmaterials
// @access  Private
exports.getRawMaterials = async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) {
                query.entity = req.query.entity;
            }
        } else {
            query.entity = req.user.entity;
        }

        const materials = await RawMaterial.find(query).sort({ simpleCode: 1 });
        res.status(200).json({ success: true, count: materials.length, data: materials });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create raw material
// @route   POST /api/rawmaterials
// @access  Private
exports.createRawMaterial = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }

        // Clean up: simpleCode is now strictly auto-generated in rawMaterialModel.js pre-validate hook.
        // Discard any manually provided simpleCode.
        delete req.body.simpleCode;

        const material = await RawMaterial.create(req.body);
        res.status(201).json({ success: true, data: material });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update raw material
// @route   PUT /api/rawmaterials/:id
// @access  Private
exports.updateRawMaterial = async (req, res) => {
    try {
        let material = await RawMaterial.findById(req.params.id);
        if (!material) {
            return res.status(404).json({ success: false, error: 'Raw material not found' });
        }

        if (req.user.role !== 'SUPER_ADMIN' && material.entity?.toString() !== req.user.entity?.toString()) {
            return res.status(401).json({ success: false, error: 'Not authorized' });
        }

        material = await RawMaterial.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: material });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update current stock level
// @route   PUT /api/rawmaterials/:id/stock
// @access  Private (STORE, ADMIN, SUPER_ADMIN)
exports.updateStock = async (req, res) => {
    try {
        const { currentStock } = req.body;

        if (currentStock === undefined || currentStock < 0) {
            return res.status(400).json({ success: false, error: 'Please provide a valid stock amount' });
        }

        const material = await RawMaterial.findById(req.params.id);
        if (!material) {
            return res.status(404).json({ success: false, error: 'Raw material not found' });
        }

        // Scope check: STORE & ADMIN must belong to same entity
        if (req.user.role !== 'SUPER_ADMIN') {
            if (material.entity?.toString() !== req.user.entity?.toString()) {
                return res.status(401).json({ success: false, error: 'Not authorized to update this item' });
            }
        }

        material.currentStock = Number(currentStock);
        await material.save();

        const isLow = material.currentStock < material.minimumStock;
        const isCritical = material.currentStock === 0;

        res.status(200).json({
            success: true,
            data: material,
            alert: isCritical
                ? { level: 'CRITICAL', message: `${material.name} is OUT OF STOCK!` }
                : isLow
                ? { level: 'LOW', message: `${material.name} is below minimum stock (${material.minimumStock} ${material.unit})` }
                : null
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
// @route   DELETE /api/rawmaterials/:id
// @access  Private
exports.deleteRawMaterial = async (req, res) => {
    try {
        const material = await RawMaterial.findById(req.params.id);
        if (!material) {
            return res.status(404).json({ success: false, error: 'Raw material not found' });
        }

        if (req.user.role !== 'SUPER_ADMIN' && material.entity?.toString() !== req.user.entity?.toString()) {
            return res.status(401).json({ success: false, error: 'Not authorized' });
        }

        await material.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
