const mongoose = require('mongoose');

const EmployeeYearlyConfigSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.ObjectId,
        ref: 'Employee',
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    advanceSalary: {
        type: Number,
        default: 0
    },
    monthlyDeduction: {
        type: Number,
        default: 0
    },
    advanceStartMonth: {
        type: Number,
        default: 1,
        min: 1,
        max: 12
    },
    totalLeaves: {
        type: Number,
        default: 12
    },
    pendingLeaves: {
        type: Number,
        default: 12
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

// Compound unique index for employee and year
EmployeeYearlyConfigSchema.index({ employee: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('EmployeeYearlyConfig', EmployeeYearlyConfigSchema);
