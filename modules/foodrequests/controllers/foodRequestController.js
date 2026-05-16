const FoodRequest = require('../models/foodRequestModel');
const RawMaterial = require('../../rawmaterials/models/rawMaterialModel');
const Bom = require('../../boms/models/bomModel');

// @desc    Get all food requests
// @route   GET /api/foodrequests
// @access  Private
exports.getFoodRequests = async (req, res) => {
    try {
        let query = {};
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) query.entity = req.query.entity;
        } else if (req.user.role === 'CENTERS') {
            query.centerId = req.user._id;
        } else {
            query.entity = req.user.entity;
            if (req.query.centerId) query.centerId = req.query.centerId;
        }

        const requests = await FoodRequest.find(query)
            .populate('approvedBy', 'name')
            .populate('requestedItems.bomId')
            .sort({ createdAt: -1 })
            .lean();

        const MenuRate = require('../../menus/models/menuRateModel');
        const centerIds = [...new Set(requests.map(r => r.centerId?.toString()).filter(Boolean))];
        
        if (centerIds.length > 0) {
            const menuRates = await MenuRate.find({ center: { $in: centerIds } });
            const rateMap = {};
            const centerRateMap = {};
            menuRates.forEach(mr => {
                const centerKey = mr.center.toString();
                if (mr.bom) {
                    const bomKey = `${centerKey}_${mr.bom.toString()}`;
                    rateMap[bomKey] = mr.rate;
                    centerRateMap[bomKey] = mr.centerRate || mr.rate;
                }
                if (mr.menu) {
                    const menuKey = `${centerKey}_${mr.menu.toString()}`;
                    rateMap[menuKey] = mr.rate;
                    centerRateMap[menuKey] = mr.centerRate || mr.rate;
                }
            });

            for (const req of requests) {
                if (!req.centerId) continue;
                const centerKey = req.centerId.toString();
                for (const item of req.requestedItems) {
                    const bomId = item.bomId?._id?.toString() || item.bomId?.toString();
                    const menuId = item.menuId?._id?.toString() || item.menuId?.toString();
                    
                    let assigned = null;
                    let selling = null;
                    if (bomId && rateMap[`${centerKey}_${bomId}`] !== undefined) {
                        assigned = rateMap[`${centerKey}_${bomId}`];
                        selling = centerRateMap[`${centerKey}_${bomId}`];
                    } else if (menuId && rateMap[`${centerKey}_${menuId}`] !== undefined) {
                        assigned = rateMap[`${centerKey}_${menuId}`];
                        selling = centerRateMap[`${centerKey}_${menuId}`];
                    }
                    
                    item.assignedRate = assigned !== null ? assigned : (item.bomId?.kitchenPrice || 0);
                    item.sellingRate = selling !== null ? selling : item.assignedRate;
                }
            }
        }

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

        const { centerId, deliveryDate, requestedItems } = req.body;
        const normalizedDate = new Date(deliveryDate);
        normalizedDate.setHours(0, 0, 0, 0);

        // Try to find a pending request for this center on this normalized delivery date
        let existingRequest = await FoodRequest.findOne({
            centerId,
            deliveryDate: {
                $gte: normalizedDate,
                $lt: new Date(normalizedDate.getTime() + 24 * 60 * 60 * 1000)
            },
            status: 'PENDING'
        });

        if (existingRequest) {
            // Check if item already exists in the request to update qty, or just append
            requestedItems.forEach(newItem => {
                const existingItem = existingRequest.requestedItems.find(
                    item => item.materialName === newItem.materialName && 
                    (item.menuId?.toString() === newItem.menuId?.toString() || item.bomId?.toString() === newItem.bomId?.toString())
                );

                if (existingItem) {
                    existingItem.requestedQty += Number(newItem.requestedQty);
                } else {
                    existingRequest.requestedItems.push(newItem);
                }
            });

            const updatedRequest = await existingRequest.save();
            return res.status(200).json({ success: true, data: updatedRequest, message: 'Added to existing request' });
        }

        // Otherwise create new
        const request = await FoodRequest.create(req.body);
        res.status(201).json({ success: true, data: request });
    } catch (error) {
        console.error('Error creating food request:', error);
        
        // Handle Mongoose validation errors specifically
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, error: messages.join(', ') });
        }
        
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

            if (item.isMenuItem) {
                // Find BOM for this item
                const query = item.bomId ? { _id: item.bomId } : { menuItem: item.menuId };
                const bom = await Bom.findOne(query);
                
                if (bom) {
                    // Check all ingredients in BOM
                    for (const ingredient of bom.items) {
                        const material = await RawMaterial.findById(ingredient.materialId);
                        const requiredQty = ingredient.quantity * item.requestedQty;
                        
                        if (!material || material.currentStock < requiredQty) {
                            isSufficient = false;
                            break;
                        }
                    }
                    availableStock = isSufficient ? 1 : 0; // Binary flag for menu items
                } else {
                    // No BOM found, assume direct menu item with no stock tracking or mark as insufficient
                    isSufficient = false; 
                }
            } else if (item.material) {
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

        let activityLog = [];

        // If fully approved, deduct stock
        if (allSufficient) {
            for (const item of foodReq.requestedItems) {
                if (item.isMenuItem) {
                    const query = item.bomId ? { _id: item.bomId } : { menuItem: item.menuId };
                    const bom = await Bom.findOne(query);
                    if (bom) {
                        for (const ingredient of bom.items) {
                            const requiredQty = ingredient.quantity * item.requestedQty;
                            await RawMaterial.findByIdAndUpdate(ingredient.materialId, {
                                $inc: { currentStock: -requiredQty }
                            });
                            activityLog.push(`${ingredient.itemName}: -${requiredQty.toFixed(2)} ${ingredient.unit}`);
                        }
                    }
                } else if (item.material) {
                    const mat = await RawMaterial.findByIdAndUpdate(item.material, {
                        $inc: { currentStock: -item.requestedQty }
                    });
                    if (mat) {
                        activityLog.push(`${mat.name}: -${item.requestedQty} ${mat.unit}`);
                    }
                }
            }
        }

        const deductionDetails = activityLog.length > 0 ? ` Deducted: ${activityLog.join(', ')}` : '';

        res.status(200).json({
            success: true,
            data: foodReq,
            stockStatus: allSufficient ? 'ALL_AVAILABLE' : 'INSUFFICIENT',
            message: allSufficient
                ? `Request approved.${deductionDetails}`
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

// @desc    Get total raw material demand across all pending requests
// @route   GET /api/foodrequests/demand-summary
// @access  Private (ADMIN/SUPER_ADMIN)
exports.getDemandSummary = async (req, res) => {
    try {
        let matchQuery = { status: 'PENDING' };
        if (req.user.role !== 'SUPER_ADMIN') {
            const mongoose = require('mongoose');
            matchQuery.entity = new mongoose.Types.ObjectId(req.user.entity);
        }

        const summary = await FoodRequest.aggregate([
            // 1. Filter pending requests
            { $match: matchQuery },
            
            // 2. Flatten requested items
            { $unwind: "$requestedItems" },
            
            // 3. Convert bomId to ObjectId if it's a string to ensure lookup works
            {
                $addFields: {
                    "requestedItems.bomId": { $toObjectId: "$requestedItems.bomId" }
                }
            },
            
            // 4. Filter only menu items that have a BOM
            { $match: { "requestedItems.isMenuItem": true, "requestedItems.bomId": { $ne: null } } },
            
            // 4. Join with Boms collection
            {
                $lookup: {
                    from: "boms", // Ensure this matches your MongoDB collection name (usually lowercase plural)
                    localField: "requestedItems.bomId",
                    foreignField: "_id",
                    as: "bomDetails"
                }
            },
            
            // 5. Unwind the joined BOM (it's an array of 1 after lookup)
            { $unwind: "$bomDetails" },
            
            // 6. Unwind the ingredients inside the BOM
            { $unwind: "$bomDetails.items" },
            
            // 7. Group by material to sum up total quantity
            // Calculation: ingredient.quantity * requestedItems.requestedQty
            {
                $group: {
                    _id: {
                        materialId: "$bomDetails.items.materialId",
                        name: "$bomDetails.items.itemName"
                    },
                    totalQty: {
                        $sum: {
                            $multiply: [
                                { $toDouble: "$bomDetails.items.quantity" },
                                { $toDouble: "$requestedItems.requestedQty" }
                            ]
                        }
                    },
                    unit: { $first: "$bomDetails.items.unit" }
                }
            },
            
            // 7.5 Lookup current stock from raw materials
            {
                $lookup: {
                    from: "rawmaterials",
                    let: { matId: { $toObjectId: "$_id.materialId" } },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$_id", "$$matId"] } } }
                    ],
                    as: "materialInfo"
                }
            },
            {
                $unwind: { path: "$materialInfo", preserveNullAndEmptyArrays: true }
            },
            
            // 8. Final formatting
            {
                $project: {
                    _id: 0,
                    name: "$_id.name",
                    totalQty: 1,
                    unit: 1,
                    currentStock: { $ifNull: ["$materialInfo.currentStock", 0] }
                }
            }
        ]);

        console.log(`[DEBUG] Demand Summary Aggregation Result:`, summary);
        res.status(200).json({ success: true, data: summary });
    } catch (error) {
        console.error('Error in demand summary aggregation:', error);
        res.status(400).json({ success: false, error: error.message });
    }
};
