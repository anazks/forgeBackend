const mongoose = require('mongoose');

const WastageItemSchema = new mongoose.Schema({
    bomId: { type: mongoose.Schema.ObjectId, ref: 'Bom' },
    menuId: { type: mongoose.Schema.ObjectId, ref: 'Menu' },
    itemName: String,
    approvedQty: Number,
    rate: Number,
    sellingRate: Number,
    wastageQty: { type: Number, default: 0 },
    soldQty: { type: Number, default: 0 }
});

const WastageSchema = new mongoose.Schema({
    centerId: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    items: [WastageItemSchema],
    totalCost: { type: Number, default: 0 },
    totalWastageCost: { type: Number, default: 0 },
    totalSales: { type: Number, default: 0 },
    totalMargin: { type: Number, default: 0 },
    entity: { type: mongoose.Schema.ObjectId, ref: 'Entity', required: true },
    createdAt: { type: Date, default: Date.now }
});

// One wastage record per center per day
WastageSchema.index({ centerId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Wastage', WastageSchema);
