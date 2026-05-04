const express = require('express');
const {
    getFoodRequests,
    createFoodRequest,
    approveRequest,
    rejectRequest,
    seedSampleRequests
} = require('../controllers/foodRequestController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.route('/')
    .get(protect, getFoodRequests)
    .post(protect, createFoodRequest);

router.post('/seed-sample', protect, seedSampleRequests);

router.put('/:id/approve', protect, approveRequest);
router.put('/:id/reject', protect, rejectRequest);

module.exports = router;
