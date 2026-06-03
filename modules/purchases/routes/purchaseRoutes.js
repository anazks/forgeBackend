const express = require('express');
const {
    getPurchases,
    createPurchase,
    deletePurchase,
    createPurchaseRequest,
    getPurchaseRequests,
    approvePurchaseRequest,
    getBills,
    updateBill,
    deletePurchaseRequest
} = require('../controllers/purchaseController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getPurchases)
    .post(protect, createPurchase);

router.route('/requests')
    .get(protect, getPurchaseRequests)
    .post(protect, createPurchaseRequest);

router.route('/requests/:id')
    .delete(protect, deletePurchaseRequest);

router.put('/requests/:id/approve', protect, approvePurchaseRequest);

router.route('/bills')
    .get(protect, getBills);

router.route('/bills/:id')
    .put(protect, updateBill);

router.route('/:id')
    .delete(protect, deletePurchase);

module.exports = router;
