const path = require('path');
const mongoose = require('mongoose');

// Path to the backend dir
const backendDir = 'c:/Users/HP/OneDrive/Desktop/git_clone/forge/forgeBackend';

// Import config and services
const connectDB = require(path.join(backendDir, 'config/db'));
const revenueService = require(path.join(backendDir, 'modules/revenue/services/revenueService'));

// Import models
const User = require(path.join(backendDir, 'modules/users/models/model'));
const Entity = require(path.join(backendDir, 'modules/entities/models/Entity'));
const Menu = require(path.join(backendDir, 'modules/menus/models/menuModel'));
const Inventory = require(path.join(backendDir, 'modules/inventory/models/inventoryModel'));
const DailyRevenue = require(path.join(backendDir, 'modules/revenue/models/dailyRevenueModel'));
const Bom = require(path.join(backendDir, 'modules/boms/models/bomModel'));
const RawMaterial = require(path.join(backendDir, 'modules/rawmaterials/models/rawMaterialModel'));

async function runTest() {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected successfully!');

    let testEntity = null;
    let testLocation = null;
    let testMenu = null;
    let testInventory = null;
    let testBom = null;
    let testRawMaterial = null;
    let testRMInventory = null;

    try {
        // 1. Create a mock Entity
        testEntity = await Entity.create({
            name: 'Test Revenue Entity',
            location: 'Test Location',
            username: 'testrev_' + Date.now(),
            licenseExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) // 30 days
        });
        console.log('Created test entity:', testEntity._id);

        // 2. Create a mock User/Location with role KITCHEN
        testLocation = await User.create({
            name: 'Test Kitchen Location',
            email: 'testkitchen_' + Date.now() + '@example.com',
            password: 'password123',
            role: 'KITCHEN',
            entity: testEntity._id,
            licenseExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
            onlineSalesEnabled: false,
            aggregatorPercentage: 0
        });
        console.log('Created test kitchen location:', testLocation._id);

        // 3. Create a mock Direct menu item
        testMenu = await Menu.create({
            name: 'Mock Direct Item',
            category: 'Direct',
            unit: 'pcs',
            entity: testEntity._id
        });
        console.log('Created test menu item:', testMenu._id);

        // 4. Create mock Inventory for that item
        testInventory = await Inventory.create({
            materialId: testMenu._id,
            locationId: testLocation._id,
            entity: testEntity._id,
            currentStock: 50,
            minimumStock: 10
        });
        console.log('Created test inventory with stock = 50 for direct item');

        // 5. Create a mock Raw Material and BOM recipe
        testRawMaterial = await RawMaterial.create({
            name: 'Mock Flour',
            category: 'Flour',
            unit: 'kg',
            minimumStock: 10,
            simpleCode: Math.floor(1000 + Math.random() * 9000).toString(),
            entity: testEntity._id
        });
        console.log('Created test raw material:', testRawMaterial._id);

        testRMInventory = await Inventory.create({
            materialId: testRawMaterial._id,
            locationId: testLocation._id,
            entity: testEntity._id,
            currentStock: 100,
            minimumStock: 5
        });
        console.log('Created test inventory with stock = 100 for raw material');

        testBom = await Bom.create({
            dishName: 'Mock Bread',
            category: 'Bakery',
            unit: 'pcs',
            isSoldB2C: true,
            preparationLocation: testLocation._id,
            entity: testEntity._id,
            items: [
                {
                    materialId: testRawMaterial._id,
                    itemName: 'Mock Flour',
                    type: 'Raw Material',
                    quantity: 2, // 2kg per bread
                    unit: 'kg'
                }
            ]
        });
        console.log('Created test BOM recipe:', testBom._id);

        const testDate = '2026-05-27';

        // 6. Test confirmRevenueTab for b2b with manually added items (both Direct and BOM)
        console.log('\n--- Test: Confirm B2B Sales Tab with Manual Entries ---');
        const b2bData = [
            {
                bomId: testBom._id,
                itemName: 'Mock Bread',
                itemType: 'BOM',
                quantity: 5,
                unitPrice: 30,
                totalVal: 150,
                isManual: true
            },
            {
                menuItem: testMenu._id,
                itemName: 'Mock Direct Item',
                itemType: 'DIRECT',
                quantity: 10,
                unitPrice: 20,
                totalVal: 200,
                isManual: true
            }
        ];
        
        let confirmed = await revenueService.confirmRevenueTab(
            testLocation._id,
            testDate,
            'b2b',
            b2bData,
            testEntity._id
        );
        console.log('Confirmed B2B status:', confirmed.b2bConfirmed);
        console.log('B2B Sales count:', confirmed.b2bSales.length);

        if (!confirmed.b2bConfirmed) throw new Error('Expected b2bConfirmed to be true');
        if (confirmed.b2bSales.length !== 2) throw new Error('Expected 2 B2B entries');

        // 7. Test closeDailyRevenue
        console.log('\n--- Test: Close Daily Revenue & Verify Inventory Deductions ---');
        let closed = await revenueService.closeDailyRevenue(testLocation._id, testDate, testEntity._id, testLocation);
        console.log('Closed record status:', closed.status);
        console.log('Total Revenue Recorded:', closed.totalAmount);
        
        if (closed.status !== 'CLOSED') throw new Error('Expected record status to be CLOSED');
        if (closed.totalAmount !== 350) throw new Error('Expected totalAmount to be 350 (150 BOM + 200 Direct)');

        // Verify inventory deductions
        // 1. Direct item stock should be decremented from 50 to 40 (50 - 10)
        const updatedDirectInv = await Inventory.findById(testInventory._id);
        console.log('Direct Item Original Stock:', 50);
        console.log('Direct Item New Stock:', updatedDirectInv.currentStock);
        if (updatedDirectInv.currentStock !== 40) {
            throw new Error('Expected direct item stock to be 40');
        }

        // 2. Raw Material stock should be exploded and decremented from 100 to 90 (100 - (5 * 2))
        const updatedRMInv = await Inventory.findById(testRMInventory._id);
        console.log('Raw Material Original Stock:', 100);
        console.log('Raw Material New Stock after BOM explosion:', updatedRMInv.currentStock);
        if (updatedRMInv.currentStock !== 90) {
            throw new Error('Expected raw material stock to be 90');
        }

        console.log('Inventory deductions verified successfully!');
        console.log('\n--- ALL TESTS PASSED SUCCESSFULLY! ---');

    } catch (err) {
        console.error('Test failed with error:', err);
        process.exit(1);
    } finally {
        // Cleanup database
        console.log('\nCleaning up database records...');
        if (testRMInventory) await Inventory.deleteOne({ _id: testRMInventory._id });
        if (testRawMaterial) await RawMaterial.deleteOne({ _id: testRawMaterial._id });
        if (testBom) await Bom.deleteOne({ _id: testBom._id });
        if (testInventory) await Inventory.deleteOne({ _id: testInventory._id });
        if (testMenu) await Menu.deleteOne({ _id: testMenu._id });
        if (testLocation) await User.deleteOne({ _id: testLocation._id });
        if (testEntity) await Entity.deleteOne({ _id: testEntity._id });
        await DailyRevenue.deleteMany({ locationId: testLocation ? testLocation._id : null });
        console.log('Cleanup completed.');

        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

runTest();
