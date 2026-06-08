const ExpenseCategory = require('../models/expenseCategoryModel');

// @desc    Get all expense categories
// @route   GET /api/expenses
exports.getExpenseCategories = async (req, res) => {
    try {
        let query = {};
        
        if (req.user.role !== 'SUPER_ADMIN') {
            // Show global categories OR entity-specific categories
            query = {
                $or: [
                    { entity: req.user.entity },
                    { entity: { $exists: false } },
                    { entity: null }
                ]
            };
            
            // Further filter by location type if applicable
            if (req.user.role === 'RESORT') {
                query.$or.push({ applicableLocations: { $in: ['ALL', 'Resort'] } });
            } else if (req.user.role === 'KITCHEN') {
                query.$or.push({ applicableLocations: { $in: ['ALL', 'Kitchen'] } });
            } else if (req.user.role === 'CENTERS' || req.user.role === 'AGGREGATE') {
                query.$or.push({ applicableLocations: { $in: ['ALL', 'Center'] } });
            } else if (req.user.role === 'RESTAURANT') {
                query.$or.push({ applicableLocations: { $in: ['ALL', 'Kitchen', 'Center', 'Restaurant'] } });
            }
        } else if (req.query.entity) {
            query.entity = req.query.entity;
        }

        const categories = await ExpenseCategory.find(query).sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: categories.length, data: categories });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create expense category
// @route   POST /api/expenses
exports.createExpenseCategory = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }
        const category = await ExpenseCategory.create(req.body);
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete expense category
// @route   DELETE /api/expenses/:id
exports.deleteExpenseCategory = async (req, res) => {
    try {
        const category = await ExpenseCategory.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update expense category
// @route   PUT /api/expense-categories/:id
exports.updateExpenseCategory = async (req, res) => {
    try {
        let category = await ExpenseCategory.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        // Maintain role-based authorization check
        if (req.user.role !== 'SUPER_ADMIN' && category.entity && category.entity.toString() !== req.user.entity.toString()) {
            return res.status(401).json({ success: false, error: 'Not authorized to update this category' });
        }

        category = await ExpenseCategory.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: category });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

