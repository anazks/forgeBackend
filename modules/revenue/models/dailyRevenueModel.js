const mongoose = require('mongoose');

const DailyRevenueSchema = new mongoose.Schema({
    locationId: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['OPEN', 'CLOSED'],
        default: 'OPEN'
    },
    b2bConfirmed: {
        type: Boolean,
        default: false
    },
    b2cConfirmed: {
        type: Boolean,
        default: false
    },
    onlineConfirmed: {
        type: Boolean,
        default: false
    },
    b2bSales: [{
        bomId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Bom'
        },
        menuItem: {
            type: mongoose.Schema.ObjectId,
            ref: 'Menu'
        },
        itemType: {
            type: String,
            enum: ['BOM', 'DIRECT']
        },
        itemName: String,
        quantity: {
            type: Number,
            default: 0
        },
        unitPrice: {
            type: Number,
            default: 0
        },
        totalVal: {
            type: Number,
            default: 0
        },
        isManual: {
            type: Boolean,
            default: false
        }
    }],
    b2cSales: [{
        menuItem: {
            type: mongoose.Schema.ObjectId,
            ref: 'Menu'
        },
        bomId: {
            type: mongoose.Schema.ObjectId,
            ref: 'Bom'
        },
        itemName: String,
        itemType: {
            type: String,
            enum: ['BOM', 'DIRECT']
        },
        unit: String,
        stockQty: {
            type: Number,
            default: 0
        },
        soldQty: {
            type: Number,
            default: 0
        },
        unitPrice: {
            type: Number,
            default: 0
        },
        totalVal: {
            type: Number,
            default: 0
        }
    }],
    onlineSales: {
        totalSaleValue: {
            type: Number,
            default: 0
        },
        aggregatorPercentage: {
            type: Number,
            default: 0
        }
    },
    totalAmount: {
        type: Number,
        default: 0
    },
    reportedCash: {
        type: Number,
        default: 0
    },
    reportedOnline: {
        type: Number,
        default: 0
    },
    reportedDifference: {
        type: Number,
        default: 0
    },
    verification: {
        cashDeposited: {
            type: Number,
            default: 0
        },
        onlinePayments: {
            type: Number,
            default: 0
        },
        onlineSalesReceivedAmount: {
            type: Number,
            default: 0
        },
        onlineSalesCommission: {
            type: Number,
            default: 0
        },
        difference: {
            type: Number,
            default: 0
        },
        remarks: {
            type: String,
            default: ''
        },
        isAcknowledged: {
            type: Boolean,
            default: false
        },
        acknowledgedAt: {
            type: Date
        }
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: true
    },
    closedAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// One revenue record per location per day
DailyRevenueSchema.index({ locationId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DailyRevenue', DailyRevenueSchema);
