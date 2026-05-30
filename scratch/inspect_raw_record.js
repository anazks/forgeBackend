const mongoose = require('mongoose');
const DailyRevenue = require('../modules/revenue/models/dailyRevenueModel');
require('dotenv').config();

async function inspectRecord() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const record = await DailyRevenue.findById('6a182238f61e7188ced09c1b').lean();
        console.log(JSON.stringify(record, null, 2));
        mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
}

inspectRecord();
