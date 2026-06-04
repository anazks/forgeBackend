const hrService = require('../services/hrService');

// @desc    Add a new Calendar Year View
// @route   POST /api/employees/year-views
// @access  Private (HR/ADMIN)
exports.addYearView = async (req, res, next) => {
    try {
        const entityId = req.user.role === 'SUPER_ADMIN' ? req.body.entity : req.user.entity;
        const yearView = await hrService.addYearView(req.body.year, entityId);
        res.status(201).json({ success: true, data: yearView });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all Year Views
// @route   GET /api/employees/year-views
// @access  Private (HR/ADMIN)
exports.getYearViews = async (req, res, next) => {
    try {
        const entityId = req.user.role === 'SUPER_ADMIN' ? req.query.entity : req.user.entity;
        const yearViews = await hrService.getYearViews(entityId);
        res.status(200).json({ success: true, count: yearViews.length, data: yearViews });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Yearly Configs for a Year
// @route   GET /api/employees/year-views/:year/configs
// @access  Private (HR/ADMIN)
exports.getYearlyConfigs = async (req, res, next) => {
    try {
        const entityId = req.user.role === 'SUPER_ADMIN' ? req.query.entity : req.user.entity;
        const locationFilter = req.query.location;
        const configs = await hrService.getYearlyConfigs(Number(req.params.year), locationFilter, entityId);
        res.status(200).json({ success: true, count: configs.length, data: configs });
    } catch (error) {
        next(error);
    }
};

// @desc    Update Employee Yearly Config
// @route   PUT /api/employees/yearly-configs/:configId
// @access  Private (HR/ADMIN)
exports.updateYearlyConfig = async (req, res, next) => {
    try {
        const entityId = req.user.role === 'SUPER_ADMIN' ? req.body.entity : req.user.entity;
        const config = await hrService.updateYearlyConfig(req.params.configId, req.body, entityId);
        res.status(200).json({ success: true, data: config });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Monthly Employee Records
// @route   GET /api/employees/year-views/:year/months/:month/records
// @access  Private (HR/ADMIN)
exports.getMonthlyRecords = async (req, res, next) => {
    try {
        const entityId = req.user.role === 'SUPER_ADMIN' ? req.query.entity : req.user.entity;
        const locationFilter = req.query.location;
        const data = await hrService.getMonthlyRecords(
            Number(req.params.year),
            Number(req.params.month),
            locationFilter,
            entityId
        );
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// @desc    Update and Acknowledge Monthly Record
// @route   PUT /api/employees/monthly-records/:recordId/acknowledge
// @access  Private (HR/ADMIN)
exports.updateAndAcknowledgeRecord = async (req, res, next) => {
    try {
        const entityId = req.user.role === 'SUPER_ADMIN' ? req.body.entity : req.user.entity;
        const record = await hrService.updateAndAcknowledgeRecord(
            req.params.recordId,
            req.body,
            req.user._id,
            entityId
        );
        res.status(200).json({ success: true, data: record });
    } catch (error) {
        next(error);
    }
};


// @desc    Get HR Dashboard Metrics
// @route   GET /api/employees/hr-dashboard
// @access  Private (HR/ADMIN)
exports.getHrDashboardMetrics = async (req, res, next) => {
    try {
        const entityId = req.user.role === 'SUPER_ADMIN' ? req.query.entity : req.user.entity;
        const metrics = await hrService.getHrDashboardMetrics(entityId);
        res.status(200).json({ success: true, data: metrics });
    } catch (error) {
        next(error);
    }
};
