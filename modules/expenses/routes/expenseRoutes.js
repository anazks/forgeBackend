const express = require('express');
const {
    createExpense,
    getExpenses,
    cooApproveExpense,
    cooRejectExpense,
    financeApproveExpense,
    financeRejectExpense
} = require('../controllers/expenseController');
const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .post(protect, createExpense)
    .get(protect, getExpenses);

router.put('/:id/coo-approve',     protect, authorize('COO', 'ADMIN'),     cooApproveExpense);
router.put('/:id/coo-reject',      protect, authorize('COO', 'ADMIN'),     cooRejectExpense);
router.put('/:id/finance-approve', protect, authorize('FINANCE', 'ADMIN'), financeApproveExpense);
router.put('/:id/finance-reject',  protect, authorize('FINANCE', 'ADMIN'), financeRejectExpense);

module.exports = router;
