const mongoose = require('mongoose');

const EmployeeMonthlyRecordSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.ObjectId,
        ref: 'Employee',
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    month: {
        type: Number, // 1 to 12
        required: true
    },
    advanceDeductionApplied: {
        type: Number,
        default: 0
    },
    leavesTaken: {
        type: Number,
        default: 0
    },
    lopLeaves: {
        type: Number,
        default: 0
    },
    calculatedSalary: {
        type: Number,
        required: true
    },
    finalSalary: {
        type: Number,
        required: true
    },
    isLopApplicable: {
        type: Boolean,
        default: false
    },
    // BUG-H4 Fix: Tracks whether HR manually typed a finalSalary different from calculatedSalary.
    // When true, auto-recalculation will NOT overwrite finalSalary.
    isFinalSalaryManuallySet: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['DRAFT', 'ACKNOWLEDGED'],
        default: 'DRAFT'
    },
    acknowledgedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: false
    },
    acknowledgedAt: {
        type: Date
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound unique index for employee, year, and month
EmployeeMonthlyRecordSchema.index({ employee: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('EmployeeMonthlyRecord', EmployeeMonthlyRecordSchema);
