const express = require('express');
const { 
    getDailyRevenue, 
    confirmRevenueTab, 
    closeDailyRevenue,
    getFinanceStats,
    getFinanceLocationDetails,
    saveFinanceVerification,
    getCashClosure,
    saveCashClosure,
    submitCashClosure,
    cooApproveCashClosure,
    getPendingCooCashClosures,
    getPendingFinanceCashClosures
} = require('../controllers/revenueController');
const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

// All revenue routes are protected
router.use(protect);

router.get('/daily', getDailyRevenue);
router.post('/daily/confirm-tab', confirmRevenueTab);
router.post('/daily/close', closeDailyRevenue);

router.get('/cash-closure', getCashClosure);
router.put('/cash-closure', saveCashClosure);
router.post('/cash-closure/submit', submitCashClosure);
router.get('/cash-closures/pending-coo', authorize('COO', 'ADMIN', 'SUPER_ADMIN'), getPendingCooCashClosures);
router.get('/cash-closures/pending-finance', authorize('FINANCE', 'COO', 'ADMIN', 'SUPER_ADMIN'), getPendingFinanceCashClosures);
router.put('/cash-closures/coo-approve', authorize('COO', 'ADMIN', 'SUPER_ADMIN'), cooApproveCashClosure);

router.get('/finance/stats', authorize('SUPER_ADMIN', 'ADMIN', 'FINANCE'), getFinanceStats);
router.get('/finance/location/:locationId', authorize('SUPER_ADMIN', 'ADMIN', 'FINANCE'), getFinanceLocationDetails);
router.post('/finance/verify', authorize('SUPER_ADMIN', 'ADMIN', 'FINANCE'), saveFinanceVerification);

module.exports = router;
