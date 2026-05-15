const Payment = require('../models/paymentModel');
const User = require('../../users/models/model');

// @desc    Create a payment record
// @route   POST /api/payments
// @access  Private (Super Admin or Admin)
exports.createPayment = async (req, res, next) => {
    try {
        const { adminId, amount, paymentType, duration, transactionId } = req.body;

        const payment = await Payment.create({
            admin: adminId,
            amount,
            paymentType,
            duration,
            transactionId,
            status: 'Pending'
        });

        res.status(201).json({ success: true, data: payment });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Confirm payment and update admin status
// @route   PUT /api/payments/:id/confirm
// @access  Private (Super Admin)
exports.confirmPayment = async (req, res, next) => {
    try {
        const payment = await Payment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment record not found' });
        }

        if (payment.status === 'Success') {
            return res.status(400).json({ success: false, error: 'Payment already confirmed' });
        }

        // Update payment status
        payment.status = 'Success';
        await payment.save();

        // Update Admin User
        const admin = await User.findById(payment.admin);
        if (admin) {
            admin.isActive = true;
            
            // Extend license
            const currentExpire = admin.licenseExpires && admin.licenseExpires > new Date() 
                ? admin.licenseExpires 
                : new Date();
            
            const newExpire = new Date(currentExpire);
            newExpire.setMonth(newExpire.getMonth() + payment.duration);
            
            admin.licenseExpires = newExpire;
            await admin.save();
        }

        res.status(200).json({ success: true, data: payment });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Process a manual renewal (one-step)
// @route   POST /api/payments/manual-renewal
// @access  Private (Super Admin)
exports.manualRenewal = async (req, res, next) => {
    try {
        const { adminId, amount, duration, paymentType, customLicenseDate } = req.body;

        const admin = await User.findById(adminId).select('+password');
        if (!admin) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const payment = await Payment.create({
            admin: adminId,
            amount,
            paymentType: paymentType || 'Custom',
            duration,
            status: 'Success',
            transactionId: `MAN-${Date.now()}`,
            paymentDate: new Date()
        });

        admin.isActive = true;

        if (customLicenseDate) {
            // Super admin override: use exact date from calendar
            admin.licenseExpires = new Date(customLicenseDate);
        } else {
            // Default: extend by exact 30-day periods from current expiry or today
            const base = (admin.licenseExpires && admin.licenseExpires > new Date())
                ? admin.licenseExpires
                : new Date();
            admin.licenseExpires = new Date(base.getTime() + parseInt(duration) * 30 * 24 * 60 * 60 * 1000);
        }

        await admin.save();
        res.status(201).json({ success: true, data: payment, admin });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get payment statistics for dashboard
// @route   GET /api/payments/stats
// @access  Private (Super Admin)
exports.getPaymentStats = async (req, res, next) => {
    try {
        const totalRevenue = await Payment.aggregate([
            { $match: { status: 'Success' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const recentPayments = await Payment.find({ status: 'Success' })
            .sort('-paymentDate')
            .limit(5)
            .populate('admin', 'name licenseNumber');

        res.status(200).json({
            success: true,
            totalRevenue: totalRevenue[0]?.total || 0,
            recentPayments
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all payments
// @route   GET /api/payments
// @access  Private (Super Admin)
exports.getPayments = async (req, res, next) => {
    try {
        const payments = await Payment.find().populate('admin', 'name email licenseNumber');
        res.status(200).json({ success: true, data: payments });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get month-over-month revenue for a calendar year
// @route   GET /api/payments/monthly?year=2024
// @access  Private (Super Admin)
exports.getMonthlyRevenue = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const start = new Date(year, 0, 1);
        const end = new Date(year + 1, 0, 1);

        const data = await Payment.aggregate([
            { $match: { status: 'Success', paymentDate: { $gte: start, $lt: end } } },
            { $group: { _id: { month: { $month: '$paymentDate' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { '_id.month': 1 } }
        ]);

        // Fill all 12 months
        const months = Array.from({ length: 12 }, (_, i) => {
            const found = data.find(d => d._id.month === i + 1);
            return { month: i + 1, total: found?.total || 0, count: found?.count || 0 };
        });

        const yearTotal = months.reduce((sum, m) => sum + m.total, 0);
        res.status(200).json({ success: true, year, yearTotal, data: months });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
