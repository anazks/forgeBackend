const { AppError } = require('../../../middleware/errorHandler');
const Employee = require('../models/employeeModel');
const HrYearView = require('../models/hrYearViewModel');
const EmployeeYearlyConfig = require('../models/employeeYearlyConfigModel');
const EmployeeMonthlyRecord = require('../models/employeeMonthlyRecordModel');
// ClosedMonth model removed — month locking via HTTP routes was removed in BUG-H1.
// The isMonthClosed check was dead code (always returned false with no route to create records).

/**
 * Calculate the remaining advance balance for an employee from a previous year's Dec
 */
async function calculatePrevYearCarryover(employeeId, prevYear) {
    const config = await EmployeeYearlyConfig.findOne({ employee: employeeId, year: prevYear }).lean();
    if (!config) {
        return { advanceSalary: 0, monthlyDeduction: 0, totalLeaves: 12 };
    }

    // Sum deductions in the previous year — only count ACKNOWLEDGED (confirmed) months
    // BUG-H2 Fix: DRAFT records must not count as real deductions in carry-over calculation
    const records = await EmployeeMonthlyRecord.find({
        employee: employeeId,
        year: prevYear,
        status: 'ACKNOWLEDGED'
    }).lean();
    const totalDeducted = records.reduce((sum, r) => sum + (r.advanceDeductionApplied || 0), 0);
    const remainingAdvance = Math.max(0, config.advanceSalary - totalDeducted);

    return {
        advanceSalary: remainingAdvance,
        monthlyDeduction: remainingAdvance > 0 ? config.monthlyDeduction : 0,
        totalLeaves: config.totalLeaves || 12
    };
}

/**
 * Ensure an employee has a yearly configuration
 */
async function ensureYearlyConfig(employeeId, year, entityId) {
    let config = await EmployeeYearlyConfig.findOne({ employee: employeeId, year }).lean();
    if (!config) {
        // Carry over from previous year if available
        const carryover = await calculatePrevYearCarryover(employeeId, year - 1);
        config = await EmployeeYearlyConfig.create({
            employee: employeeId,
            year,
            advanceSalary: carryover.advanceSalary,
            monthlyDeduction: carryover.monthlyDeduction,
            totalLeaves: carryover.totalLeaves,
            pendingLeaves: carryover.totalLeaves,
            entity: entityId
        });
        // Convert to lean object
        config = config.toObject();
    }
    return config;
}

// getOrInitMonthlyRecord() removed (M4 refactor):
// Its logic was inlined into getMonthlyRecords() as part of the N+1 pre-fetch optimization.
// All record initialization and update logic now operates on pre-fetched batch data.

/**
 * Add a new Year View
 */
exports.addYearView = async (year, entityId) => {
    if (!year) {
        throw new AppError('Year is required', 400);
    }
    const existing = await HrYearView.findOne({ year, entity: entityId }).lean();
    if (existing) {
        throw new AppError('Year view already exists', 400);
    }

    const yearView = await HrYearView.create({ year, entity: entityId });

    // Initialize yearly configurations for all active employees
    const activeEmployees = await Employee.find({ status: 'Active', entity: entityId }).lean();
    for (const emp of activeEmployees) {
        await ensureYearlyConfig(emp._id, year, entityId);
    }

    return yearView;
};

/**
 * Get all Year Views
 */
exports.getYearViews = async (entityId) => {
    return await HrYearView.find({ entity: entityId }).sort({ year: -1 }).lean();
};

/**
 * Get Employee Yearly Configurations for a calendar year
 */
exports.getYearlyConfigs = async (year, locationFilter, entityId) => {
    const query = { status: 'Active' };
    if (entityId) query.entity = entityId;
    if (locationFilter) query.locationName = locationFilter;

    const employees = await Employee.find(query).select('employeeCode employeeName designation locationName contactNumber monthlyTakeHomeSalary').lean();

    // M4 Fix: Pre-fetch all configs for this year in ONE query, then match in memory.
    // Replaces the N+1 pattern (one ensureYearlyConfig DB call per employee).
    const existingConfigs = await EmployeeYearlyConfig.find({ year, entity: entityId }).lean();
    const configMap = {};
    existingConfigs.forEach(c => { configMap[c.employee.toString()] = c; });

    const configs = [];
    for (const emp of employees) {
        // Use pre-fetched config if available; only hit DB for employees missing a config (first-time setup)
        let config = configMap[emp._id.toString()];
        if (!config) {
            config = await ensureYearlyConfig(emp._id, year, entityId);
        }
        configs.push({ employee: emp, config });
    }

    return configs;
};

/**
 * Update Employee Yearly Config
 */
