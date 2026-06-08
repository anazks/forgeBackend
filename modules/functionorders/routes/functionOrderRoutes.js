const express = require('express');
const {
    createFunctionOrder,
    getFunctionOrders,
    updateFunctionOrderDishes,
    setTotalOrderValue,
    placeFunctionOrderRequest,
    confirmSettlement,
    acknowledgeByFinance,
    acknowledgeAdvanceByFinance,
    acknowledgeFinalByFinance,
    getPendingFinanceOrders,
    updateFunctionOrder
} = require('../controllers/functionOrderController');
const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .post(protect, createFunctionOrder)
    .get(protect, getFunctionOrders);

router.get('/pending-finance', protect, authorize('FINANCE', 'COO', 'ADMIN', 'SUPER_ADMIN'), getPendingFinanceOrders);

router.put('/:id', protect, updateFunctionOrder);
router.put('/:id/dishes', protect, updateFunctionOrderDishes);
router.put('/:id/total-value', protect, setTotalOrderValue);
router.put('/:id/place-request', protect, placeFunctionOrderRequest);
router.put('/:id/settle', protect, confirmSettlement);
router.put('/:id/acknowledge', protect, authorize('FINANCE', 'COO', 'ADMIN', 'SUPER_ADMIN'), acknowledgeByFinance);
router.put('/:id/acknowledge-advance', protect, authorize('FINANCE', 'COO', 'ADMIN', 'SUPER_ADMIN'), acknowledgeAdvanceByFinance);
router.put('/:id/acknowledge-final', protect, authorize('FINANCE', 'COO', 'ADMIN', 'SUPER_ADMIN'), acknowledgeFinalByFinance);

module.exports = router;
