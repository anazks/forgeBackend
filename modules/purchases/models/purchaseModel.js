const mongoose = require('mongoose');

const PurchaseSchema = new mongoose.Schema({
    purchaseCode: {
        type: String,
        unique: true
    },
    item: {
        type: mongoose.Schema.ObjectId,
        ref: 'RawMaterial',
        required: [true, 'Please select an item']
    },
    vendor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Vendor',
        required: false
    },
    unitPrice: {
        type: Number,
        required: [true, 'Please enter unit price']
    },
    quantity: {
        type: Number,
        required: [true, 'Please enter quantity']
    },
    discount: {
        type: Number,
        default: 0
    },
    totalCost: {
        type: Number
    },
    purchaseDate: {
        type: Date,
        default: Date.now
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: true
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['Completed', 'Pending', 'Cancelled'],
        default: 'Completed'
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

// Auto-calculate total cost and generate code
PurchaseSchema.pre('save', async function() {
    this.totalCost = (this.unitPrice * this.quantity) - this.discount;
    
    if (!this.purchaseCode) {
        const counterExists = await Counter.findById('purchaseCode');
        if (!counterExists) {
            const highestDoc = await this.model('Purchase').findOne({}, { purchaseCode: 1 }).sort({ purchaseCode: -1 }).lean();
            let startSeq = 0;
            if (highestDoc && highestDoc.purchaseCode) {
                const match = highestDoc.purchaseCode.match(/\d+/);
                startSeq = match ? parseInt(match[0], 10) : 0;
            }
            try {
                await Counter.create({ _id: 'purchaseCode', seq: startSeq });
            } catch (e) {
                // Ignore duplicate key error if another request created it concurrently
            }
        }

        const counter = await Counter.findByIdAndUpdate(
            'purchaseCode',
            { $inc: { seq: 1 } },
            { returnDocument: 'after', upsert: true }
        );
        this.purchaseCode = `PUR-${counter.seq.toString().padStart(4, '0')}`;
    }
});

// Update stock in RawMaterial after purchase
PurchaseSchema.post('save', async function() {
    const RawMaterial = mongoose.model('RawMaterial');
    await RawMaterial.findByIdAndUpdate(this.item, {
        $inc: { currentStock: this.quantity }
    });
});

module.exports = mongoose.model('Purchase', PurchaseSchema);