exports.updateYearlyConfig = async (configId, data, entityId) => {
    const config = await EmployeeYearlyConfig.findById(configId);
    if (!config) {
        throw new AppError('Yearly configuration not found', 404);
    }
    // L2 cleanup: ClosedMonth reference removed. Month locking no longer exists.
    // Yearly config can always be updated (affects future DRAFT monthly records only).

    if (data.advanceSalary !== undefined) config.advanceSalary = Number(data.advanceSalary);
    if (data.monthlyDeduction !== undefined) config.monthlyDeduction = Number(data.monthlyDeduction);
    if (data.advanceStartMonth !== undefined) config.advanceStartMonth = Number(data.advanceStartMonth);
    if (data.totalLeaves !== undefined) {
        config.totalLeaves = Number(data.totalLeaves);
    }

    await config.save();

    // Recalculate pending leaves for the year
    const records = await EmployeeMonthlyRecord.find({ employee: config.employee, year: config.year }).lean();
    const totalLeavesTaken = records.reduce((sum, r) => sum + (r.leavesTaken || 0), 0);
    config.pendingLeaves = Math.max(0, config.totalLeaves - totalLeavesTaken);
    await config.save();

    return config;
};

/**
 * Get Employee Monthly Records for a specific month
 */
exports.getMonthlyRecords = async (year, month, locationFilter, entityId) => {
    const query = { status: 'Active' };
    if (entityId) query.entity = entityId;
    if (locationFilter) query.locationName = locationFilter;

    // Filter employees by date of joining: only those who joined in or before the queried month
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    query.dateOfJoining = { $lte: endOfMonth };

    const employees = await Employee.find(query).select('employeeCode employeeName designation locationName monthlyTakeHomeSalary').lean();
    const empIds = employees.map(e => e._id);

    // M4 Fix: Batch pre-fetch all data needed for record calculation — eliminates N+1 per employee.
    // Instead of 3 DB queries per employee (monthly record + yearly config + prior records),
    // we fetch everything in 3 total queries and match in memory.
    const [allMonthRecords, allYearConfigs, allPriorRecords] = await Promise.all([
        EmployeeMonthlyRecord.find({ employee: { $in: empIds }, year, month }).lean(),
        EmployeeYearlyConfig.find({ employee: { $in: empIds }, year, entity: entityId }).lean(),
        EmployeeMonthlyRecord.find({ employee: { $in: empIds }, year, month: { $lt: month } }).lean()
    ]);

    const monthRecordMap = {}; // empId → monthly record
    allMonthRecords.forEach(r => { monthRecordMap[r.employee.toString()] = r; });

    const configMap = {}; // empId → yearly config
    allYearConfigs.forEach(c => { configMap[c.employee.toString()] = c; });

    const records = [];

    for (const emp of employees) {
        // Fall back to individual DB calls only for employees missing configs (first-time year setup)
        let config = configMap[emp._id.toString()];
        if (!config) {
            config = await ensureYearlyConfig(emp._id, year, entityId);
        }

        const priorRecords = allPriorRecords.filter(r => r.employee.toString() === emp._id.toString());
        const startMonth = config.advanceStartMonth || 1;
        const totalPriorDeductions = priorRecords
            .filter(r => r.month >= startMonth)
            .reduce((sum, r) => sum + (r.advanceDeductionApplied || 0), 0);

        const remainingAdvanceBeforeMonth = (month >= startMonth)
            ? Math.max(0, config.advanceSalary - totalPriorDeductions)
            : 0;

        const advanceDeductionApplied = (remainingAdvanceBeforeMonth > 0 && month >= startMonth)
            ? Math.min(config.monthlyDeduction, remainingAdvanceBeforeMonth)
            : 0;

        const totalPriorLeaves = priorRecords.reduce((sum, r) => sum + (r.leavesTaken || 0), 0);
        const pendingLeavesBeforeMonth = Math.max(0, config.totalLeaves - totalPriorLeaves);
        const calculatedSalary = Math.max(0, (emp.monthlyTakeHomeSalary || 0) - advanceDeductionApplied);

        let record = monthRecordMap[emp._id.toString()];

        if (!record) {
            const created = await EmployeeMonthlyRecord.create({
                employee: emp._id,
                year,
                month,
                advanceDeductionApplied,
                leavesTaken: 0,
                lopLeaves: 0,
                calculatedSalary,
                finalSalary: calculatedSalary,
                isLopApplicable: false,
                status: 'DRAFT',
                entity: entityId
            });
            record = created.toObject();
        } else if (record.status === 'DRAFT') {
            record = await EmployeeMonthlyRecord.findOneAndUpdate(
                { _id: record._id },
                {
                    advanceDeductionApplied,
                    calculatedSalary,
                    finalSalary: record.isFinalSalaryManuallySet ? record.finalSalary : calculatedSalary
                },
                { new: true }
            ).lean();
        }

        records.push({
            ...record,
            employee: emp,
            pendingLeavesBeforeMonth,
            remainingAdvanceBeforeMonth
        });
    }

    // Month locking removed (L2): isClosed always returned false after BUG-H1 route removal.
    // Returning isClosed: false as a constant so frontend contracts are unchanged.
    return {
        records,
        isClosed: false
    };
};

