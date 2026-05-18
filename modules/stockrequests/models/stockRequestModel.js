const mongoose = require('mongoose');

const RequestItemSchema = new mongoose.Schema({
    material: {
        type: mongoose.Schema.ObjectId,
        ref: 'RawMaterial',
        required: false
    },
    menuId: {
        type: mongoose.Schema.ObjectId,
        ref: 'Menu',
        required: false
    },
    bomId: {
        type: mongoose.Schema.ObjectId,
        ref: 'Bom',
        required: false
    },
    isMenuItem: {
        type: Boolean,
        default: false
    },
    materialName: { type: String, required: true },
    simpleCode:   { type: String, default: '—' },
    requestedQty: { type: Number, required: true, min: 0 },
    unit:         { type: String, default: 'kg' },
    approvalStatus: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        default: 'PENDING'
    },
    availableStock: { type: Number, default: null }, // filled at approval time
    isStockSufficient: { type: Boolean, default: null },
    receivedQty: { type: Number, default: null }
});

const StockRequestSchema = new mongoose.Schema({
    centerName: { type: String, required: [true, 'Please provide the center name'] },
    centerId: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: false
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: false
    },
    requestedItems: [RequestItemSchema],
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'PARTIAL', 'RECEIVED'],
        default: 'PENDING'
    },
    notes: { type: String, default: '' },
    approvedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: false
    },
    approvedAt: { type: Date },
    receivedAt: { type: Date },
    rejectionReason: { type: String, default: '' },
    deliveryDate: {
        type: Date,
        default: () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return tomorrow;
        }
    },
    createdAt: { type: Date, default: Date.now }
});

// Keep the Mongoose model name as 'FoodRequest' to preserve the existing
// MongoDB collection ('foodrequests') without any data migration.
module.exports = mongoose.model('FoodRequest', StockRequestSchema);
