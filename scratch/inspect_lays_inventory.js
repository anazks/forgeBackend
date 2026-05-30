const mongoose = require('mongoose');
const Inventory = require('../modules/inventory/models/inventoryModel');
require('dotenv').config();

async function inspectInventory() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const inv = await Inventory.findById('6a188d317e2823c06bd59780').lean();
        console.log(JSON.stringify(inv, null, 2));
        mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
}

inspectInventory();
