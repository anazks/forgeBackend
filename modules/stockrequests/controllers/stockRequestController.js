const StockRequest = require('../models/stockRequestModel');
const Bom = require('../../boms/models/bomModel');
const InternalOrder = require('../../production/models/internalOrderModel');
const { AppError } = require('../../../middleware/errorHandler');
const userService = require('../../users/services/userService');
// L9: RawMaterial removed — was imported but never used in this controller.
// Raw material data access goes through rawMaterialService (called from stockRequestService).

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

        // BUG-CO3 Fix: Check if Kitchen has already dispatched more than the new qty
        const relatedOrders = await InternalOrder.find({ foodRequestId: req.params.id }).lean();
        let alreadyDispatched = 0;
        for (const order of relatedOrders) {
            const orderItem = order.items.find(i =>
                (item.bomId && i.bomId?.toString() === item.bomId.toString()) ||
                (item.menuId && i.menuId?.toString() === item.menuId.toString()) ||
                (i.itemName === item.materialName)
            );
            if (orderItem && (orderItem.dispatchedQty || 0) > alreadyDispatched) {
                alreadyDispatched = orderItem.dispatchedQty || 0;
            }
        }

        if (Number(requestedQty) < alreadyDispatched) {
            throw new AppError(
                `Cannot reduce quantity to ${requestedQty}. Kitchen has already dispatched ${alreadyDispatched} unit(s) for this item. Please enter ${alreadyDispatched} or more.`,
                400
            );
        }

        item.requestedQty = Math.max(0, Number(requestedQty));
        await stockReq.save();
        await syncInternalOrdersForRequest(stockReq);

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

        // Sync Internal Orders
        await syncInternalOrdersForRequest(stockReq);

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
        // BUG-CO2 Fix: track requests that were not found so COO sees a meaningful partial failure report
        const skippedRequestIds = [];

        for (const reqId of requestIds) {
            const stockReq = await StockRequest.findById(reqId);
            if (!stockReq) {
                skippedRequestIds.push(reqId);
                continue;
            }

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
            const anyActed = stockReq.requestedItems.some(i => i.approvalStatus !== 'PENDING');
            if (anyActed) {
                const allActed = stockReq.requestedItems.every(i => i.approvalStatus !== 'PENDING');
                if (allActed) {
                    const allRejected = stockReq.requestedItems.every(i => i.approvalStatus === 'REJECTED');
                    if (allRejected) {
                        stockReq.status = 'REJECTED';
                    } else {
                        const anyRejected = stockReq.requestedItems.some(i => i.approvalStatus === 'REJECTED');
                        stockReq.status = anyRejected ? 'PARTIAL' : 'APPROVED';
                    }
                } else {
                    stockReq.status = 'PARTIAL';
                }
                stockReq.approvedBy = req.user._id;
                stockReq.approvedAt = new Date();
            }

            await stockReq.save();
            await syncInternalOrdersForRequest(stockReq);
            updatedRequests.push(stockReq);
        }

        const response = {
            success: true,
            data: updatedRequests,
            message: skippedRequestIds.length > 0
                ? `Bulk action applied. ${skippedRequestIds.length} request(s) were skipped (not found or deleted): ${skippedRequestIds.join(', ')}`
                : 'Bulk action applied successfully',
            skippedRequestIds
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

// @desc    Seed sample stock requests (demo only)
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

        // H5 Fix: Atomic status guard — prevents double-receipt from concurrent requests
        // (e.g., double-click, network retry). MongoDB guarantees this check+update is
        // indivisible: only the FIRST call wins; the second sees no matching document.
        const guard = await StockRequest.findOneAndUpdate(
            { _id: req.params.id, status: { $ne: 'RECEIVED' } },
            { $set: { status: 'RECEIVED', receivedAt: new Date() } },
            { new: true }
        );

        if (!guard) {
            // Either not found, or already received by a concurrent request
            const existing = await StockRequest.findById(req.params.id).lean().select('status');
            if (!existing) throw new AppError('Request not found', 404);
            throw new AppError('Request already marked as received', 400);
        }

        // Now process the individual item quantities against the atomically-locked record
        const stockReq = await StockRequest.findById(req.params.id);
        const Inventory = require('../../inventory/models/inventoryModel');

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
                    // BOM items (dishes) are daily-consumption — do NOT track in Inventory
                    if (originalItem.isMenuItem) {
                        // No inventory update needed for BOM/dish items
                    } else if (originalItem.material) {
                        // Raw material: increment stock at the receiving center's Inventory record
                        await Inventory.findOneAndUpdate(
                            {
                                materialId: originalItem.material,
                                locationId: stockReq.centerId,
                                entity: stockReq.entity
                            },
                            { $inc: { currentStock: recQty } },
                            { upsert: true, new: true, runValidators: false }
                        );
                    }
                }
                originalItem.receivedQty = recQty;
            }
        }

        // status + receivedAt already set by the atomic guard above; save item quantities
        await stockReq.save();

        if (stockReq.functionOrderId) {
            const functionOrderService = require('../../functionorders/services/functionOrderService');
            await functionOrderService.syncFunctionOrderStatus(stockReq.functionOrderId);
        }

        res.status(200).json({ success: true, data: stockReq, message: 'Receipt confirmed and stock adjusted' });
    } catch (error) {
        next(error);
    }
};

