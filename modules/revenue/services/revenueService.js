const mongoose = require('mongoose');
const DailyRevenue = require('../models/dailyRevenueModel');
const InternalOrder = require('../../production/models/internalOrderModel');
const Inventory = require('../../inventory/models/inventoryModel');
const Menu = require('../../menus/models/menuModel');
const Bom = require('../../boms/models/bomModel');
const MenuRate = require('../../menus/models/menuRateModel');
const User = require('../../users/models/model');
const FoodRequest = require('../../stockrequests/models/stockRequestModel');
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
        const hasOnline = user.onlineSalesEnabled && user.role !== 'AGGREGATE';

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
                    destinationLocation: { $ne: locationId },
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

                // Query FoodRequests placed for today's delivery date
                const requests = await FoodRequest.find({
                    centerId: locationId,
                    entity: entityId,
                    deliveryDate: { $gte: start, $lte: end },
                    status: { $ne: 'REJECTED' }
                }).lean();

                const requestedBomIds = new Set();
                if (requests && requests.length > 0) {
                    for (const reqDoc of requests) {
                        if (reqDoc.requestedItems) {
                            for (const item of reqDoc.requestedItems) {
                                if (item.bomId) {
                                    requestedBomIds.add(item.bomId.toString());
                                }
                            }
                        }
                    }
                }

                // BOM Dishes delivered today
                const receivedOrders = await InternalOrder.find({
                    destinationLocation: locationId,
                    entity: entityId,
                    receivedAt: { $gte: start, $lte: end },
                    status: { $in: ['RECEIVED', 'PARTIAL_RECEIPT'] }
                }).populate('foodRequestId').lean();

                const bomMap = {};
                for (const order of receivedOrders) {
                    if (order.foodRequestId && order.foodRequestId.functionOrderId) {
                        continue;
                    }
                    for (const item of order.items) {
                        if (item.bomId && item.receivedQty > 0) {
                            const bomIdStr = item.bomId.toString();
                            if (!bomMap[bomIdStr]) {
                                const bom = await Bom.findById(item.bomId).lean().select('dishName unit isSoldB2C kitchenPrice');
                                if (bom && bom.isSoldB2C !== false) {
                                    let rateDoc = await MenuRate.findOne({ bom: item.bomId, center: locationId }).lean();
                                    if (!rateDoc) {
                                        rateDoc = await MenuRate.findOne({ bom: item.bomId, center: null }).lean();
                                    }
                                    const price = rateDoc ? (rateDoc.centerRate || rateDoc.rate || 0) : 0;
                                    const buyingPrice = rateDoc ? (rateDoc.rate || 0) : (bom.kitchenPrice || 0);
                                    bomMap[bomIdStr] = {
                                        bomId: item.bomId,
                                        itemName: bom.dishName,
                                        itemType: 'BOM',
                                        unit: bom.unit || 'pcs',
                                        stockQty: 0,
                                        soldQty: 0,
                                        buyingPrice: buyingPrice,
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

                // Ensure requested dishes for today are included even if stockQty is 0
                for (const reqBomId of requestedBomIds) {
                    if (!bomMap[reqBomId]) {
                        const bom = await Bom.findById(reqBomId).lean().select('dishName unit isSoldB2C kitchenPrice');
                        if (bom && bom.isSoldB2C !== false) {
                            let rateDoc = await MenuRate.findOne({ bom: reqBomId, center: locationId }).lean();
                            if (!rateDoc) {
                                rateDoc = await MenuRate.findOne({ bom: reqBomId, center: null }).lean();
                            }
                            const price = rateDoc ? (rateDoc.centerRate || rateDoc.rate || 0) : 0;
                            const buyingPrice = rateDoc ? (rateDoc.rate || 0) : (bom.kitchenPrice || 0);
                            bomMap[reqBomId] = {
                                bomId: new mongoose.Types.ObjectId(reqBomId),
                                itemName: bom.dishName,
                                itemType: 'BOM',
                                unit: bom.unit || 'pcs',
                                stockQty: 0,
                                soldQty: 0,
                                buyingPrice: buyingPrice,
                                unitPrice: price
                            };
                        }
                    }
                }

                b2cList.push(...Object.values(bomMap));

                // BUG-C5 Fix: batch Inventory lookup for direct menu items (single query, not N+1)
                const directMenus = await Menu.find({ entity: entityId }).lean();
                if (directMenus.length > 0) {
                    const menuIds = directMenus.map(m => m._id);
                    const inventories = await Inventory.find({
                        materialId: { $in: menuIds },
                        locationId
                    }).lean();
                    const invMap = {};
                    inventories.forEach(inv => { invMap[inv.materialId.toString()] = inv; });

                    for (const menu of directMenus) {
                        const inv = invMap[menu._id.toString()];
                        if (inv && inv.currentStock > 0) {
                            let rateDoc = await MenuRate.findOne({ menu: menu._id, center: locationId }).lean();
                            if (!rateDoc) {
                                rateDoc = await MenuRate.findOne({ menu: menu._id, center: null }).lean();
                            }
                            const buyingPrice = rateDoc ? (rateDoc.rate || 0) : 0;
                            b2cList.push({
                                menuItem: menu._id,
                                itemName: menu.name,
                                itemType: 'DIRECT',
                                unit: menu.unit === 'custom' ? (menu.customUnit || menu.unit) : menu.unit,
                                stockQty: inv.currentStock,
                                soldQty: 0,
                                buyingPrice: buyingPrice,
                                // Use menu.mrpPrice as the fixed selling price per unit.
                                // Falls back to 0 for legacy items created before mrpPrice was added.
                                unitPrice: menu.mrpPrice || 0,
                                totalVal: 0
                            });
                        }
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
    async confirmRevenueTab(locationId, dateStr, tabType, salesData, entityId, isDraft = false) {
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
            if (!isDraft) {
                // Verify all items have positive unitPrice
                const invalidItem = salesData.find(item => !item.unitPrice || Number(item.unitPrice) <= 0);
                if (invalidItem) {
                    throw new AppError(`B2B item "${invalidItem.itemName}" is missing a unit price. Please configure or edit it before confirming.`, 400);
                }
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
            record.b2bConfirmed = !isDraft;
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
                buyingPrice: Number(item.buyingPrice) || 0,
                unitPrice: Number(item.unitPrice) || 0,
                totalVal: (Number(item.soldQty) || 0) * (Number(item.unitPrice) || 0)
            }));
            const totalB2C = record.b2cSales.reduce((acc, item) => acc + (item.totalVal || 0), 0);
            
            const user = await User.findById(locationId).lean();
            if (!user) {
                throw new AppError('Location user not found', 404);
            }
            if (user.role === 'AGGREGATE') {
                record.reportedCash = 0;
                record.reportedOnline = 0;
                record.reportedDifference = 0;
                
                const Expense = require('../../expenses/models/expenseModel');
                const expenses = await Expense.find({
                    locationId,
                    date: { $gte: start, $lte: end },
                    status: { $ne: 'REJECTED' }
                }).lean();
                const expensesTotal = expenses.reduce((sum, exp) => sum + (exp.approvedAmount !== undefined ? exp.approvedAmount : exp.amount), 0);
                
                const commPct = user.aggregatorPercentage || 0;
                const gstDeduction = (totalB2C / 1.05) * 0.05;
                const commissionVal = (commPct / 100) * totalB2C;
                const totalReceivable = totalB2C - gstDeduction - commissionVal - expensesTotal;

                record.aggregatorExpectedRevenue = totalB2C;
                record.aggregatorGstDeduction = gstDeduction;
                record.aggregatorCommission = commissionVal;
                record.aggregatorExpenses = expensesTotal;
                record.aggregatorTotalReceivable = totalReceivable;
            } else {
                record.reportedDifference = totalB2C - (record.reportedCash + record.reportedOnline);
            }
            record.b2cConfirmed = !isDraft;
        } else if (tabType === 'online') {
            record.onlineSales = {
                totalSaleValue: Number(salesData.totalSaleValue) || 0,
                aggregatorPercentage: Number(salesData.aggregatorPercentage) || 0
            };
            record.onlineConfirmed = !isDraft;
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
        const isAggregator = user.role === 'AGGREGATE';
        const hasOnline = user.onlineSalesEnabled && !isAggregator;

        if ((isKitchen || isRestaurant) && !record.b2bConfirmed) {
            throw new AppError('Please confirm B2B dispatches before closing the daily revenue.', 400);
        }
        if ((isCenterOrAggregate || isRestaurant) && !record.b2cConfirmed) {
            throw new AppError('Please confirm B2C sales before closing the daily revenue.', 400);
        }
        if (!isAggregator && (isCenterOrAggregate || isRestaurant) && (!record.cashClosure || !record.cashClosure.submittedForCOO)) {
            throw new AppError('Please submit the Cash Closure before closing the daily revenue.', 400);
        }
        if (hasOnline && !record.onlineConfirmed) {
            throw new AppError('Please confirm Online Sales before closing the daily revenue.', 400);
        }

        const inventoryService = require('../../inventory/services/inventoryService');

        // Deduct inventory stock for B2C counter sales (DIRECT items only; BOM items are daily consumption)
        for (const item of record.b2cSales) {
            if (item.itemType === 'DIRECT' && item.soldQty > 0) {
                // BUG-SYS2 Fix: use safeDeductStock to floor at 0, never block the close operation
                await inventoryService.safeDeductStock(
                    item.menuItem,
                    locationId,
                    entityId,
                    item.soldQty
                );
            }
        }

        // Deduct inventory stock for B2B manually added dispatches
        if (record.b2bSales) {
            for (const item of record.b2bSales) {
                if (item.isManual && item.quantity > 0) {
                    if (item.itemType === 'DIRECT' && item.menuItem) {
                        await inventoryService.safeDeductStock(
                            item.menuItem,
                            locationId,
                            entityId,
                            item.quantity
                        );
                    } else if (item.itemType === 'BOM' && item.bomId) {
                        // BUG-K3 Fix: Recursive BOM ingredient deduction
                        const bom = await Bom.findById(item.bomId).lean();
                        if (bom && bom.items) {
                            for (const bomItem of bom.items) {
                                if (bomItem.materialId && bomItem.type !== 'BOM Item') {
                                    const requiredQty = bomItem.quantity * item.quantity;
                                    await inventoryService.safeDeductStock(
                                        bomItem.materialId,
                                        locationId,
                                        entityId,
                                        requiredQty
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

        if (user.role === 'AGGREGATE') {
            record.totalAmount = totalB2C;
            
            // Auto-populate mock cash closure so standard coo queries pick it up
            const Expense = require('../../expenses/models/expenseModel');
            const dayExpenses = await Expense.find({
                locationId,
                date: { $gte: start, $lte: end },
                status: { $ne: 'REJECTED' }
            }).lean();
            
            record.cashClosure = {
                prevDayCashInHand: 0,
                cashFoodSales: 0,
                onlineSalesTotal: 0,
                advancePaymentsReceived: 0,
                functionOrderFinalPayments: 0,
                cashExpenses: 0,
                expenseIds: dayExpenses.map(e => e._id),
                advanceCashTaken: 0,
                cashDepositedToBank: 0,
                cashInHand: 0,
                expectedCash: 0,
                difference: 0,
                submittedForCOO: true,
                submittedAt: new Date(),
                cooConfirmed: false,
                cooConfirmedAt: null,
                financeAcknowledged: false,
                financeAcknowledgedAt: null
            };
        } else {
            record.totalAmount = totalB2B + totalB2C + totalOnline;
        }

        record.status = 'CLOSED';
        record.closedAt = new Date();
        record.cooApproved = false;
        record.financeReconciled = false;

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

        const query = {
            date: { $gte: start, $lte: end }
        };

        if (locationId) {
            if (Array.isArray(locationId)) {
                query.locationId = { $in: locationId.map(id => new mongoose.Types.ObjectId(id)) };
            } else if (locationId !== 'ALL' && locationId !== 'ALL_LOCATIONS' && mongoose.Types.ObjectId.isValid(locationId)) {
                query.locationId = new mongoose.Types.ObjectId(locationId);
            }
        }

        if (entityId && (!query.locationId || locationId === 'ALL')) {
            query.entity = new mongoose.Types.ObjectId(entityId);
        }

        const records = await DailyRevenue.find(query).populate('locationId').lean();

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
            totalAmount,
            records
        };
    }
    /**
     * Fetch entity-wide financial rollups & pending actions
     */
    async getFinanceDashboardStats(entityId) {
        // Query all revenues for this entity that are CLOSED and COO-Approved
        const records = await DailyRevenue.find({ entity: entityId, status: 'CLOSED', cooApproved: true })
            .populate('locationId')
            .lean();

        // BUG-F1 Fix: Single aggregate to get approved expense totals per location+date
        // Replaces the N+1 Expense.find() that was firing once per revenue record
        const Expense = require('../../expenses/models/expenseModel');
        const expenseAgg = await Expense.aggregate([
            { $match: { entity: entityId, status: { $in: ['APPROVED', 'PENDING_FINANCE'] } } },
            {
                $group: {
                    _id: {
                        locationId: '$locationId',
                        // Truncate to date string YYYY-MM-DD for grouping
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }
                    },
                    totalAmount: { $sum: { $ifNull: ['$approvedAmount', '$amount'] } }
                }
            }
        ]);
        // Build O(1) lookup: "locationId::YYYY-MM-DD" → totalAmount
        const expenseLookup = {};
        for (const agg of expenseAgg) {
            const key = `${agg._id.locationId}::${agg._id.date}`;
            expenseLookup[key] = agg.totalAmount || 0;
        }

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

            if (user.role === 'AGGREGATE') {
                reported = record.aggregatorTotalReceivable || 0;
                verified = record.verification?.aggregatorAmountReceived || 0;
            } else {
                // B2B dispatches (Kitchen/Restaurant)
                if (isKitchen || isRestaurant) {
                    const b2bRev = record.b2bSales.reduce((sum, item) => sum + (item.totalVal || 0), 0);
                    reported += b2bRev;
                    verified += b2bRev;
                }

                // O(1) lookup from pre-fetched aggregate
                const dateKey = new Date(record.date).toISOString().split('T')[0];
                const expenseKey = `${user._id}::${dateKey}`;
                const approvedExpensesAmount = expenseLookup[expenseKey] || 0;

                // B2C counter sales (Centers/Restaurant)
                if (isCenterOrAggregate || isRestaurant) {
                    reported += (record.reportedCash || 0) + (record.reportedOnline || 0);
                    verified += (record.verification?.cashDeposited || 0) + (record.verification?.onlinePayments || 0) + approvedExpensesAmount;
                }

                // Online aggregator sales
                if (hasOnline) {
                    reported += record.onlineSales?.totalSaleValue || 0;
                    verified += (record.verification?.onlineSalesReceivedAmount || 0);
                }
            }

            totalReported += reported;
            totalVerified += verified;

            if (!record.financeReconciled) {
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
        const records = await DailyRevenue.find({ locationId, entity: entityId, status: 'CLOSED', cooApproved: true })
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
                return expDateStr === recDateStr && ['APPROVED', 'PENDING_FINANCE'].includes(exp.status);
            });
            record.approvedExpensesAmount = dayApprovedExpenses.reduce((sum, exp) => sum + (exp.approvedAmount !== undefined ? exp.approvedAmount : exp.amount || 0), 0);
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

        let reportedTotal = 0;
        let verifiedTotal = 0;
        let difference = 0;
        let verification = {};

        if (user.role === 'AGGREGATE') {
            reportedTotal = record.aggregatorTotalReceivable || 0;
            const aggregatorAmountReceived = Number(verificationData.aggregatorAmountReceived) || 0;
            const aggregatorGstVerified = Number(verificationData.aggregatorGstVerified) || 0;
            const aggregatorCommissionVerified = Number(verificationData.aggregatorCommissionVerified) || 0;

            verifiedTotal = aggregatorAmountReceived;
            difference = reportedTotal - verifiedTotal;

            verification = {
                aggregatorAmountReceived,
                aggregatorGstVerified,
                aggregatorCommissionVerified,
                difference,
                remarks: verificationData.remarks || '',
                isAcknowledged: !!verificationData.isAcknowledged,
                acknowledgedAt: verificationData.isAcknowledged ? new Date() : (record.verification?.acknowledgedAt || null)
            };
        } else {
            const aggregatorPercentage = record.onlineSales?.aggregatorPercentage || 0;
            const hasOnline = !!user.onlineSalesEnabled;
            const onlineExpected = hasOnline
                ? (user.role === 'AGGREGATE'
                    ? (record.onlineSales?.totalSaleValue || 0) * (1 - aggregatorPercentage / 100)
                    : (record.onlineSales?.totalSaleValue || 0))
                : 0;

            reportedTotal = (record.reportedCash || 0) + (record.reportedOnline || 0) + onlineExpected;

            // Fetch approved expenses for this location and date to include in verified total
            const Expense = require('../../expenses/models/expenseModel');
            const dayExpenses = await Expense.find({
                locationId,
                entity: user.entity,
                date: { $gte: start, $lte: end },
                status: { $in: ['APPROVED', 'PENDING_FINANCE'] }
            }).lean();
            const approvedExpensesAmount = dayExpenses.reduce((sum, exp) => sum + (exp.approvedAmount !== undefined ? exp.approvedAmount : exp.amount), 0);

            const cashDeposited = Number(verificationData.cashDeposited) || 0;
            const onlinePayments = Number(verificationData.onlinePayments) || 0;
            const onlineSalesReceivedAmount = hasOnline ? (Number(verificationData.onlineSalesReceivedAmount) || 0) : 0;
            const onlineSalesCommission = hasOnline ? (Number(verificationData.onlineSalesCommission) || 0) : 0;

            verifiedTotal = cashDeposited + onlinePayments + onlineSalesReceivedAmount + approvedExpensesAmount;
            difference = reportedTotal - verifiedTotal;

            verification = {
                cashDeposited,
                onlinePayments,
                onlineSalesReceivedAmount,
                onlineSalesCommission,
                difference,
                remarks: verificationData.remarks || '',
                isAcknowledged: !!verificationData.isAcknowledged,
                acknowledgedAt: verificationData.isAcknowledged ? new Date() : (record.verification?.acknowledgedAt || null)
            };
        }

        record.verification = verification;

        if (verification.isAcknowledged) {
            record.financeReconciled = true;
            record.financeReconciledAt = new Date();
            if (record.cashClosure) {
                record.cashClosure.financeAcknowledged = true;
                record.cashClosure.financeAcknowledgedAt = new Date();

                // Auto-approve associated cash expenses from PENDING_FINANCE to APPROVED
                const Expense = require('../../expenses/models/expenseModel');
                await Expense.updateMany(
                    { _id: { $in: record.cashClosure.expenseIds || [] }, status: 'PENDING_FINANCE' },
                    { status: 'APPROVED' }
                );

                // Auto-acknowledge linked Cash final payments
                const FunctionOrder = require('../../functionorders/models/functionOrderModel');
                for (const foId of record.cashClosure.functionOrderIds || []) {
                    const fo = await FunctionOrder.findById(foId);
                    if (fo) {
                        fo.finalFinanceAcknowledged = true;
                        fo.finalFinanceAcknowledgedAt = new Date();
                        fo.finalFinanceNote = `Auto-acknowledged via Daily Cash Closure on ${dateStr}`;
                        if (fo.advanceFinanceAcknowledged) {
                            fo.status = 'CLOSED';
                        }
                        await fo.save();
                    }
                }

                // Auto-acknowledge Cash advances booked on this day
                const cashAdvances = await FunctionOrder.find({
                    centerId: locationId,
                    advancePaymentMode: 'Cash',
                    bookingDate: { $gte: start, $lte: end },
                    advanceFinanceAcknowledged: false
                });
                for (const fo of cashAdvances) {
                    fo.advanceFinanceAcknowledged = true;
                    fo.advanceFinanceAcknowledgedAt = new Date();
                    fo.advanceFinanceNote = `Auto-acknowledged via Daily Cash Closure on ${dateStr}`;
                    if (fo.finalFinanceAcknowledged) {
                        fo.status = 'CLOSED';
                    }
                    await fo.save();
                }
            }
        }
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

    async getCashClosureData(locationId, dateStr, entityId) {
        const { start, end } = this.getDateRange(dateStr);

        let record = await DailyRevenue.findOne({
            locationId,
            date: { $gte: start, $lte: end }
        });

        if (!record) {
            record = await this.initializeDailyRevenue(locationId, dateStr, entityId);
        }

        const functionOrderService = require('../../functionorders/services/functionOrderService');
        const Expense = require('../../expenses/models/expenseModel');

        // 1. Fetch prevDayCashInHand
        const prevRecord = await DailyRevenue.findOne({
            locationId,
            date: { $lt: start },
            'cashClosure.cooConfirmed': true
        }).sort({ date: -1 }).lean();
        const prevDayCashInHand = prevRecord && prevRecord.cashClosure ? ((prevRecord.cashClosure.cashInHand || 0) - (prevRecord.cashClosure.cashDepositedToBank || 0)) : 0;

        // 2. Fetch cashFoodSales (from B2C confirmed reportedCash)
        const cashFoodSales = record.reportedCash || 0;

        // 3. Fetch onlineSalesTotal
        const onlineSalesTotal = record.onlineSales?.totalSaleValue || 0;

        // 4. Fetch advancePaymentsReceived (cash-mode advances booking today)
        const advancePaymentsReceived = await functionOrderService.getCashAdvancesForDate(locationId, start, end);

        // 5. Fetch functionOrderFinalPayments (cash final payments settled today)
        const finalPaymentsObj = await functionOrderService.getCashFinalPaymentsForDate(locationId, start, end);
        const functionOrderFinalPayments = finalPaymentsObj.totalAmount;
        const functionOrderIds = finalPaymentsObj.ids;

        // 6. Fetch individual expenses for listing and total cashExpenses
        const expenses = await Expense.find({
            locationId,
            date: { $gte: start, $lte: end },
            paymentMethod: 'Cash',
            status: { $ne: 'REJECTED' }
        }).lean();
        const cashExpenses = expenses.reduce((sum, exp) => sum + (exp.approvedAmount !== undefined ? exp.approvedAmount : exp.amount), 0);
        const expenseIds = expenses.map(e => e._id);

        if (!record.cashClosure || !record.cashClosure.submittedForCOO) {
            const currentClosure = record.cashClosure || {};
            
            const advanceCashTaken = currentClosure.advanceCashTaken || 0;
            const cashDepositedToBank = currentClosure.cashDepositedToBank || 0;
            const cashInHand = currentClosure.cashInHand || 0;

            const expectedCash = prevDayCashInHand + cashFoodSales + advancePaymentsReceived + functionOrderFinalPayments - cashExpenses + advanceCashTaken - cashDepositedToBank;
            const difference = (cashInHand - cashDepositedToBank) - expectedCash;

            record.cashClosure = {
                prevDayCashInHand,
                cashFoodSales,
                onlineSalesTotal,
                advancePaymentsReceived,
                functionOrderFinalPayments,
                cashExpenses,
                functionOrderIds,
                expenseIds,
                advanceCashTaken,
                cashDepositedToBank,
                cashInHand,
                expectedCash,
                difference,
                submittedForCOO: currentClosure.submittedForCOO || false,
                submittedAt: currentClosure.submittedAt || null,
                cooConfirmed: currentClosure.cooConfirmed || false,
                cooConfirmedAt: currentClosure.cooConfirmedAt || null,
                financeAcknowledged: currentClosure.financeAcknowledged || false,
                financeAcknowledgedAt: currentClosure.financeAcknowledgedAt || null
            };
            await record.save();
        }

        return {
            record,
            expenses
        };
    }

    async saveCashClosure(locationId, dateStr, data) {
        const { start, end } = this.getDateRange(dateStr);

        let record = await DailyRevenue.findOne({
            locationId,
            date: { $gte: start, $lte: end }
        });

        if (!record) {
            throw new AppError('Revenue record not found for this day', 404);
        }

        if (record.cashClosure && record.cashClosure.submittedForCOO) {
            throw new AppError('Cash Closure is already submitted and locked', 400);
        }

        const { advanceCashTaken, cashDepositedToBank, cashInHand } = data;

        const closure = record.cashClosure || {};
        closure.advanceCashTaken = Number(advanceCashTaken) || 0;
        closure.cashDepositedToBank = Number(cashDepositedToBank) || 0;
        closure.cashInHand = Number(cashInHand) || 0;

        const expectedCash = (closure.prevDayCashInHand || 0) + (closure.cashFoodSales || 0) + (closure.advancePaymentsReceived || 0) + (closure.functionOrderFinalPayments || 0) - (closure.cashExpenses || 0) + closure.advanceCashTaken - closure.cashDepositedToBank;
        
        closure.expectedCash = expectedCash;
        closure.difference = (closure.cashInHand - closure.cashDepositedToBank) - expectedCash;

        record.cashClosure = closure;
        record.markModified('cashClosure');
        await record.save();
        return record;
    }

    async submitCashClosureForCOO(locationId, dateStr) {
        const { start, end } = this.getDateRange(dateStr);

        let record = await DailyRevenue.findOne({
            locationId,
            date: { $gte: start, $lte: end }
        });

        if (!record) {
            throw new AppError('Revenue record not found for this day', 404);
        }

        if (!record.cashClosure) {
            throw new AppError('Cash Closure data not found. Please save it first.', 400);
        }

        if (record.cashClosure.submittedForCOO) {
            throw new AppError('Cash Closure is already submitted', 400);
        }

        record.cashClosure.submittedForCOO = true;
        record.cashClosure.submittedAt = new Date();
        record.markModified('cashClosure');

        await record.save();
        return record;
    }

    async approveDayClosure(locationId, dateStr, approvedExpenses, closureUpdates, b2cSales, b2bSales, cooUser) {
        const { start, end } = this.getDateRange(dateStr);

        let record = await DailyRevenue.findOne({
            locationId,
            date: { $gte: start, $lte: end }
        });

        if (!record) {
            throw new AppError('Revenue record not found for this day', 404);
        }

        const user = await User.findById(locationId).lean();
        if (!user) {
            throw new AppError('Location user not found', 404);
        }

        // Apply COO edits to B2C sales if provided
        if (b2cSales && Array.isArray(b2cSales)) {
            record.b2cSales = b2cSales.map(item => ({
                menuItem: item.menuItem,
                bomId: item.bomId,
                itemName: item.itemName,
                itemType: item.itemType,
                unit: item.unit,
                stockQty: Number(item.stockQty) || 0,
                soldQty: Number(item.soldQty) || 0,
                buyingPrice: Number(item.buyingPrice) || 0,
                unitPrice: Number(item.unitPrice) || 0,
                totalVal: (Number(item.soldQty) || 0) * (Number(item.unitPrice) || 0)
            }));
            record.markModified('b2cSales');
        }

        // Apply COO edits to B2B sales if provided
        if (b2bSales && Array.isArray(b2bSales)) {
            record.b2bSales = b2bSales.map(item => ({
                bomId: item.bomId,
                menuItem: item.menuItem,
                itemType: item.itemType || 'BOM',
                itemName: item.itemName,
                quantity: Number(item.quantity) || 0,
                unitPrice: Number(item.unitPrice) || 0,
                totalVal: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
                isManual: !!item.isManual
            }));
            record.markModified('b2bSales');
        }

        const Expense = require('../../expenses/models/expenseModel');
        const functionOrderService = require('../../functionorders/services/functionOrderService');

        let totalApprovedExpenses = 0;

        for (const expUpdate of approvedExpenses || []) {
            const exp = await Expense.findById(expUpdate.expenseId);
            if (exp) {
                exp.approvedAmount = Number(expUpdate.approvedAmount) || 0;
                exp.status = 'PENDING_FINANCE';
                await exp.save();
                totalApprovedExpenses += exp.approvedAmount;
            }
        }

        const remainingExpenses = await Expense.find({
            _id: { $in: (record.cashClosure && record.cashClosure.expenseIds) || [], $nin: (approvedExpenses || []).map(e => e.expenseId) }
        });
        for (const exp of remainingExpenses) {
            exp.approvedAmount = exp.amount;
            exp.status = 'PENDING_FINANCE';
            await exp.save();
            totalApprovedExpenses += exp.approvedAmount;
        }

        const totalB2C = record.b2cSales.reduce((acc, item) => acc + (item.totalVal || 0), 0);
        const totalB2B = record.b2bSales.reduce((acc, item) => acc + (item.totalVal || 0), 0);
        const totalOnline = record.onlineSales?.totalSaleValue || 0;

        if (user.role === 'AGGREGATE') {
            const commPct = user.aggregatorPercentage || 0;
            const gstDeduction = (totalB2C / 1.05) * 0.05;
            const commissionVal = (commPct / 100) * totalB2C;
            const totalReceivable = totalB2C - gstDeduction - commissionVal - totalApprovedExpenses;

            record.aggregatorExpectedRevenue = totalB2C;
            record.aggregatorGstDeduction = gstDeduction;
            record.aggregatorCommission = commissionVal;
            record.aggregatorExpenses = totalApprovedExpenses;
            record.aggregatorTotalReceivable = totalReceivable;
            record.totalAmount = totalB2C;

            if (record.cashClosure) {
                record.cashClosure.cashExpenses = totalApprovedExpenses;
                record.cashClosure.cooConfirmed = true;
                record.cashClosure.cooConfirmedAt = new Date();
                record.markModified('cashClosure');
            }
        } else {
            if (record.cashClosure) {
                if (closureUpdates) {
                    if (closureUpdates.prevDayCashInHand !== undefined) record.cashClosure.prevDayCashInHand = Number(closureUpdates.prevDayCashInHand) || 0;
                    if (closureUpdates.cashFoodSales !== undefined) record.cashClosure.cashFoodSales = Number(closureUpdates.cashFoodSales) || 0;
                    if (closureUpdates.advancePaymentsReceived !== undefined) record.cashClosure.advancePaymentsReceived = Number(closureUpdates.advancePaymentsReceived) || 0;
                    if (closureUpdates.functionOrderFinalPayments !== undefined) record.cashClosure.functionOrderFinalPayments = Number(closureUpdates.functionOrderFinalPayments) || 0;
                    if (closureUpdates.advanceCashTaken !== undefined) record.cashClosure.advanceCashTaken = Number(closureUpdates.advanceCashTaken) || 0;
                    if (closureUpdates.cashDepositedToBank !== undefined) record.cashClosure.cashDepositedToBank = Number(closureUpdates.cashDepositedToBank) || 0;
                    if (closureUpdates.cashInHand !== undefined) record.cashClosure.cashInHand = Number(closureUpdates.cashInHand) || 0;
                }
                record.cashClosure.cashExpenses = totalApprovedExpenses;

                const expectedCash = (record.cashClosure.prevDayCashInHand || 0)
                    + (record.cashClosure.cashFoodSales || 0)
                    + (record.cashClosure.advancePaymentsReceived || 0)
                    + (record.cashClosure.functionOrderFinalPayments || 0)
                    - totalApprovedExpenses
                    + (record.cashClosure.advanceCashTaken || 0)
                    - (record.cashClosure.cashDepositedToBank || 0);

                record.cashClosure.expectedCash = expectedCash;
                record.cashClosure.difference = (record.cashClosure.cashInHand - record.cashClosure.cashDepositedToBank) - expectedCash;

                record.cashClosure.cooConfirmed = true;
                record.cashClosure.cooConfirmedAt = new Date();
                record.markModified('cashClosure');
            }
            record.reportedDifference = totalB2C - (record.reportedCash + record.reportedOnline);
            record.totalAmount = totalB2B + totalB2C + totalOnline;
        }

        record.cooApproved = true;
        record.cooApprovedAt = new Date();
        if (user.role === 'KITCHEN') {
            record.financeReconciled = true;
            record.financeReconciledAt = new Date();
        }
        await record.save();

        if (record.cashClosure) {
            for (const foId of record.cashClosure.functionOrderIds || []) {
                await functionOrderService.linkToCashClosure(foId, record.date);
                await functionOrderService.syncFunctionOrderStatus(foId);
            }
        }

        return record;
    }

    async getPendingCooCashClosures(entityId) {
        return await DailyRevenue.find({
            entity: entityId,
            status: 'CLOSED'
        }).populate('locationId', 'name role').lean();
    }

    async getPendingFinanceCashClosures(entityId) {
        return await DailyRevenue.find({
            entity: entityId,
            status: 'CLOSED',
            cooApproved: true,
            financeReconciled: false
        }).populate('locationId', 'name role').lean();
    }
}

module.exports = new RevenueService();
