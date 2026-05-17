const mongoose = require('mongoose');

const PurchaseRequestSchema = new mongoose.Schema({
    prCode: {
        type: String,
        unique: true
    },
    items: [{
        item: {
            type: mongoose.Schema.ObjectId,
            ref: 'RawMaterial',
            required: true
        },
        itemName: String,
        requestedQty: {
            type: Number,
            required: true
        },
        approvedQty: {
            type: Number
        },
        unitPrice: {
            type: Number,
            default: 0
        },
        unit: String
    }],
    vendor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Vendor',
        required: false
    },
    requestedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: true
    },
    destinationLocation: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: false
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'BILLED'],
        default: 'PENDING'
    },
    notes: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

PurchaseRequestSchema.pre('save', async function() {
    if (!this.prCode) {
        const count = await this.model('PurchaseRequest').countDocuments();
        this.prCode = `PR-${(count + 1).toString().padStart(4, '0')}`;
    }
});

module.exports = mongoose.model('PurchaseRequest', PurchaseRequestSchema);
