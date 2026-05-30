const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const RawMaterial = require('./modules/rawmaterials/models/rawMaterialModel');
const Bom = require('./modules/boms/models/bomModel');
const FoodRequest = require('./modules/stockrequests/models/stockRequestModel');
const Inventory = require('./modules/inventory/models/inventoryModel');
const Menu = require('./modules/menus/models/menuModel');
const MenuRate = require('./modules/menus/models/menuRateModel');
const DailyRevenue = require('./modules/revenue/models/dailyRevenueModel');
const User = require('./modules/users/models/model');

// Additional models
const InternalOrder = require('./modules/production/models/internalOrderModel');
const Wastage = require('./modules/wastage/models/wastageModel');
const Vendor = require('./modules/vendors/models/vendorModel');
const Payment = require('./modules/payments/models/paymentModel');
const Finance = require('./modules/finance/models/financeModel');
const ExpenseCategory = require('./modules/expenses/models/expenseCategoryModel');
const Event = require('./modules/events/models/eventModel');
const Bank = require('./modules/banks/models/bankModel');
const Employee = require('./modules/employees/models/employeeModel');

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

    if (target === 'all' || target === 'revenue') {
      await DailyRevenue.deleteMany({});
      console.log('Cleared Daily Revenue records');
    }

    if (target === 'all' || target === 'users') {
      const result = await User.deleteMany({ role: { $ne: 'SUPER_ADMIN' } });
      console.log(`Cleared ${result.deletedCount} user logins (SUPER_ADMIN preserved).`);
    }

    if (target === 'all' || target === 'production') {
      await InternalOrder.deleteMany({});
      console.log('Cleared Internal Orders');
    }

    if (target === 'all' || target === 'wastage') {
      await Wastage.deleteMany({});
      console.log('Cleared Wastage records');
    }

    if (target === 'all' || target === 'vendors') {
      await Vendor.deleteMany({});
      console.log('Cleared Vendors');
    }

    if (target === 'all' || target === 'finance') {
      await Payment.deleteMany({});
      console.log('Cleared Payments');
      await Finance.deleteMany({});
      console.log('Cleared Finance transactions');
      await ExpenseCategory.deleteMany({});
      console.log('Cleared Expense Categories');
      await Event.deleteMany({});
      console.log('Cleared Events');
      await Bank.deleteMany({});
      console.log('Cleared Banks');
      await Employee.deleteMany({});
      console.log('Cleared Employees');
    }

    if (target === 'all') {
      try {
        await mongoose.connection.db.collection('counters').deleteMany({});
        console.log('Cleared Counter sequence numbers');
      } catch (e) {
        // collection might not exist yet
      }
    }

    if (target === 'revenue-reopen') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const result = await DailyRevenue.updateMany(
        { date: { $gte: todayStart, $lte: todayEnd } },
        { 
          $set: { 
            status: 'OPEN', 
            b2bConfirmed: false, 
            b2cConfirmed: false, 
            onlineConfirmed: false 
          } 
        }
      );
      console.log(`Reopened ${result.modifiedCount} daily revenue records for today.`);
    }

    if (target === 'all') {
      console.log('\nData Reset Complete! Your SUPER_ADMIN login and Entity details are untouched.');
    } else {
      console.log('\nReset Complete for target: ' + target.toUpperCase());
    }
    process.exit(0);

  } catch (err) {
    console.error('Error during reset:', err);
    process.exit(1);
  }
}

run();
