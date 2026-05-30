const mongoose = require('mongoose');
const DailyRevenue = require('../models/dailyRevenueModel');
const InternalOrder = require('../../production/models/internalOrderModel');
const Inventory = require('../../inventory/models/inventoryModel');
const Menu = require('../../menus/models/menuModel');
const Bom = require('../../boms/models/bomModel');
const Purchase = require('../../purchases/models/purchaseModel');
const MenuRate = require('../../menus/models/menuRateModel');
const User = require('../../users/models/model');
const { AppError } = require('../../../middleware/errorHandler');

class RevenueService {
    /**
     * Get start and end of a specific date
     */
    getDateRange(dateStr) {
        const start = new Date(dateStr);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateStr);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    /**
     * Fetch daily revenue record or dynamically compute the draft data
     */
    async getDailyRevenue(locationId, dateStr, entityId) {
        const { start, end } = this.getDateRange(dateStr);

        let record = await DailyRevenue.findOne({
            locationId,
            date: { $gte: start, $lte: end }
        });

        const user = await User.findById(locationId).lean();
        if (!user) {
            throw new AppError('User/Location not found', 404);
        }

        const isKitchen = user.role === 'KITCHEN';
        const isRestaurant = user.role === 'RESTAURANT';
        const isCenterOrAggregate = user.role === 'CENTERS' || user.role === 'AGGREGATE';
        const hasOnline = user.onlineSalesEnabled;

        const needsB2B = isKitchen || isRestaurant;
        const needsB2C = isCenterOrAggregate || isRestaurant;

        if (!record) {
            // Return empty draft
            record = new DailyRevenue({
                locationId,
                date: start,
                status: 'OPEN',
                b2bConfirmed: false,
                b2cConfirmed: false,
                onlineConfirmed: false,
                b2bSales: [],
                b2cSales: [],
                onlineSales: {
                    totalSaleValue: 0,
                    aggregatorPercentage: user.aggregatorPercentage || 0
                },
                entity: entityId
            });
        }

        // Dynamically populate open tabs
        if (record.status === 'OPEN') {
            // 1. Populate B2B if needed and not confirmed
            if (needsB2B && !record.b2bConfirmed) {
                const orders = await InternalOrder.find({
                    sourceLocation: locationId,
                    entity: entityId,
                    dispatchedAt: { $gte: start, $lte: end },
                    status: { $in: ['DISPATCHED', 'PARTIAL_RECEIPT', 'RECEIVED', 'PARTIAL_DISPATCH'] }
                }).lean();

                const b2bMap = {};
                for (const order of orders) {
                    for (const item of order.items) {
                        if (item.bomId && item.dispatchedQty > 0) {
                            const bomIdStr = item.bomId.toString();
                            if (!b2bMap[bomIdStr]) {
                                const bom = await Bom.findById(item.bomId).lean().select('dishName unit');
                                if (bom) {
                                    // Lookup local sale price in pricing console
                                    let rateDoc = await MenuRate.findOne({ bom: item.bomId, center: locationId }).lean();
                                    if (!rateDoc) {
                                        rateDoc = await MenuRate.findOne({ bom: item.bomId, center: null }).lean();
                                    }
                                    const price = rateDoc ? (rateDoc.centerRate || rateDoc.rate || 0) : 0;
                                    b2bMap[bomIdStr] = {
                                        bomId: item.bomId,
                                        itemName: bom.dishName,
                                        itemType: 'BOM',
                                        quantity: 0,
                                        unitPrice: price
                                    };
                                }
                            }
                            if (b2bMap[bomIdStr]) {
                                b2bMap[bomIdStr].quantity += item.dispatchedQty;
                            }
                        }
                    }
                }
                record.b2bSales = Object.values(b2bMap).map(item => ({
                    ...item,
                    totalVal: item.quantity * item.unitPrice
                }));
            }

            // 2. Populate B2C if needed and not confirmed
            if (needsB2C && !record.b2cConfirmed) {
                const b2cList = [];

                // BOM Dishes delivered today
                const receivedOrders = await InternalOrder.find({
                    destinationLocation: locationId,
                    entity: entityId,
                    receivedAt: { $gte: start, $lte: end },
                    status: { $in: ['RECEIVED', 'PARTIAL_RECEIPT'] }
                }).lean();

                const bomMap = {};
                for (const order of receivedOrders) {
                    for (const item of order.items) {
                        if (item.bomId && item.receivedQty > 0) {
                            const bomIdStr = item.bomId.toString();
                            if (!bomMap[bomIdStr]) {
                                const bom = await Bom.findById(item.bomId).lean().select('dishName unit isSoldB2C');
                                if (bom && bom.isSoldB2C !== false) {
                                    let rateDoc = await MenuRate.findOne({ bom: item.bomId, center: locationId }).lean();
                                    if (!rateDoc) {
                                        rateDoc = await MenuRate.findOne({ bom: item.bomId, center: null }).lean();
                                    }
                                    const price = rateDoc ? (rateDoc.centerRate || rateDoc.rate || 0) : 0;
                                    bomMap[bomIdStr] = {
                                        bomId: item.bomId,
                                        itemName: bom.dishName,
                                        itemType: 'BOM',
                                        unit: bom.unit || 'pcs',
                                        stockQty: 0,
                                        soldQty: 0,
                                        unitPrice: price
                                    };
                                }
                            }
                            if (bomMap[bomIdStr]) {
                                bomMap[bomIdStr].stockQty += item.receivedQty;
                            }
                        }
                    }
                }
                b2cList.push(...Object.values(bomMap));

                // Direct Items (only direct menu items where stock > 0)
                const directMenus = await Menu.find({ entity: entityId }).lean();
                for (const menu of directMenus) {
                    const inv = await Inventory.findOne({ materialId: menu._id, locationId }).lean();
                    if (inv && inv.currentStock > 0) {
                        const latestPurchase = await Purchase.findOne({ item: menu._id, entity: entityId }).sort({ purchaseDate: -1 }).lean();
                        b2cList.push({
                            menuItem: menu._id,
                            itemName: menu.name,
                            itemType: 'DIRECT',
                            unit: menu.unit,
                            stockQty: inv.currentStock,
                            soldQty: 0,
                            unitPrice: latestPurchase ? latestPurchase.unitPrice : 0,
                            totalVal: 0
                        });
                    }
                }
                record.b2cSales = b2cList;
            }

            // 3. Online Sales
            if (hasOnline && !record.onlineConfirmed) {
                record.onlineSales.aggregatorPercentage = user.aggregatorPercentage || 0;
            }
        }

        return record;
    }

