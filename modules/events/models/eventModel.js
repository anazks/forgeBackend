const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
    eventName: {
        type: String,
        required: [true, 'Please add an event name']
    },
    eventDate: {
        type: Date,
        required: [true, 'Please add a date']
    },
    description: {
        type: String
    },
    type: {
        type: String,
        enum: ['Public Holiday', 'Festival', 'Operational', 'Others'],
        default: 'Others'
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

module.exports = mongoose.model('Event', EventSchema);
