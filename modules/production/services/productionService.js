const InternalOrder = require('../models/internalOrderModel');
const Inventory = require('../../inventory/models/inventoryModel');
const Bom = require('../../boms/models/bomModel');
const { AppError } = require('../../../middleware/errorHandler');

class ProductionService {
    async getInternalOrders(query) {
        return await InternalOrder.find(query)
            .populate('sourceLocation', 'name')
            .populate('destinationLocation', 'name')
            .populate('items.bomId', 'dishName')
            .sort({ createdAt: -1 })
            .lean();
    }

    async dispatchOrder(orderId, itemsToDispatch, sourceLocationId, entityId) {
        const order = await InternalOrder.findById(orderId);
        if (!order) {
            throw new AppError('Order not found', 404);
        }

        let fullyDispatched = true;
        let anyDispatched = false;

        for (const orderItem of order.items) {
            const dispatchReq = itemsToDispatch.find(i => i.itemId === orderItem._id.toString());
            if (dispatchReq && dispatchReq.dispatchQty > 0) {
                const qtyToDispatch = Number(dispatchReq.dispatchQty);
                orderItem.dispatchedQty += qtyToDispatch;
                
                // Deduct Raw Materials based on BOM
                if (orderItem.bomId) {
                    const bom = await Bom.findById(orderItem.bomId).lean();
                    if (bom && bom.items) {
                        for (const bomItem of bom.items) {
                            if (bomItem.materialId) {
                                const requiredQty = bomItem.quantity * qtyToDispatch;
                                await Inventory.findOneAndUpdate(
                                    { 
                                        materialId: bomItem.materialId, 
                                        locationId: order.sourceLocation,
                                        entity: order.entity
                                    },
                                    { $inc: { currentStock: -requiredQty } },
                                    { upsert: true, new: true, runValidators: false }
                                );
                            }
                        }
                    }
                }
                anyDispatched = true;
                
                if (orderItem.dispatchedQty >= orderItem.requestedQty) {
                    orderItem.status = 'DISPATCHED';
                } else {
                    orderItem.status = 'PENDING';
                }
            }

            if (orderItem.dispatchedQty < orderItem.requestedQty) {
                fullyDispatched = false;
            }
        }

        if (anyDispatched) {
            order.status = fullyDispatched ? 'DISPATCHED' : 'PARTIAL_DISPATCH';
            order.dispatchedAt = new Date();
            await order.save();
        }

        return order;
    }

    async receiveOrder(orderId, itemsToReceive, destinationLocationId, entityId) {
        const order = await InternalOrder.findById(orderId);
        if (!order) {
            throw new AppError('Order not found', 404);
        }

        let fullyReceived = true;
        let anyReceived = false;

        for (const orderItem of order.items) {
            const receiveReq = itemsToReceive.find(i => i.itemId === orderItem._id.toString());
            if (receiveReq && receiveReq.receiveQty > 0) {
                const qtyToReceive = Number(receiveReq.receiveQty);
                orderItem.receivedQty += qtyToReceive;

                if (orderItem.dispatchedQty > 0) {
                    if (orderItem.receivedQty >= orderItem.dispatchedQty) {
                        orderItem.status = 'RECEIVED';
                    } else {
                        orderItem.status = 'PARTIAL_RECEIPT';
                    }
                }
                anyReceived = true;
            }

            if (orderItem.receivedQty < orderItem.requestedQty) {
                fullyReceived = false;
            }
        }

        if (anyReceived) {
            order.status = fullyReceived ? 'RECEIVED' : 'PARTIAL_RECEIPT';
            order.receivedAt = new Date();
            await order.save();
        }

        return order;
    }
}

module.exports = new ProductionService();
