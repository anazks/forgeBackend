const express = require('express');
const {
    getStockRequests,
    createStockRequest,
    approveRequest,
    rejectRequest,
    receiveRequest,
    seedSampleRequests,
    getDemandSummary,
    cooBulkAction
} = require('../controllers/stockRequestController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.get('/demand-summary', protect, getDemandSummary);

router.route('/')
    .get(protect, getStockRequests)
    .post(protect, createStockRequest);

router.post('/seed-sample', protect, seedSampleRequests);

router.put('/coo-bulk-action', protect, cooBulkAction);

router.put('/:id/approve', protect, approveRequest);
router.put('/:id/reject', protect, rejectRequest);
router.put('/:id/receive', protect, receiveRequest);

module.exports = router;
