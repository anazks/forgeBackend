const express = require('express');
const {
    getPurchases,
    createPurchase,
    deletePurchase
} = require('../controllers/purchaseController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getPurchases)
    .post(protect, createPurchase);

router.route('/:id')
    .delete(protect, deletePurchase);

module.exports = router;
