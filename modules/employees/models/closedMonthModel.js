const mongoose = require('mongoose');

const ClosedMonthSchema = new mongoose.Schema({
    year: {
        type: Number,
        required: true
    },
    month: {
        type: Number, // 1 to 12
        required: true
    },
    closedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    closedAt: {
        type: Date,
        default: Date.now
    },
    entity: {
        type: mongoose.Schema.ObjectId,
        ref: 'Entity',
        required: false
    }
});

ClosedMonthSchema.index({ year: 1, month: 1, entity: 1 }, { unique: true });

module.exports = mongoose.model('ClosedMonth', ClosedMonthSchema);
