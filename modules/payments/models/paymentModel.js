const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: [true, 'Please add an amount']
    },
    paymentType: {
        type: String,
        enum: ['Monthly', 'Yearly', 'Custom'],
        required: true
    },
    duration: {
        type: Number, // in months
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Success', 'Failed'],
        default: 'Pending'
    },
    transactionId: {
        type: String,
        unique: true
    },
    paymentDate: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Payment', PaymentSchema);
