const FoodRequest = require('../models/foodRequestModel');
const RawMaterial = require('../../rawmaterials/models/rawMaterialModel');

// @desc    Get all food requests
// @route   GET /api/foodrequests
// @access  Private
exports.getFoodRequests = async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) query.entity = req.query.entity;
        } else {
            query.entity = req.user.entity;
        }

        const requests = await FoodRequest.find(query)
            .populate('approvedBy', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: requests.length, data: requests });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create a food request
// @route   POST /api/foodrequests
// @access  Private
exports.createFoodRequest = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }
        const request = await FoodRequest.create(req.body);
        res.status(201).json({ success: true, data: request });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Approve a food request (checks stock)
// @route   PUT /api/foodrequests/:id/approve
// @access  Private (STORE/ADMIN/SUPER_ADMIN)
exports.approveRequest = async (req, res) => {
    try {
        const foodReq = await FoodRequest.findById(req.params.id);
        if (!foodReq) return res.status(404).json({ success: false, error: 'Request not found' });

        if (foodReq.status === 'APPROVED') {
            return res.status(400).json({ success: false, error: 'Request already approved' });
        }

        // Check stock for all items in request
        let allSufficient = true;
        const updatedItems = [];

        for (const item of foodReq.requestedItems) {
            let availableStock = null;
            let isSufficient = true;

            if (item.material) {
                const material = await RawMaterial.findById(item.material);
                if (material) {
                    availableStock = material.currentStock;
                    isSufficient = material.currentStock >= item.requestedQty;
                }
            }

            if (!isSufficient) allSufficient = false;

            updatedItems.push({
                ...item.toObject(),
                availableStock,
                isStockSufficient: isSufficient
            });
        }

        // Determine status
        const status = allSufficient ? 'APPROVED' : 'PARTIAL';

        foodReq.requestedItems = updatedItems;
        foodReq.status = status;
        foodReq.approvedBy = req.user._id;
        foodReq.approvedAt = new Date();
        await foodReq.save();

        // If fully approved, deduct stock
        if (allSufficient) {
            for (const item of foodReq.requestedItems) {
                if (item.material) {
                    await RawMaterial.findByIdAndUpdate(item.material, {
                        $inc: { currentStock: -item.requestedQty }
                    });
                }
            }
        }

        res.status(200).json({
            success: true,
            data: foodReq,
            stockStatus: allSufficient ? 'ALL_AVAILABLE' : 'INSUFFICIENT',
            message: allSufficient
                ? 'Request approved and stock deducted.'
                : 'Some items have insufficient stock. Request marked PARTIAL.'
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Reject a food request
// @route   PUT /api/foodrequests/:id/reject
// @access  Private
exports.rejectRequest = async (req, res) => {
    try {
        const foodReq = await FoodRequest.findById(req.params.id);
        if (!foodReq) return res.status(404).json({ success: false, error: 'Request not found' });

        foodReq.status = 'REJECTED';
        foodReq.rejectionReason = req.body.reason || 'Rejected by store manager';
        foodReq.approvedBy = req.user._id;
        foodReq.approvedAt = new Date();
        await foodReq.save();

        res.status(200).json({ success: true, data: foodReq });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Seed sample food requests (demo only)
// @route   POST /api/foodrequests/seed-sample
// @access  Private/Admin
exports.seedSampleRequests = async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') query.entity = req.user.entity;

        const materials = await RawMaterial.find(query).limit(5);
        if (materials.length === 0) {
            return res.status(400).json({ success: false, error: 'No raw materials found. Add items in Item Config first.' });
        }

        const centerNames = ['North Center', 'South Center', 'East Wing Center', 'West Branch'];
        const sampleRequests = [];

        for (let i = 0; i < 3; i++) {
            const centerName = centerNames[i % centerNames.length];
            const itemCount = Math.min(materials.length, Math.floor(Math.random() * 3) + 1);
            const requestedItems = materials.slice(0, itemCount).map(m => ({
                material: m._id,
                materialName: m.name,
                simpleCode: m.simpleCode,
                requestedQty: Math.floor(Math.random() * 10) + 1,
                unit: m.unit === 'custom' ? (m.customUnit || 'unit') : m.unit
            }));

            sampleRequests.push({
                centerName,
                entity: req.user.role !== 'SUPER_ADMIN' ? req.user.entity : (req.body.entity || null),
                requestedItems,
                status: 'PENDING',
                notes: `Sample request from ${centerName} — Demo Data`
            });
        }

        const created = await FoodRequest.insertMany(sampleRequests);
        res.status(201).json({ success: true, count: created.length, data: created });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
