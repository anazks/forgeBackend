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
        receivedQty: Number,
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
    destinationLocation: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

BillSchema.pre('save', async function() {
    if (!this.billCode) {
        const counterExists = await Counter.findById('billCode');
        if (!counterExists) {
            const highestDoc = await this.model('Bill').findOne({}, { billCode: 1 }).sort({ billCode: -1 }).lean();
            let startSeq = 0;
            if (highestDoc && highestDoc.billCode) {
                const match = highestDoc.billCode.match(/\d+/);
                startSeq = match ? parseInt(match[0], 10) : 0;
            }
            try {
                await Counter.create({ _id: 'billCode', seq: startSeq });
            } catch (e) {
                // Ignore duplicate key error if another request created it concurrently
            }
        }

        const counter = await Counter.findByIdAndUpdate(
            'billCode',
            { $inc: { seq: 1 } },
            { returnDocument: 'after', upsert: true }
        );
        this.billCode = `BILL-${counter.seq.toString().padStart(4, '0')}`;
    }
});

module.exports = mongoose.model('Bill', BillSchema);
