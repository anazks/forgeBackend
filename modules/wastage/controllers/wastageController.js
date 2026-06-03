const Wastage = require('../models/wastageModel');
const FoodRequest = require('../../stockrequests/models/stockRequestModel');
const MenuRate = require('../../menus/models/menuRateModel');

// @desc    Get or create today's wastage record for a center
// @route   GET /api/wastage/today
// @access  Private (Centers)
exports.getTodayWastage = async (req, res) => {
    try {
        const centerId = req.user._id;
        const entityId = req.user.entity;
        
        // Get date from query or default to today in YYYY-MM-DD
        const targetDate = req.query.date || new Date().toLocaleDateString('en-CA');
        
        // Find existing record
        let wastage = await Wastage.findOne({ centerId, date: targetDate });
        
        // We also need to fetch approved FoodRequests for the target date
        const targetDateObj = new Date(targetDate);
        const targetStart = new Date(targetDateObj);
        targetStart.setHours(0, 0, 0, 0);
        const targetEnd = new Date(targetDateObj);
        targetEnd.setHours(23, 59, 59, 999);
        
        const requests = await FoodRequest.find({
            centerId,
            status: { $in: ['APPROVED', 'PARTIAL'] },
            deliveryDate: { $gte: targetStart, $lte: targetEnd }
        }).populate('requestedItems.bomId');
        
        // Fetch custom rates
        const menuRates = await MenuRate.find({ center: centerId });
        const rateMap = {};
        const sellingRateMap = {};
        menuRates.forEach(mr => {
            if (mr.bom) {
                rateMap[mr.bom.toString()] = mr.rate;
                sellingRateMap[mr.bom.toString()] = mr.centerRate || mr.rate;
            }
            if (mr.menu) {
                rateMap[mr.menu.toString()] = mr.rate;
                sellingRateMap[mr.menu.toString()] = mr.centerRate || mr.rate;
            }
        });

        // Build list of approved items for today
        const todayItemsMap = {};
        requests.forEach(req => {
            req.requestedItems.forEach(item => {
                if (item.isStockSufficient !== false) {
                    const bomId = item.bomId?._id?.toString() || item.bomId?.toString();
                    const menuId = item.menuId?.toString();
                    const key = bomId || menuId;
                    if (!key) return;
                    
                    let rate = item.bomId?.kitchenPrice || 0;
                    let sellingRate = rate;

                    if (bomId && rateMap[bomId] !== undefined) {
                        rate = rateMap[bomId];
                        sellingRate = sellingRateMap[bomId];
                    } else if (menuId && rateMap[menuId] !== undefined) {
                        rate = rateMap[menuId];
                        sellingRate = sellingRateMap[menuId];
                    }
                    
                    if (!todayItemsMap[key]) {
                        todayItemsMap[key] = {
                            bomId: item.bomId?._id || null,
                            menuId: item.menuId || null,
                            itemName: item.materialName || 'Unknown',
                            approvedQty: 0,
                            rate: rate,
                            sellingRate: sellingRate,
                            wastageQty: 0,
                            soldQty: 0
                        };
                    }
                    todayItemsMap[key].approvedQty += item.requestedQty;
                }
            });
        });

        // Merge with existing wastage record
        if (wastage) {
            wastage.items.forEach(wItem => {
                const key = wItem.bomId?.toString() || wItem.menuId?.toString();
                if (key && todayItemsMap[key]) {
                    todayItemsMap[key].wastageQty = wItem.wastageQty;
                    todayItemsMap[key].soldQty = wItem.soldQty;
                }
            });
        }
        
        const mergedItems = Object.values(todayItemsMap);
        
        res.status(200).json({
            success: true,
            data: {
                date: targetDate,
                items: mergedItems,
                recordId: wastage ? wastage._id : null
            }
        });

    } catch (error) {
        console.error(error);
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Save wastage record for today
// @route   POST /api/wastage
// @access  Private (Centers)
exports.saveWastage = async (req, res) => {
    try {
        const { date, items } = req.body;
        const centerId = req.user._id;
        const entityId = req.user.entity;
        
        let targetItems = items;
        let targetDate = date;
        
        if (targetDate && targetDate.includes('T')) {
            targetDate = targetDate.split('T')[0];
        }
        
        if (!targetItems && req.body.materialId) {
            const RawMaterial = require('../../rawmaterials/models/rawMaterialModel');
            const rm = await RawMaterial.findById(req.body.materialId);
            targetItems = [{
                itemName: rm ? rm.name : 'Unknown Raw Material',
                wastageQty: req.body.quantity || 0,
                approvedQty: 0,
                rate: 0,
                sellingRate: 0
            }];
        }
        
        if (!targetItems || !Array.isArray(targetItems)) {
            return res.status(400).json({ success: false, error: 'Wastage items are required' });
        }
        
        let totalCost = 0;
        let totalWastageCost = 0;
        let totalSales = 0;
        let totalMargin = 0;
        
        targetItems.forEach(item => {
            totalCost += ((item.approvedQty || 0) * (item.rate || 0));
            totalWastageCost += ((item.wastageQty || 0) * (item.rate || 0));
            // Income generated by center price (sellingRate)
            totalSales += ((item.soldQty || 0) * (item.sellingRate || item.rate || 0));
        });

        totalMargin = totalSales - totalCost;

        const targetCenterId = req.body.locationId || centerId;

        const updated = await Wastage.findOneAndUpdate(
            { centerId: targetCenterId, date: targetDate },
            { 
                centerId: targetCenterId, 
                entity: entityId, 
                date: targetDate, 
                items: targetItems, 
                totalCost, 
                totalWastageCost, 
                totalSales,
                totalMargin
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all wastage records for analytics
// @route   GET /api/wastage
// @access  Private (Admin/SuperAdmin)
exports.getAllWastage = async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        }

        // Optional filter by center
        if (req.query.centerId) {
            query.centerId = req.query.centerId;
        }

        // Optional filter by date
        if (req.query.date) {
            query.date = req.query.date;
        }

        const records = await Wastage.find(query)
            .populate('centerId', 'name email')
            .sort({ date: -1 });

        res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