async function syncInternalOrdersForRequest(stockReq) {
    const internalOrdersMap = {}; // Key: "sourceLocId->destLocId"

    async function explodeAndMap(bomId, menuId, itemName, qty, unit, currentDestinationLocId) {
        const bom = await Bom.findById(bomId);
        if (!bom) return;

        const prepLocId = bom.preparationLocation?.toString() || currentDestinationLocId;

        // If prepLoc is different from currentDestinationLocId OR it matches the requesting center (self-preparing),
        // we create an internal order from prepLocId to currentDestinationLocId.
        if (prepLocId !== currentDestinationLocId || prepLocId === stockReq.centerId.toString()) {
            const key = `${prepLocId}->${currentDestinationLocId}`;
            if (!internalOrdersMap[key]) {
                internalOrdersMap[key] = [];
            }
            const existing = internalOrdersMap[key].find(i => 
                (bomId && i.bomId?.toString() === bomId.toString()) || 
                (menuId && i.menuId?.toString() === menuId.toString()) ||
                (i.itemName === itemName)
            );
            if (existing) {
                existing.requestedQty += qty;
            } else {
                internalOrdersMap[key].push({
                    bomId: bom._id,
                    menuId: menuId,
                    itemName: itemName,
                    requestedQty: qty,
                    unit: unit
                });
            }
            
            // Recurse for nested BOM Item ingredients using prepLocId as destination
            for (const ing of bom.items || []) {
                if (ing.type === 'BOM Item') {
                    const ingQty = ing.quantity * qty;
                    const subBom = await Bom.findOne({
                        $or: [
                            { _id: ing.materialId },
                            { menuItem: ing.materialId }
                        ]
                    }).lean();
                    if (subBom) {
                        await explodeAndMap(
                            subBom._id,
                            subBom.menuItem,
                            subBom.dishName,
                            ingQty,
                            subBom.unit || 'pcs',
                            prepLocId
                        );
                    }
                }
            }
        } else {
            // Self-preparing but not the requesting center (so it is a sub-assembly prepared in-house by prepLocId)
            // Recurse for nested BOM Item ingredients using prepLocId as destination
            for (const ing of bom.items || []) {
                if (ing.type === 'BOM Item') {
                    const ingQty = ing.quantity * qty;
                    const subBom = await Bom.findOne({
                        $or: [
                            { _id: ing.materialId },
                            { menuItem: ing.materialId }
                        ]
                    }).lean();
                    if (subBom) {
                        await explodeAndMap(
                            subBom._id,
                            subBom.menuItem,
                            subBom.dishName,
                            ingQty,
                            subBom.unit || 'pcs',
                            prepLocId
                        );
                    }
                }
            }
        }
    }

    for (const item of stockReq.requestedItems) {
        if (item.approvalStatus === 'APPROVED' && (item.isMenuItem || item.bomId || item.menuId)) {
            const query = item.bomId ? { _id: item.bomId } : { menuItem: item.menuId };
            const bom = await Bom.findOne(query);
            if (bom) {
                await explodeAndMap(
                    bom._id,
                    item.menuId || bom.menuItem,
                    item.materialName,
                    item.requestedQty,
                    item.unit,
                    stockReq.centerId.toString()
                );
            }
        }
    }

    for (const key in internalOrdersMap) {
        const [sourceLocId, destLocId] = key.split('->');
        const newItemsList = internalOrdersMap[key];
        
        let existingOrder = await InternalOrder.findOne({
            foodRequestId: stockReq._id,
            sourceLocation: sourceLocId,
            destinationLocation: destLocId
        });

        if (existingOrder) {
            const updatedItems = [];
            newItemsList.forEach(newItem => {
                const existingItem = existingOrder.items.find(i => 
                    (newItem.bomId && i.bomId?.toString() === newItem.bomId.toString()) || 
                    (newItem.menuId && i.menuId?.toString() === newItem.menuId.toString()) ||
                    (i.itemName === newItem.itemName)
                );
                if (existingItem) {
                    existingItem.requestedQty = newItem.requestedQty;
                    updatedItems.push(existingItem);
                } else {
                    updatedItems.push(newItem);
                }
            });
            existingOrder.items = updatedItems;
            if (existingOrder.items.length === 0) {
                await InternalOrder.findByIdAndDelete(existingOrder._id);
            } else {
                await existingOrder.save();
            }
        } else {
            if (newItemsList.length > 0) {
                await InternalOrder.create({
                    sourceLocation: sourceLocId,
                    destinationLocation: destLocId,
                    entity: stockReq.entity,
                    foodRequestId: stockReq._id,
                    items: newItemsList
                });
            }
        }
    }

    const existingOrders = await InternalOrder.find({ foodRequestId: stockReq._id });
    for (const order of existingOrders) {
        const sourceLocId = order.sourceLocation.toString();
        const destLocId = order.destinationLocation.toString();
        const key = `${sourceLocId}->${destLocId}`;
        if (!internalOrdersMap[key]) {
            await InternalOrder.findByIdAndDelete(order._id);
        }
    }

    // Automatically initialize DailyRevenue logs for involved locations on delivery date
    try {
        const revenueService = require('../../revenue/services/revenueService');
        const deliveryDateStr = stockReq.deliveryDate.toISOString();
        const entityId = stockReq.entity.toString();

        // 1. Destination location (requesting center)
        await revenueService.initializeDailyRevenue(stockReq.centerId.toString(), deliveryDateStr, entityId);

        // 2. Source locations (preparation locations)
        for (const key in internalOrdersMap) {
            const [sourceLocId] = key.split('->');
            await revenueService.initializeDailyRevenue(sourceLocId, deliveryDateStr, entityId);
        }
    } catch (e) {
        console.error('Failed to initialize daily revenue:', e.message);
    }
}
