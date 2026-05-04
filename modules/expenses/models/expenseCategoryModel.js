const mongoose = require('mongoose');

const ExpenseCategorySchema = new mongoose.Schema({
    categoryCode: {
        type: String,
        unique: true
    },
    categoryName: {
        type: String,
        required: [true, 'Please enter a category name']
    },
    applicableLocations: [{
        type: String,
        enum: ['ALL', 'Kitchen', 'Center', 'Restaurant', 'Resort', 'Head Office']
    }],
    expenseType: {
        type: String,
        enum: ['Production', 'Maintenance', 'Other'],
        required: [true, 'Please select an expense type']
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
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

// Auto-generate category code before saving
ExpenseCategorySchema.pre('save', async function() {
    if (!this.categoryCode) {
        const count = await this.model('ExpenseCategory').countDocuments();
        this.categoryCode = `EXP-${(count + 1).toString().padStart(3, '0')}`;
    }
});

module.exports = mongoose.model('ExpenseCategory', ExpenseCategorySchema);
