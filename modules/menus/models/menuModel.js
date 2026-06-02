const mongoose = require('mongoose');

const MenuSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a menu item name']
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
        required: function() {
            return this.unit === 'custom';
        }
    },
    // MRP: fixed selling price per unit quantity for direct items.
    // Used in the revenue console as the default unitPrice for B2C sales.
    // Required for all new direct menu items; existing items default to 0 (must be updated).
    mrpPrice: {
        type: Number,
        required: [true, 'Please enter the MRP price per unit'],
        min: [0, 'MRP price cannot be negative'],
        default: 0
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

module.exports = mongoose.model('Menu', MenuSchema);