    /**
     * Confirm individual tab entries (b2b, b2c, online)
     */
    async confirmRevenueTab(locationId, dateStr, tabType, salesData, entityId) {
        const { start, end } = this.getDateRange(dateStr);

        let record = await DailyRevenue.findOne({
            locationId,
            date: { $gte: start, $lte: end }
        });

        if (record && record.status === 'CLOSED') {
            throw new AppError('Revenue records are closed and locked for this day', 400);
        }

        if (!record) {
            record = new DailyRevenue({
                locationId,
                date: start,
                status: 'OPEN',
                entity: entityId
            });
        }

        if (tabType === 'b2b') {
            // Verify all items have positive unitPrice
            const invalidItem = salesData.find(item => !item.unitPrice || Number(item.unitPrice) <= 0);
            if (invalidItem) {
                throw new AppError(`B2B item "${invalidItem.itemName}" is missing a unit price. Please configure or edit it before confirming.`, 400);
            }
            record.b2bSales = salesData.map(item => ({
                bomId: item.bomId,
                menuItem: item.menuItem,
                itemType: item.itemType || 'BOM',
                itemName: item.itemName,
                quantity: Number(item.quantity) || 0,
                unitPrice: Number(item.unitPrice) || 0,
                totalVal: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
                isManual: !!item.isManual
            }));
            record.b2bConfirmed = true;
        } else if (tabType === 'b2c') {
            let items = salesData;
            if (!Array.isArray(salesData) && salesData.b2cSales) {
                items = salesData.b2cSales;
                record.reportedCash = Number(salesData.reportedCash) || 0;
                record.reportedOnline = Number(salesData.reportedOnline) || 0;
            }
            record.b2cSales = items.map(item => ({
                menuItem: item.menuItem,
                bomId: item.bomId,
                itemName: item.itemName,
                itemType: item.itemType,
                unit: item.unit,
                stockQty: Number(item.stockQty) || 0,
                soldQty: Number(item.soldQty) || 0,
                unitPrice: Number(item.unitPrice) || 0,
                totalVal: (Number(item.soldQty) || 0) * (Number(item.unitPrice) || 0)
            }));
            const totalB2C = record.b2cSales.reduce((acc, item) => acc + (item.totalVal || 0), 0);
            record.reportedDifference = totalB2C - (record.reportedCash + record.reportedOnline);
            record.b2cConfirmed = true;
        } else if (tabType === 'online') {
            record.onlineSales = {
                totalSaleValue: Number(salesData.totalSaleValue) || 0,
                aggregatorPercentage: Number(salesData.aggregatorPercentage) || 0
            };
            record.onlineConfirmed = true;
        } else {
            throw new AppError('Invalid tab type', 400);
        }

        await record.save();
        return record;
    }

