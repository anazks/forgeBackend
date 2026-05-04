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
        match: [/^\d{4}$/, 'Simple code must be exactly 4 digits']
    },
    vendorName: {
        type: String,
        trim: true,
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

module.exports = mongoose.model('RawMaterial', RawMaterialSchema);
