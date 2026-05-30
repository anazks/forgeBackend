const mongoose = require('mongoose');

const BankSchema = new mongoose.Schema({
    bankName: {
        type: String,
        required: [true, 'Please add a bank name']
    },
    ifscCode: {
        type: String,
        required: [true, 'Please add an IFSC code']
    },
    branch: {
        type: String,
        required: [true, 'Please add a branch name']
    },
    accountNumber: {
        type: String,
        unique: true,
        required: [true, 'Please add an account number']
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: false
    },
    locations: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Bank', BankSchema);
