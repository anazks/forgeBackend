const mongoose = require('mongoose');

const InternalOrderItemSchema = new mongoose.Schema({
    bomId: {
        type: mongoose.Schema.ObjectId,
        ref: 'Bom',
        required: false
    },
    menuId: {
        type: mongoose.Schema.ObjectId,
        ref: 'Menu',
        required: false
    },
    itemName: { type: String, required: true },
    requestedQty: { type: Number, required: true, min: 0 },
    dispatchedQty: { type: Number, default: 0 },
    receivedQty: { type: Number, default: 0 },
    unit: { type: String, default: 'pcs' },
    status: {
        type: String,
        enum: ['PENDING', 'DISPATCHED', 'PARTIAL_RECEIPT', 'RECEIVED'],
        default: 'PENDING'
    }
});

const InternalOrderSchema = new mongoose.Schema({
    orderCode: {
        type: String,
        unique: true
    },
    sourceLocation: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true // Preparation location (e.g., Kitchen)
    },
    destinationLocation: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true // Requesting center
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: true
    },
    items: [InternalOrderItemSchema],
    status: {
        type: String,
        enum: ['PENDING', 'PARTIAL_DISPATCH', 'DISPATCHED', 'PARTIAL_RECEIPT', 'RECEIVED'],
        default: 'PENDING'
    },
    foodRequestId: {
        type: mongoose.Schema.ObjectId,
        ref: 'FoodRequest',
        required: false // Link to the original food request
    },
    createdAt: { type: Date, default: Date.now },
    dispatchedAt: { type: Date },
    receivedAt: { type: Date }
});

const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

InternalOrderSchema.pre('save', async function() {
    if (!this.orderCode) {
        const counterExists = await Counter.findById('orderCode');
        if (!counterExists) {
            const highestDoc = await this.model('InternalOrder').findOne({}, { orderCode: 1 }).sort({ orderCode: -1 }).lean();
            let startSeq = 0;
            if (highestDoc && highestDoc.orderCode) {
                const match = highestDoc.orderCode.match(/\d+/);
                startSeq = match ? parseInt(match[0], 10) : 0;
            }
            try {
                await Counter.create({ _id: 'orderCode', seq: startSeq });
            } catch (e) {
                // Ignore duplicate key error if another request created it concurrently
            }
        }

        const counter = await Counter.findByIdAndUpdate(
            'orderCode',
            { $inc: { seq: 1 } },
            { returnDocument: 'after', upsert: true }
        );
        this.orderCode = `INT-${counter.seq.toString().padStart(5, '0')}`;
    }
});

module.exports = mongoose.model('InternalOrder', InternalOrderSchema);
