const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema({
    vendorCode: {
        type: String,
        unique: true,
        required: [true, 'Please add a vendor code']
    },
    vendorName: {
        type: String,
        required: [true, 'Please add a vendor name']
    },
    address: {
        type: String
    },
    gstNumber: {
        type: String
    },
    vendorCategory: {
        type: String,
        required: [true, 'Please add a category']
    },
    contactPersonName: {
        type: String
    },
    contactNumber: {
        type: String,
        required: [true, 'Please add a contact number']
    },
    contactEmail: {
        type: String,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    creditPeriodType: {
        type: String,
        enum: ['Days', 'Weeks', 'Months'],
        default: 'Days'
    },
    creditDays: {
        type: Number,
        default: 0
    },
    bankName: {
        type: String
    },
    accountNumber: {
        type: String
    },
    ifscCode: {
        type: String
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
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

module.exports = mongoose.model('Vendor', VendorSchema);
