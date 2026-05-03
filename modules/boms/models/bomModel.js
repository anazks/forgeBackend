const mongoose = require('mongoose');

const BomItemSchema = new mongoose.Schema({
    itemName: {
        type: String,
        required: [true, 'Please add an item name']
    },
    quantity: {
        type: Number,
        required: [true, 'Please add a quantity']
    },
    unit: {
        type: String,
        enum: ['kg', 'ltr', 'pcs', 'custom'],
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
        enum: ['Raw Material', 'Consumable'],
        required: [true, 'Please specify the item type']
    }
});

const BomSchema = new mongoose.Schema({
    dishName: {
        type: String,
        required: [true, 'Please add a Dish Name']
    },
    menuItem: {
        type: mongoose.Schema.ObjectId,
        ref: 'Menu',
        required: false // Optional link to the actual menu item
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
