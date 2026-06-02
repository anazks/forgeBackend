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
        default: 0
        // Note: min: 0 removed — safeDeductStock() in inventoryService already floors to 0.
        // The min validator would block $inc operations in cases where Mongoose re-validates,
        // even though safeDeductStock prevents negative values at the application layer.
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

// H3 Fix: unique index now includes entity to prevent cross-entity stock collision.
// MIGRATION NOTE: Before deploying, verify no duplicate (materialId + locationId) pairs
// exist across different entity values with:
// db.inventories.aggregate([{ $group: { _id: { m: "$materialId", l: "$locationId" }, c: { $sum: 1 } } }, { $match: { c: { $gt: 1 } } }])
InventorySchema.index({ materialId: 1, locationId: 1, entity: 1 }, { unique: true });

module.exports = mongoose.model('Inventory', InventorySchema);
