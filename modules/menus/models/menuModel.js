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