/**
 * Update and acknowledge a monthly record
 */
exports.updateAndAcknowledgeRecord = async (recordId, updateData, userId, entityId) => {
    let record = await EmployeeMonthlyRecord.findById(recordId);
    if (!record) {
        throw new AppError('Monthly record not found', 404);
    }

    // Month-locking check removed (L2): isMonthClosed was always false after BUG-H1 route removal.
    // Records in ACKNOWLEDGED status are still protected by business logic (status check below).

    // Get employee details
    const employee = await Employee.findById(record.employee).lean();
    if (!employee) {
        throw new AppError('Employee not found', 404);
    }

    // Get yearly config to check remaining leaves
    const config = await EmployeeYearlyConfig.findOne({ employee: record.employee, year: record.year });
    if (!config) {
        throw new AppError('Yearly configuration not found', 404);
    }

    if (updateData.leavesTaken !== undefined) {
        record.leavesTaken = Number(updateData.leavesTaken);
    }

    if (updateData.finalSalary !== undefined) {
        const newFinalSalary = Number(updateData.finalSalary);
        record.finalSalary = newFinalSalary;
        // BUG-H4 Fix: Mark as manually set if HR typed a value different from the calculated salary
        // Clears the flag if HR resets it back to the system-calculated value
        record.isFinalSalaryManuallySet = (newFinalSalary !== record.calculatedSalary);
    }

    // Recalculate leaves
    const priorRecords = await EmployeeMonthlyRecord.find({
        employee: record.employee,
        year: record.year,
        month: { $lt: record.month }
    }).lean();

    const totalPriorLeaves = priorRecords.reduce((sum, r) => sum + (r.leavesTaken || 0), 0);
    const pendingLeavesBeforeMonth = Math.max(0, config.totalLeaves - totalPriorLeaves);

    if (record.leavesTaken > pendingLeavesBeforeMonth) {
        record.lopLeaves = record.leavesTaken - pendingLeavesBeforeMonth;
        record.isLopApplicable = true;
    } else {
        record.lopLeaves = 0;
        record.isLopApplicable = false;
    }

    if (updateData.status === 'DRAFT') {
        record.status = 'DRAFT';
    } else {
        record.status = 'ACKNOWLEDGED';
        record.acknowledgedBy = userId;
        record.acknowledgedAt = Date.now();
    }

    await record.save();

    // Recalculate actual yearly pending leaves
    const allRecords = await EmployeeMonthlyRecord.find({ employee: record.employee, year: record.year }).lean();
    const totalYearLeavesTaken = allRecords.reduce((sum, r) => sum + (r.leavesTaken || 0), 0);
    config.pendingLeaves = Math.max(0, config.totalLeaves - totalYearLeavesTaken);
    await config.save();

    const recordObj = record.toObject();
    recordObj.employee = employee;
    return recordObj;
};

// closeMonth and unlockMonth service functions removed (L2 / Code Review 2026-05-31).
// The HTTP routes for these were removed in BUG-H1 sprint. Removing the service functions
// completes the cleanup. If month-locking is required in the future, it should be redesigned
// with full UI/UX support and re-added as a new feature. See open_technical_points.md OTP-004.

/**
 * Get basic HR dashboard metrics
 */
exports.getHrDashboardMetrics = async (entityId) => {
    const query = { status: 'Active' };
    if (entityId) query.entity = entityId;

    const totalEmployees = await Employee.countDocuments(query);

    const year = new Date().getFullYear();
    const configs = await EmployeeYearlyConfig.find({ year, entity: entityId }).lean();
    const totalAdvancesActive = configs.reduce((sum, c) => sum + (c.advanceSalary || 0), 0);

    // L2 cleanup: closedMonthsCount removed — ClosedMonth collection is no longer written to
    // (month-locking routes removed in BUG-H1). Always returns 0 until feature is re-introduced.
    return {
        totalEmployees,
        totalAdvancesActive,
        closedMonthsCount: 0, // month-locking not active (see OTP-004)
        currentYear: year
    };
};
