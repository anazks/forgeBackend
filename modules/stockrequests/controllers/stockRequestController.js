const StockRequest = require('../models/stockRequestModel');
const RawMaterial = require('../../rawmaterials/models/rawMaterialModel');
const Bom = require('../../boms/models/bomModel');
const { AppError } = require('../../../middleware/errorHandler');

// @desc    COO edits a single item's requested quantity
// @route   PUT /api/foodrequests/:id/items
// @access  Private (COO, ADMIN, SUPER_ADMIN)
exports.updateItemQty = async (req, res, next) => {
    try {
        const { itemId, requestedQty } = req.body;
        if (!itemId || requestedQty === undefined) {
            throw new AppError('itemId and requestedQty are required', 400);
        }
        const stockReq = await StockRequest.findById(req.params.id);
        if (!stockReq) throw new AppError('Request not found', 404);

        const item = stockReq.requestedItems.id(itemId);
        if (!item) throw new AppError('Item not found in request', 404);

        item.requestedQty = Math.max(0, Number(requestedQty));
        await stockReq.save();

        res.status(200).json({ success: true, data: stockReq });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all stock requests
// @route   GET /api/foodrequests
// @access  Private
exports.getStockRequests = async (req, res, next) => {
    try {
        let query = {};
        const REQUESTER_ROLES = ['CENTERS', 'RESTAURANT', 'AGGREGATE'];
        if (req.user.role === 'SUPER_ADMIN') {
            if (req.query.entity) query.entity = req.query.entity;
        } else if (REQUESTER_ROLES.includes(req.user.role)) {
            query.centerId = req.user._id;
        } else {
            query.entity = req.user.entity;
            if (req.query.centerId) query.centerId = req.query.centerId;
        }

        const requests = await StockRequest.find(query)
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
        next(error);
    }
};

// @desc    Create a stock request
// @route   POST /api/foodrequests
// @access  Private
exports.createStockRequest = async (req, res, next) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }

        const { centerId, deliveryDate, requestedItems } = req.body;
        const normalizedDate = new Date(deliveryDate);
        normalizedDate.setHours(0, 0, 0, 0);

        // Try to find a pending request for this center on this normalized delivery date
        let existingRequest = await StockRequest.findOne({
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
        const request = await StockRequest.create(req.body);
        res.status(201).json({ success: true, data: request });
    } catch (error) {
        next(error);
    }
};

// @desc    COO approves or rejects specific items in a stock request
// @route   PUT /api/foodrequests/:id/approve
// @access  Private (COO, ADMIN, SUPER_ADMIN)
// Body: { itemIds: string[], action: 'APPROVED' | 'REJECTED' }
exports.approveRequest = async (req, res, next) => {
    try {
        const { itemIds, action } = req.body;

        if (!itemIds || !Array.isArray(itemIds) || !['APPROVED', 'REJECTED'].includes(action)) {
            throw new AppError('itemIds (array) and action (APPROVED|REJECTED) are required', 400);
        }

        const stockReq = await StockRequest.findById(req.params.id);
        if (!stockReq) throw new AppError('Request not found', 404);

        // Update approvalStatus for each targeted item
        itemIds.forEach(itemId => {
            const item = stockReq.requestedItems.id(itemId);
            if (item) item.approvalStatus = action;
        });

        // Recalculate overall request status
        const allItems = stockReq.requestedItems;
        const allApproved  = allItems.every(i => i.approvalStatus === 'APPROVED');
        const allRejected  = allItems.every(i => i.approvalStatus === 'REJECTED');
        const anyPending   = allItems.some(i => i.approvalStatus === 'PENDING');

        if (allRejected) {
            stockReq.status = 'REJECTED';
        } else if (allApproved && !anyPending) {
            stockReq.status = 'APPROVED';
        } else {
            // Mix of approved/rejected/pending → PARTIAL
            stockReq.status = 'PARTIAL';
        }

        stockReq.approvedBy = req.user._id;
        stockReq.approvedAt = new Date();
        await stockReq.save();

        res.status(200).json({
            success: true,
            data: stockReq,
            message: `${itemIds.length} item(s) ${action.toLowerCase()}.`
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Reject a stock request
// @route   PUT /api/foodrequests/:id/reject
// @access  Private
exports.rejectRequest = async (req, res, next) => {
    try {
        const stockReq = await StockRequest.findById(req.params.id);
        if (!stockReq) {
            throw new AppError('Request not found', 404);
        }

        stockReq.status = 'REJECTED';
        stockReq.rejectionReason = req.body.reason || 'Rejected';
        stockReq.approvedBy = req.user._id;
        stockReq.approvedAt = new Date();
        await stockReq.save();

        res.status(200).json({ success: true, data: stockReq });
    } catch (error) {
        next(error);
    }
};

// @desc    COO bulk approve/reject items
// @route   PUT /api/foodrequests/coo-bulk-action
// @access  Private (COO, ADMIN, SUPER_ADMIN)
exports.cooBulkAction = async (req, res, next) => {
    try {
        const { actions } = req.body; // Array of { requestId, itemId, action: 'APPROVED' | 'REJECTED', requestedQty }

        if (!actions || !Array.isArray(actions)) {
            throw new AppError('Invalid actions payload', 400);
        }

        const requestIds = [...new Set(actions.map(a => a.requestId))];
        const updatedRequests = [];

        for (const reqId of requestIds) {
            const stockReq = await StockRequest.findById(reqId);
            if (!stockReq) continue;

            const reqActions = actions.filter(a => a.requestId === reqId);
            
            for (const act of reqActions) {
                const item = stockReq.requestedItems.id(act.itemId);
                if (item) {
                    item.approvalStatus = act.action;
                    if (act.requestedQty !== undefined) {
                        item.requestedQty = Number(act.requestedQty);
                    }
                }
            }

            // Check if all items are acted upon
            const allActed = stockReq.requestedItems.every(i => i.approvalStatus !== 'PENDING');
            if (allActed) {
                const anyRejected = stockReq.requestedItems.some(i => i.approvalStatus === 'REJECTED');
                const allRejected = stockReq.requestedItems.every(i => i.approvalStatus === 'REJECTED');
                
                if (allRejected) {
                    stockReq.status = 'REJECTED';
                } else if (anyRejected) {
                    stockReq.status = 'PARTIAL';
                } else {
                    stockReq.status = 'APPROVED';
                }
                stockReq.approvedBy = req.user._id;
                stockReq.approvedAt = new Date();
            }

            await stockReq.save();
            updatedRequests.push(stockReq);
        }

        res.status(200).json({ success: true, data: updatedRequests, message: 'Bulk action applied successfully' });
    } catch (error) {
        next(error);
    }
};

// @desc    Seed sample stock requests (demo only)
// @route   POST /api/foodrequests/seed-sample
// @access  Private/Admin
exports.seedSampleRequests = async (req, res, next) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') query.entity = req.user.entity;

        const materials = await RawMaterial.find(query).limit(5);
        if (materials.length === 0) {
            throw new AppError('No raw materials found. Add items in Item Config first.', 400);
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

        const created = await StockRequest.insertMany(sampleRequests);
        res.status(201).json({ success: true, count: created.length, data: created });
    } catch (error) {
        next(error);
    }
};

// @desc    Get total raw material demand across all pending requests
// @route   GET /api/foodrequests/demand-summary
// @access  Private (STORE/ADMIN/SUPER_ADMIN/COO)
exports.getDemandSummary = async (req, res, next) => {
    try {
        const result = await require('../services/stockRequestService').getDemandSummary(
            req.user.entity,
            req.user.role,
            req.query.date
        );
        res.status(200).json({ 
            success: true, 
            data: {
                totalOpenDemands: result.totalOpenDemands,
                items: result.data
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Receive stock items at center (updates actual receipt counts)
// @route   PUT /api/foodrequests/:id/receive
// @access  Private (CENTERS)
exports.receiveRequest = async (req, res, next) => {
    try {
        const { items } = req.body;
        const stockReq = await StockRequest.findById(req.params.id);
        
        if (!stockReq) {
            throw new AppError('Request not found', 404);
        }
        
        if (stockReq.status === 'RECEIVED') {
            throw new AppError('Request already marked as received', 400);
        }

        // Deduct stock based on received quantity
        for (const item of items) {
            const originalItem = stockReq.requestedItems.find(i => 
                i.materialName === item.materialName && 
                (i.material?.toString() === item.material?.toString() || 
                 i.bomId?.toString() === item.bomId?.toString() ||
                 i.menuId?.toString() === item.menuId?.toString())
            );

            if (originalItem && item.receivedQty !== undefined) {
                const recQty = Number(item.receivedQty);
                
                if (recQty > 0) {
                    if (originalItem.isMenuItem) {
                        const query = originalItem.bomId ? { _id: originalItem.bomId } : { menuItem: originalItem.menuId };
                        const bom = await Bom.findOne(query);
                        if (bom) {
                            for (const ingredient of bom.items) {
                                const deductQty = ingredient.quantity * recQty;
                                await RawMaterial.findByIdAndUpdate(ingredient.materialId, {
                                    $inc: { currentStock: -deductQty }
                                });
                            }
                        }
                    } else if (originalItem.material) {
                        await RawMaterial.findByIdAndUpdate(originalItem.material, {
                            $inc: { currentStock: -recQty }
                        });
                    }
                }
                originalItem.receivedQty = recQty;
            }
        }

        stockReq.status = 'RECEIVED';
        stockReq.receivedAt = new Date();
        await stockReq.save();

        res.status(200).json({ success: true, data: stockReq, message: 'Receipt confirmed and stock adjusted' });
    } catch (error) {
        next(error);
    }
};
