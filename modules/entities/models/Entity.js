const mongoose = require('mongoose');

const EntitySchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Please add a username'],
        unique: true,
        trim: true
    },
    name: {
        type: String,
        required: [true, 'Please add a name']
    },
    location: {
        type: String,
        required: [true, 'Please add a location']
    },
    admins: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Entity', EntitySchema);
