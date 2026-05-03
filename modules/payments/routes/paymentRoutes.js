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

router.get('/stats', authorize('SUPER_ADMIN'), getPaymentStats);
router.post('/manual-renewal', authorize('SUPER_ADMIN'), manualRenewal);

router.route('/')
    .get(authorize('SUPER_ADMIN'), getPayments)
    .post(authorize('SUPER_ADMIN', 'ADMIN'), createPayment);

router.put('/:id/confirm', authorize('SUPER_ADMIN'), confirmPayment);

module.exports = router;
