const mongoose = require('mongoose');

const InventorySchema = new mongoose.Schema({
    materialId: {
        type: mongoose.Schema.ObjectId,
        ref: 'RawMaterial',
        required: [true, 'Please specify the raw material']
    },
    locationId: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Please specify the location']
    },
    currentStock: {
        type: Number,
        default: 0,
        min: [0, 'Current stock cannot be negative']
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Ensure a material only has one inventory record per location
InventorySchema.index({ materialId: 1, locationId: 1 }, { unique: true });

module.exports = mongoose.model('Inventory', InventorySchema);
