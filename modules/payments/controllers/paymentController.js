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
        const { adminId, amount, duration, paymentType } = req.body;

        const admin = await User.findById(adminId).select('+password');
        if (!admin) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Create a successful payment record immediately
        const payment = await Payment.create({
            admin: adminId,
            amount,
            paymentType: paymentType || 'Custom',
            duration,
            status: 'Success',
            transactionId: `MAN-${Date.now()}`,
            paymentDate: new Date()
        });

        // Update User Status and License
        admin.isActive = true;
        const currentExpire = (admin.licenseExpires && admin.licenseExpires > new Date()) 
            ? admin.licenseExpires 
            : new Date();
        
        const newExpire = new Date(currentExpire);
        newExpire.setMonth(newExpire.getMonth() + parseInt(duration));
        
        admin.licenseExpires = newExpire;
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
