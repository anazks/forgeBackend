const Purchase = require('../models/purchaseModel');
const PurchaseRequest = require('../models/purchaseRequestModel');
const Bill = require('../models/billModel');
const RawMaterial = require('../../rawmaterials/models/rawMaterialModel');
const Inventory = require('../../inventory/models/inventoryModel');
const { AppError } = require('../../../middleware/errorHandler');

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
        // L1 Fix: All delete logic (including Inventory reversal) is now in the service layer.
        await purchaseService.deletePurchase(req.params.id, req.user.entity);
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};

// --- Purchase Requests ---

// @desc    Create Purchase Request
// @route   POST /api/purchases/requests
exports.createPurchaseRequest = async (req, res, next) => {
    try {
        req.body.requestedBy = req.user._id;
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }
        if (req.body.vendorId && !req.body.vendor) {
            req.body.vendor = req.body.vendorId;
        }

        // Default destinationLocation for location-based roles if not provided
        if (!req.body.destinationLocation && ['KITCHEN', 'CENTERS', 'RESTAURANT', 'AGGREGATE'].includes(req.user.role)) {
            req.body.destinationLocation = req.user._id;
        }

        // Enforce destinationLocation is present for all roles
        if (!req.body.destinationLocation) {
            return res.status(400).json({ success: false, error: 'Destination location is required.' });
        }

        // Auto-approve if it comes from the Stock Requests gap analysis with a destination location
        if (req.body.destinationLocation) {
            req.body.status = 'BILLED';

            // H4 Fix: Vendor must be present before we save anything.
            // Without a vendor, Bill.create() would fail AFTER the PR is saved, leaving an orphaned PR.
            const vendorId = req.body.vendor || req.body.vendorId;
            if (!vendorId) {
                return res.status(400).json({
                    success: false,
                    error: 'A vendor must be selected before raising a Purchase Request.'
                });
            }
            req.body.vendor = vendorId;

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

            if (duplicateBill && !req.body.allowDuplicate) {
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
                unitPrice: i.unitPrice || 0,
                total: i.requestedQty * (i.unitPrice || 0)
            }));
            await Bill.create({
                purchaseRequest: pr._id,
                vendor: pr.vendor,
                items: billItems,
                totalAmount: billItems.reduce((acc, curr) => acc + curr.total, 0),
                entity: pr.entity,
                deliveryStatus: 'PENDING',
                destinationLocation: req.body.destinationLocation
            });
        }

        res.status(201).json({ success: true, data: pr });
    } catch (error) {
        next(error);
    }
};

// @desc    Get all Purchase Requests
// @route   GET /api/purchases/requests
exports.getPurchaseRequests = async (req, res, next) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        }
        if (['CENTERS', 'KITCHEN', 'RESTAURANT', 'AGGREGATE'].includes(req.user.role)) {
            query.destinationLocation = req.user._id;
        }
        const requests = await PurchaseRequest.find(query)
            .populate('requestedBy', 'name')
            .populate('vendor', 'vendorName')
            .populate('items.item', 'name unit')
            .sort({ createdAt: -1 });
            
        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        next(error);
    }
};

// @desc    Accept/Approve Purchase Request & Generate Bill
// @route   PUT /api/purchases/requests/:id/approve
exports.approvePurchaseRequest = async (req, res, next) => {
    try {
        const { vendor, items } = req.body;
        const pr = await PurchaseRequest.findById(req.params.id);
        if (!pr) throw new AppError('PR not found', 404);

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
            deliveryStatus: 'PENDING',
            destinationLocation: pr.destinationLocation
        });

        res.status(200).json({ success: true, data: { pr, bill } });
    } catch (error) {
        next(error);
    }
};

// --- Bills ---

// @desc    Get all Bills
// @route   GET /api/purchases/bills
exports.getBills = async (req, res, next) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        }
        if (['CENTERS', 'KITCHEN', 'RESTAURANT', 'AGGREGATE'].includes(req.user.role)) {
            query.destinationLocation = req.user._id;
        }
        const bills = await Bill.find(query)
            .populate('vendor', 'vendorName')
            .populate('purchaseRequest', 'prCode')
            .sort({ createdAt: -1 });
            
        res.status(200).json({ success: true, data: bills });
    } catch (error) {
        next(error);
    }
};

// @desc    Update Bill Payment or Delivery
// @route   PUT /api/purchases/bills/:id
exports.updateBill = async (req, res, next) => {
    try {
        const oldBill = await Bill.findById(req.params.id);
        if (!oldBill) throw new AppError('Bill not found', 404);

        if (req.body.paymentStatus) {
            const canMarkPaid = ['FINANCE', 'COO', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
            if (!canMarkPaid) {
                throw new AppError('Only Finance, COO, or Admin can update payment status.', 403);
            }
        }

        // Validate unitPrice if marking as DELIVERED
        if (req.body.deliveryStatus === 'DELIVERED') {
            const itemsToCheck = req.body.items || oldBill.items;
            const invalidPriceItem = itemsToCheck.find(i => Number(i.unitPrice) <= 0);
            if (invalidPriceItem) {
                throw new AppError('All received items must have a unit price greater than 0.', 400);
            }
        }

        const bill = await Bill.findByIdAndUpdate(req.params.id, req.body, { new: true });
        
        if (req.body.deliveryStatus === 'DELIVERED') {
            if (oldBill.deliveryStatus !== 'DELIVERED') {
                // First time delivery
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
            } else {
                // Already delivered. We are editing it. Calculate difference.
                for (const item of bill.items) {
                    const newQty = item.receivedQty !== undefined ? item.receivedQty : item.quantity;
                    
                    // Find old quantity for this item
                    const oldItem = oldBill.items.find(i => i.item.toString() === item.item.toString());
                    const oldQty = oldItem ? (oldItem.receivedQty !== undefined ? oldItem.receivedQty : oldItem.quantity) : 0;
                    
                    const qtyDiff = newQty - oldQty;
                    
                    if (bill.destinationLocation && qtyDiff !== 0) {
                        await Inventory.findOneAndUpdate(
                            { materialId: item.item, locationId: bill.destinationLocation, entity: bill.entity },
                            { $inc: { currentStock: qtyDiff } },
                            { upsert: true, new: true }
                        );
                    }
                }
            }
        }
        
        res.status(200).json({ success: true, data: bill });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete Purchase Request
// @route   DELETE /api/purchases/requests/:id
exports.deletePurchaseRequest = async (req, res, next) => {
    try {
        const pr = await PurchaseRequest.findById(req.params.id);
        if (!pr) throw new AppError('Purchase Request not found', 404);
        
        await pr.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};
