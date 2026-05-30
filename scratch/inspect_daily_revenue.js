const mongoose = require('mongoose');
const DailyRevenue = require('../modules/revenue/models/dailyRevenueModel');
require('dotenv').config();

async function inspectDailyRevenue() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to database.');

        const records = await DailyRevenue.find().lean();
        console.log(`Found ${records.length} total daily revenue records.`);

        for (const record of records) {
            console.log(`\nRecord ID: ${record._id} | Location: ${record.locationId} | Date: ${record.date.toISOString()} | Status: ${record.status}`);
            console.log(`B2C Confirmed: ${record.b2cConfirmed} | B2B Confirmed: ${record.b2bConfirmed}`);
            console.log('B2C Sales:');
            for (const item of record.b2cSales || []) {
                console.log(`  - ItemName: ${item.itemName} | ItemType: ${item.itemType} | MenuItem: ${item.menuItem} | BomId: ${item.bomId} | SoldQty: ${item.soldQty} | TotalVal: ${item.totalVal}`);
            }
        }

        mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

inspectDailyRevenue();