    /**
     * Close daily revenue (lock entries and execute inventory deductions)
     */
    async closeDailyRevenue(locationId, dateStr, entityId, reqUser) {
        const { start, end } = this.getDateRange(dateStr);

        const record = await DailyRevenue.findOne({
            locationId,
            date: { $gte: start, $lte: end }
        });

        if (!record) {
            throw new AppError('Revenue records not found for this day. Please input and confirm tab data first.', 404);
        }

        if (record.status === 'CLOSED') {
            throw new AppError('Day has already been closed and locked', 400);
        }

        const user = await User.findById(locationId).lean();
        if (!user) {
            throw new AppError('User/Location not found', 404);
        }

        // Validate that all relevant tabs are confirmed
        const isKitchen = user.role === 'KITCHEN';
        const isRestaurant = user.role === 'RESTAURANT';
        const isCenterOrAggregate = user.role === 'CENTERS' || user.role === 'AGGREGATE';
        const hasOnline = user.onlineSalesEnabled;

        if ((isKitchen || isRestaurant) && !record.b2bConfirmed) {
            throw new AppError('Please confirm B2B dispatches before closing the daily revenue.', 400);
        }
        if ((isCenterOrAggregate || isRestaurant) && !record.b2cConfirmed) {
            throw new AppError('Please confirm B2C sales before closing the daily revenue.', 400);
        }
        if (hasOnline && !record.onlineConfirmed) {
            throw new AppError('Please confirm Online Sales before closing the daily revenue.', 400);
        }

        // Deduct inventory stock for B2C counter sales (DIRECT items only; BOM items are daily consumption)
        for (const item of record.b2cSales) {
            if (item.itemType === 'DIRECT' && item.soldQty > 0) {
                await Inventory.findOneAndUpdate(
                    { materialId: item.menuItem, locationId, entity: entityId },
                    { $inc: { currentStock: -item.soldQty } },
                    { new: true }
                );
            }
        }

        // Deduct inventory stock for B2B manually added dispatches
        if (record.b2bSales) {
            for (const item of record.b2bSales) {
                if (item.isManual && item.quantity > 0) {
                    if (item.itemType === 'DIRECT' && item.menuItem) {
                        await Inventory.findOneAndUpdate(
                            { materialId: item.menuItem, locationId, entity: entityId },
                            { $inc: { currentStock: -item.quantity } },
                            { new: true }
                        );
                    } else if (item.itemType === 'BOM' && item.bomId) {
                        // Explode ingredients and deduct from inventory
                        const bom = await Bom.findById(item.bomId).lean();
                        if (bom && bom.items) {
                            for (const bomItem of bom.items) {
                                if (bomItem.materialId) {
                                    const requiredQty = bomItem.quantity * item.quantity;
                                    await Inventory.findOneAndUpdate(
                                        { 
                                            materialId: bomItem.materialId, 
                                            locationId,
                                            entity: entityId
                                        },
                                        { $inc: { currentStock: -requiredQty } },
                                        { new: true }
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        // Calculate total amount
        const totalB2B = record.b2bSales.reduce((acc, item) => acc + (item.totalVal || 0), 0);
        const totalB2C = record.b2cSales.reduce((acc, item) => acc + (item.totalVal || 0), 0);
        const totalOnline = record.onlineSales.totalSaleValue || 0;

        record.totalAmount = totalB2B + totalB2C + totalOnline;
        record.status = 'CLOSED';
        record.closedAt = new Date();

        await record.save();
        return record;
    }

    /**
     * Fetch consolidated revenue for a date range
     */
    async getConsolidatedRevenue(locationId, startDateStr, endDateStr, entityId) {
        const start = new Date(startDateStr);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDateStr);
        end.setHours(23, 59, 59, 999);

        const records = await DailyRevenue.find({
            locationId,
            date: { $gte: start, $lte: end }
        }).lean();

        const b2bMap = {};
        const b2cMap = {};
        let totalOnlineValue = 0;
        let onlineWeight = 0;
        let onlineCount = 0;
        let totalAmount = 0;

        for (const record of records) {
            totalAmount += record.totalAmount || 0;

            if (record.b2bSales) {
                for (const item of record.b2bSales) {
                    const idStr = (item.bomId || item.menuItem || 'item').toString();
                    const key = idStr + '_' + item.itemName;
                    if (!b2bMap[key]) {
                        b2bMap[key] = {
                            bomId: item.bomId,
                            menuItem: item.menuItem,
                            itemName: item.itemName,
                            itemType: item.itemType || 'BOM',
                            quantity: 0,
                            unitPrice: item.unitPrice,
                            totalVal: 0
                        };
                    }
                    b2bMap[key].quantity += item.quantity || 0;
                    b2bMap[key].totalVal += item.totalVal || 0;
                    b2bMap[key].unitPrice = item.unitPrice;
                }
            }

            if (record.b2cSales) {
                for (const item of record.b2cSales) {
                    const key = (item.bomId || item.menuItem || 'item').toString() + '_' + item.itemName;
                    if (!b2cMap[key]) {
                        b2cMap[key] = {
                            menuItem: item.menuItem,
                            bomId: item.bomId,
                            itemName: item.itemName,
                            itemType: item.itemType,
                            unit: item.unit,
                            stockQty: 0,
                            soldQty: 0,
                            unitPrice: item.unitPrice,
                            totalVal: 0
                        };
                    }
                    b2cMap[key].stockQty += item.stockQty || 0;
                    b2cMap[key].soldQty += item.soldQty || 0;
                    b2cMap[key].totalVal += item.totalVal || 0;
                    b2cMap[key].unitPrice = item.unitPrice;
                }
            }

            if (record.onlineSales) {
                totalOnlineValue += record.onlineSales.totalSaleValue || 0;
                onlineWeight += record.onlineSales.aggregatorPercentage || 0;
                onlineCount++;
            }
        }

        return {
            locationId,
            startDate: start,
            endDate: end,
            status: 'CONSOLIDATED',
            b2bSales: Object.values(b2bMap),
            b2cSales: Object.values(b2cMap),
            onlineSales: {
                totalSaleValue: totalOnlineValue,
                aggregatorPercentage: onlineCount > 0 ? (onlineWeight / onlineCount) : 0
            },
            totalAmount
        };
    }
    /**
     * Fetch entity-wide financial rollups & pending actions
     */
    async getFinanceDashboardStats(entityId) {
        // Query all revenues for this entity (both OPEN and CLOSED)
        const records = await DailyRevenue.find({ entity: entityId })
            .populate('locationId')
            .lean();

        let totalReported = 0;
        let totalVerified = 0;
        let totalDifference = 0;

        const pendingReconciliations = [];

        for (let record of records) {
            const user = record.locationId;
            if (!user) continue;

            const isKitchen = user.role === 'KITCHEN';
            const isRestaurant = user.role === 'RESTAURANT';
            const isCenterOrAggregate = user.role === 'CENTERS' || user.role === 'AGGREGATE';
            const hasOnline = user.onlineSalesEnabled;

            if (record.status === 'OPEN') {
                // Dynamically populate draft data for open records
                const computed = await this.getDailyRevenue(user._id, record.date, entityId);
                record.b2bSales = computed.b2bSales;
                record.b2cSales = computed.b2cSales;
                record.reportedCash = computed.reportedCash;
                record.reportedOnline = computed.reportedOnline;
                record.onlineSales = computed.onlineSales;
            }

            let reported = 0;
            let verified = 0;

            // B2B dispatches (Kitchen/Restaurant)
            if (isKitchen || isRestaurant) {
                const b2bRev = record.b2bSales.reduce((sum, item) => sum + (item.totalVal || 0), 0);
                reported += b2bRev;
                // B2B has no verification, so verified B2B equals reported B2B
                verified += b2bRev;
            }

            const Expense = require('../../expenses/models/expenseModel');
            const start = new Date(record.date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(record.date);
            end.setHours(23, 59, 59, 999);
            
            const dayExpenses = await Expense.find({
                locationId: user._id,
                entity: entityId,
                date: { $gte: start, $lte: end },
                status: 'APPROVED'
            }).lean();
            const approvedExpensesAmount = dayExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

            // B2C counter sales (Centers/Restaurant/Aggregate)
            if (isCenterOrAggregate || isRestaurant) {
                reported += (record.reportedCash || 0) + (record.reportedOnline || 0);
                verified += (record.verification?.cashDeposited || 0) + (record.verification?.onlinePayments || 0) + approvedExpensesAmount;
            }

            // Online aggregator sales
            if (hasOnline) {
                const aggregatorPercentage = record.onlineSales?.aggregatorPercentage || 0;
                // Only AGGREGATE role gets aggregator rate auto-applied
                const onlineExpected = user.role === 'AGGREGATE'
                    ? (record.onlineSales?.totalSaleValue || 0) * (1 - aggregatorPercentage / 100)
                    : (record.onlineSales?.totalSaleValue || 0);

                reported += onlineExpected;
                verified += (record.verification?.onlineSalesReceivedAmount || 0);
            }

            totalReported += reported;
            totalVerified += verified;

            if (!record.verification?.isAcknowledged) {
                pendingReconciliations.push({
                    locationId: user._id,
                    locationName: user.name,
                    locationRole: user.role,
                    date: record.date,
                    reportedTotal: reported,
                    verifiedTotal: verified,
                    difference: record.verification?.difference || (reported - verified)
                });
            }
        }

        totalDifference = totalReported - totalVerified;

        return {
            totalReported,
            totalVerified,
            totalDifference,
            pendingReconciliations
        };
    }

    /**
     * Fetch daily revenue logs and mapped bank details for a specific location
     */
    async getFinanceLocationDetails(locationId, entityId) {
        const records = await DailyRevenue.find({ locationId, entity: entityId })
            .lean()
            .sort({ date: -1 });

        const Expense = require('../../expenses/models/expenseModel');
        const expenses = await Expense.find({ locationId, entity: entityId })
            .sort({ date: -1, createdAt: -1 })
            .lean();

        // Stitch approved expenses amount into each daily record
        for (const record of records) {
            const recDateStr = new Date(record.date).toISOString().split('T')[0];
            const dayApprovedExpenses = expenses.filter(exp => {
                const expDateStr = new Date(exp.date).toISOString().split('T')[0];
                return expDateStr === recDateStr && exp.status === 'APPROVED';
            });
            record.approvedExpensesAmount = dayApprovedExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        }

        const Bank = require('../../banks/models/bankModel');
        const bank = await Bank.findOne({ locations: locationId }).lean();

        return {
            records,
            expenses,
            bank
        };
    }

    /**
     * Reconcile, save verification details, and acknowledge
     */
    async saveFinanceVerification(locationId, dateStr, verificationData) {
        const { start, end } = this.getDateRange(dateStr);

        const record = await DailyRevenue.findOne({
            locationId,
            date: { $gte: start, $lte: end }
        });

        if (!record) {
            throw new AppError('Revenue record not found for the selected day', 404);
        }

        const user = await User.findById(locationId).lean();
        if (!user) {
            throw new AppError('Location user not found', 404);
        }

        const aggregatorPercentage = record.onlineSales?.aggregatorPercentage || 0;
        const hasOnline = !!user.onlineSalesEnabled;
        const onlineExpected = hasOnline
            ? (user.role === 'AGGREGATE'
                ? (record.onlineSales?.totalSaleValue || 0) * (1 - aggregatorPercentage / 100)
                : (record.onlineSales?.totalSaleValue || 0))
            : 0;

        const reportedTotal = (record.reportedCash || 0) + (record.reportedOnline || 0) + onlineExpected;

        // Fetch approved expenses for this location and date to include in verified total
        const Expense = require('../../expenses/models/expenseModel');
        const dayExpenses = await Expense.find({
            locationId,
            entity: user.entity,
            date: { $gte: start, $lte: end },
            status: 'APPROVED'
        }).lean();
        const approvedExpensesAmount = dayExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

        const cashDeposited = Number(verificationData.cashDeposited) || 0;
        const onlinePayments = Number(verificationData.onlinePayments) || 0;
        const onlineSalesReceivedAmount = hasOnline ? (Number(verificationData.onlineSalesReceivedAmount) || 0) : 0;
        const onlineSalesCommission = hasOnline ? (Number(verificationData.onlineSalesCommission) || 0) : 0;

        const verifiedTotal = cashDeposited + onlinePayments + onlineSalesReceivedAmount + approvedExpensesAmount;
        const difference = reportedTotal - verifiedTotal;

        record.verification = {
            cashDeposited,
            onlinePayments,
            onlineSalesReceivedAmount,
            onlineSalesCommission,
            difference,
            remarks: verificationData.remarks || '',
            isAcknowledged: !!verificationData.isAcknowledged,
            acknowledgedAt: verificationData.isAcknowledged ? new Date() : (record.verification?.acknowledgedAt || null)
        };

        await record.save();
        return record;
    }

    async initializeDailyRevenue(locationId, dateStr, entityId) {
        const { start, end } = this.getDateRange(dateStr);
        let record = await DailyRevenue.findOne({
            locationId,
            date: { $gte: start, $lte: end }
        });
        if (!record) {
            const user = await User.findById(locationId).lean();
            record = await DailyRevenue.create({
                locationId,
                entity: entityId,
                date: start,
                status: 'OPEN',
                b2bConfirmed: false,
                b2cConfirmed: false,
                onlineConfirmed: false,
                b2bSales: [],
                b2cSales: [],
                onlineSales: {
                    totalSaleValue: 0,
                    aggregatorPercentage: user ? (user.aggregatorPercentage || 0) : 0
                }
            });
        }
        return record;
    }
}

module.exports = new RevenueService();
