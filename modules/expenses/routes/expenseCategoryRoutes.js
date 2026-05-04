const express = require('express');
const {
    getExpenseCategories,
    createExpenseCategory,
    deleteExpenseCategory
} = require('../controllers/expenseCategoryController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getExpenseCategories)
    .post(protect, createExpenseCategory);

router.route('/:id')
    .delete(protect, deleteExpenseCategory);

module.exports = router;
