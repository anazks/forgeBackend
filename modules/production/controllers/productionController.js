const productionService = require('../services/productionService');

// @desc    Get all internal orders (for Receive and Send tabs)
// @route   GET /api/production/orders
exports.getInternalOrders = async (req, res, next) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        }

        const userRole = req.user.role;
        const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || userRole === 'COO';

        let targetLocation = req.query.locationId;
        if (!targetLocation || targetLocation === 'ALL') {
            if (!isAdmin) {
                targetLocation = req.user._id;
            }
        }

        if (targetLocation && targetLocation !== 'ALL') {
            if (req.query.type === 'send') {
                query.sourceLocation = targetLocation;
            } else if (req.query.type === 'receive') {
                query.destinationLocation = targetLocation;
            }
        }

        if (req.query.type === 'receive') {
            query.status = { $ne: 'PENDING' };
        }

        const orders = await productionService.getInternalOrders(query);

        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        next(error);
    }
};

// @desc    Dispatch items (Send)
// @route   POST /api/production/orders/:id/dispatch
exports.dispatchOrder = async (req, res, next) => {
    try {
        const { itemsToDispatch } = req.body; // Array of { itemId, dispatchQty }

        // H2 ownership check: non-admin users can only dispatch from their own location.
        // productionService.dispatchOrder validates the order exists and uses order.sourceLocation
        // for inventory deductions. We pre-check here to fail fast with a clear 403 message.
        const isAdminRole = ['COO', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
        if (!isAdminRole) {
            const InternalOrder = require('../models/internalOrderModel');
            const order = await InternalOrder.findById(req.params.id).lean().select('sourceLocation');
            if (order && order.sourceLocation.toString() !== req.user._id.toString()) {
                const { AppError } = require('../../../middleware/errorHandler');
                throw new AppError('You can only dispatch orders from your own location', 403);
            }
        }

        const order = await productionService.dispatchOrder(
            req.params.id,
            itemsToDispatch,
            req.user._id,
            req.user.entity
        );
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

// @desc    Receive items
// @route   POST /api/production/orders/:id/receive
exports.receiveOrder = async (req, res, next) => {
    try {
        const { itemsToReceive } = req.body; // Array of { itemId, receiveQty }
        const order = await productionService.receiveOrder(
            req.params.id,
            itemsToReceive,
            req.user._id,
            req.user.entity
        );
        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};
