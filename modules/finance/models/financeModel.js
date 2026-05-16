const mongoose = require('mongoose');

const FinanceSchema = new mongoose.Schema({
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    amount: {
        type: Number,
        required: [true, 'Please add an amount']
    },
    type: {
        type: String,
        enum: ['INCOME', 'EXPENSE'],
        required: true
    },
    category: {
        type: mongoose.Schema.ObjectId,
        ref: 'ExpenseCategory',
        required: function() { return this.type === 'EXPENSE'; }
    },
    description: {
        type: String,
        required: false
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Finance', FinanceSchema);
