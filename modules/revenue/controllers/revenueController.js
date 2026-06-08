const revenueService = require('../services/revenueService');
const { AppError } = require('../../../middleware/errorHandler');

// @desc    Get daily revenue record or dynamic draft data
// @route   GET /api/revenue/daily
// @access  Private
exports.getDailyRevenue = async (req, res, next) => {
    try {
        const { date, startDate, endDate } = req.query;
        if (!date && (!startDate || !endDate)) {
            return res.status(400).json({ success: false, error: 'Either date or both startDate & endDate query parameters are required' });
        }

        let locationId = req.user._id;
        const isAdminOrPartner = ['SUPER_ADMIN', 'ADMIN', 'COO', 'PARTNER'].includes(req.user.role);
        if (isAdminOrPartner && req.query.centerId) {
            if (req.query.centerId === 'ALL') {
                locationId = 'ALL';
            } else if (typeof req.query.centerId === 'string' && req.query.centerId.includes(',')) {
                locationId = req.query.centerId.split(',');
            } else {
                locationId = req.query.centerId;
            }
        }

        let entityId = req.user.entity;
        if (req.user.role === 'SUPER_ADMIN' && req.query.entity) {
            entityId = req.query.entity;
        }

        let data;
        if (startDate && endDate) {
            data = await revenueService.getConsolidatedRevenue(locationId, startDate, endDate, entityId);
        } else {
            data = await revenueService.getDailyRevenue(locationId, date, entityId);
        }

        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Confirm a single revenue tab (B2B, B2C, or Online)
// @route   POST /api/revenue/daily/confirm-tab
// @access  Private
exports.confirmRevenueTab = async (req, res, next) => {
    try {
        const { date, tabType, salesData, isDraft } = req.body;
        if (!date || !tabType || !salesData) {
            return res.status(400).json({ success: false, error: 'date, tabType, and salesData are required fields' });
        }

        let locationId = req.user._id;
        const isAdminOrPartner = ['SUPER_ADMIN', 'ADMIN', 'COO', 'PARTNER'].includes(req.user.role);
        if (isAdminOrPartner && req.query.centerId) {
            locationId = req.query.centerId;
        }

        let entityId = req.user.entity;
        if (req.user.role === 'SUPER_ADMIN' && req.query.entity) {
            entityId = req.query.entity;
        }

        const data = await revenueService.confirmRevenueTab(locationId, date, tabType, salesData, entityId, isDraft);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
// @desc    Close daily revenue and execute inventory deductions
// @route   POST /api/revenue/daily/close
// @access  Private
exports.closeDailyRevenue = async (req, res, next) => {
    try {
        const { date } = req.body;
        if (!date) {
            return res.status(400).json({ success: false, error: 'date is required' });
        }

        let locationId = req.user._id;
        const isAdminOrPartner = ['SUPER_ADMIN', 'ADMIN', 'COO', 'PARTNER'].includes(req.user.role);
        if (isAdminOrPartner && req.query.centerId) {
            locationId = req.query.centerId;
        }

        let entityId = req.user.entity;
        if (req.user.role === 'SUPER_ADMIN' && req.query.entity) {
            entityId = req.query.entity;
        }

        const data = await revenueService.closeDailyRevenue(locationId, date, entityId, req.user);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Get finance rollups & pending actions
// @route   GET /api/revenue/finance/stats
// @access  Private/Finance
exports.getFinanceStats = async (req, res, next) => {
    try {
        let entityId = req.user.entity;
        if (req.user.role === 'SUPER_ADMIN' && req.query.entity) {
            entityId = req.query.entity;
        }
        const data = await revenueService.getFinanceDashboardStats(entityId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Get finance daily log detail for a location
// @route   GET /api/revenue/finance/location/:locationId
// @access  Private/Finance
exports.getFinanceLocationDetails = async (req, res, next) => {
    try {
        let entityId = req.user.entity;
        if (req.user.role === 'SUPER_ADMIN' && req.query.entity) {
            entityId = req.query.entity;
        }
        const { locationId } = req.params;
        const data = await revenueService.getFinanceLocationDetails(locationId, entityId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Reconcile daily logs and save verification
// @route   POST /api/revenue/finance/verify
// @access  Private/Finance
exports.saveFinanceVerification = async (req, res, next) => {
    try {
        const { locationId, date, verificationData } = req.body;
        if (!locationId || !date || !verificationData) {
            return res.status(400).json({ success: false, error: 'locationId, date, and verificationData are required' });
        }
        const data = await revenueService.saveFinanceVerification(locationId, date, verificationData);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.getCashClosure = async (req, res, next) => {
    try {
        const { date } = req.query;
        if (!date) {
            throw new AppError('Date is required', 400);
        }

        let locationId = req.user._id;
        const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'COO'].includes(req.user.role);
        if (isAdmin && req.query.locationId) {
            locationId = req.query.locationId;
        }

        let entityId = req.user.entity;
        if (req.user.role === 'SUPER_ADMIN' && req.query.entity) {
            entityId = req.query.entity;
        }

        const data = await revenueService.getCashClosureData(locationId, date, entityId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.saveCashClosure = async (req, res, next) => {
    try {
        const { date, data } = req.body;
        if (!date || !data) {
            throw new AppError('date and data are required fields', 400);
        }

        const locationId = req.body.locationId || req.user._id;
        const result = await revenueService.saveCashClosure(locationId, date, data);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.submitCashClosure = async (req, res, next) => {
    try {
        const { date } = req.body;
        if (!date) {
            throw new AppError('date is required', 400);
        }

        const locationId = req.body.locationId || req.user._id;
        const result = await revenueService.submitCashClosureForCOO(locationId, date);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.cooApproveCashClosure = async (req, res, next) => {
    try {
        const { locationId, date, approvedExpenses, closureUpdates, b2cSales, b2bSales } = req.body;
        if (!locationId || !date) {
            throw new AppError('locationId and date are required fields', 400);
        }

        const result = await revenueService.approveDayClosure(locationId, date, approvedExpenses, closureUpdates, b2cSales, b2bSales, req.user);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.getPendingCooCashClosures = async (req, res, next) => {
    try {
        let entityId = req.user.entity;
        if (req.user.role === 'SUPER_ADMIN' && req.query.entity) {
            entityId = req.query.entity;
        }

        const data = await revenueService.getPendingCooCashClosures(entityId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.getPendingFinanceCashClosures = async (req, res, next) => {
    try {
        let entityId = req.user.entity;
        if (req.user.role === 'SUPER_ADMIN' && req.query.entity) {
            entityId = req.query.entity;
        }

        const data = await revenueService.getPendingFinanceCashClosures(entityId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

