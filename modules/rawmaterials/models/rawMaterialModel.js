const mongoose = require('mongoose');

const RawMaterialSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a raw material name'],
        trim: true
    },
    simpleCode: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        match: [/^\d{4}$/, 'Simple code must be exactly 4 digits']
    },
    vendorName: {
        type: String,
        trim: true,
        default: ''
    },
    category: {
        type: String,
        default: ''
    },
    unit: {
        type: String,
        enum: ['kg', 'ltr', 'pcs', 'gm', 'ml', 'custom'],
        required: [true, 'Please specify a unit']
    },
    customUnit: {
        type: String,
        required: function () {
            return this.unit === 'custom';
        }
    },
    minimumStock: {
        type: Number,
        required: [true, 'Please add a minimum stock level'],
        min: [0, 'Minimum stock cannot be negative']
    },
    currentStock: {
        type: Number,
        default: 0,
        min: [0, 'Current stock cannot be negative']
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

const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

RawMaterialSchema.pre('validate', async function() {
    if (this.isNew || !this.simpleCode) {
        const counterExists = await Counter.findById('simpleCode');
        if (!counterExists) {
            const highestDoc = await this.model('RawMaterial').findOne({}, { simpleCode: 1 }).sort({ simpleCode: -1 }).lean();
            let startSeq = 1000; // start sequence at 1000 if none exist
            if (highestDoc && highestDoc.simpleCode) {
                const match = highestDoc.simpleCode.match(/\d+/);
                startSeq = match ? parseInt(match[0], 10) : 1000;
            }
            try {
                await Counter.create({ _id: 'simpleCode', seq: startSeq });
            } catch (e) {
                // Ignore duplicate key error if created concurrently
            }
        }

        const counter = await Counter.findByIdAndUpdate(
            'simpleCode',
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.simpleCode = String(counter.seq);
    }
});

module.exports = mongoose.model('RawMaterial', RawMaterialSchema);
