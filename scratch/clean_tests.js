const path = require('path');
const mongoose = require('mongoose');

const backendDir = 'c:/Users/HP/OneDrive/Desktop/git_clone/forge/forgeBackend';
const connectDB = require(path.join(backendDir, 'config/db'));

const Entity = require(path.join(backendDir, 'modules/entities/models/Entity'));
const User = require(path.join(backendDir, 'modules/users/models/model'));
const RawMaterial = require(path.join(backendDir, 'modules/rawmaterials/models/rawMaterialModel'));
const Bom = require(path.join(backendDir, 'modules/boms/models/bomModel'));
const Menu = require(path.join(backendDir, 'modules/menus/models/menuModel'));
const Inventory = require(path.join(backendDir, 'modules/inventory/models/inventoryModel'));
const DailyRevenue = require(path.join(backendDir, 'modules/revenue/models/dailyRevenueModel'));

async function clean() {
    console.log('Connecting to database...');
    await connectDB();

    try {
        // Delete Entities with "Test" in name
        const entityRes = await Entity.deleteMany({ name: /Test/i });
        console.log(`Deleted ${entityRes.deletedCount} test entities.`);

        // Delete Users with "Test" or "test" in name or email
        const userRes = await User.deleteMany({ 
            $or: [
                { name: /Test/i },
                { email: /test/i }
            ]
        });
        console.log(`Deleted ${userRes.deletedCount} test users.`);

        // Delete RawMaterials with "Mock" or "Test"
        const rmRes = await RawMaterial.deleteMany({ name: /Mock|Test/i });
        console.log(`Deleted ${rmRes.deletedCount} test raw materials.`);

        // Delete BOMs with "Mock" or "Test"
        const bomRes = await Bom.deleteMany({ dishName: /Mock|Test/i });
        console.log(`Deleted ${bomRes.deletedCount} test BOMs.`);

        // Delete Menus with "Mock" or "Test"
        const menuRes = await Menu.deleteMany({ name: /Mock|Test/i });
        console.log(`Deleted ${menuRes.deletedCount} test menu items.`);

        // Clear orphan daily revenues or inventories that might not have an entity reference
        const invRes = await Inventory.deleteMany({ 
            $or: [
                { materialId: null },
                { entity: null }
            ]
        });
        console.log(`Deleted ${invRes.deletedCount} orphan inventories.`);

    } catch (err) {
        console.error('Error during cleanup:', err);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

clean();
