const Purchase = require('../models/purchaseModel');
const PurchaseRequest = require('../models/purchaseRequestModel');
const Bill = require('../models/billModel');
const RawMaterial = require('../../rawmaterials/models/rawMaterialModel');
const Inventory = require('../../inventory/models/inventoryModel');

const purchaseService = require('../services/purchaseService');
const rawMaterialService = require('../../rawmaterials/services/rawMaterialService');

// @desc    Get all purchases
// @route   GET /api/purchases
exports.getPurchases = async (req, res, next) => {
    try {
        const isAdmin = req.user.role === 'SUPER_ADMIN';
        const purchases = await purchaseService.getPurchasesByEntity(req.user.entity, isAdmin);

        // Calculate stats for top 3 dashboard
        const totalSpent = purchases.reduce((acc, curr) => acc + (curr.totalCost || 0), 0);
        const totalItems = purchases.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
        const recentCount = purchases.filter(p => {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            return p.purchaseDate > d;
        }).length;

        res.status(200).json({ 
            success: true, 
            count: purchases.length, 
            stats: { totalSpent, totalItems, recentCount },
            data: purchases 
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create purchase
// @route   POST /api/purchases
exports.createPurchase = async (req, res, next) => {
    try {
        req.body.user = req.user._id;
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }

        const purchase = await purchaseService.createPurchase(req.body);
        res.status(201).json({ success: true, data: purchase });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete purchase
// @route   DELETE /api/purchases/:id
exports.deletePurchase = async (req, res, next) => {
    try {
        const { itemId, quantity } = await purchaseService.deletePurchase(req.params.id);
        
        // Reverse stock update using cross-domain service call
        if (itemId) {
            await rawMaterialService.adjustStock(itemId, -quantity);
        }

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};

// --- Purchase Requests ---

// @desc    Create Purchase Request
// @route   POST /api/purchases/requests
// @desc    Create Purchase Request
// @route   POST /api/purchases/requests
exports.createPurchaseRequest = async (req, res) => {
    try {
        req.body.requestedBy = req.user._id;
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }

        // Auto-approve if it comes from the Stock Requests gap analysis with a destination location
        if (req.body.destinationLocation) {
            req.body.status = 'BILLED';
            
            // Persistent Duplicate PR Guard (arch-compliant via service layer):
            // Block if ANY pending Bill already covers the same items at the same location,
            // regardless of who raised it (Store Manager or COO).
            const materialIds = req.body.items.map(i => i.item?.toString()).filter(Boolean);
            const entityId = req.user.role !== 'SUPER_ADMIN' ? req.user.entity : undefined;

            const duplicateBill = await purchaseService.findDuplicatePendingPR(
                materialIds,
                req.body.destinationLocation,
                entityId
            );

            if (duplicateBill) {
                const prCode = duplicateBill.purchaseRequest?.prCode || 'existing PR';
                return res.status(409).json({
                    success: false,
                    error: `A pending Purchase Request (${prCode}) already exists for one or more of these items at this location. Please refresh the Gap Analysis to see current status.`
                });
            }
        }

        const pr = await PurchaseRequest.create(req.body);

        // Instantly generate Bill if auto-approved
        if (req.body.destinationLocation) {
            const billItems = req.body.items.map(i => ({
                item: i.item,
                itemName: i.itemName,
                quantity: i.requestedQty,
                unitPrice: 0,
                total: 0
            }));
            await Bill.create({
                purchaseRequest: pr._id,
                vendor: pr.vendor || req.body.vendorId, // Use vendorId if passed directly
                items: billItems,
                totalAmount: 0,
                entity: pr.entity,
                deliveryStatus: 'PENDING',
                destinationLocation: req.body.destinationLocation
            });
        }

        res.status(201).json({ success: true, data: pr });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all Purchase Requests
// @route   GET /api/purchases/requests
exports.getPurchaseRequests = async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        }
        if (req.user.role === 'CENTERS' || req.user.role === 'KITCHEN') {
            query.destinationLocation = req.user._id;
        }
        const requests = await PurchaseRequest.find(query)
            .populate('requestedBy', 'name')
            .populate('vendor', 'vendorName')
            .populate('items.item', 'name unit')
            .sort({ createdAt: -1 });
            
        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Accept/Approve Purchase Request & Generate Bill
// @route   PUT /api/purchases/requests/:id/approve
exports.approvePurchaseRequest = async (req, res) => {
    try {
        const { vendor, items } = req.body;
        const pr = await PurchaseRequest.findById(req.params.id);
        if (!pr) return res.status(404).json({ success: false, error: 'PR not found' });

        // Update PR
        pr.vendor = vendor || pr.vendor;
        pr.items = items;
        pr.status = 'BILLED';
        await pr.save();

        // Generate Bill
        let totalAmount = 0;
        const billItems = items.map(i => {
            const total = Number(i.approvedQty || i.requestedQty) * Number(i.unitPrice || 0);
            totalAmount += total;
            return {
                item: i.item,
                itemName: i.itemName,
                quantity: i.approvedQty || i.requestedQty,
                unitPrice: i.unitPrice || 0,
                total: total
            };
        });

        const bill = await Bill.create({
            purchaseRequest: pr._id,
            vendor: pr.vendor || vendor,
            items: billItems,
            totalAmount,
            entity: pr.entity,
            deliveryStatus: 'PENDING'
        });

        res.status(200).json({ success: true, data: { pr, bill } });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// --- Bills ---

// @desc    Get all Bills
// @route   GET /api/purchases/bills
exports.getBills = async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        }
        if (req.user.role === 'CENTERS' || req.user.role === 'KITCHEN') {
            query.destinationLocation = req.user._id;
        }
        const bills = await Bill.find(query)
            .populate('vendor', 'vendorName')
            .populate('purchaseRequest', 'prCode')
            .sort({ createdAt: -1 });
            
        res.status(200).json({ success: true, data: bills });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Update Bill Payment or Delivery
// @route   PUT /api/purchases/bills/:id
exports.updateBill = async (req, res) => {
    try {
        const oldBill = await Bill.findById(req.params.id);
        const bill = await Bill.findByIdAndUpdate(req.params.id, req.body, { new: true });
        
        // If delivery status just changed to DELIVERED, update stock in Inventory
        if (req.body.deliveryStatus === 'DELIVERED' && oldBill.deliveryStatus !== 'DELIVERED') {
            for (const item of bill.items) {
                const qtyToAdd = item.receivedQty !== undefined ? item.receivedQty : item.quantity;
                if (bill.destinationLocation && qtyToAdd > 0) {
                    await Inventory.findOneAndUpdate(
                        { materialId: item.item, locationId: bill.destinationLocation, entity: bill.entity },
                        { $inc: { currentStock: qtyToAdd } },
                        { upsert: true, new: true }
                    );
                }
            }
        }
        
        res.status(200).json({ success: true, data: bill });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
