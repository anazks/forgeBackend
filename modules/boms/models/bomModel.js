const mongoose = require('mongoose');

const BomItemSchema = new mongoose.Schema({
    itemName: {
        type: String,
        required: [true, 'Please add an item name']
    },
    materialId: {
        type: mongoose.Schema.ObjectId,
        ref: 'RawMaterial',
        required: false
    },
    quantity: {
        type: Number,
        required: [true, 'Please add a quantity']
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
    type: {
        type: String,
        enum: ['Raw Material', 'Consumable', 'BOM Item'],
        required: [true, 'Please specify the item type']
    }
});

const BomSchema = new mongoose.Schema({
    dishName: {
        type: String,
        required: [true, 'Please add a Dish Name']
    },
    kitchenPrice: {
        type: Number,
        default: 0,
        min: [0, 'Price cannot be negative']
    },
    unit: {
        type: String,
        enum: ['kg', 'ltr', 'pcs', 'gm', 'ml', 'custom'],
        default: 'pcs'
    },
    customUnit: {
        type: String,
        default: ''
    },
    menuItem: {
        type: mongoose.Schema.ObjectId,
        ref: 'Menu',
        required: false
    },
    preparationLocation: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: false
    },
    isSoldB2C: {
        type: Boolean,
        default: true
    },
    items: [BomItemSchema],
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

module.exports = mongoose.model('Bom', BomSchema);
