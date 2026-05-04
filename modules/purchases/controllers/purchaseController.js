const Purchase = require('../models/purchaseModel');
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
