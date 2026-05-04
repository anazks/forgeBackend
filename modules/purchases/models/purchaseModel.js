const mongoose = require('mongoose');

const PurchaseSchema = new mongoose.Schema({
    purchaseCode: {
        type: String,
        unique: true
    },
    item: {
        type: mongoose.Schema.ObjectId,
        ref: 'RawMaterial',
        required: [true, 'Please select an item']
    },
    vendor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Vendor',
        required: false
    },
    unitPrice: {
        type: Number,
        required: [true, 'Please enter unit price']
    },
    quantity: {
        type: Number,
        required: [true, 'Please enter quantity']
    },
    discount: {
        type: Number,
        default: 0
    },
    totalCost: {
        type: Number
    },
    purchaseDate: {
        type: Date,
        default: Date.now
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: true
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['Completed', 'Pending', 'Cancelled'],
        default: 'Completed'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-calculate total cost and generate code
PurchaseSchema.pre('save', async function() {
    this.totalCost = (this.unitPrice * this.quantity) - this.discount;
    
    if (!this.purchaseCode) {
        const count = await this.model('Purchase').countDocuments();
        this.purchaseCode = `PUR-${(count + 1).toString().padStart(4, '0')}`;
    }
});

// Update stock in RawMaterial after purchase
PurchaseSchema.post('save', async function() {
    const RawMaterial = mongoose.model('RawMaterial');
    await RawMaterial.findByIdAndUpdate(this.item, {
        $inc: { currentStock: this.quantity }
    });
});

module.exports = mongoose.model('Purchase', PurchaseSchema);
