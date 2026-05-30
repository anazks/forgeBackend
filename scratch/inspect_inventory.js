const mongoose = require('mongoose');
const Inventory = require('../modules/inventory/models/inventoryModel');
const RawMaterial = require('../modules/rawmaterials/models/rawMaterialModel');
const Menu = require('../modules/menus/models/menuModel');
const Bom = require('../modules/boms/models/bomModel');
const User = require('../modules/users/models/model');
require('dotenv').config();

async function inspectInventory() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to database.');

        const inventories = await Inventory.find().lean();
        console.log(`Found ${inventories.length} total inventory records.`);

        for (const item of inventories) {
            const matId = item.materialId;
            const locId = item.locationId;

            const loc = await User.findById(locId).lean();
            const locName = loc ? `${loc.name} (${loc.role})` : 'Unknown Location';

            const rawMat = await RawMaterial.findById(matId).lean();
            const menu = await Menu.findById(matId).lean();
            const bom = await Bom.findById(matId).lean();

            let type = 'UNKNOWN';
            let name = 'N/A';
            if (rawMat) {
                type = 'RawMaterial';
                name = rawMat.name;
            } else if (menu) {
                type = 'Menu';
                name = menu.name;
            } else if (bom) {
                type = 'BOM';
                name = bom.dishName;
            }

            console.log(`Inventory ID: ${item._id} | Location: ${locName} | Material ID: ${matId} | Type: ${type} | Name: ${name} | Stock: ${item.currentStock}`);
        }

        mongoose.connection.close();
    } catch (err) {
        console.error('Error during inspection:', err);
    }
}

inspectInventory();
