const mongoose = require('mongoose');

const HrYearViewSchema = new mongoose.Schema({
    year: {
        type: Number,
        required: [true, 'Please add a calendar year'],
        unique: true
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

module.exports = mongoose.model('HrYearView', HrYearViewSchema);
