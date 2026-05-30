const mongoose = require('mongoose');
const User = require('../modules/users/models/model');
const Entity = require('../modules/entities/models/Entity');
const RawMaterial = require('../modules/rawmaterials/models/rawMaterialModel');
const Bom = require('../modules/boms/models/bomModel');
const Inventory = require('../modules/inventory/models/inventoryModel');
const StockRequest = require('../modules/stockrequests/models/stockRequestModel');
const InternalOrder = require('../modules/production/models/internalOrderModel');
const PurchaseRequest = require('../modules/purchases/models/purchaseRequestModel');
const Bill = require('../modules/purchases/models/billModel');
const Vendor = require('../modules/vendors/models/vendorModel');
const Menu = require('../modules/menus/models/menuModel');

const stockRequestController = require('../modules/stockrequests/controllers/stockRequestController');
const productionService = require('../modules/production/services/productionService');
const productionController = require('../modules/production/controllers/productionController');
const purchaseController = require('../modules/purchases/controllers/purchaseController');

require('dotenv').config();

async function runTest() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        // Cleanup existing test entity data if any
        const existingEntity = await Entity.findOne({ username: 'prod_test_corp' });
        if (existingEntity) {
            await Inventory.deleteMany({ entity: existingEntity._id });
            await StockRequest.deleteMany({ entity: existingEntity._id });
            await InternalOrder.deleteMany({ entity: existingEntity._id });
            await PurchaseRequest.deleteMany({ entity: existingEntity._id });
            await Bill.deleteMany({ entity: existingEntity._id });
            await Entity.deleteOne({ _id: existingEntity._id });
        }

        await User.deleteMany({ email: { $in: ['center_a@test.com', 'kitchen_b@test.com'] } });
        await RawMaterial.deleteMany({ name: { $in: ['RM Milk', 'RM Sugar'] } });
        await Bom.deleteMany({ dishName: { $in: ['Ingredient I', 'Dish P'] } });
        await Menu.deleteMany({ name: { $in: ['Ingredient I', 'Dish P'] } });
        await Vendor.deleteMany({ vendorName: 'Test Prod Vendor' });

        // 1. Setup Entity and Users
        const entity = await Entity.create({
            name: 'Prod Test Corp',
            location: 'Sandbox Room',
            username: 'prod_test_corp'
        });

        const centerA = await User.create({
            name: 'Center A',
            email: 'center_a@test.com',
            password: 'password123',
            role: 'CENTERS',
            licenseNumber: 'LIC-CEN-A',
            entity: entity._id
        });

        const kitchenB = await User.create({
            name: 'Kitchen B',
            email: 'kitchen_b@test.com',
            password: 'password123',
            role: 'KITCHEN',
            licenseNumber: 'LIC-KIT-B',
            entity: entity._id
        });

        const vendor = await Vendor.create({
            vendorName: 'Test Prod Vendor',
            email: 'vendor@test.com',
            contactNumber: '1234567890',
            vendorCode: 'VND-TEST-001',
            entity: entity._id
        });

        // 2. Setup Raw Materials
        const rmMilk = await RawMaterial.create({
            name: 'RM Milk',
            simpleCode: '1001',
            unit: 'ltr',
            minimumStock: 10,
            currentStock: 0,
            entity: entity._id
        });

        const rmSugar = await RawMaterial.create({
            name: 'RM Sugar',
            simpleCode: '1002',
            unit: 'kg',
            minimumStock: 10,
            currentStock: 0,
            entity: entity._id
        });

        // 3. Setup Menu and BOMs (Ingredient I prepared at Kitchen B, Dish P prepared at Center A using Ingredient I)
        // We link Ingredient I BOM to its Menu item, and in Dish P we reference the Menu item ID to test robust resolution.
        const menuIngredientI = await Menu.create({
            name: 'Ingredient I',
            unit: 'ltr',
            category: 'Sub-assembly',
            entity: entity._id
        });

        const bomIngredientI = await Bom.create({
            dishName: 'Ingredient I',
            unit: 'ltr',
            menuItem: menuIngredientI._id,
            preparationLocation: kitchenB._id,
            entity: entity._id,
            items: [
                { materialId: rmMilk._id, itemName: 'RM Milk', quantity: 2, unit: 'ltr', type: 'Raw Material' }
            ]
        });

        const menuDishP = await Menu.create({
            name: 'Dish P',
            unit: 'pcs',
            category: 'Main Dish',
            entity: entity._id
        });

        const bomDishP = await Bom.create({
            dishName: 'Dish P',
            unit: 'pcs',
            menuItem: menuDishP._id,
            preparationLocation: centerA._id,
            entity: entity._id,
            items: [
                { materialId: menuIngredientI._id, itemName: 'Ingredient I', quantity: 1, unit: 'ltr', type: 'BOM Item' },
                { materialId: rmSugar._id, itemName: 'RM Sugar', quantity: 3, unit: 'kg', type: 'Raw Material' }
            ]
        });

        // 4. Seed initial inventory
        // RM Milk at Kitchen B = 100 liters
        await Inventory.create({
            materialId: rmMilk._id,
            locationId: kitchenB._id,
            entity: entity._id,
            currentStock: 100
        });

        // RM Sugar at Center A = 100 kg
        await Inventory.create({
            materialId: rmSugar._id,
            locationId: centerA._id,
            entity: entity._id,
            currentStock: 100
        });

        console.log('Seeding and setup finished.');

        // 5. Create a Stock Request: Center A requests 5 pcs of Dish P
        const stockReq = await StockRequest.create({
            centerName: 'Center A',
            centerId: centerA._id,
            entity: entity._id,
            requestedItems: [
                {
                    bomId: bomDishP._id,
                    materialName: 'Dish P',
                    requestedQty: 5,
                    unit: 'pcs',
                    isMenuItem: true,
                    approvalStatus: 'APPROVED' // COO bulk approves
                }
            ],
            status: 'APPROVED',
            deliveryDate: new Date()
        });

        // Trigger sync of internal orders manually (acts as after stockRequest approval)
        // We will call the controller method or run the sync function
        console.log('Syncing internal orders...');
        const syncModule = require('../modules/stockrequests/controllers/stockRequestController');
        // Let's resolve syncInternalOrdersForRequest from controller (it's not exported, so let's call approveRequest)
        // Or wait! Can we mock request context and trigger approveRequest? Yes!
        const req = {
            params: { id: stockReq._id },
            body: { itemIds: [stockReq.requestedItems[0]._id.toString()], action: 'APPROVED' },
            user: { _id: centerA._id }
        };
        const res = {
            status: (code) => ({
                json: (data) => console.log('Approved Stock Request items status:', code, data.message)
            })
        };
        await syncModule.approveRequest(req, res, (err) => { if (err) throw err; });

        // 6. Verify internal orders are created
        const internalOrders = await InternalOrder.find({ foodRequestId: stockReq._id }).lean();
        console.log(`Internal Orders created: ${internalOrders.length}`);
        
        if (internalOrders.length !== 2) {
            throw new Error(`Expected 2 internal orders, found ${internalOrders.length}`);
        }

        const selfOrder = internalOrders.find(o => o.sourceLocation.toString() === centerA._id.toString());
        const subAssemblyOrder = internalOrders.find(o => o.sourceLocation.toString() === kitchenB._id.toString());

        if (!selfOrder || selfOrder.destinationLocation.toString() !== centerA._id.toString()) {
            throw new Error('Self-directed parent order is missing or incorrect!');
        }
        if (!subAssemblyOrder || subAssemblyOrder.destinationLocation.toString() !== centerA._id.toString()) {
            throw new Error('Sub-assembly order from Kitchen B to Center A is missing or incorrect!');
        }

        console.log('Internal Order creations: PASSED');

        // 7. Check PO visibility: Center A (receiving location) queries type=receive
        const getOrdersReq = {
            user: centerA,
            query: { type: 'receive', locationId: centerA._id.toString() }
        };
        let receiveOrdersList = [];
        const getOrdersRes = {
            status: (code) => ({
                json: (data) => { receiveOrdersList = data.data; }
            })
        };
        await productionController.getInternalOrders(getOrdersReq, getOrdersRes, (err) => { if (err) throw err; });

        console.log(`Visible receive PO count at Center A (both pending): ${receiveOrdersList.length}`);
        if (receiveOrdersList.length !== 0) {
            throw new Error(`Expected 0 visible POs when all are PENDING, but got ${receiveOrdersList.length}`);
        }
        console.log('PO Visibility (pending filtered): PASSED');

        // 8. Dispatch sub-assembly order at Kitchen B
        console.log('Dispatching sub-assembly order at Kitchen B...');
        await productionService.dispatchOrder(
            subAssemblyOrder._id,
            [{ itemId: subAssemblyOrder.items[0]._id.toString(), dispatchQty: 5 }],
            kitchenB._id,
            entity._id
        );

        // Check Kitchen B's RM Milk inventory (should deduct 5 * 2 = 10 liters, remaining = 90)
        const milkInv = await Inventory.findOne({ materialId: rmMilk._id, locationId: kitchenB._id }).lean();
        console.log(`Kitchen B milk inventory: ${milkInv.currentStock}`);
        if (milkInv.currentStock !== 90) {
            throw new Error(`Expected 90 liters milk stock, got ${milkInv.currentStock}`);
        }
        console.log('Stock Deduction on Dispatch: PASSED');

        // 9. Check PO visibility again: sub-assembly order should now be visible
        await productionController.getInternalOrders(getOrdersReq, getOrdersRes, (err) => { if (err) throw err; });
        console.log(`Visible receive PO count at Center A (after 1 dispatch): ${receiveOrdersList.length}`);
        if (receiveOrdersList.length !== 1 || receiveOrdersList[0]._id.toString() !== subAssemblyOrder._id.toString()) {
            throw new Error('Dispatched sub-assembly PO is not visible!');
        }
        console.log('PO Visibility (after dispatch): PASSED');

        // 10. Receive sub-assembly order at Center A
        console.log('Receiving sub-assembly order at Center A...');
        await productionService.receiveOrder(
            subAssemblyOrder._id,
            [{ itemId: subAssemblyOrder.items[0]._id.toString(), receiveQty: 5 }],
            centerA._id,
            entity._id
        );

        // Verify Center A does NOT have Ingredient I in persistent inventory (BOM item untracked)
        const ingredientIInv = await Inventory.findOne({ materialId: menuIngredientI._id, locationId: centerA._id }).lean();
        console.log(`Center A Ingredient I stock: ${ingredientIInv?.currentStock}`);
        if (ingredientIInv && ingredientIInv.currentStock !== 0) {
            throw new Error(`Expected no persistent stock for Ingredient I (BOM), but got ${ingredientIInv.currentStock}`);
        }
        console.log('Inventory Increment on Receive: PASSED (BOM items skipped correctly)');

        // 11. Dispatch self-prepared order (Dish P) at Center A
        console.log('Dispatching self-prepared order (Dish P) at Center A...');
        await productionService.dispatchOrder(
            selfOrder._id,
            [{ itemId: selfOrder.items[0]._id.toString(), dispatchQty: 5 }],
            centerA._id,
            entity._id
        );

        // This should deduct:
        // - 5 * 3 = 15 units of RM Sugar from Center A (remaining: 100 - 15 = 85)
        // - 0 units of Ingredient I from Center A inventory (since it is a BOM sub-assembly, skipped)
        const sugarInv = await Inventory.findOne({ materialId: rmSugar._id, locationId: centerA._id }).lean();
        const updatedIngredientIInv = await Inventory.findOne({ materialId: menuIngredientI._id, locationId: centerA._id }).lean();

        console.log(`Center A Sugar stock: ${sugarInv.currentStock}, Ingredient I stock: ${updatedIngredientIInv?.currentStock}`);
        if (sugarInv.currentStock !== 85) {
            throw new Error(`Expected RM Sugar to be 85, got ${sugarInv.currentStock}`);
        }
        if (updatedIngredientIInv && updatedIngredientIInv.currentStock > 0) {
            throw new Error(`Expected Ingredient I stock to remain untracked/0, got ${updatedIngredientIInv.currentStock}`);
        }
        console.log('Self-prepared Dispatch Stock Deductions: PASSED (BOM ingredients skipped correctly)');

        // Receive self-prepared order
        console.log('Receiving self-prepared order at Center A...');
        await productionService.receiveOrder(
            selfOrder._id,
            [{ itemId: selfOrder.items[0]._id.toString(), receiveQty: 5 }],
            centerA._id,
            entity._id
        );

        // Verify Center A does NOT have Dish P in persistent inventory (BOM item untracked)
        const dishPInv = await Inventory.findOne({ materialId: menuDishP._id, locationId: centerA._id }).lean();
        console.log(`Center A Dish P stock: ${dishPInv?.currentStock}`);
        if (dishPInv && dishPInv.currentStock !== 0) {
            throw new Error(`Expected no persistent stock for Dish P (BOM), but got ${dishPInv.currentStock}`);
        }
        console.log('Self-prepared Receive: PASSED (BOM items skipped correctly)');

        // 12. Test Manual PR Approval flow (Issue 3: destinationLocation omission)
        console.log('Creating manual Purchase Request...');
        const pr = await PurchaseRequest.create({
            items: [{ item: rmMilk._id, itemName: 'RM Milk', requestedQty: 10, unit: 'liter' }],
            requestedBy: centerA._id,
            destinationLocation: centerA._id,
            entity: entity._id
        });

        const approveReq = {
            params: { id: pr._id },
            body: { vendor: vendor._id, items: pr.items.map(i => ({ item: i.item, itemName: i.itemName, requestedQty: 10, approvedQty: 10, unitPrice: 15, unit: i.unit })) },
            user: { role: 'ADMIN', entity: entity._id }
        };

        let generatedBill = null;
        const approveRes = {
            status: (code) => ({
                json: (data) => {
                    console.log('Approve response status code:', code, 'data:', data);
                    generatedBill = data.data?.bill;
                }
            })
        };

        await purchaseController.approvePurchaseRequest(approveReq, approveRes);
        console.log('Approved PR. Bill generated:', generatedBill?.billCode, 'DestinationLocation:', generatedBill?.destinationLocation);

        if (!generatedBill || generatedBill.destinationLocation?.toString() !== centerA._id.toString()) {
            throw new Error('Generated Bill is missing destinationLocation!');
        }
        console.log('Manual PR Bill destinationLocation Mapping: PASSED');

        // Deliver Bill and check receiving location inventory updates
        const updateBillReq = {
            params: { id: generatedBill._id },
            body: {
                deliveryStatus: 'DELIVERED',
                items: generatedBill.items.map(i => ({ ...i, receivedQty: 10 })),
                totalAmount: 150
            },
            user: { role: 'ADMIN', entity: entity._id }
        };
        const updateBillRes = {
            status: (code) => ({
                json: (data) => console.log('Bill updated status:', code, data.data.deliveryStatus)
            })
        };
        await purchaseController.updateBill(updateBillReq, updateBillRes);

        // Verify Center A Milk inventory has increased by 10 liters
        const centerMilkInv = await Inventory.findOne({ materialId: rmMilk._id, locationId: centerA._id }).lean();
        console.log(`Center A Milk Inventory: ${centerMilkInv?.currentStock}`);
        if (!centerMilkInv || centerMilkInv.currentStock !== 10) {
            throw new Error(`Expected 10 liters of milk at Center A, got ${centerMilkInv?.currentStock}`);
        }
        console.log('Manual Bill Delivery Inventory Update: PASSED');

        // Cleanup
        await Entity.findByIdAndDelete(entity._id);
        await User.deleteMany({ _id: { $in: [centerA._id, kitchenB._id] } });
        await RawMaterial.deleteMany({ _id: { $in: [rmMilk._id, rmSugar._id] } });
        await Bom.deleteMany({ _id: { $in: [bomIngredientI._id, bomDishP._id] } });
        await Menu.deleteMany({ _id: { $in: [menuIngredientI._id, menuDishP._id] } });
        await Vendor.findByIdAndDelete(vendor._id);
        await Inventory.deleteMany({ entity: entity._id });
        await StockRequest.deleteMany({ entity: entity._id });
        await InternalOrder.deleteMany({ entity: entity._id });
        await PurchaseRequest.deleteMany({ entity: entity._id });
        await Bill.deleteMany({ entity: entity._id });

        console.log('All tests PASSED successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Test FAILED:', err);
        process.exit(1);
    }
}

runTest();
