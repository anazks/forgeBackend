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
        required: true
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

const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

PurchaseRequestSchema.pre('save', async function() {
    if (!this.prCode) {
        const counterExists = await Counter.findById('prCode');
        if (!counterExists) {
            const highestDoc = await this.model('PurchaseRequest').findOne({}, { prCode: 1 }).sort({ prCode: -1 }).lean();
            let startSeq = 0;
            if (highestDoc && highestDoc.prCode) {
                const match = highestDoc.prCode.match(/\d+/);
                startSeq = match ? parseInt(match[0], 10) : 0;
            }
            try {
                await Counter.create({ _id: 'prCode', seq: startSeq });
            } catch (e) {
                // Ignore duplicate key error if another request created it concurrently
            }
        }

        const counter = await Counter.findByIdAndUpdate(
            'prCode',
            { $inc: { seq: 1 } },
            { returnDocument: 'after', upsert: true }
        );
        this.prCode = `PR-${counter.seq.toString().padStart(4, '0')}`;
    }
});

module.exports = mongoose.model('PurchaseRequest', PurchaseRequestSchema);
