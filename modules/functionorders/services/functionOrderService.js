const FunctionOrder = require('../models/functionOrderModel');
const FoodRequest = require('../../stockrequests/models/stockRequestModel');
const DailyRevenue = require('../../revenue/models/dailyRevenueModel');
const InternalOrder = require('../../production/models/internalOrderModel');
const User = require('../../users/models/model');
const { AppError } = require('../../../middleware/errorHandler');

class FunctionOrderService {
    async createFunctionOrder(data, user) {
        const { eventDate, description, advanceAmount, advancePaymentMode, totalOrderValue, dishes } = data;

        if (!eventDate || !description || advancePaymentMode === undefined) {
            throw new AppError('Event date, description, and advance payment mode are required', 400);
        }
        const parsedAdvance = Number(advanceAmount) || 0;
        const advanceFinanceAcknowledged = parsedAdvance === 0;
        const advanceFinanceAcknowledgedAt = advanceFinanceAcknowledged ? new Date() : null;

        const functionOrder = await FunctionOrder.create({
            centerId: user._id,
            entity: user.entity,
            eventDate: new Date(eventDate),
            description,
            advanceAmount: parsedAdvance,
            advancePaymentMode,
            totalOrderValue: Number(totalOrderValue) || 0,
            pendingReceivable: Math.max(0, (Number(totalOrderValue) || 0) - parsedAdvance),
            dishes: dishes || [],
            status: 'OPEN',
            advanceFinanceAcknowledged,
            advanceFinanceAcknowledgedAt
        });

        return functionOrder;
    }

    async updateFunctionOrder(id, data, centerId) {
        const order = await FunctionOrder.findOne({ _id: id, centerId });
        if (!order) {
            throw new AppError('Function order not found', 404);
        }
        if (order.status !== 'OPEN') {
            throw new AppError('Details can only be modified when the order is in OPEN status', 400);
        }

        const { eventDate, description, advanceAmount, advancePaymentMode, totalOrderValue } = data;

        if (eventDate) order.eventDate = new Date(eventDate);
        if (description !== undefined) order.description = description;
        if (advanceAmount !== undefined) order.advanceAmount = Number(advanceAmount) || 0;
        if (advancePaymentMode !== undefined) order.advancePaymentMode = advancePaymentMode;
        if (totalOrderValue !== undefined) order.totalOrderValue = Number(totalOrderValue) || 0;

        order.pendingReceivable = Math.max(0, order.totalOrderValue - order.advanceAmount - (order.finalPaymentAmount || 0));

        await order.save();
        return order;
    }

    async getFunctionOrders(searchId, isCorporate, statusFilter) {
        const query = isCorporate ? { entity: searchId } : { centerId: searchId };
        if (statusFilter) {
            query.status = { $in: statusFilter.split(',') };
        }
        return await FunctionOrder.find(query).sort({ eventDate: 1 }).lean();
    }

    async updateFunctionOrderDishes(id, dishes, centerId) {
        const order = await FunctionOrder.findOne({ _id: id, centerId });
        if (!order) {
            throw new AppError('Function order not found', 404);
        }
        if (order.status !== 'OPEN') {
            throw new AppError('Dishes can only be modified when the order is in OPEN status', 400);
        }

        order.dishes = dishes || [];
        await order.save();
        return order;
    }

    async setTotalOrderValue(id, value, centerId) {
        const order = await FunctionOrder.findOne({ _id: id, centerId });
        if (!order) {
            throw new AppError('Function order not found', 404);
        }
        const allowedStatuses = ['OPEN', 'REQUEST_PLACED', 'DELIVERED', 'PENDING_SETTLEMENT'];
        if (!allowedStatuses.includes(order.status)) {
            throw new AppError(`Total order value cannot be modified in status: ${order.status}`, 400);
        }

        order.totalOrderValue = Number(value) || 0;
        order.pendingReceivable = Math.max(0, order.totalOrderValue - order.advanceAmount - (order.finalPaymentAmount || 0));
        await order.save();
        return order;
    }

