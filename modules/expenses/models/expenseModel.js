const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
    locationId: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Please add a location ID']
    },
    date: {
        type: Date,
        required: [true, 'Please add a date']
    },
    description: {
        type: String,
        required: [true, 'Please add a description']
    },
    category: {
        type: String,
        enum: [
            'Transport- Food',
            'Petrol Expenses',
            'Staff travelling Expenses',
            'Staff Welfare Expenses',
            'Cleaning Charges',
            'Repair and Maintenance',
            'Consumable Purchase',
            'Rent',
            'Gas',
            'Electricity Charges',
            'Water Charges'
        ],
        required: [true, 'Please select a category']
    },
    amount: {
        type: Number,
        required: [true, 'Please add an amount'],
        min: [0, 'Amount cannot be negative']
    },
    approvedAmount: {
        type: Number,
        min: [0, 'Approved amount cannot be negative']
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'UPI', 'Card', 'Bank Transfer'],
        required: [true, 'Please select a payment method']
    },
    status: {
        type: String,
        enum: ['PENDING_COO', 'PENDING_FINANCE', 'APPROVED', 'REJECTED'],
        default: 'PENDING_COO'
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: [true, 'Please reference an Entity']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index to query by location, entity, status, and date range efficiently
ExpenseSchema.index({ entity: 1, locationId: 1, date: 1, status: 1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
