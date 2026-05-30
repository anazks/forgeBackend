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
const DailyRevenue = require(path.join(backendDir, 'modules/revenue/models/dailyRevenueModel'));
const Expense = require(path.join(backendDir, 'modules/expenses/models/expenseModel'));

async function runTest() {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Database connected successfully!');

    let testEntity = null;
    let testLocation = null;
    let testExpense = null;
    let testDailyRevenue = null;

    try {
        // 1. Create a mock Entity
        testEntity = await Entity.create({
            name: 'Test Expense Entity',
            location: 'Test Location',
            username: 'testexp_' + Date.now(),
            licenseExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) // 30 days
        });
        console.log('Created test entity:', testEntity._id);

        // 2. Create a mock User/Location with role CENTERS
        testLocation = await User.create({
            name: 'Test Center Location',
            email: 'testcenter_' + Date.now() + '@example.com',
            password: 'password123',
            role: 'CENTERS',
            entity: testEntity._id,
            licenseExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
            onlineSalesEnabled: false
        });
        console.log('Created test center location:', testLocation._id);

        const testDate = '2026-05-29';
        const startOfDay = new Date(testDate);
        startOfDay.setHours(0,0,0,0);

        // 3. Create a daily revenue log closed with some sales
        testDailyRevenue = await DailyRevenue.create({
            locationId: testLocation._id,
            date: startOfDay,
            status: 'CLOSED',
            b2cConfirmed: true,
            reportedCash: 1000,
            reportedOnline: 0,
            b2cSales: [],
            entity: testEntity._id
        });
        console.log('Created closed daily revenue record with reportedCash = 1000');

        // 4. Create an expense under PENDING_COO status
        testExpense = await Expense.create({
            locationId: testLocation._id,
            date: startOfDay,
            description: 'Test petrol expenses',
            category: 'Petrol Expenses',
            amount: 250,
            paymentMethod: 'Cash',
            status: 'PENDING_COO',
            entity: testEntity._id
        });
        console.log('Created test expense (250 INR) in PENDING_COO status');

        // 5. Verify location details & approved expense sum is 0
        console.log('\n--- Test 1: Verify getFinanceLocationDetails with PENDING_COO ---');
        let details = await revenueService.getFinanceLocationDetails(testLocation._id, testEntity._id);
        console.log('Fetched expenses count:', details.expenses.length);
        console.log('Stitched approvedExpensesAmount:', details.records[0].approvedExpensesAmount);

        if (details.expenses.length !== 1) throw new Error('Expected 1 expense');
        if (details.records[0].approvedExpensesAmount !== 0) throw new Error('Expected approvedExpensesAmount to be 0 for pending expense');

        // 6. Update expense status to PENDING_FINANCE
        testExpense.status = 'PENDING_FINANCE';
        await testExpense.save();
        console.log('\nUpdated test expense status to PENDING_FINANCE');

        // 7. Verify approved expense sum remains 0
        console.log('\n--- Test 2: Verify getFinanceLocationDetails with PENDING_FINANCE ---');
        details = await revenueService.getFinanceLocationDetails(testLocation._id, testEntity._id);
        console.log('Stitched approvedExpensesAmount:', details.records[0].approvedExpensesAmount);
        if (details.records[0].approvedExpensesAmount !== 0) throw new Error('Expected approvedExpensesAmount to be 0 for PENDING_FINANCE');

        // 8. Update expense status to APPROVED
        testExpense.status = 'APPROVED';
        await testExpense.save();
        console.log('\nUpdated test expense status to APPROVED');

        // 9. Verify approved expense sum is now 250
        console.log('\n--- Test 3: Verify getFinanceLocationDetails with APPROVED ---');
        details = await revenueService.getFinanceLocationDetails(testLocation._id, testEntity._id);
        console.log('Stitched approvedExpensesAmount:', details.records[0].approvedExpensesAmount);
        if (details.records[0].approvedExpensesAmount !== 250) throw new Error('Expected approvedExpensesAmount to be 250');

        // 10. Verify getFinanceDashboardStats (reconciliation calculation)
        console.log('\n--- Test 4: Verify getFinanceDashboardStats includes approved expenses ---');
        // Let's create local verification record to mimic finance save
        testDailyRevenue.verification = {
            cashDeposited: 750, // 1000 sales - 250 expense = 750 deposited
            onlinePayments: 0,
            isAcknowledged: false
        };
        await testDailyRevenue.save();

        let stats = await revenueService.getFinanceDashboardStats(testEntity._id);
        console.log('Dashboard stats reported:', stats.totalReported);
        console.log('Dashboard stats verified:', stats.totalVerified);
        console.log('Dashboard stats difference:', stats.totalDifference);

        if (stats.totalReported !== 1000) throw new Error('Expected totalReported to be 1000');
        // verifiedTotal = cashDeposited (750) + onlinePayments (0) + approvedExpenses (250) = 1000
        if (stats.totalVerified !== 1000) throw new Error('Expected totalVerified to be 1000');
        if (stats.totalDifference !== 0) throw new Error('Expected totalDifference to be 0');
        console.log('Dashboard stats calculation matches verification total!');

        // 11. Verify saveFinanceVerification calculates difference correctly
        console.log('\n--- Test 5: Verify saveFinanceVerification ---');
        let verifiedRecord = await revenueService.saveFinanceVerification(
            testLocation._id,
            testDate,
            {
                cashDeposited: 700, // Deposit 700, so we expect a mismatch of 50
                onlinePayments: 0,
                remarks: 'Mismatch of 50',
                isAcknowledged: false
            }
        );
        console.log('Saved Verification difference:', verifiedRecord.verification.difference);
        // reportedTotal (1000) - verifiedTotal (700 cash + 250 expense = 950) = 50 difference
        if (verifiedRecord.verification.difference !== 50) {
            throw new Error(`Expected verification difference to be 50, but got ${verifiedRecord.verification.difference}`);
        }
        console.log('Verification difference calculation verified!');

        console.log('\n--- ALL EXPENSE FLOW INTEGRATION TESTS PASSED! ---');

    } catch (err) {
        console.error('Test failed with error:', err);
    } finally {
        console.log('\nCleaning up database records...');
        if (testExpense) await Expense.deleteOne({ _id: testExpense._id });
        if (testDailyRevenue) await DailyRevenue.deleteOne({ _id: testDailyRevenue._id });
        if (testLocation) await User.deleteOne({ _id: testLocation._id });
        if (testEntity) await Entity.deleteOne({ _id: testEntity._id });
        console.log('Cleanup completed.');

        await mongoose.connection.close();
        console.log('Database connection closed.');
        process.exit(0);
    }
}

runTest();
