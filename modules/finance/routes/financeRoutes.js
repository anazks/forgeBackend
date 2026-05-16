const express = require('express');
const {
    getFinanceRecords,
    createFinanceRecord,
    getFinanceStats
} = require('../controllers/financeController');
const { protect } = require('../../../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/stats', getFinanceStats);

router.route('/')
    .get(getFinanceRecords)
    .post(createFinanceRecord);

module.exports = router;
