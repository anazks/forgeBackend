const mongoose = require('mongoose');

const MenuRateSchema = new mongoose.Schema({
    menu: {
        type: mongoose.Schema.ObjectId,
        ref: 'Menu',
        required: false
    },
    bom: {
        type: mongoose.Schema.ObjectId,
        ref: 'Bom',
        required: false
    },
    center: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    rate: {
        type: Number,
        required: [true, 'Please add a rate']
    },
    centerRate: {
        type: Number,
        default: 0
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

// Unique rate per menu item per center OR per bom per center
MenuRateSchema.index({ menu: 1, center: 1 }, { unique: true, sparse: true });
MenuRateSchema.index({ bom: 1, center: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('MenuRate', MenuRateSchema);
