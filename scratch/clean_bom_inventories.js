const mongoose = require('mongoose');
const Inventory = require('../modules/inventory/models/inventoryModel');
const Bom = require('../modules/boms/models/bomModel');
require('dotenv').config();

async function cleanBoms() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to database.');

        // Find all BOMs to get their _ids and menuItems
        const boms = await Bom.find().lean();
        const bomIds = boms.map(b => b._id);
        const bomMenuIds = boms.filter(b => b.menuItem).map(b => b.menuItem);

        const idsToDelete = [...bomIds, ...bomMenuIds];
        console.log(`Found ${idsToDelete.length} total BOM/Menu IDs to check for inventory cleanup.`);

        const result = await Inventory.deleteMany({ materialId: { $in: idsToDelete } });
        console.log(`Successfully deleted ${result.deletedCount} stale BOM inventory records.`);

        mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
}

cleanBoms();
