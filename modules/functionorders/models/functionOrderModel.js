const mongoose = require('mongoose');

const FunctionOrderSchema = new mongoose.Schema({
    foCode: {
        type: String,
        unique: true
    },
    centerId: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: true
    },
    bookingDate: {
        type: Date,
        default: Date.now
    },
    eventDate: {
        type: Date,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    advanceAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    advancePaymentMode: {
        type: String,
        enum: ['Cash', 'UPI', 'Card', 'Bank Transfer'],
        required: true
    },
    totalOrderValue: {
        type: Number,
        default: 0,
        min: 0
    },
    pendingReceivable: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['OPEN', 'REQUEST_PLACED', 'DELIVERED', 'PENDING_SETTLEMENT', 'SETTLED', 'CLOSED'],
        default: 'OPEN'
    },
    dishes: [{
        menuId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Menu'
        },
        bomId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Bom'
        },
        itemName: {
            type: String,
            required: true
        },
        qty: {
            type: Number,
            required: true,
            min: 1
        },
        unit: {
            type: String,
            default: 'pcs'
        }
    }],
    foodRequestId: {
        type: mongoose.Schema.ObjectId,
        ref: 'FoodRequest',
        required: false
    },
    finalPaymentMode: {
        type: String,
        enum: ['Cash', 'UPI', 'Card', 'Bank Transfer']
    },
    finalPaymentAmount: {
        type: Number
    },
    finalPaymentReceivedAt: {
        type: Date
    },
    linkedToCashClosure: {
        type: Boolean,
        default: false
    },
    cashClosureDate: {
        type: Date
    },
    financeAcknowledged: {
        type: Boolean,
        default: false
    },
    financeAcknowledgedAt: {
        type: Date
    },
    financeNote: {
        type: String
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

FunctionOrderSchema.pre('save', async function() {
    if (!this.foCode) {
        const counterExists = await Counter.findById('foCode');
        if (!counterExists) {
            const highestDoc = await this.model('FunctionOrder').findOne({}, { foCode: 1 }).sort({ foCode: -1 }).lean();
            let startSeq = 0;
            if (highestDoc && highestDoc.foCode) {
                const match = highestDoc.foCode.match(/\d+/);
                startSeq = match ? parseInt(match[0], 10) : 0;
            }
            try {
                await Counter.create({ _id: 'foCode', seq: startSeq });
            } catch (e) {
                // Ignore duplicate key error if created concurrently
            }
        }

        const counter = await Counter.findByIdAndUpdate(
            'foCode',
            { $inc: { seq: 1 } },
            { returnDocument: 'after', upsert: true }
        );
        this.foCode = `FO-${counter.seq.toString().padStart(5, '0')}`;
    }
});

module.exports = mongoose.model('FunctionOrder', FunctionOrderSchema);
