const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
    employeeCode: {
        type: String,
        unique: true,
        required: [true, 'Please add an employee code']
    },
    employeeName: {
        type: String,
        required: [true, 'Please add an employee name']
    },
    designation: {
        type: String,
        required: [true, 'Please add a designation']
    },
    department: {
        type: String,
        enum: ['Finance', 'Kitchen Operations', 'Center Operations', 'Store Operations', 'Others'],
        required: [true, 'Please select a department']
    },
    dateOfJoining: {
        type: Date,
        required: [true, 'Please add a date of joining']
    },
    contactNumber: {
        type: String,
        required: [true, 'Please add a contact number']
    },
    locationType: {
        type: String,
        enum: ['Head Office', 'Kitchen', 'Center', 'Resort', 'On Contract', 'Others'],
        required: [true, 'Please select a location type']
    },
    locationName: {
        type: String,
        required: [true, 'Please add a location name']
    },
    systemRole: {
        type: String
    },
    status: {
        type: String,
        enum: ['Active', 'On Leave', 'Terminated', 'Resigned'],
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

module.exports = mongoose.model('Employee', EmployeeSchema);
