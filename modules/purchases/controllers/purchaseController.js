const Purchase = require('../models/purchaseModel');
const PurchaseRequest = require('../models/purchaseRequestModel');
const Bill = require('../models/billModel');
const RawMaterial = require('../../rawmaterials/models/rawMaterialModel');

// @desc    Get all purchases
// @route   GET /api/purchases
exports.getPurchases = async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            query.entity = req.user.entity;
        }

        const purchases = await Purchase.find(query)
            .populate('item', 'name unit')
            .populate('vendor', 'vendorName')
            .sort({ purchaseDate: -1 });

        // Calculate stats for top 3 dashboard
        const totalSpent = purchases.reduce((acc, curr) => acc + curr.totalCost, 0);
        const totalItems = purchases.reduce((acc, curr) => acc + curr.quantity, 0);
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
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Create purchase
// @route   POST /api/purchases
exports.createPurchase = async (req, res) => {
    try {
        req.body.user = req.user._id;
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }

        // Fix: If vendor is empty string, set to null
        if (req.body.vendor === '') {
            delete req.body.vendor;
        }
        
        const purchase = await Purchase.create(req.body);
        res.status(201).json({ success: true, data: purchase });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete purchase
// @route   DELETE /api/purchases/:id
exports.deletePurchase = async (req, res) => {
    try {
        const purchase = await Purchase.findById(req.params.id);
        if (!purchase) return res.status(404).json({ success: false, error: 'Purchase not found' });
        
        // Reverse stock update
        await RawMaterial.findByIdAndUpdate(purchase.item, {
            $inc: { currentStock: -purchase.quantity }
        });

        await purchase.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

// --- Purchase Requests ---

// @desc    Create Purchase Request
// @route   POST /api/purchases/requests
exports.createPurchaseRequest = async (req, res) => {
    try {
        req.body.requestedBy = req.user._id;
        if (req.user.role !== 'SUPER_ADMIN') {
            req.body.entity = req.user.entity;
        }
        const pr = await PurchaseRequest.create(req.body);
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
        
        // If delivery status just changed to DELIVERED, update stock
        if (req.body.deliveryStatus === 'DELIVERED' && oldBill.deliveryStatus !== 'DELIVERED') {
            for (const item of bill.items) {
                await RawMaterial.findByIdAndUpdate(item.item, {
                    $inc: { currentStock: item.quantity }
                });
            }
        }
        
        res.status(200).json({ success: true, data: bill });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};
