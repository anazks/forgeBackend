const express = require('express');
const { getInternalOrders, dispatchOrder, receiveOrder } = require('../controllers/productionController');
const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/orders', getInternalOrders);

// Dispatch: Kitchen/Restaurant dispatch to Centers; CENTERS/AGGREGATE/RESTAURANT can also
// dispatch their own self-production orders (where BOM preparationLocation === their own _id).
// The ownership check inside dispatchOrder() blocks any cross-location dispatch attempt.
router.post('/orders/:id/dispatch',
    authorize('KITCHEN', 'RESTAURANT', 'CENTERS', 'AGGREGATE', 'COO', 'ADMIN', 'SUPER_ADMIN'),
    dispatchOrder
);

// Receive: only destination locations (Centers etc.) confirm receipt
router.post('/orders/:id/receive',
    authorize('CENTERS', 'KITCHEN', 'RESTAURANT', 'AGGREGATE', 'COO', 'ADMIN', 'SUPER_ADMIN'),
    receiveOrder
);

module.exports = router;
