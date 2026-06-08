const InternalOrder = require('../models/internalOrderModel');
const Bom = require('../../boms/models/bomModel');
const { AppError } = require('../../../middleware/errorHandler');

class ProductionService {
    async getInternalOrders(query) {
        return await InternalOrder.find(query)
            .populate('sourceLocation', 'name')
            .populate('destinationLocation', 'name')
            .populate('items.bomId', 'dishName')
            .populate('foodRequestId', 'functionOrderId')
            .sort({ createdAt: -1 })
            .lean();
    }

    async dispatchOrder(orderId, itemsToDispatch, sourceLocationId, entityId) {
        const order = await InternalOrder.findById(orderId);
        if (!order) {
            throw new AppError('Order not found', 404);
        }

        const inventoryService = require('../../inventory/services/inventoryService');

        /**
         * BUG-K3 Fix: Recursively deduct BOM ingredients including nested sub-assemblies.
         * @param {*} bomId  - The BOM document _id to explode
         * @param {*} qty    - Quantity multiplier (number of dishes)
         * @param {*} locationId - Kitchen/source location
         * @param {*} entityId
         */
        async function deductBomIngredients(bomId, qty, locationId, entityId) {
            const bom = await Bom.findById(bomId).lean();
            if (!bom || !bom.items) return;

            for (const bomItem of bom.items) {
                if (!bomItem.materialId) continue;

                if (bomItem.type === 'BOM Item') {
                    // Recurse into sub-assembly BOM
                    await deductBomIngredients(bomItem.materialId, bomItem.quantity * qty, locationId, entityId);
                } else {
                    // Raw material — safely deduct from location Inventory
                    const requiredQty = bomItem.quantity * qty;
                    await inventoryService.safeDeductStock(
                        bomItem.materialId,
                        locationId,
                        entityId,
                        requiredQty
                    );
                }
            }
        }

        let fullyDispatched = true;
        let anyDispatched = false;

        for (const orderItem of order.items) {
            const dispatchReq = itemsToDispatch.find(i => i.itemId === orderItem._id.toString());
            if (dispatchReq && dispatchReq.dispatchQty > 0) {
                const qtyToDispatch = Number(dispatchReq.dispatchQty);

                // BUG-K1 Fix: If this item is already fully dispatched, skip re-deduction
                if (orderItem.status === 'DISPATCHED') {
                    continue;
                }

                orderItem.dispatchedQty += qtyToDispatch;

                // Deduct ingredients via recursive BOM explosion
                if (orderItem.bomId) {
                    await deductBomIngredients(
                        orderItem.bomId,
                        qtyToDispatch,
                        order.sourceLocation,
                        order.entity
                    );
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

                // BOM items do not come up in inventory (only daily consumption).
                // We check if this item is a BOM item (has bomId or is linked to a Bom).
                let isBomItem = !!orderItem.bomId;
                if (!isBomItem && orderItem.menuId) {
                    const bom = await Bom.findOne({ menuItem: orderItem.menuId }).lean();
                    if (bom) {
                        isBomItem = true;
                    }
                }

                if (!isBomItem) {
                    let targetId = orderItem.menuId || orderItem.bomId;
                    if (targetId) {
                        await Inventory.findOneAndUpdate(
                            {
                                materialId: targetId,
                                locationId: order.destinationLocation,
                                entity: order.entity
                            },
                            { $inc: { currentStock: qtyToReceive } },
                            { upsert: true, new: true, runValidators: false }
                        );
                    }
                }
            }

            if (orderItem.receivedQty < orderItem.requestedQty) {
                fullyReceived = false;
            }
        }

        if (anyReceived) {
            order.status = fullyReceived ? 'RECEIVED' : 'PARTIAL_RECEIPT';
            order.receivedAt = new Date();
            await order.save();

            if (order.foodRequestId) {
                const FoodRequestModel = require('../../stockrequests/models/stockRequestModel');
                const foodReq = await FoodRequestModel.findById(order.foodRequestId).lean().select('functionOrderId');
                if (foodReq && foodReq.functionOrderId) {
                    const functionOrderService = require('../../functionorders/services/functionOrderService');
                    await functionOrderService.syncFunctionOrderStatus(foodReq.functionOrderId);
                }
            }
        }

        return order;
    }
}

module.exports = new ProductionService();
