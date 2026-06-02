const express = require('express');
const {
    getStockRequests,
    createStockRequest,
    approveRequest,
    rejectRequest,
    receiveRequest,
    getDemandSummary,
    cooBulkAction,
    updateItemQty
} = require('../controllers/stockRequestController');
const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

router.get('/demand-summary', protect, getDemandSummary);

router.route('/')
    .get(protect, getStockRequests)
    .post(protect, createStockRequest);

// COO-level actions: approve, reject, bulk actions
router.put('/coo-bulk-action', protect, authorize('COO', 'ADMIN', 'SUPER_ADMIN'), cooBulkAction);
router.put('/:id/items',   protect, authorize('COO', 'ADMIN', 'SUPER_ADMIN'), updateItemQty);
router.put('/:id/approve', protect, authorize('COO', 'ADMIN', 'SUPER_ADMIN'), approveRequest);
router.put('/:id/reject',  protect, authorize('COO', 'ADMIN', 'SUPER_ADMIN'), rejectRequest);

// Location-level receive: Centers, Kitchen, Restaurant confirm physical receipt
router.put('/:id/receive', protect, authorize('CENTERS', 'KITCHEN', 'RESTAURANT', 'ADMIN', 'SUPER_ADMIN'), receiveRequest);

module.exports = router;
