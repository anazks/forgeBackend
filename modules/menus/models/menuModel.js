const mongoose = require('mongoose');

const MenuSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a menu item name']
    },
    unitPrice: {
        type: Number,
        required: [true, 'Please add a unit price']
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
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: false // If true, only admins can create for their entity. We'll leave it false so super admin can create global ones, or specify entity.
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Menu', MenuSchema);
