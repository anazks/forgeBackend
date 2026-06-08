const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
    employeeCode: {
        type: String,
        unique: true,
        immutable: true,
        required: [true, 'Please add an employee code']
    },
    customEmployeeCode: {
        type: String,
        trim: true,
        default: ''
    },
    employeeName: {
        type: String,
        required: [true, 'Please add an employee name']
    },
    designation: {
        type: String,
        required: [true, 'Please add a designation']
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
    address: {
        type: String
    },
    emergencyContact: {
        type: String
    },
    monthlyTakeHomeSalary: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

EmployeeSchema.pre('validate', async function() {
    if (this.isNew || !this.employeeCode) {
        const counterExists = await Counter.findById('employeeCode');
        if (!counterExists) {
            const highestDoc = await this.model('Employee').findOne({}, { employeeCode: 1 }).sort({ employeeCode: -1 }).lean();
            let startSeq = 0;
            if (highestDoc && highestDoc.employeeCode) {
                const match = highestDoc.employeeCode.match(/\d+/);
                startSeq = match ? parseInt(match[0], 10) : 0;
            }
            try {
                await Counter.create({ _id: 'employeeCode', seq: startSeq });
            } catch (e) {
                // Ignore duplicate key error if created concurrently
            }
        }

        const counter = await Counter.findByIdAndUpdate(
            'employeeCode',
            { $inc: { seq: 1 } },
            { new: true, upsert: true }
        );
        this.employeeCode = `EMP${counter.seq.toString().padStart(3, '0')}`;
    }
});

module.exports = mongoose.model('Employee', EmployeeSchema);
