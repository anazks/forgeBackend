const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../modules/users/models/model');
const DailyRevenue = require('../modules/revenue/models/dailyRevenueModel');
const Bill = require('../modules/purchases/models/billModel');
const Vendor = require('../modules/vendors/models/vendorModel');
const Expense = require('../modules/expenses/models/expenseModel');
const revenueService = require('../modules/revenue/services/revenueService');
const purchaseController = require('../modules/purchases/controllers/purchaseController');

const runTest = async () => {
    console.log('--- STARTING CONSOLIDATED FLOW INTEGRATION TEST ---');
    
    // Connect to database
    await connectDB();

    // 1. Setup Mock Data
    console.log('1. Setting up mock data...');
    let entityId = new mongoose.Types.ObjectId();
    
    // Create Mock Vendor
    let vendor = await Vendor.create({
        vendorCode: 'VND001',
        vendorName: 'Test Vendor',
        contactPerson: 'John Doe',
        contactNumber: '9876543210',
        entity: entityId
    });
    console.log(`Created mock vendor: ${vendor.vendorName}`);

    // Create Mock Aggregator User
    let aggregator = await User.create({
        name: 'Mock Aggregator',
        email: `aggregator_${Date.now()}@test.com`,
        password: 'password123',
        role: 'AGGREGATE',
        entity: entityId,
        aggregatorPercentage: 15,
        isActive: true
    });
    console.log(`Created mock aggregator user: ${aggregator.name} with 15% commission`);

    // Create Mock Store Manager User
    let storeManager = await User.create({
        name: 'Mock Store Manager',
        email: `store_${Date.now()}@test.com`,
        password: 'password123',
        role: 'STORE',
        entity: entityId,
        isActive: true
    });

    // Create Mock Finance User
    let financeUser = await User.create({
        name: 'Mock Finance',
        email: `finance_${Date.now()}@test.com`,
        password: 'password123',
        role: 'FINANCE',
        entity: entityId,
        isActive: true
    });

    const dateStr = new Date().toISOString().split('T')[0];
    console.log(`Test Date: ${dateStr}`);

    // 2. Simulate Aggregator entering sales data
    console.log('2. Confirming B2C tab for Aggregator...');
    const salesData = {
        b2cSales: [
            {
                itemName: 'Dish A',
                itemType: 'DIRECT',
                unit: 'pcs',
                stockQty: 100,
                soldQty: 10,
                unitPrice: 150
            },
            {
                itemName: 'Dish B',
                itemType: 'DIRECT',
                unit: 'pcs',
                stockQty: 50,
                soldQty: 5,
                unitPrice: 200
            }
        ]
    };

    // Confirm tab
    let record = await revenueService.confirmRevenueTab(aggregator._id, dateStr, 'b2c', salesData, entityId);
    
    // Check calculated fields
    console.log('Checking confirmed fields:');
    console.log(`aggregatorExpectedRevenue: ${record.aggregatorExpectedRevenue} (Expected: 2500)`);
    console.log(`aggregatorGstDeduction: ${record.aggregatorGstDeduction} (Expected: 119.05)`);
    console.log(`aggregatorCommission: ${record.aggregatorCommission} (Expected: 375)`);
    console.log(`aggregatorTotalReceivable: ${record.aggregatorTotalReceivable} (Expected: 2005.95)`);

    if (record.aggregatorExpectedRevenue !== 2500) {
        throw new Error('Mismatched aggregatorExpectedRevenue');
    }

    // 3. Create Daily Expense for Aggregator
    console.log('3. Logging daily expense for Aggregator...');
    let expense = await Expense.create({
        date: new Date(),
        description: 'Mock Aggregator Delivery Boy Fuel',
        category: 'Petrol Expenses',
        amount: 200,
        paymentMethod: 'Cash',
        status: 'PENDING_COO',
        locationId: aggregator._id,
        entity: entityId
    });
    
    // Confirm B2C sales again to pull in the new expense
    record = await revenueService.confirmRevenueTab(aggregator._id, dateStr, 'b2c', salesData, entityId);
    console.log(`aggregatorExpenses: ${record.aggregatorExpenses} (Expected: 200)`);
    console.log(`aggregatorTotalReceivable: ${record.aggregatorTotalReceivable} (Expected: 1805.95)`);

    if (record.aggregatorExpenses !== 200) {
        throw new Error('Mismatched aggregatorExpenses');
    }

    // 4. Close the Daily Revenue
    console.log('4. Closing the Daily Revenue for Aggregator...');
    record = await revenueService.closeDailyRevenue(aggregator._id, dateStr, entityId, aggregator);
    console.log(`Daily status: ${record.status}`);
    console.log(`cooApproved: ${record.cooApproved}`);
    console.log(`financeReconciled: ${record.financeReconciled}`);
    if (record.status !== 'CLOSED') {
        throw new Error('Day closure failed to status CLOSED');
    }

    // 4.5 Test: Try to log a new expense now that the day is closed (should fail)
    console.log('4.5 Testing expense creation block after Day Closure...');
    try {
        const expenseController = require('../modules/expenses/controllers/expenseController');
        let reqMock = {
            body: {
                date: dateStr,
                description: 'Late fuel charge',
                category: 'Petrol Expenses',
                amount: 50,
                paymentMethod: 'Cash',
                locationId: aggregator._id
            },
            user: aggregator
        };
        let resMock = {
            status: () => resMock,
            json: () => {}
        };
        await expenseController.createExpense(reqMock, resMock, (err) => {
            if (err) throw err;
        });
        throw new Error('Expense was successfully created even though the day is closed!');
    } catch (err) {
        console.log(`Successfully blocked logging expense after day close. Error: "${err.message}"`);
    }

    // 5. Query pending approvals for COO
    console.log('5. Querying pending Day Closures for COO...');
    let pendingCoo = await revenueService.getPendingCooCashClosures(entityId);
    console.log(`Pending COO closures count: ${pendingCoo.length}`);
    if (pendingCoo.length === 0) {
        throw new Error('No pending closures found for COO');
    }

    // 6. COO approves day closure and edits values
    console.log('6. COO editing and approving day closure...');
    const editedB2cSales = [
        {
            itemName: 'Dish A',
            itemType: 'DIRECT',
            unit: 'pcs',
            stockQty: 100,
            soldQty: 12, // Edited from 10 to 12
            unitPrice: 150
        },
        {
            itemName: 'Dish B',
            itemType: 'DIRECT',
            unit: 'pcs',
            stockQty: 50,
            soldQty: 5,
            unitPrice: 200
        }
    ];

    const approvedExpenses = [
        {
            expenseId: expense._id,
            approvedAmount: 180 // Edited from 200 to 180
        }
    ];

    record = await revenueService.approveDayClosure(aggregator._id, dateStr, approvedExpenses, null, editedB2cSales, null, { role: 'COO' });
    console.log('Re-checking fields after COO edits and approval:');
    console.log(`aggregatorExpectedRevenue: ${record.aggregatorExpectedRevenue} (Expected: 2800)`);
    console.log(`aggregatorGstDeduction: ${record.aggregatorGstDeduction.toFixed(2)} (Expected: 133.33)`);
    console.log(`aggregatorCommission: ${record.aggregatorCommission} (Expected: 420)`);
    console.log(`aggregatorExpenses: ${record.aggregatorExpenses} (Expected: 180)`);
    console.log(`aggregatorTotalReceivable: ${record.aggregatorTotalReceivable.toFixed(2)} (Expected: 2066.67)`);
    console.log(`cooApproved: ${record.cooApproved}`);

    if (record.aggregatorExpectedRevenue !== 2800) {
        throw new Error('Mismatched aggregatorExpectedRevenue after COO edit');
    }
    if (record.aggregatorExpenses !== 180) {
        throw new Error('Mismatched aggregatorExpenses after COO edit');
    }
    if (!record.cooApproved) {
        throw new Error('cooApproved flag is not true after COO approval');
    }

    // 7. Query pending Finance daily reconciliations
    console.log('7. Querying pending daily reconciliations for Finance...');
    let pendingFinance = await revenueService.getPendingFinanceCashClosures(entityId);
    console.log(`Pending Finance closures count: ${pendingFinance.length}`);
    if (pendingFinance.length === 0) {
        throw new Error('No pending closures found for Finance');
    }

    // 8. Finance reconciles Aggregator closure
    console.log('8. Finance reconciling the Daily Closure...');
    const verificationData = {
        aggregatorAmountReceived: 2060, // Mismatch of 6.67
        aggregatorGstVerified: 133.33,
        aggregatorCommissionVerified: 420,
        remarks: 'Small difference in payout bank transfer credit',
        isAcknowledged: true
      };
      
    record = await revenueService.saveFinanceVerification(aggregator._id, dateStr, verificationData);
    console.log('Checking reconciliation flags:');
    console.log(`financeReconciled: ${record.financeReconciled}`);
    console.log(`verification.difference: ${record.verification?.difference.toFixed(2)}`);
    console.log(`verification.isAcknowledged: ${record.verification?.isAcknowledged}`);

    if (!record.financeReconciled) {
        throw new Error('financeReconciled flag is not true after Finance Acknowledgment');
    }

    // 9. Vendor Bill updates
    console.log('9. Creating Vendor Bill for payment authorization test...');
    let bill = await Bill.create({
        vendor: vendor._id,
        items: [
            {
                itemName: 'Raw Onion',
                quantity: 100,
                unitPrice: 20,
                total: 2000
            }
        ],
        totalAmount: 2000,
        paidAmount: 0,
        paymentStatus: 'UNPAID',
        deliveryStatus: 'DELIVERED',
        destinationLocation: aggregator._id,
        entity: entityId
    });

    console.log(`Created mock bill: ${bill.billCode}`);

    // Try to update bill paymentStatus to PAID as store manager (should fail)
    console.log('Testing STORE role blocking for paymentStatus update...');
    try {
        let reqMock = {
            params: { id: bill._id },
            body: { paymentStatus: 'PAID' },
            user: storeManager
        };
        let resMock = {
            status: () => resMock,
            json: () => {}
        };
        await purchaseController.updateBill(reqMock, resMock, (err) => {
            if (err) throw err;
        });
        throw new Error('STORE role was NOT blocked from updating paymentStatus!');
    } catch (err) {
        console.log(`Successfully blocked STORE role. Error message: "${err.message}"`);
    }

    // Try to update bill paymentStatus to PAID as finance (should succeed)
    console.log('Testing FINANCE role approval for paymentStatus update...');
    let reqMockFinance = {
        params: { id: bill._id },
        body: { paymentStatus: 'PAID' },
        user: financeUser
    };
    let resMockFinance = {
        status: (code) => {
            console.log(`Finance update status code: ${code}`);
            return resMockFinance;
        },
        json: (payload) => {
            console.log('Finance update response payload:', payload.success);
        }
    };
    await purchaseController.updateBill(reqMockFinance, resMockFinance, (err) => {
        if (err) throw err;
    });

    let updatedBill = await Bill.findById(bill._id);
    console.log(`Updated payment status: ${updatedBill.paymentStatus}`);
    if (updatedBill.paymentStatus !== 'PAID') {
        throw new Error('Finance user failed to update paymentStatus to PAID');
    }

    // Clean up test data
    console.log('Cleaning up test data...');
    await Vendor.findByIdAndDelete(vendor._id);
    await User.findByIdAndDelete(aggregator._id);
    await User.findByIdAndDelete(storeManager._id);
    await User.findByIdAndDelete(financeUser._id);
    await DailyRevenue.findByIdAndDelete(record._id);
    await Expense.findByIdAndDelete(expense._id);
    await Bill.findByIdAndDelete(bill._id);

    console.log('--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
    process.exit(0);
};

runTest().catch(err => {
    console.error('--- TEST RUN ENCOUNTERED AN ERROR ---');
    console.error(err);
    process.exit(1);
});
