const mongoose = require('mongoose');

const VendorSchema = new mongoose.Schema({
    vendorCode: {
        type: String,
        unique: true,
        immutable: true,
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
    vendorCategories: {
        type: [String],
        default: []
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

const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

VendorSchema.pre('validate', async function() {
    // ALWAYS auto-generate vendorCode for new documents
    if (this.isNew || !this.vendorCode) {
        const counterExists = await Counter.findById('vendorCode');
        if (!counterExists) {
            const highestDoc = await this.model('Vendor').findOne({}, { vendorCode: 1 }).sort({ vendorCode: -1 }).lean();
            let startSeq = 0;
            if (highestDoc && highestDoc.vendorCode) {
                const match = highestDoc.vendorCode.match(/\d+/);
                startSeq = match ? parseInt(match[0], 10) : 0;
            }
            try {
                await Counter.create({ _id: 'vendorCode', seq: startSeq });
            } catch (e) {
                // Ignore duplicate key error if created concurrently
            }
        }

        const counter = await Counter.findByIdAndUpdate(
            'vendorCode',
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.vendorCode = `V${counter.seq.toString().padStart(3, '0')}`;
    }
});

module.exports = mongoose.model('Vendor', VendorSchema);
