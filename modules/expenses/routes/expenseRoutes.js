const express = require('express');
const {
    createExpense,
    getExpenses,
    cooApproveExpense,
    cooRejectExpense,
    financeApproveExpense,
    financeRejectExpense
} = require('../controllers/expenseController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .post(protect, createExpense)
    .get(protect, getExpenses);

router.put('/:id/coo-approve', protect, cooApproveExpense);
router.put('/:id/coo-reject', protect, cooRejectExpense);
router.put('/:id/finance-approve', protect, financeApproveExpense);
router.put('/:id/finance-reject', protect, financeRejectExpense);

module.exports = router;
