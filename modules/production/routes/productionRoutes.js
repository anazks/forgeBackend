const express = require('express');
const { getInternalOrders, dispatchOrder, receiveOrder } = require('../controllers/productionController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/orders', getInternalOrders);
router.post('/orders/:id/dispatch', dispatchOrder);
router.post('/orders/:id/receive', receiveOrder);

module.exports = router;
