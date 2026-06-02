const functionOrderService = require('../services/functionOrderService');
const { AppError } = require('../../../middleware/errorHandler');

exports.createFunctionOrder = async (req, res, next) => {
    try {
        const order = await functionOrderService.createFunctionOrder(req.body, req.user);
        res.status(201).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

exports.getFunctionOrders = async (req, res, next) => {
    try {
        const isCorporate = ['ADMIN', 'SUPER_ADMIN', 'COO', 'FINANCE'].includes(req.user.role);
        const searchId = isCorporate ? (req.user.entity?._id || req.user.entity) : req.user._id;
        const orders = await functionOrderService.getFunctionOrders(searchId, isCorporate, req.query.status);
        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        next(error);
    }
};

exports.updateFunctionOrderDishes = async (req, res, next) => {
    try {
        const centerId = req.user._id;
        const order = await functionOrderService.updateFunctionOrderDishes(req.params.id, req.body.dishes, centerId);
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

exports.setTotalOrderValue = async (req, res, next) => {
    try {
        const centerId = req.user._id;
        const order = await functionOrderService.setTotalOrderValue(req.params.id, req.body.totalOrderValue, centerId);
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

exports.placeFunctionOrderRequest = async (req, res, next) => {
    try {
        const centerId = req.user._id;
        const { deliveryDate } = req.body;
        if (!deliveryDate) {
            throw new AppError('Delivery date is required to place request', 400);
        }
        const order = await functionOrderService.placeFunctionOrderRequest(req.params.id, deliveryDate, centerId);
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

exports.confirmSettlement = async (req, res, next) => {
    try {
        const centerId = req.user._id;
        const { paymentMode, paymentAmount } = req.body;
        if (!paymentMode || paymentAmount === undefined) {
            throw new AppError('paymentMode and paymentAmount are required', 400);
        }
        const order = await functionOrderService.confirmSettlement(req.params.id, paymentMode, paymentAmount, centerId);
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

exports.acknowledgeByFinance = async (req, res, next) => {
    try {
        const userRole = req.user.role;
        const isFinanceOrAdmin = ['FINANCE', 'COO', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);
        if (!isFinanceOrAdmin) {
            throw new AppError('Access denied: only finance or admin/COO can acknowledge settlements', 403);
        }

        const { note } = req.body;
        const order = await functionOrderService.acknowledgeByFinance(req.params.id, note, req.user);
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

exports.getPendingFinanceOrders = async (req, res, next) => {
    try {
        const userRole = req.user.role;
        const isFinanceOrAdmin = ['FINANCE', 'COO', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);
        if (!isFinanceOrAdmin) {
            throw new AppError('Access denied: only finance or admin/COO can view pending settlements', 403);
        }

        const entityId = req.user.entity;
        const data = await functionOrderService.getPendingFinanceOrders(entityId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
