const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const RawMaterial = require('./modules/rawmaterials/models/rawMaterialModel');
const Bom = require('./modules/boms/models/bomModel');
const FoodRequest = require('./modules/foodrequests/models/foodRequestModel');
const Inventory = require('./modules/inventory/models/inventoryModel');
const Menu = require('./modules/menus/models/menuModel');
const MenuRate = require('./modules/menus/models/menuRateModel');

// Purchase models
let Purchase, PurchaseRequest, PurchaseBill;
try {
  Purchase = require('./modules/purchases/models/purchaseModel');
  PurchaseRequest = require('./modules/purchases/models/purchaseRequestModel');
  PurchaseBill = require('./modules/purchases/models/billModel');
} catch (e) {
  console.error("Error loading purchase models:", e.message);
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Get the target from command line arguments (e.g., "node reset_db.js requests")
    const args = process.argv.slice(2);
    const target = args[0] ? args[0].toLowerCase() : 'all';

    console.log(`Connected to DB. Starting reset for target: [${target.toUpperCase()}]...`);

    if (target === 'all' || target === 'materials') {
      await RawMaterial.deleteMany({});
      console.log('Cleared Raw Materials');
    }

    if (target === 'all' || target === 'boms') {
      await Bom.deleteMany({});
      console.log('Cleared BOMs');
    }

    if (target === 'all' || target === 'requests') {
      await FoodRequest.deleteMany({});
      console.log('Cleared Food Requests (Center My-Requests)');
    }

    if (target === 'all' || target === 'inventory') {
      await Inventory.deleteMany({});
      console.log('Cleared Inventory');
    }

    if (target === 'all' || target === 'menus') {
      await Menu.deleteMany({});
      console.log('Cleared Menu Items');
      await MenuRate.deleteMany({});
      console.log('Cleared Menu Rates');
    }

    if (target === 'all' || target === 'purchase') {
      if (Purchase) {
        await Purchase.deleteMany({});
        console.log('Cleared Purchases');
      }
      if (PurchaseRequest) {
        await PurchaseRequest.deleteMany({});
        console.log('Cleared Purchase Requests');
      }
      if (PurchaseBill) {
        await PurchaseBill.deleteMany({});
        console.log('Cleared Purchase Bills');
      }
    }

    console.log('\nData Reset Complete! Your Users and Logins are untouched.');
    process.exit(0);

  } catch (err) {
    console.error('Error during reset:', err);
    process.exit(1);
  }
}

run();