    async placeFunctionOrderRequest(id, deliveryDate, centerId) {
        const order = await FunctionOrder.findOne({ _id: id, centerId });
        if (!order) {
            throw new AppError('Function order not found', 404);
        }
        if (order.status !== 'OPEN') {
            throw new AppError('Request can only be placed for OPEN orders', 400);
        }
        if (!order.dishes || order.dishes.length === 0) {
            throw new AppError('Cannot place request for order with no dishes', 400);
        }

        const centerUser = await User.findById(centerId).lean();
        if (!centerUser) {
            throw new AppError('Center user not found', 404);
        }

        // Map dishes to requestedItems for StockRequest
        const requestedItems = order.dishes.map(d => ({
            bomId: d.bomId,
            menuId: d.menuId,
            isMenuItem: true,
            materialName: d.itemName,
            requestedQty: d.qty,
            unit: d.unit || 'pcs',
            approvalStatus: 'PENDING'
        }));

        // Create standard FoodRequest
        const foodRequest = await FoodRequest.create({
            centerName: centerUser.name,
            centerId: order.centerId,
            entity: order.entity,
            requestedItems,
            status: 'PENDING',
            notes: `Function Order Booking Reference: ${order.foCode}. ${order.description}`,
            deliveryDate: new Date(deliveryDate),
            functionOrderId: order._id
        });

        order.foodRequestId = foodRequest._id;
        order.status = 'REQUEST_PLACED';
        await order.save();

        return order;
    }

    async confirmSettlement(id, paymentMode, paymentAmount, centerId) {
        const order = await FunctionOrder.findOne({ _id: id, centerId });
        if (!order) {
            throw new AppError('Function order not found', 404);
        }

        const allowedStatuses = ['REQUEST_PLACED', 'DELIVERED', 'PENDING_SETTLEMENT'];
        if (!allowedStatuses.includes(order.status)) {
            throw new AppError(`Order cannot be settled in status: ${order.status}`, 400);
        }

        // HARD BLOCK: Center cannot confirm a CASH settlement if Cash Closure is already submitted today
        if (paymentMode === 'Cash') {
            const today = new Date();
            const start = new Date(today);
            start.setHours(0, 0, 0, 0);
            const end = new Date(today);
            end.setHours(23, 59, 59, 999);

            const closure = await DailyRevenue.findOne({
                locationId: centerId,
                date: { $gte: start, $lte: end }
            }).lean();

            if (closure && closure.cashClosure && closure.cashClosure.submittedForCOO) {
                throw new AppError("Today's Cash Closure is already submitted. Cash settlements must be confirmed before submitting Cash Closure.", 400);
            }
        }
        order.finalPaymentMode = paymentMode;
        const parsedFinalAmount = Number(paymentAmount) || 0;
        order.finalPaymentAmount = parsedFinalAmount;
        order.finalPaymentReceivedAt = new Date();
        order.pendingReceivable = Math.max(0, order.totalOrderValue - order.advanceAmount - order.finalPaymentAmount);
        order.status = 'SETTLED';
        order.linkedToCashClosure = false; // Cash Closure engine will link it later

        if (parsedFinalAmount === 0) {
            order.finalFinanceAcknowledged = true;
            order.finalFinanceAcknowledgedAt = new Date();
            if (order.advanceFinanceAcknowledged) {
                order.status = 'CLOSED';
            }
        }

        await order.save();
        return order;    }

    async linkToCashClosure(id, cashClosureDate) {
        const order = await FunctionOrder.findById(id);
        if (!order) return;
        order.linkedToCashClosure = true;
        order.cashClosureDate = new Date(cashClosureDate);
        await order.save();
    }

    async acknowledgeByFinance(id, note, financeUser) {
        const order = await FunctionOrder.findById(id);
        if (!order) {
            throw new AppError('Function order not found', 404);
        }

        order.financeAcknowledged = true;
        order.financeAcknowledgedAt = new Date();
        order.financeNote = note || (order.finalPaymentMode === 'Cash' 
            ? "Cash collection confirmed at center. Deposit to be verified via Cash Receivables."
            : "");
        
        // Also mark both new split reconciliation fields true for backward compatibility
        order.advanceFinanceAcknowledged = true;
        order.advanceFinanceAcknowledgedAt = new Date();
        order.finalFinanceAcknowledged = true;
        order.finalFinanceAcknowledgedAt = new Date();
        order.status = 'CLOSED';

        await order.save();
        return order;
    }

