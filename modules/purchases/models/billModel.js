const mongoose = require('mongoose');

const BillSchema = new mongoose.Schema({
    billCode: {
        type: String,
        unique: true
    },
    purchaseRequest: {
        type: mongoose.Schema.ObjectId,
        ref: 'PurchaseRequest'
    },
    vendor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Vendor',
        required: true
    },
    items: [{
        item: {
            type: mongoose.Schema.ObjectId,
            ref: 'RawMaterial'
        },
        itemName: String,
        quantity: Number,
        unitPrice: Number,
        total: Number
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    paymentStatus: {
        type: String,
        enum: ['UNPAID', 'PARTIAL', 'PAID'],
        default: 'UNPAID'
    },
    deliveryStatus: {
        type: String,
        enum: ['PENDING', 'DELIVERED'],
        default: 'PENDING'
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

BillSchema.pre('save', async function() {
    if (!this.billCode) {
        const count = await this.model('Bill').countDocuments();
        this.billCode = `BILL-${(count + 1).toString().padStart(4, '0')}`;
    }
});

module.exports = mongoose.model('Bill', BillSchema);
