const Expense = require('../models/expenseModel');
const { AppError } = require('../../../middleware/errorHandler');
const DailyRevenue = require('../../revenue/models/dailyRevenueModel');

// @desc    Create a new expense
// @route   POST /api/expenses
// @access  Private
exports.createExpense = async (req, res, next) => {
    try {
        const { date, description, category, amount, paymentMethod, locationId } = req.body;

        let targetLocationId = req.user._id;
        const isAdminOrCoo = ['SUPER_ADMIN', 'ADMIN', 'COO'].includes(req.user.role);
        if (isAdminOrCoo && locationId) {
            targetLocationId = locationId;
        }

        let entityId = req.user.entity;
        if (req.user.role === 'SUPER_ADMIN' && req.body.entity) {
            entityId = req.body.entity;
        }

        // Check if daily revenue is closed or submitted for approval
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        const record = await DailyRevenue.findOne({
            locationId: targetLocationId,
            date: { $gte: start, $lte: end }
        }).lean();

        if (record && (record.status === 'CLOSED' || (record.cashClosure && record.cashClosure.submittedForCOO) || record.cooApproved)) {
            return next(new AppError('Cannot log or edit expenses for this day as the daily closure is already closed or submitted for approval', 400));
        }

        const expense = await Expense.create({
            locationId: targetLocationId,
            date: new Date(date),
            description,
            category,
            amount: Number(amount),
            paymentMethod,
            entity: entityId,
            status: 'PENDING_COO'
        });

        res.status(201).json({ success: true, data: expense });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all expenses (filtered by role/permissions)
// @route   GET /api/expenses
// @access  Private
exports.getExpenses = async (req, res, next) => {
    try {
        let query = {};

        // Entity scoping
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        } else if (req.query.entity) {
            query.entity = req.query.entity;
        }

        // Role-based permissions
        const isPrivileged = ['SUPER_ADMIN', 'ADMIN', 'COO', 'FINANCE', 'PARTNER'].includes(req.user.role);
        if (!isPrivileged) {
            // Regular user sees only their own location's expenses
            query.locationId = req.user._id;
        } else if (req.query.locationId && req.query.locationId !== 'ALL') {
            if (req.query.locationId.includes(',')) {
                query.locationId = { $in: req.query.locationId.split(',') };
            } else {
                query.locationId = req.query.locationId;
            }
        }

        // Status filter
        if (req.query.status) {
            query.status = req.query.status;
        }

        // Date range filter
        if (req.query.startDate || req.query.endDate) {
            query.date = {};
            if (req.query.startDate) {
                const start = new Date(req.query.startDate);
                start.setHours(0, 0, 0, 0);
                query.date.$gte = start;
            }
            if (req.query.endDate) {
                const end = new Date(req.query.endDate);
                end.setHours(23, 59, 59, 999);
                query.date.$lte = end;
            }
        }

        const expenses = await Expense.find(query)
            .populate('locationId', 'name role')
            .sort({ date: -1, createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, count: expenses.length, data: expenses });
    } catch (error) {
        next(error);
    }
};

// @desc    COO Approve expense
// @route   PUT /api/expenses/:id/coo-approve
// @access  Private (COO only)
exports.cooApproveExpense = async (req, res, next) => {
    try {
        const expense = await Expense.findById(req.params.id);
        if (!expense) {
            return next(new AppError('Expense not found', 404));
        }

        // BUG-F3 Fix: Guard against cross-entity approvals
        if (req.user.role !== 'SUPER_ADMIN' && expense.entity?.toString() !== req.user.entity?.toString()) {
            return next(new AppError('Access denied: this expense belongs to a different entity.', 403));
        }

        if (expense.status !== 'PENDING_COO') {
            return next(new AppError(`Expense cannot be approved by COO in its current status: ${expense.status}`, 400));
        }

        expense.status = 'PENDING_FINANCE';
        await expense.save();

        res.status(200).json({ success: true, data: expense });
    } catch (error) {
        next(error);
    }
};

// @desc    COO Reject expense
// @route   PUT /api/expenses/:id/coo-reject
// @access  Private (COO only)
exports.cooRejectExpense = async (req, res, next) => {
    try {
        const expense = await Expense.findById(req.params.id);
        if (!expense) {
            return next(new AppError('Expense not found', 404));
        }

        // BUG-F3 Fix: Guard against cross-entity operations
        if (req.user.role !== 'SUPER_ADMIN' && expense.entity?.toString() !== req.user.entity?.toString()) {
            return next(new AppError('Access denied: this expense belongs to a different entity.', 403));
        }

        if (expense.status !== 'PENDING_COO') {
            return next(new AppError(`Expense cannot be rejected by COO in its current status: ${expense.status}`, 400));
        }

        expense.status = 'REJECTED';
        await expense.save();

        res.status(200).json({ success: true, data: expense });
    } catch (error) {
        next(error);
    }
};

// @desc    Finance Approve expense
// @route   PUT /api/expenses/:id/finance-approve
// @access  Private (Finance only)
exports.financeApproveExpense = async (req, res, next) => {
    try {
        const expense = await Expense.findById(req.params.id);
        if (!expense) {
            return next(new AppError('Expense not found', 404));
        }

        // BUG-F3 Fix: Guard against cross-entity approvals
        if (req.user.role !== 'SUPER_ADMIN' && expense.entity?.toString() !== req.user.entity?.toString()) {
            return next(new AppError('Access denied: this expense belongs to a different entity.', 403));
        }

        if (expense.status !== 'PENDING_FINANCE') {
            return next(new AppError(`Expense cannot be approved by Finance in its current status: ${expense.status}`, 400));
        }

        expense.status = 'APPROVED';
        await expense.save();

        res.status(200).json({ success: true, data: expense });
    } catch (error) {
        next(error);
    }
};

// @desc    Finance Reject expense
// @route   PUT /api/expenses/:id/finance-reject
// @access  Private (Finance only)
exports.financeRejectExpense = async (req, res, next) => {
    try {
        const expense = await Expense.findById(req.params.id);
        if (!expense) {
            return next(new AppError('Expense not found', 404));
        }

        // BUG-F3 Fix: Guard against cross-entity operations
        if (req.user.role !== 'SUPER_ADMIN' && expense.entity?.toString() !== req.user.entity?.toString()) {
            return next(new AppError('Access denied: this expense belongs to a different entity.', 403));
        }

        if (expense.status !== 'PENDING_FINANCE') {
            return next(new AppError(`Expense cannot be rejected by Finance in its current status: ${expense.status}`, 400));
        }

        expense.status = 'REJECTED';
        await expense.save();

        res.status(200).json({ success: true, data: expense });
    } catch (error) {
        next(error);
    }
};