    async acknowledgeAdvanceByFinance(id, note, financeUser) {
        const order = await FunctionOrder.findById(id);
        if (!order) {
            throw new AppError('Function order not found', 404);
        }

        order.advanceFinanceAcknowledged = true;
        order.advanceFinanceAcknowledgedAt = new Date();
        order.advanceFinanceNote = note || (order.advancePaymentMode === 'Cash' 
            ? "Cash advance collection confirmed at center."
            : "");

        // If final payment is also already acknowledged, close the order
        if (order.finalFinanceAcknowledged) {
            order.status = 'CLOSED';
        }

        await order.save();
        return order;
    }

    async acknowledgeFinalByFinance(id, note, financeUser) {
        const order = await FunctionOrder.findById(id);
        if (!order) {
            throw new AppError('Function order not found', 404);
        }

        order.finalFinanceAcknowledged = true;
        order.finalFinanceAcknowledgedAt = new Date();
        order.finalFinanceNote = note || (order.finalPaymentMode === 'Cash' 
            ? "Cash collection confirmed at center. Deposit to be verified via Cash Receivables."
            : "");

        // If advance is also already acknowledged, close the order
        if (order.advanceFinanceAcknowledged) {
            order.status = 'CLOSED';
        }

        await order.save();
        return order;
    }

    async syncFunctionOrderStatus(functionOrderId) {
        const order = await FunctionOrder.findById(functionOrderId);
        if (!order) return;

        if (order.status !== 'REQUEST_PLACED') return; // Only transition from REQUEST_PLACED

        const foodRequest = await FoodRequest.findById(order.foodRequestId).lean();
        if (!foodRequest) return;

        // If stock request itself is marked received
        if (foodRequest.status === 'RECEIVED') {
            order.status = 'PENDING_SETTLEMENT';
            await order.save();
            return;
        }

        // Check if there are internal orders and all are RECEIVED
        const internalOrders = await InternalOrder.find({ foodRequestId: order.foodRequestId }).lean();
        if (internalOrders.length > 0) {
            const allReceived = internalOrders.every(io => io.status === 'RECEIVED');
            if (allReceived) {
                order.status = 'PENDING_SETTLEMENT';
                await order.save();
            }
        }
    }

    // Helper functions for Cash Closure engine
    async getCashAdvancesForDate(locationId, dateStart, dateEnd) {
        const advances = await FunctionOrder.find({
            centerId: locationId,
            advancePaymentMode: 'Cash',
            bookingDate: { $gte: dateStart, $lte: dateEnd }
        }).lean();

        return advances.reduce((sum, order) => sum + (order.advanceAmount || 0), 0);
    }

    async getCashFinalPaymentsForDate(locationId, dateStart, dateEnd) {
        const payments = await FunctionOrder.find({
            centerId: locationId,
            finalPaymentMode: 'Cash',
            status: 'SETTLED',
            finalPaymentReceivedAt: { $gte: dateStart, $lte: dateEnd },
            linkedToCashClosure: false
        }).lean();

        return {
            totalAmount: payments.reduce((sum, order) => sum + (order.finalPaymentAmount || 0), 0),
            ids: payments.map(p => p._id)
        };
    }

    async getPendingFinanceOrders(entityId) {
        // 1. Fetch pending advances (where advanceAmount > 0 and not yet acknowledged by finance)
        const pendingAdvances = await FunctionOrder.find({
            entity: entityId,
            advanceAmount: { $gt: 0 },
            advanceFinanceAcknowledged: false
        }).populate('centerId', 'name').lean();

        // 2. Fetch pending final payments (where order is SETTLED and final payment is not yet acknowledged)
        // For cash settlements, they must be linked to daily cash closure first.
        // For non-cash settlements, they are ready for reconciliation immediately.
        const pendingFinalPayments = await FunctionOrder.find({
            entity: entityId,
            status: 'SETTLED',
            finalFinanceAcknowledged: false,
            $or: [
                { finalPaymentMode: { $ne: 'Cash' } },
                { finalPaymentMode: 'Cash', linkedToCashClosure: true }
            ]
        }).populate('centerId', 'name').lean();

        // Return both structures to maintain legacy compatibility if needed
        const legacyNonCash = pendingFinalPayments.filter(fo => fo.finalPaymentMode !== 'Cash');
        const legacyCash = pendingFinalPayments.filter(fo => fo.finalPaymentMode === 'Cash');

        return { 
            pendingAdvances, 
            pendingFinalPayments,
            nonCash: legacyNonCash,
            cash: legacyCash
        };
    }
}

module.exports = new FunctionOrderService();
