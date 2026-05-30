const mongoose = require('mongoose');
const User = require('../modules/users/models/model');
const DailyRevenue = require('../modules/revenue/models/dailyRevenueModel');
const Bank = require('../modules/banks/models/bankModel');
const Entity = require('../modules/entities/models/Entity');
const Menu = require('../modules/menus/models/menuModel');
const Bom = require('../modules/boms/models/bomModel');
const Inventory = require('../modules/inventory/models/inventoryModel');
const revenueService = require('../modules/revenue/services/revenueService');
require('dotenv').config();

async function testFinanceFlow() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        // Preemptive cleanup
        await Entity.deleteMany({ username: 'finance_test_corp' });
        await User.deleteMany({ email: 'cafe_center_test@forge.com' });
        await Bank.deleteMany({ accountNumber: 'SANDBOX-101-202' });

        // 1. Create a test Entity
        const testEntity = await Entity.create({
            name: 'Finance Test Corp',
            location: 'Main Office',
            username: 'finance_test_corp'
        });
        console.log('Created test Entity:', testEntity._id);

        // 2. Create a test Location User
        const testLocation = await User.create({
            name: 'B2C Cafe Center',
            email: 'cafe_center_test@forge.com',
            password: 'password123',
            role: 'CENTERS',
            entity: testEntity._id,
            licenseNumber: 'TEST-LIC-111',
            onlineSalesEnabled: true,
            aggregatorPercentage: 15
        });
        console.log('Created test Location User:', testLocation._id);

        // 3. Create a test Bank Account
        const testBank = await Bank.create({
            bankName: 'Test Sandbox Bank',
            accountNumber: 'SANDBOX-101-202',
            ifscCode: 'SBOX0000101',
            branch: 'Fintech Hub',
            entity: testEntity._id,
            locations: [testLocation._id]
        });
        console.log('Created test Bank account:', testBank._id);

        // 4. Create and Confirm B2C Daily Revenue
        const targetDateStr = '2026-05-28';
        
        // Let's initialize the record (simulates COO approving request)
        const initializedRecord = await revenueService.initializeDailyRevenue(testLocation._id, targetDateStr, testEntity._id);
        console.log('Initialized Daily Revenue Record (OPEN):', initializedRecord.status);

        // Verify it is visible in getFinanceDashboardStats in OPEN status
        const openStats = await revenueService.getFinanceDashboardStats(testEntity._id);
        console.log('Open Stats Rollup (before closing):', {
            totalReported: openStats.totalReported,
            pendingCount: openStats.pendingReconciliations.length
        });
        if (openStats.pendingReconciliations.length !== 1 || openStats.pendingReconciliations[0].reportedTotal !== 0) {
            throw new Error('Expected 1 pending open reconciliation with 0 reported total');
        }

        // Seed Direct item, BOM Menu, and BOM Recipe
        const testDirectMenu = await Menu.create({
            name: 'Test Direct Item',
            unit: 'pcs',
            category: 'DIRECT',
            entity: testEntity._id
        });

        const testBomMenu = await Menu.create({
            name: 'Test BOM Menu Item',
            unit: 'pcs',
            category: 'BOM',
            entity: testEntity._id
        });

        const testBom = await Bom.create({
            dishName: 'Test BOM Recipe',
            unit: 'pcs',
            menuItem: testBomMenu._id,
            entity: testEntity._id
        });

        // Initialize inventory stock
        const directInv = await Inventory.create({
            materialId: testDirectMenu._id,
            locationId: testLocation._id,
            entity: testEntity._id,
            currentStock: 100
        });

        const bomInv = await Inventory.create({
            materialId: testBomMenu._id, // stock aligned to Menu ID
            locationId: testLocation._id,
            entity: testEntity._id,
            currentStock: 100
        });

        // Confirm B2C Sales
        const salesData = {
            b2cSales: [
                { menuItem: testDirectMenu._id, itemName: 'Test Direct Item', itemType: 'DIRECT', soldQty: 30, unitPrice: 100, totalVal: 3000 },
                { bomId: testBom._id, itemName: 'Test BOM Recipe', itemType: 'BOM', soldQty: 40, unitPrice: 50, totalVal: 2000 }
            ],
            reportedCash: 3000,
            reportedOnline: 1800
        };

        const confirmedRecord = await revenueService.confirmRevenueTab(
            testLocation._id,
            targetDateStr,
            'b2c',
            salesData,
            testEntity._id
        );

        console.log('Confirmed B2C Tab:', {
            b2cConfirmed: confirmedRecord.b2cConfirmed,
            reportedCash: confirmedRecord.reportedCash,
            reportedOnline: confirmedRecord.reportedOnline,
            reportedDifference: confirmedRecord.reportedDifference
        });

        if (confirmedRecord.reportedDifference !== 200) {
            throw new Error(`Reported difference mismatch! Expected 200, got ${confirmedRecord.reportedDifference}`);
        }

        // Confirm Online Sales (since onlineSalesEnabled is true)
        const onlineConfirmed = await revenueService.confirmRevenueTab(
            testLocation._id,
            targetDateStr,
            'online',
            { totalSaleValue: 1000, aggregatorPercentage: 15 },
            testEntity._id
        );
        console.log('Confirmed Online Tab:', onlineConfirmed.onlineSales);

        // Close daily revenue
        await revenueService.closeDailyRevenue(testLocation._id, targetDateStr, testEntity._id, testLocation);
        console.log('Daily Revenue Closed & Locked.');

        // Verify inventory reductions
        const updatedDirectInv = await Inventory.findById(directInv._id).lean();
        const updatedBomInv = await Inventory.findById(bomInv._id).lean();
        console.log('Updated Stock Levels:', {
            directItem: updatedDirectInv.currentStock,
            bomItem: updatedBomInv.currentStock
        });
        if (updatedDirectInv.currentStock !== 70) {
            throw new Error(`Expected direct item stock to be 70, got ${updatedDirectInv.currentStock}`);
        }
        if (updatedBomInv.currentStock !== 100) {
            throw new Error(`Expected BOM item stock to remain 100 (untracked in inventory), got ${updatedBomInv.currentStock}`);
        }
        console.log('B2C Inventory Reductions: PASSED');

        // 5. Finance Reconciliation & Verification
        const verificationInputs = {
            cashDeposited: 2950, // 50 mismatch
            onlinePayments: 1800, // 0 mismatch
            onlineSalesReceivedAmount: 1000, // 0 mismatch
            onlineSalesCommission: 150,
            remarks: 'Cash counter short by 50',
            isAcknowledged: true
        };

        const verifiedRecord = await revenueService.saveFinanceVerification(
            testLocation._id,
            targetDateStr,
            verificationInputs
        );

        console.log('Verified & Acknowledged by Finance:', {
            isAcknowledged: verifiedRecord.verification.isAcknowledged,
            difference: verifiedRecord.verification.difference,
            remarks: verifiedRecord.verification.remarks
        });

        // ReportedTotal = reportedCash(3000) + reportedOnline(1800) + aggregator(1000) = 5800
        // VerifiedTotal = cashDeposited(2950) + onlinePayments(1800) + aggregator(1000) = 5750
        // Expected difference = 5800 - 5750 = 50
        if (verifiedRecord.verification.difference !== 50) {
            throw new Error(`Reconciliation difference mismatch! Expected 50, got ${verifiedRecord.verification.difference}`);
        }

        // 6. Test rollups
        const stats = await revenueService.getFinanceDashboardStats(testEntity._id);
        console.log('Consolidated Stats Rollup:', {
            totalReported: stats.totalReported,
            totalVerified: stats.totalVerified,
            totalDifference: stats.totalDifference,
            pendingCount: stats.pendingReconciliations.length
        });

        if (stats.totalReported !== 5800 || stats.totalVerified !== 5750 || stats.totalDifference !== 50) {
            throw new Error('Stats rollup mismatch!');
        }

        // --- Phase 2: Test location with onlineSalesEnabled = false ---
        console.log('\n--- Phase 2: Testing with onlineSalesEnabled = false ---');
        await User.findByIdAndUpdate(testLocation._id, { onlineSalesEnabled: false });

        const datePhase2Str = '2026-05-29';
        const initializedRecord2 = await revenueService.initializeDailyRevenue(testLocation._id, datePhase2Str, testEntity._id);
        console.log('Initialized Phase 2 Daily Revenue Record (OPEN):', initializedRecord2.status);

        // Confirm B2C sales
        const salesData2 = {
            b2cSales: [
                { menuItem: testDirectMenu._id, itemName: 'Test Direct Item', itemType: 'DIRECT', soldQty: 10, unitPrice: 100, totalVal: 1000 }
            ],
            reportedCash: 1000,
            reportedOnline: 800
        };

        await revenueService.confirmRevenueTab(
            testLocation._id,
            datePhase2Str,
            'b2c',
            salesData2,
            testEntity._id
        );
        console.log('Confirmed Phase 2 B2C Tab');

        // Close daily revenue
        await revenueService.closeDailyRevenue(testLocation._id, datePhase2Str, testEntity._id, testLocation);
        console.log('Closed Phase 2 Daily Revenue');

        // Save Finance Verification (even if we pass onlineSalesReceivedAmount, it should be ignored/set to 0 since onlineSalesEnabled is false)
        const verificationInputs2 = {
            cashDeposited: 950,
            onlinePayments: 800,
            onlineSalesReceivedAmount: 500, // Should be ignored
            onlineSalesCommission: 50,      // Should be ignored
            remarks: 'Aggregator values should be ignored',
            isAcknowledged: true
        };

        const verifiedRecord2 = await revenueService.saveFinanceVerification(
            testLocation._id,
            datePhase2Str,
            verificationInputs2
        );

        console.log('Phase 2 Verified & Acknowledged:', {
            difference: verifiedRecord2.verification.difference,
            onlineSalesReceivedAmount: verifiedRecord2.verification.onlineSalesReceivedAmount,
            onlineSalesCommission: verifiedRecord2.verification.onlineSalesCommission
        });

        // Expected reportedTotal = cash(1000) + online(800) = 1800 (aggregator ignored)
        // Expected verifiedTotal = cashDeposited(950) + onlinePayments(800) = 1750 (aggregator ignored)
        // Expected difference = 1800 - 1750 = 50
        if (verifiedRecord2.verification.difference !== 50) {
            throw new Error(`Phase 2 difference mismatch! Expected 50, got ${verifiedRecord2.verification.difference}`);
        }
        if (verifiedRecord2.verification.onlineSalesReceivedAmount !== 0) {
            throw new Error(`Expected onlineSalesReceivedAmount to be ignored/0, but got ${verifiedRecord2.verification.onlineSalesReceivedAmount}`);
        }
        if (verifiedRecord2.verification.onlineSalesCommission !== 0) {
            throw new Error(`Expected onlineSalesCommission to be ignored/0, but got ${verifiedRecord2.verification.onlineSalesCommission}`);
        }
        console.log('Phase 2 Test PASSED successfully!');

        // 7. Cleanup test data
        console.log('Cleaning up sandbox test data...');
        await Entity.findByIdAndDelete(testEntity._id);
        await User.findByIdAndDelete(testLocation._id);
        await Bank.findByIdAndDelete(testBank._id);
        await Menu.deleteMany({ entity: testEntity._id });
        await Bom.deleteMany({ entity: testEntity._id });
        await Inventory.deleteMany({ entity: testEntity._id });
        await DailyRevenue.deleteMany({ locationId: testLocation._id });
        console.log('Cleanup complete. Test PASSED successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Test FAILED:', err);
        process.exit(1);
    }
}

testFinanceFlow();
