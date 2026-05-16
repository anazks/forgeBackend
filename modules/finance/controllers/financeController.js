const mongoose = require('mongoose');
const Finance = require('../models/financeModel');
const ExpenseCategory = require('../../expenses/models/expenseCategoryModel');

// @desc    Get all finance records for an entity
// @route   GET /api/finance
// @access  Private
exports.getFinanceRecords = async (req, res, next) => {
    try {
        let query = {};
        
        // If resort login, filter by their entity
        if (req.user.role === 'RESORT') {
            query.entity = req.user.entity;
        } else if (req.query.entityId) {
            query.entity = req.query.entityId;
        }

        const records = await Finance.find(query)
            .populate('category')
            .sort({ date: -1 });

        res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create a finance record
// @route   POST /api/finance
// @access  Private
exports.createFinanceRecord = async (req, res, next) => {
    try {
        req.body.createdBy = req.user.id;
        
        // Auto-assign entity if not provided and user is linked to an entity
        if (!req.body.entity && req.user.entity) {
            req.body.entity = req.user.entity;
        }

        const record = await Finance.create(req.body);

        res.status(201).json({
            success: true,
            data: record
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get dashboard stats for resort
// @route   GET /api/finance/stats
// @access  Private
exports.getFinanceStats = async (req, res, next) => {
    try {
        const entityId = req.user.entity || req.query.entityId;
        if (!entityId) {
            return res.status(400).json({ success: false, error: 'Entity ID is required' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stats = await Finance.aggregate([
            { $match: { entity: new mongoose.Types.ObjectId(entityId) } },
            {
                $facet: {
                    allTime: [
                        {
                            $group: {
                                _id: '$type',
                                total: { $sum: '$amount' }
                            }
                        }
                    ],
                    today: [
                        { $match: { date: { $gte: today } } },
                        {
                            $group: {
                                _id: '$type',
                                total: { $sum: '$amount' }
                            }
                        }
                    ]
                }
            }
        ]);

        const result = {
            totalIncome: 0,
            totalExpense: 0,
            netBalance: 0,
            todayIncome: 0,
            todayExpense: 0
        };

        stats[0].allTime.forEach(stat => {
            if (stat._id === 'INCOME') result.totalIncome = stat.total;
            if (stat._id === 'EXPENSE') result.totalExpense = stat.total;
        });

        stats[0].today.forEach(stat => {
            if (stat._id === 'INCOME') result.todayIncome = stat.total;
            if (stat._id === 'EXPENSE') result.todayExpense = stat.total;
        });

        result.netBalance = result.totalIncome - result.totalExpense;

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
