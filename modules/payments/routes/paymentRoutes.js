const express = require('express');
const { 
    createPayment, 
    confirmPayment, 
    getPayments, 
    manualRenewal, 
    getPaymentStats 
} = require('../controllers/paymentController');
const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/stats', protect, authorize('SUPER_ADMIN', 'COO'), getPaymentStats);
router.post('/manual-renewal', protect, authorize('SUPER_ADMIN', 'COO'), manualRenewal);

router.route('/')
    .get(protect, authorize('SUPER_ADMIN', 'COO'), getPayments)
    .post(protect, authorize('SUPER_ADMIN', 'ADMIN', 'COO'), createPayment);

router.put('/:id/confirm', protect, authorize('SUPER_ADMIN', 'COO'), confirmPayment);

module.exports = router;
