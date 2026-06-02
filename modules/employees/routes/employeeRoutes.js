const express = require('express');
const {
    getEmployees,
    getEmployee,
    createEmployee,
    updateEmployee,
    deleteEmployee
} = require('../controllers/employeeController');
const {
    addYearView,
    getYearViews,
    getYearlyConfigs,
    updateYearlyConfig,
    getMonthlyRecords,
    updateAndAcknowledgeRecord,
    getHrDashboardMetrics
} = require('../controllers/hrController');
const { protect, authorize } = require('../../../middleware/auth');

const router = express.Router();

// HR Dashboard metrics
router.route('/hr-dashboard')
    .get(protect, authorize('HR', 'ADMIN', 'SUPER_ADMIN'), getHrDashboardMetrics);

// Year Views
router.route('/year-views')
    .get(protect, authorize('HR', 'ADMIN', 'SUPER_ADMIN'), getYearViews)
    .post(protect, authorize('HR', 'ADMIN', 'SUPER_ADMIN'), addYearView);

// Yearly employee configs for a year
router.route('/year-views/:year/configs')
    .get(protect, authorize('HR', 'ADMIN', 'SUPER_ADMIN'), getYearlyConfigs);

// Update yearly config
router.route('/yearly-configs/:configId')
    .put(protect, authorize('HR', 'ADMIN', 'SUPER_ADMIN'), updateYearlyConfig);

// Monthly records for a year and month
router.route('/year-views/:year/months/:month/records')
    .get(protect, authorize('HR', 'ADMIN', 'SUPER_ADMIN'), getMonthlyRecords);

// Acknowledge a monthly record
router.route('/monthly-records/:recordId/acknowledge')
    .put(protect, authorize('HR', 'ADMIN', 'SUPER_ADMIN'), updateAndAcknowledgeRecord);

// Close Month and Unlock Month routes removed — no longer exposed via HTTP (BUG-H1)
// Employee CRUD
router.route('/')
    .get(protect, getEmployees)
    .post(protect, createEmployee);

router.route('/:id')
    .get(protect, getEmployee)
    .put(protect, updateEmployee)
    .delete(protect, deleteEmployee);

module.exports = router;
